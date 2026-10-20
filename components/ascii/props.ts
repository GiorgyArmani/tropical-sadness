// Piezas que cualquier escena puede usar: palmeras, objetos con caras (tele, lápidas, cripta) y peces

import { clamp, dirChar, hash, mixRGB, ramp, rgb, type Cell, type RGB } from "./math"
import type { Frame, Kept } from "./types"

// --- Palmeras ---

// Posición relativa al radio de la escena. x: derecha, z: hacia la cámara en la vista "Frente".
export type Palm = { x: number; z: number; h: number; lean: [number, number]; size: number; phase: number }

export type PalmStyle = {
  leaf: (v: number) => RGB
  trunk: (v: number) => RGB
  fronds: number
  elev: number[] // elevación de cada hoja (radianes)
  droop?: number // cuánto más se caen las hojas
  length?: number // largo de las hojas
  ragged?: number // 0 a 1: hojas comidas (palmeras secas)
  coconuts?: boolean
}

const DENSE_RAMP = ":-=+*#%@"

// Palmera sombreada: la forma la dan los trazos, la luz la dan el color y la densidad del carácter
export const drawPalm = (f: Frame, palm: Palm, style: PalmStyle) => {
  const { R, t, cw, lh, cols, rows, chars, colors, shade, project, ground, wind, lightSide } = f
  const id = f.newShape()
  const cells: number[] = []
  const pAmb = 0.75 + 0.25 * f.sky.light
  const step = cw * 0.85

  const shadeCell = (px: number, py: number, ch: string, v: number, col: (v: number) => RGB) => {
    const c = Math.floor(px / cw)
    const r = Math.floor(py / lh)
    if (c < 0 || r < 0 || c >= cols || r >= rows) return
    const i = r * cols + c
    const k = clamp(v, 0, 1)
    chars[i] = ch || ramp(DENSE_RAMP, k)
    colors[i] = rgb(col(k), pAmb)
    if (shade[i] !== id) cells.push(i)
    shade[i] = id
  }

  const wx = palm.x * R
  const wz = palm.z * R
  const ph = palm.h * R
  const swayX = (wind + Math.sin(t * 1.1 + palm.phase) * 0.03) * ph
  const swayZ = Math.sin(t * 0.9 + palm.phase * 2) * 0.02 * ph
  const base: [number, number, number] = [wx, ground(wx, wz) - lh * 0.4, wz]
  const top: [number, number, number] = [wx + palm.lean[0] * ph + swayX, base[1] + ph, wz + palm.lean[1] * ph + swayZ]
  const ctrl: [number, number, number] = [wx + palm.lean[0] * ph * 0.15, base[1] + ph * 0.55, wz + palm.lean[1] * ph * 0.15]

  // Tronco: dos celdas de ancho, el lado que mira al astro denso y claro, el otro en sombra, con anillos
  const n = Math.ceil(ph / (lh * 0.5))
  for (let s = 0; s <= n; s++) {
    const u = s / n
    const p = [0, 1, 2].map((k) => (1 - u) * (1 - u) * base[k] + 2 * (1 - u) * u * ctrl[k] + u * u * top[k])
    const [px, py] = project(p[0], p[1], p[2])
    const ring = Math.floor(py / lh) % 2 === 0 ? 0.15 : 0
    const lit = lightSide > 0 ? px + cw * 0.5 : px - cw * 0.5
    const dark = lightSide > 0 ? px - cw * 0.5 : px + cw * 0.5
    shadeCell(lit, py, "", 0.85 - ring, style.trunk)
    if (palm.h > 0.3 && u < 0.85) shadeCell(dark, py, "", 0.3 - ring, style.trunk)
  }

  // Copa: hojas en espina de pescado, ordenadas por profundidad
  const L = palm.size * R * (style.length ?? 1)
  const fronds = Array.from({ length: style.fronds }, (_, fi) => {
    const phi = (fi / style.fronds) * Math.PI * 2 + palm.phase + Math.sin(t * 1.6 + palm.phase + fi * 0.9) * 0.06
    const elev = style.elev[fi % style.elev.length] + Math.sin(t * 1.3 + fi) * 0.04
    const len = L * (0.82 + hash(fi, palm.phase * 10) * 0.3)
    const dir = [Math.cos(elev) * Math.cos(phi), Math.sin(elev), Math.cos(elev) * Math.sin(phi)]
    const tipDepth = project(top[0] + dir[0] * len, top[1], top[2] + dir[2] * len)[2]
    return { fi, dir, len, tipDepth, droop: 0.3 + (1 - dir[1]) * 0.4 + (style.droop ?? 0) }
  }).sort((a, b) => a.tipDepth - b.tipDepth)

  const [tsx, tsy, tdepth] = project(...top)
  for (const fr of fronds) {
    // Las hojas de atrás quedan en sombra
    const facing = fr.tipDepth > tdepth ? 0 : -0.3
    const samples = Math.ceil(fr.len / step)
    let [lx0, ly0] = [tsx, tsy]
    for (let s = 1; s <= samples; s++) {
      const u = s / samples
      const wxp = top[0] + fr.dir[0] * fr.len * u + wind * fr.len * u * u * 0.5
      const wyp = top[1] + fr.dir[1] * fr.len * u - fr.droop * fr.len * u * u
      const wzp = top[2] + fr.dir[2] * fr.len * u
      const [px, py] = project(wxp, wyp, wzp)
      const dx = px - lx0
      const dy = py - ly0
      lx0 = px
      ly0 = py
      const mag = Math.hypot(dx, dy)
      if (mag < 0.01) continue
      const nx = dx / mag
      const ny = dy / mag

      // Foliolos a ambos lados: más claros los que miran al astro y hacia arriba
      if (u > 0.1 && s % 2 === 0 && hash(s, fr.fi + palm.phase) >= (style.ragged ?? 0)) {
        const leaf = L * 0.2 * (1 - u * 0.8)
        for (const side of [-1, 1]) {
          const ca = Math.cos(side * 1.0)
          const sa = Math.sin(side * 1.0)
          let lx = nx * ca - ny * sa
          let ly = nx * sa + ny * ca + 0.55
          const lm = Math.hypot(lx, ly) || 1
          lx /= lm
          ly /= lm
          const ch = dirChar(lx, ly)
          const lambert = clamp(0.5 + 0.4 * lx * lightSide - 0.35 * ly, 0, 1)
          const k = Math.max(1, Math.round(leaf / step))
          for (let j = 1; j <= k; j++) {
            const v = 0.2 + 0.75 * lambert * (1 - (j / k) * 0.35) + (1 - u) * 0.1 + facing
            shadeCell(px + lx * j * step, py + ly * j * step, ch, v, style.leaf)
          }
        }
      }
      // Nervio central: carácter denso que se aclara hacia la base
      shadeCell(px, py, "", 0.55 + (1 - u) * 0.4 + facing, style.leaf)
    }
  }

  // Cocos, iluminados del lado del astro
  if (style.coconuts) {
    for (const [ox, oy] of [[-1, 0.6], [1, 0.6], [0, 0]]) {
      shadeCell(tsx + ox * cw, tsy + oy * lh, ox === 0 ? "@" : "o", 0.6 + 0.3 * ox * lightSide, style.trunk)
    }
  }

  // Contorno vacío de una celda: separa la palmera del cielo, el suelo y las palmeras de atrás
  for (const i of cells) {
    const c = i % cols
    const around = [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, i - cols, i + cols]
    for (const j of around) {
      if (j < 0 || j >= chars.length || shade[j] === id) continue
      chars[j] = ""
      shade[j] = 255
    }
  }
}

// --- Objetos con caras (la tele, lápidas, cruces, la cripta) ---

// Cada cara recibe columna/fila del sprite original; null deja ver lo de atrás
export type FaceFn = (c: number, r: number, t: number) => Cell | null

export type BoxSpec = {
  x: number // posición relativa al radio de la escena
  z: number
  yaw: number
  w: number // ancho, fondo y alto del sprite, en celdas
  d: number
  h: number
  size: number // ancho relativo al radio, para que escale con la escena
  minScale: number
  front: FaceFn
  back: FaceFn // se espeja sola
  side: FaceFn
  edge?: string // color de un marco automático (la tele); sin él, el sprite trae su borde
  top?: (set: (c: number, r: number, ch: string, col: string) => void, mid: number, row0: number) => void
  // Zona del frente que es una entrada (la pantalla de la tele, la puerta de la cripta), en celdas del
  // sprite: [columna, fila, última columna, última fila]. Si el frente se ve, se avisa con f.portal()
  portal?: [number, number, number, number]
}

// Agrandar sin repetir trazos: cada línea se dibuja una sola vez dentro de su bloque
// (sc, nc: columna dentro del bloque y ancho; sr, nr: lo mismo en filas). El resto del bloque queda liso.
const upscale = (cell: Cell, sc: number, nc: number, sr: number, nr: number): Cell => {
  if ((nc === 1 && nr === 1) || cell[2]) return cell
  const [ch, col] = cell
  const mc = (nc - 1) >> 1
  const mr = (nr - 1) >> 1
  const blank: Cell = [" ", col]
  switch (ch) {
    case "|":
    case "(":
    case ")":
    case "[":
    case "]":
    case "{":
    case "}":
      return sc === mc ? cell : blank
    case "-":
    case "=":
    case "~":
      return sr === mr ? cell : blank
    case "_":
      return sr === nr - 1 ? cell : blank
    case "/":
      return sc === Math.floor(((nr - 1 - sr) * nc) / nr) ? cell : blank
    case "\\":
      return sc === Math.floor((sr * nc) / nr) ? cell : blank
    case ".":
    case ",":
      return sc === mc && sr === nr - 1 ? cell : blank
    case "'":
    case "`":
    case "^":
      return sc === mc && sr === 0 ? cell : blank
    case "+":
      return sc === mc && sr === mr ? cell : sc === mc ? ["|", col] : sr === mr ? ["-", col] : blank
    case "#":
    case "%":
    case "@":
    case ":":
    case ";":
    case " ":
      return cell // texturas y huecos: se repiten
    default:
      // Letras, ojos y adornos: una vez, en el centro del bloque
      return sc === mc && sr === mr ? cell : blank
  }
}

// Se ven una o dos caras según el ángulo, cada una escalada por su orientación.
// Devuelve sus celdas, por si la escena quiere redibujarlas encima del clima.
export const drawBox = (f: Frame, b: BoxSpec): Kept[] => {
  const { R, t, cw, lh, cols, rows, chars, colors, project, ground } = f
  const cells: Kept[] = []
  const set = (c: number, r: number, ch: string, col: string) => {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return
    const i = r * cols + c
    chars[i] = ch
    colors[i] = col
    cells.push({ i, ch, col })
  }
  const wx = b.x * R
  const wz = b.z * R
  const [sx, sy] = project(wx, ground(wx, wz), wz)
  const a = f.angle + b.yaw
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  type Face = { width: number; src: number; normalX: number; fn: (c: number, r: number) => Cell | null; front?: boolean }
  const faces: Face[] = []
  const raw = (R * b.size) / (b.w * cw)
  const scale = Math.max(b.minScale, raw)
  const fw = Math.round(b.w * scale * Math.abs(ca))
  const sw = Math.round(b.d * scale * Math.abs(sa))
  const dh = Math.round(b.h * scale)
  if (fw > 0) {
    faces.push(
      ca > 0
        ? { width: fw, src: b.w, normalX: -sa, fn: (c, r) => b.front(c, r, t), front: true }
        : { width: fw, src: b.w, normalX: sa, fn: (c, r) => b.back(b.w - 1 - c, r, t) },
    )
  }
  if (sw > 0) faces.push({ width: sw, src: b.d, normalX: sa > 0 ? ca : -ca, fn: (c, r) => b.side(c, r, t) })
  faces.sort((f1, f2) => f1.normalX - f2.normalX)

  const total = faces.reduce((s, fc) => s + fc.width, 0)
  let col0 = Math.round(sx / cw - total / 2)
  const row0 = Math.floor((sy + lh * 0.6) / lh) - dh
  b.top?.(set, col0 + Math.floor(total / 2), row0)

  // Cada celda de salida sabe de qué celda del sprite viene y en qué lugar del bloque cae
  const blocks = (out: number, src: number) => {
    const from = new Array<number>(out)
    const sub = new Array<number>(out)
    const len = new Array<number>(out)
    for (let k = 0; k < out; k++) from[k] = Math.min(src - 1, Math.floor(((k + 0.5) / out) * src))
    for (let k = 0; k < out; k++) {
      let a = k
      while (a > 0 && from[a - 1] === from[k]) a--
      let z = k
      while (z < out - 1 && from[z + 1] === from[k]) z++
      sub[k] = k - a
      len[k] = z - a + 1
    }
    return { from, sub, len }
  }
  const rowsMap = blocks(dh, b.h)
  const isLetter = (ch: string | undefined) => !!ch && /[A-Za-z0-9]/.test(ch)
  // Las palabras ("RIP") van juntas y centradas: separadas un paso entero, sin letras repetidas ni huecos desparejos
  const placeWord = (face: Face, srcC: number, srcR: number, c: number, sr: number, nr: number, cell: Cell): Cell => {
    if (sr !== (nr - 1) >> 1) return [" ", cell[1]]
    let a = srcC
    while (a > 0 && isLetter(face.fn(a - 1, srcR)?.[0])) a--
    let z = srcC
    while (z < face.src - 1 && isLetter(face.fn(z + 1, srcR)?.[0])) z++
    const k = face.width / face.src
    const sp = Math.max(1, Math.floor(k))
    const n = z - a + 1
    const base = Math.floor(((a + z + 1) / 2) * k - (n * sp) / 2 + (sp - 1) / 2)
    const j = (c - base) / sp
    if (!Number.isInteger(j) || j < 0 || j >= n) return [" ", cell[1]]
    return face.fn(a + j, srcR) ?? [" ", cell[1]]
  }

  for (const face of faces) {
    if (face.front && b.portal && f.portal) {
      // Dónde quedó la entrada en la pantalla, en px
      const [c0, r0, c1, r1] = b.portal
      const kx = face.width / face.src
      const ky = dh / b.h
      f.portal({ x: (col0 + c0 * kx) * cw, y: (row0 + r0 * ky) * lh, w: (c1 - c0 + 1) * kx * cw, h: (r1 - r0 + 1) * ky * lh })
    }
    const colsMap = blocks(face.width, face.src)
    for (let c = 0; c < face.width; c++) {
      const srcC = colsMap.from[c]
      for (let r = 0; r < dh; r++) {
        const srcR = rowsMap.from[r]
        let cell: Cell | null
        if (b.edge) {
          const edgeT = r === 0
          const edgeB = r === dh - 1
          const edgeL = c === 0
          const edgeR = c === face.width - 1
          if (edgeT || edgeB) cell = [edgeL || edgeR ? (edgeT ? "." : "'") : edgeT ? "-" : "=", b.edge]
          else if (edgeL || edgeR) cell = ["|", b.edge]
          else cell = face.fn(srcC, srcR)
        } else cell = face.fn(srcC, srcR)
        if (cell && !cell[2] && isLetter(cell[0])) cell = placeWord(face, srcC, srcR, c, rowsMap.sub[r], rowsMap.len[r], cell)
        else if (cell) cell = upscale(cell, colsMap.sub[c], colsMap.len[c], rowsMap.sub[r], rowsMap.len[r])
        if (cell) set(col0 + c, row0 + r, cell[0], cell[1])
      }
    }
    col0 += face.width
  }

  // Contorno vacío alrededor para que resalte sobre el suelo
  const own = new Set(cells.map((cell) => cell.i))
  for (const { i } of cells) {
    const c = i % cols
    for (const j of [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, i - cols, i + cols]) {
      if (j >= 0 && j < chars.length && !own.has(j)) chars[j] = ""
    }
  }
  return cells
}

// Cara hecha de texto: los espacios a los costados de cada línea son transparentes, los de adentro tapan
export const sprite = (lines: string[], paint: (ch: string, c: number, r: number, t: number) => string): FaceFn => {
  const bounds = lines.map((l) => (l.trim() ? [l.length - l.trimStart().length, l.trimEnd().length - 1] : null))
  return (c, r, t) => {
    const bound = bounds[r]
    if (!bound || c < bound[0] || c > bound[1]) return null
    const ch = lines[r][c] ?? " "
    return [ch, paint(ch, c, r, t)]
  }
}

// --- Peces ---

// Cardúmenes bajo la superficie: sombras tenues, o luces (bioluminiscencia) si glow
export const drawSchools = (f: Frame, glow: RGB | null) => {
  const { t, W, H, cw, lh, shoreY, plot } = f
  const seaTop = shoreY + lh * 2.5
  const shadow = mixRGB(f.seaNear, [0, 8, 22], 0.8)
  for (let s = 0; s < 3; s++) {
    const dir = s % 2 ? -1 : 1
    const span = W + 300
    const run = (t * (9 + s * 5) + s * 700) % span
    const sx = dir > 0 ? run - 150 : span - run - 150
    const sy = seaTop + (H - seaTop) * (0.2 + s * 0.25) + Math.sin(t * 0.5 + s) * lh
    const body = dir > 0 ? "><>" : "<><"
    for (let k = 0; k < 6; k++) {
      const fx = sx + (hash(s, k) - 0.5) * cw * 20 + Math.sin(t * 2 + k) * cw * 0.6
      const fy = sy + (hash(k, s) - 0.5) * lh * 3
      if (glow) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 3 + k * 1.7)
        for (let j = 0; j < 3; j++) plot(fx + (j - 1) * cw, fy, body[j], rgb(glow, 0.45 + pulse * 0.5))
        if (pulse > 0.6) plot(fx - dir * cw * (2 + (k % 2)), fy, ".", rgb(glow, 0.5))
      } else {
        for (let j = 0; j < 3; j++) plot(fx + (j - 1) * cw, fy, body[j], rgb(shadow))
      }
    }
  }
}

// Peces que saltan en arco: salpicadura al salir y al entrar, y ondas que se abren
export const drawJumpers = (f: Frame) => {
  const { t, W, H, cw, lh, shoreY, plot, L, calm } = f
  const seaTop = shoreY + lh * 2.5
  const fishCol: RGB = f.night > 0.5 ? [170, 195, 255] : [240, 245, 255]
  const jumpSlot = Math.floor(t / 2.5)
  for (let k = jumpSlot - 1; k <= jumpSlot; k++) {
    if (hash(k, 11) > 0.6 * calm + 0.1) continue
    const p = (t - (k * 2.5 + hash(k, 12) * 1.2)) / 1.1
    if (p < 0 || p > 2) continue
    const dir = hash(k, 15) > 0.5 ? 1 : -1
    const x0 = W * (0.05 + hash(k, 13) * 0.9)
    const y0 = seaTop + (H - seaTop) * hash(k, 14) * 0.75
    const width = cw * (6 + hash(k, 16) * 6)
    const xl = x0 + dir * width
    if (p <= 1) {
      const fx = x0 + dir * width * p
      const fy = y0 - 4 * p * (1 - p) * lh * (2 + hash(k, 17) * 2)
      const body = dir > 0 ? "><>" : "<><"
      for (let j = 0; j < 3; j++) plot(fx + (j - 1) * cw, fy, body[j], rgb(fishCol, L))
      if (p < 0.3) {
        plot(x0, y0, "o", rgb(fishCol, 0.8 * L))
        plot(x0 - cw, y0, "'", rgb(fishCol, 0.6 * L))
        plot(x0 + cw, y0, "'", rgb(fishCol, 0.6 * L))
      }
      if (p > 0.8) plot(xl, y0, "o", rgb(fishCol, 0.8 * L))
    } else {
      const r = (p - 1) * cw * 5
      const fade = (2 - p) * 0.7 * L
      plot(xl - r, y0, "(", rgb(fishCol, fade))
      plot(xl + r, y0, ")", rgb(fishCol, fade))
    }
  }
}
