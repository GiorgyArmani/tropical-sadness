// Motor · película ASCII: lo que la cámara ve, revelado en caracteres.
//
// La GPU dibuja la escena y la resume en un píxel por celda de texto, con el trazo de cada celda ya
// decidido (edges.ts). Acá cada celda se vuelve un carácter: la luz elige qué tan lleno es, los
// bordes eligen la dirección del trazo (- / | \) y el color se insinúa con la paleta de la isla.
// Las letras las estampa la GPU (glyphs.ts); si no puede, se escriben con fillText como antes.
// La cámara la usa en Camera.shoot().
//
// Dos niveles de detalle:
//   "classic" -> 12 escalones de luz y trazos en siluetas y esquinas (donde la superficie dobla)
//   "fine"    -> 19 escalones y trazos también donde la luz cambia de golpe (el borde de un charco
//                de luz, el marco de una ventana encendida, el tubo contra el techo)

import { clamp, dirChar, hash, ramp, rgb } from "../../ascii/math"
import { EDGE_MASK, EDGE_NONE, GLOW_BIT } from "./edges"
import { GlyphGL } from "./glyphs"

export type AsciiDetail = "classic" | "fine"

export type AsciiLook = {
  exposure: number // cuánta luz recibe el ASCII (1 normal)
  saturation?: number // cuánto color pasa (0 gris, 1 todo; 0.5 por defecto)
  grade?: number // cuánto se tiñe con la paleta de la isla (0.45 por defecto)
  detail?: AsciiDetail // "fine" por defecto
}

const RAMPS: Record<AsciiDetail, string> = {
  classic: " .,:;-=+*#%@",
  fine: " .`',:;-~=+*ox%#&8@",
}
// Qué tanto tiene que cambiar la luz entre vecinos para que se trace un borde (modo fino)
const LIGHT_EDGE = 0.32

// Los trazos, en el orden de los votos. La dirección sale de dirChar (math.ts)
const STROKES = "-/|\\"
const strokeOf = (dx: number, dy: number) => STROKES.indexOf(dirChar(dx, dy))
const NONE = -1
const CREASE = 4 // esquina sin dirección todavía: la decide la votación

const FONT_PX = 8 // letra chica: más celdas, más detalle
const FONT_PX_SMALL = 7 // en pantallas angostas
const MAX_CELLS = 70000
const MAX_COARSE = 4

// La paleta de la isla: de la sombra a la luz, azul profundo -> violeta -> rosa -> naranja -> arena
const GRADE: [number, number, number][] = [
  [16, 30, 92],
  [96, 40, 150],
  [235, 80, 170],
  [255, 150, 70],
  [255, 228, 120],
]
const gradeAt = (v: number): [number, number, number] => {
  const x = clamp(v, 0, 0.999) * (GRADE.length - 1)
  const i = Math.floor(x)
  const f = x - i
  const a = GRADE[i]
  const b = GRADE[i + 1]
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
}

// Cuánta luz tiene un píxel para el ASCII. Con el brillo percibido solo, una luz roja o azul pura
// queda casi negra (el rojo vale un 30% del blanco) y la habitación se pierde: por eso cuenta
// también el canal más fuerte. Los colores parejos (amarillo, blanco, gris) quedan igual.
const lightOf = (R: number, G: number, B: number) => Math.max(0.299 * R + 0.587 * G + 0.114 * B, 0.6 * Math.max(R, G, B)) / 255

// Todas las letras que se usan, en el atlas de la GPU. La 0 es la celda vacía
const GLYPHS = [...new Set(" " + RAMPS.fine + RAMPS.classic + STROKES + "@o")].join("")
const GLYPH_OF = new Map([...GLYPHS].map((ch, i) => [ch, i]))
const FONT = (px: number) => `${px}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`

// La estática: letras grises en tres tonos, de una hoja fija corrida unas celdas al azar en cada cuadro
const STATIC_TONES = [0.45, 0.7, 0.95]
const STATIC_RGB = [200, 205, 215]
const STATIC_PAD = 8

export class AsciiFilm {
  W = 0 // tamaño en px de CSS
  H = 0
  cw = 5 // ancho y alto de una celda
  lh = 8
  cols = 0
  rows = 0
  pixels = new Uint8Array(0) // de la GPU, de abajo hacia arriba: RGB color, A trazo y brillo (edges.ts)
  sub = 1 // píxeles de escena por celda, por lado (2 = bordes y color a más resolución)
  private lum = new Float32Array(0)
  private raw = new Int8Array(0) // borde de cada celda antes de votar
  private edge = new Int8Array(0) // borde ya votado
  private coarse = 0 // calidad automática: cuántos puntos se agrandó la letra
  // Los extras de la compu. En el celular no se usan nunca: las esquinas ni siquiera están en su
  // shader, y el 2x2 cuadruplica el trabajo de la GPU (los celulares se caían al pasar puertas)
  creases: boolean // buscar esquinas en el shader
  private creasesFailed: boolean // ya se probó y fue lento (o es un celular): no se vuelve a intentar
  private subFailed: boolean // lo mismo para el 2x2
  private cells = new Uint8Array(0) // lo que se dibuja: por celda RGB y número de letra (filas desde arriba)
  private glyphs: GlyphGL
  private octx: CanvasRenderingContext2D // el lienzo de encima (la lluvia, y las letras si no hay GPU)
  private overlaySized = false // el lienzo de encima solo ocupa memoria si alguien lo usa
  private overlayDirty = false
  private font = ""
  private gctx: CanvasRenderingContext2D | null
  private glowTick = 0

  constructor(
    readonly canvas: HTMLCanvasElement, // el lienzo de encima: mide la pantalla y recibe la lluvia
    textCanvas: HTMLCanvasElement, // donde la GPU estampa las letras (debajo del anterior)
    readonly glowCanvas: HTMLCanvasElement | null = null,
    readonly phone = false, // en el celular el color sale un poco más fuerte (la pantalla muestra más oscuro)
  ) {
    this.octx = canvas.getContext("2d")!
    this.glyphs = new GlyphGL(textCanvas)
    this.creases = !phone
    this.creasesFailed = phone
    this.subFailed = phone
    this.gctx = glowCanvas?.getContext("2d") ?? null
  }

  // Mide la pantalla y decide cuántas celdas entran
  resize() {
    const { canvas, octx: ctx } = this
    const W = (this.W = canvas.clientWidth)
    const H = (this.H = canvas.clientHeight)
    // El lienzo de encima se suelta: vuelve a tomar tamaño recién cuando alguien dibuja en él
    canvas.width = canvas.height = 0
    this.overlaySized = false
    this.overlayDirty = false
    if (this.glowCanvas) {
      this.glowCanvas.width = Math.ceil(W / 4)
      this.glowCanvas.height = Math.ceil(H / 4)
    }
    let px = (W < 640 ? FONT_PX_SMALL : FONT_PX) + this.coarse
    const measure = () => {
      ctx.font = FONT(px)
      return ctx.measureText("M").width
    }
    this.cw = measure()
    // Con pantallas enormes se agranda la letra para no pasarse de celdas
    while ((W / this.cw) * (H / (px * 1.1)) > MAX_CELLS) {
      px += 1
      this.cw = measure()
    }
    this.font = FONT(px)
    this.lh = Math.round(px * 1.1)
    this.cols = Math.ceil(W / this.cw)
    this.rows = Math.ceil(H / this.lh)
    const n = this.cols * this.rows
    this.pixels = new Uint8Array(n * 4)
    this.lum = new Float32Array(n)
    this.raw = new Int8Array(n)
    this.edge = new Int8Array(n)
    this.cells = new Uint8Array(n * 4)
    const { cols, rows, cw, lh, font } = this
    this.glyphs.resize({ cols, rows, W, H, cw, lh, font, glyphs: GLYPHS })
  }

  // El lienzo de encima, para dibujar con 2D (la lluvia). Toma tamaño la primera vez que se pide
  get ctx() {
    const { canvas, octx } = this
    if (!this.overlaySized) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(this.W * dpr)
      canvas.height = Math.round(this.H * dpr)
      octx.setTransform(canvas.width / this.W, 0, 0, canvas.height / this.H, 0, 0)
      octx.font = this.font
      octx.textBaseline = "top"
      this.overlaySized = true
    }
    this.overlayDirty = true
    return octx
  }

  // ¿Cambió el tamaño de la pantalla desde la última medida?
  stale() {
    return this.canvas.clientWidth !== this.W || this.canvas.clientHeight !== this.H
  }

  // Calidad automática según cuánto tardan los cuadros (ms promedio):
  //   - si tarda: se apaga el 2x2, después las esquinas (cada uno no se vuelve a probar) y recién
  //     después la letra crece un punto (menos celdas)
  //   - si sobra mucho tiempo: la letra se achica (más celdas)
  //   - si sobra algo: se prenden las esquinas y después el 2x2 (en el celular nunca: ver arriba)
  // Devuelve true si cambió.
  adapt(ms: number) {
    const room = ms < (this.phone ? 14 : 20)
    if (ms > 24) {
      if (this.sub > 1) {
        this.sub = 1
        this.subFailed = true
        return true
      }
      if (this.creases) {
        this.creases = false
        this.creasesFailed = true
        return true
      }
      if (this.coarse >= MAX_COARSE) return false
      this.coarse++
    } else if (ms < 9 && this.coarse > 0) this.coarse--
    else if (room && !this.creases && !this.creasesFailed) {
      this.creases = true
      return true
    } else if (room && this.sub === 1 && !this.subFailed) {
      this.sub = 2
      return true
    } else return false
    this.resize()
    return true
  }

  // Un punto que la cámara proyectó (unidades de alto de pantalla desde el centro) en px de pantalla
  toScreen(q: { x: number; y: number }) {
    const span = this.rows * this.lh
    return { x: (this.cols * this.cw) / 2 + q.x * span, y: span / 2 - q.y * span }
  }

  // Borra lo que se dibujó encima en el cuadro anterior (la lluvia)
  clear() {
    if (this.overlayDirty) this.octx.clearRect(0, 0, this.W, this.H)
    this.overlayDirty = false
  }

  // Los bordes, en dos pasos (la idea de AcerolaFX llevada a celdas):
  //   1. cada celda dice si es borde y hacia dónde va el trazo. Los saltos de profundidad y las
  //      esquinas ya los votó la GPU (edges.ts); acá se suman los saltos de luz
  //   2. votación con las 8 vecinas: el trazo sigue la dirección que más se repite alrededor, y una
  //      celda de borde sola, sin ninguna vecina que también lo sea, vuelve a ser relleno (sin puntitos)
  private findEdges(fine: boolean) {
    const { pixels, lum, raw, edge, cols, rows } = this
    const at = (c: number, r: number) => ((rows - 1 - r) * cols + c) * 4
    const li = (c: number, r: number) => clamp(r, 0, rows - 1) * cols + clamp(c, 0, cols - 1)
    const L = (c: number, r: number) => lum[li(c, r)]
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = r * cols + c
        const i = at(c, r)
        const gpu = pixels[i + 3] & EDGE_MASK
        raw[k] = gpu === EDGE_NONE ? NONE : gpu
        if (raw[k] !== NONE || !fine) continue
        if (lightOf(pixels[i], pixels[i + 1], pixels[i + 2]) <= 0.06) continue
        // Borde de luz: donde la luz salta de un vecino al otro, el trazo lo dibuja del lado claro
        // (así queda de una celda de ancho, no doble)
        const v = lum[k]
        const lx = L(c + 1, r) - L(c - 1, r)
        const ly = L(c, r + 1) - L(c, r - 1)
        const lo = Math.min(L(c + 1, r), L(c - 1, r), L(c, r + 1), L(c, r - 1))
        if (Math.abs(lx) + Math.abs(ly) > LIGHT_EDGE && v > 0.3 && v - lo > LIGHT_EDGE * 0.6) raw[k] = strokeOf(-ly, lx)
      }
    }
    const R = (c: number, r: number) => (c < 0 || r < 0 || c >= cols || r >= rows ? NONE : raw[r * cols + c])
    const on = (c: number, r: number) => (R(c, r) !== NONE ? 1 : 0)
    const votes = [0, 0, 0, 0]
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = r * cols + c
        const own = raw[k]
        edge[k] = NONE
        if (own === NONE) continue
        votes[0] = votes[1] = votes[2] = votes[3] = 0
        let near = 0
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue
            const o = R(c + dc, r + dr)
            if (o === NONE) continue
            near++
            if (o !== CREASE) votes[o]++
          }
        }
        if (!near) continue // sola: no es una línea, es ruido
        if (own === CREASE) {
          // La esquina sigue la fila de vecinas que también son borde
          votes[0] += 2 * (on(c + 1, r) + on(c - 1, r))
          votes[1] += 2 * (on(c + 1, r - 1) + on(c - 1, r + 1))
          votes[2] += 2 * (on(c, r + 1) + on(c, r - 1))
          votes[3] += 2 * (on(c - 1, r - 1) + on(c + 1, r + 1))
        } else votes[own] += 1.5 // la propia pesa más: hacen falta dos vecinas que coincidan para corregirla
        let best = own === CREASE ? 0 : own
        for (let j = 0; j < 4; j++) if (votes[j] > votes[best]) best = j
        edge[k] = best
      }
    }
  }

  // Revela los píxeles en caracteres. staticAmt: cuánta estática tapa la imagen (0..1)
  develop(look: AsciiLook, staticAmt: number, tick: number) {
    const { pixels, lum, edge, cols, rows } = this
    const exposure = look.exposure
    const sat = look.saturation ?? 0.5
    const gr = look.grade ?? 0.45
    const fine = (look.detail ?? "fine") === "fine"
    const RAMP = RAMPS[fine ? "fine" : "classic"]
    const colorK = this.phone ? 1.15 : 1
    // La imagen de WebGL viene de abajo hacia arriba
    const at = (c: number, r: number) => ((rows - 1 - r) * cols + c) * 4
    // Primero la luz de cada celda ya expuesta (los bordes de luz miran a los vecinos)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = at(c, r)
        const l = lightOf(pixels[i], pixels[i + 1], pixels[i + 2])
        // La curva levanta los medios tonos: lo iluminado llega a los caracteres llenos y la
        // penumbra se sigue leyendo
        lum[r * cols + c] = Math.pow(Math.min(l * exposure, 1), 0.85)
      }
    }
    this.findEdges(fine)
    const cells = this.cells
    const st = this.staticAt(staticAmt, tick)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = r * cols + c
        const o = k * 4
        // Celda tapada por la estática
        if (st && hash(c + tick * 13, r + tick * 7) < staticAmt * 0.95) {
          st(c, r, o)
          continue
        }
        const i = at(c, r)
        const R = pixels[i]
        const G = pixels[i + 1]
        const B = pixels[i + 2]
        const v = clamp(lum[k], 0, 0.999)
        const isEdge = edge[k] !== NONE
        // Nunca vacío: hasta la sombra tiene una textura tenue
        let ch = isEdge ? STROKES[edge[k]] : ramp(RAMP, Math.max(v, 0.09))
        // Casi monocromo: el color se insinúa, la luz manda. El tono sale a brillo pleno dividiendo
        // por el canal más fuerte (sin pasar por HSB) y después se oscurece según la luz de la celda:
        // así un azul o un rojo puro no se pasan de 255 en un canal y no cambian de tono al recortarse
        const m = Math.max(R, G, B, 1)
        let kc = (0.3 + 0.95 * v) * colorK
        if (isEdge) kc *= 1.25
        kc = Math.min(kc, 1) // más allá de 1 se recortaría el canal fuerte y el tono se correría
        // Mezcla el color de la escena con la paleta de la isla según la luz
        const g = gradeAt(v)
        const cr = (255 + ((R * 255) / m - 255) * sat) * kc
        const cg = (255 + ((G * 255) / m - 255) * sat) * kc
        const cb = (255 + ((B * 255) / m - 255) * sat) * kc
        const gk = 0.55 + 0.75 * v
        let cR = cr + (g[0] * gk - cr) * gr
        let cG = cg + (g[1] * gk - cg) * gr
        let cB = cb + (g[2] * gk - cb) * gr
        if (pixels[i + 3] & GLOW_BIT) {
          // Brillo marcado por la escena (ojos): color puro y carácter lleno
          ch = R + G + B > 330 ? "@" : "o"
          cR = R
          cG = G * 0.7
          cB = B * 0.7
        }
        // Si un canal se pasa de 255 se divide por el más fuerte en vez de recortar (no cambia el tono)
        const mx = Math.max(cR, cG, cB)
        const f = mx > 255 ? 255 / mx : 1
        cells[o] = cR * f
        cells[o + 1] = cG * f
        cells[o + 2] = cB * f
        cells[o + 3] = GLYPH_OF.get(ch) ?? 0
      }
    }
    this.present()
  }

  // La estática en una celda: letra y tono de una hoja fija corrida unas celdas al azar en cada cuadro
  // (parece nueva sin calcular otra). Devuelve null si no hay estática
  private staticAt(amount: number, tick: number) {
    if (amount <= 0) return null
    const cells = this.cells
    const ox = Math.floor(hash(tick, 3) * STATIC_PAD)
    const oy = Math.floor(hash(tick, 9) * STATIC_PAD)
    const a = Math.min(1, amount * 1.1)
    return (c: number, r: number, o: number) => {
      const sc = c + ox
      const sr = r + oy
      const tone = STATIC_TONES[Math.floor(hash(sc * 7, sr * 3) * STATIC_TONES.length)] * a
      cells[o] = STATIC_RGB[0] * tone
      cells[o + 1] = STATIC_RGB[1] * tone
      cells[o + 2] = STATIC_RGB[2] * tone
      cells[o + 3] = GLYPH_OF.get(ramp(RAMPS.classic, hash(sc, sr * 11))) ?? 0
    }
  }

  // Pantalla de estática sola (mientras la escena se prepara)
  drawStatic(amount: number, tick: number) {
    const { cols, rows, cells } = this
    const st = this.staticAt(amount, tick)
    if (this.W <= 0 || !st) return
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const o = (r * cols + c) * 4
        if (hash(c + tick * 13, r + tick * 7) < amount * 0.95) st(c, r, o)
        else cells[o + 3] = 0
      }
    }
    this.present()
  }

  // Muestra las celdas: las estampa la GPU; si no puede, se escriben con fillText en el lienzo de
  // encima, juntando en una tira las celdas seguidas del mismo color
  private present() {
    this.clear()
    if (this.glyphs.draw(this.cells)) return
    const { cells, cols, rows, cw, lh } = this
    const ctx = this.ctx
    for (let r = 0; r < rows; r++) {
      let run = ""
      let runColor = ""
      let runStart = 0
      for (let c = 0; c <= cols; c++) {
        const o = (r * cols + c) * 4
        const g = c < cols ? cells[o + 3] : 0
        const color = g ? rgb([cells[o], cells[o + 1], cells[o + 2]]) : ""
        if (!g || color !== runColor) {
          if (run.trim()) {
            ctx.fillStyle = runColor
            ctx.fillText(run, runStart * cw, r * lh)
          }
          run = g ? GLYPHS[g] : ""
          runColor = color
          runStart = c
        } else run += GLYPHS[g]
      }
    }
  }

  // El halo: una copia borrosa encima. Alcanza con actualizarlo un cuadro sí y otro no.
  // (Se copia en el mismo cuadro en que se dibujaron las letras: después la GPU puede borrarlas)
  glow() {
    const g = this.gctx
    if (!g || !this.glowCanvas || this.glowTick++ % 2) return
    g.clearRect(0, 0, this.glowCanvas.width, this.glowCanvas.height)
    const src = this.glyphs.ok ? this.glyphs.canvas : this.canvas
    if (src.width) g.drawImage(src, 0, 0, this.glowCanvas.width, this.glowCanvas.height)
  }

  // Antes había que preparar una hoja de estática en un rato libre; ahora la estática sale sola
  warm() {
    return false
  }

  dispose() {
    this.glyphs.dispose()
  }
}
