// Motor · película ASCII: lo que la cámara ve, revelado en caracteres.
//
// La GPU dibuja la escena a una imagen chiquita (un píxel por celda de texto) y acá cada píxel se
// vuelve un carácter: la luz elige qué tan lleno es, los bordes eligen la dirección del trazo
// (- / | \) y el color se insinúa con la paleta de la isla. La cámara la usa en Camera.shoot().
//
// Dos niveles de detalle:
//   "classic" -> 12 escalones de luz y trazos solo en los bordes de profundidad (siluetas)
//   "fine"    -> 19 escalones y trazos también donde la luz cambia de golpe (el borde de un charco
//                de luz, el marco de una ventana encendida, el tubo contra el techo)

import { clamp, dirChar, hash, ramp, rgb } from "../../ascii/math"

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

const STATIC_TONES = [0.45, 0.7, 0.95].map((a) => rgb([200, 205, 215], a))
const STATIC_PAD = 8 // la hoja de estática tiene 8 celdas de más: se corre al azar y parece otra

export class AsciiFilm {
  readonly ctx: CanvasRenderingContext2D // por si el juego dibuja encima (la lluvia)
  W = 0 // tamaño en px de CSS
  H = 0
  cw = 5 // ancho y alto de una celda
  lh = 8
  cols = 0
  rows = 0
  pixels = new Uint8Array(0) // RGBA de la GPU; alpha = profundidad (254 = brillo marcado por la escena)
  private lum = new Float32Array(0)
  private coarse = 0 // calidad automática: cuántos puntos se agrandó la letra
  private sheet: HTMLCanvasElement | null = null
  private gctx: CanvasRenderingContext2D | null
  private glowTick = 0

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly glowCanvas: HTMLCanvasElement | null = null,
    readonly phone = false, // en el celular el color sale un poco más fuerte (la pantalla muestra más oscuro)
  ) {
    this.ctx = canvas.getContext("2d")!
    this.gctx = glowCanvas?.getContext("2d") ?? null
  }

  // Mide la pantalla y decide cuántas celdas entran
  resize() {
    const { canvas, ctx } = this
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W = (this.W = canvas.clientWidth)
    const H = (this.H = canvas.clientHeight)
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (this.glowCanvas) {
      this.glowCanvas.width = Math.ceil(W / 4)
      this.glowCanvas.height = Math.ceil(H / 4)
    }
    let px = (W < 640 ? FONT_PX_SMALL : FONT_PX) + this.coarse
    const measure = () => {
      ctx.font = `${px}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`
      return ctx.measureText("M").width
    }
    this.cw = measure()
    // Con pantallas enormes se agranda la letra para no pasarse de celdas
    while ((W / this.cw) * (H / (px * 1.1)) > MAX_CELLS) {
      px += 1
      this.cw = measure()
    }
    ctx.textBaseline = "top"
    this.lh = Math.round(px * 1.1)
    this.cols = Math.ceil(W / this.cw)
    this.rows = Math.ceil(H / this.lh)
    this.pixels = new Uint8Array(this.cols * this.rows * 4)
    this.lum = new Float32Array(this.cols * this.rows)
    this.sheet = null
  }

  // ¿Cambió el tamaño de la pantalla desde la última medida?
  stale() {
    return this.canvas.clientWidth !== this.W || this.canvas.clientHeight !== this.H
  }

  // Calidad automática: si los cuadros tardan (ms promedio), la letra crece un punto (menos celdas);
  // si sobra tiempo, vuelve a achicarse. Devuelve true si cambió.
  adapt(ms: number) {
    if (ms > 24 && this.coarse < MAX_COARSE) this.coarse++
    else if (ms < 9 && this.coarse > 0) this.coarse--
    else return false
    this.resize()
    return true
  }

  // Un punto que la cámara proyectó (unidades de alto de pantalla desde el centro) en px de pantalla
  toScreen(q: { x: number; y: number }) {
    const span = this.rows * this.lh
    return { x: (this.cols * this.cw) / 2 + q.x * span, y: span / 2 - q.y * span }
  }

  clear() {
    this.ctx.clearRect(0, 0, this.W, this.H)
  }

  // Revela los píxeles en caracteres. staticAmt: cuánta estática tapa la imagen (0..1)
  develop(look: AsciiLook, staticAmt: number, tick: number) {
    const { ctx, pixels, lum, cols, rows, cw, lh } = this
    const exposure = look.exposure
    const sat = look.saturation ?? 0.5
    const gr = look.grade ?? 0.45
    const fine = (look.detail ?? "fine") === "fine"
    const RAMP = RAMPS[fine ? "fine" : "classic"]
    const colorK = this.phone ? 1.15 : 1
    // La imagen de WebGL viene de abajo hacia arriba
    const at = (c: number, r: number) => ((rows - 1 - clamp(r, 0, rows - 1)) * cols + clamp(c, 0, cols - 1)) * 4
    const li = (c: number, r: number) => clamp(r, 0, rows - 1) * cols + clamp(c, 0, cols - 1)
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
    this.clear()
    // La estática no se escribe letra por letra (eran miles de dibujos por cuadro y eso trababa
    // las transiciones): las celdas tapadas se saltean y encima va una imagen de estática ya hecha.
    for (let r = 0; r < rows; r++) {
      let runColor = ""
      let runStart = 0
      let run = ""
      const y = r * lh
      for (let c = 0; c <= cols; c++) {
        let ch = ""
        let color = ""
        if (c < cols && staticAmt > 0 && hash(c + tick * 13, r + tick * 7) < staticAmt * 0.95) {
          if (run) run += " " // celda tapada por la estática: la escena no la dibuja
          continue
        }
        if (c < cols) {
          const i = at(c, r)
          const R = pixels[i]
          const G = pixels[i + 1]
          const B = pixels[i + 2]
          const l = lightOf(R, G, B)
          // Borde de profundidad: el trazo sigue el contorno
          const gx = pixels[at(c + 1, r) + 3] - pixels[at(c - 1, r) + 3]
          const gy = pixels[at(c, r + 1) + 3] - pixels[at(c, r - 1) + 3]
          const d = pixels[i + 3]
          let edge = Math.abs(gx) + Math.abs(gy) > 6 + d * 0.12 && l > 0.06
          const v = clamp(lum[r * cols + c], 0, 0.999)
          // Nunca vacío: hasta la sombra tiene una textura tenue
          ch = edge ? dirChar(-gy, gx) : ramp(RAMP, Math.max(v, 0.09))
          if (fine && !edge) {
            // Borde de luz: donde la luz salta de un vecino al otro, el trazo lo dibuja (del lado claro)
            // Solo del lado claro (así el trazo queda de una celda de ancho, no doble)
            const lx = lum[li(c + 1, r)] - lum[li(c - 1, r)]
            const ly = lum[li(c, r + 1)] - lum[li(c, r - 1)]
            const lo = Math.min(lum[li(c + 1, r)], lum[li(c - 1, r)], lum[li(c, r + 1)], lum[li(c, r - 1)])
            if (Math.abs(lx) + Math.abs(ly) > LIGHT_EDGE && v > 0.3 && v - lo > LIGHT_EDGE * 0.6) {
              edge = true
              ch = dirChar(-ly, lx)
            }
          }
          // Casi monocromo: el color se insinúa, la luz manda
          const gray = l * 255
          let k = ((0.3 + 0.95 * v) * colorK) / Math.max(l, 0.1)
          if (edge) k *= 1.25
          // Mezcla el color de la escena con la paleta de la isla según la luz
          const g = gradeAt(v)
          const cr = (gray + (R - gray) * sat) * k
          const cg = (gray + (G - gray) * sat) * k
          const cb = (gray + (B - gray) * sat) * k
          const gk = 0.55 + 0.75 * v
          color = rgb([cr + (g[0] * gk - cr) * gr, cg + (g[1] * gk - cg) * gr, cb + (g[2] * gk - cb) * gr])
          if (d === 254) {
            // Brillo marcado por la escena (ojos): color puro y carácter lleno
            ch = R + G + B > 330 ? "@" : "o"
            color = rgb([R, G * 0.7, B * 0.7])
          }
          if (ch === " ") {
            if (run) run += " "
            continue
          }
        }
        if (color !== runColor || c === cols) {
          if (run.trim()) {
            ctx.fillStyle = runColor
            ctx.fillText(run, runStart * cw, y)
          }
          runColor = color
          runStart = c
          run = ch
        } else run += ch
      }
    }
    if (staticAmt > 0) this.drawStatic(staticAmt * 1.1, tick)
  }

  // El halo: una copia borrosa encima. Alcanza con actualizarlo un cuadro sí y otro no
  glow() {
    const g = this.gctx
    if (!g || !this.glowCanvas || this.glowTick++ % 2) return
    g.clearRect(0, 0, this.glowCanvas.width, this.glowCanvas.height)
    g.drawImage(this.canvas, 0, 0, this.glowCanvas.width, this.glowCanvas.height)
  }

  // ¿Ya está hecha la hoja de estática? Si no, la hace (tarda: conviene llamarla en un rato libre)
  warm() {
    if (this.sheet || this.W <= 0) return false
    this.staticSheet()
    return true
  }

  // Una sola hoja de estática hecha de antemano, un poco más grande que la pantalla. En cada cuadro se
  // muestra corrida unas celdas al azar: parece estática nueva sin tener que escribirla de nuevo.
  // (Se rehace si cambia el tamaño.)
  private staticSheet() {
    if (this.sheet) return this.sheet
    const { canvas, W, H, cw, lh, cols, rows } = this
    const kx = canvas.width / W
    const ky = canvas.height / H
    const sc = document.createElement("canvas")
    sc.width = Math.ceil((W + STATIC_PAD * cw) * kx)
    sc.height = Math.ceil((H + STATIC_PAD * lh) * ky)
    const sx = sc.getContext("2d")!
    sx.setTransform(kx, 0, 0, ky, 0, 0)
    sx.font = this.ctx.font
    sx.textBaseline = "top"
    for (let tone = 0; tone < STATIC_TONES.length; tone++) {
      sx.fillStyle = STATIC_TONES[tone]
      for (let r = 0; r < rows + STATIC_PAD; r++) {
        let line = ""
        for (let c = 0; c < cols + STATIC_PAD; c++) {
          line += Math.floor(hash(c * 7, r * 3) * STATIC_TONES.length) === tone ? ramp(RAMPS.classic, hash(c, r * 11)) : " "
        }
        sx.fillText(line, 0, r * lh)
      }
    }
    this.sheet = sc
    return sc
  }

  drawStatic(amount: number, tick: number) {
    const { canvas, ctx, W, H } = this
    if (W <= 0) return
    const sh = this.staticSheet()
    const ox = Math.floor(hash(tick, 3) * STATIC_PAD) * this.cw * (canvas.width / W)
    const oy = Math.floor(hash(tick, 9) * STATIC_PAD) * this.lh * (canvas.height / H)
    ctx.globalAlpha = Math.min(1, amount)
    ctx.drawImage(sh, ox, oy, canvas.width, canvas.height, 0, 0, W, H)
    ctx.globalAlpha = 1
  }
}
