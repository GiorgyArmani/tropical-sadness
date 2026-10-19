// El cementerio de Merengothica: una isla-cementerio con cripta, lápidas, calabazas,
// palmeras secas, murciélagos, fuegos fatuos y un fantasma. Cielo violeta y luna llena naranja.

import { clamp, hash, level, mixRGB, ramp, rgb, type Cell, type RGB } from "../math"
import { drawBox, drawPalm, drawSchools, sprite, type Palm, type PalmStyle } from "../props"
import type { Frame, Kept, Scene } from "../types"

const STONE = ["#3a3548", "#6b6580", "#a49dbb", "#e0dcf0"]
const WOOD = ["#3b2418", "#7a4a2a", "#b8743f", "#e8b07a"]
const GLOW = ["#0b3a20", "#1e9a4c", "#5cff8a", "#e6fff0"] // la misma estática verde de la tele

// --- La cripta (17 x 11 x 10) ---

const CRYPT_FRONT = [
  "      _/^\\_      ",
  "  _.-'     '-._  ",
  " /_____________\\ ",
  " | ||  .-.  || | ",
  " | || /   \\ || | ",
  " | || |   | || | ",
  " | || |   | || | ",
  " | || |   | || | ",
  "_|_||_|___|_||_|_",
  "=================",
]
const CRYPT_SIDE = [
  "           ",
  "  _______  ",
  " /_______\\ ",
  " |  | |  | ",
  " |  | |  | ",
  " |  | |  | ",
  " |  | |  | ",
  " |  | |  | ",
  "_|__|_|__|_",
  "===========",
]

const stonePaint = (ch: string, _c: number, r: number) => {
  if (ch === "=" || ch === "_") return STONE[1]
  if (r <= 2) return STONE[3]
  return ch === " " ? STONE[0] : STONE[2]
}
const cryptStone = sprite(CRYPT_FRONT, stonePaint)

// Por la puerta entreabierta se ve estática verde y, a veces, dos ojos
const cryptFront = (c: number, r: number, t: number): Cell | null => {
  if (r >= 4 && r <= 7 && c >= 7 && c <= 9) {
    const eyesOpen = Math.sin(t * 0.7) > 0.1 && Math.sin(t * 5.3) > -0.9
    if (r === 5 && c !== 8 && eyesOpen) return ["o", "#e8ff7a"]
    const tick = Math.floor(t * 10)
    const n = hash(c + tick * 13, r + tick * 7)
    return [ramp(" .:-=+*", n * 0.8), level(GLOW, n * 0.7), true]
  }
  return cryptStone(c, r, t)
}
const cryptBack = (c: number, r: number, t: number): Cell | null => {
  if (r >= 3 && r <= 7 && c >= 6 && c <= 10) return [(c + r) % 3 === 0 ? "." : " ", STONE[1]]
  return cryptStone(c, r, t)
}

const drawCrypt = (f: Frame) =>
  drawBox(f, {
    x: 0,
    z: -0.05,
    yaw: 0,
    w: 17,
    d: 11,
    h: 10,
    size: 0.36,
    minScale: 1,
    front: cryptFront,
    back: cryptBack,
    side: sprite(CRYPT_SIDE, stonePaint),
    top: (set, mid, row0) => {
      // Cruz en el techo
      set(mid, row0 - 3, "|", STONE[3])
      set(mid - 1, row0 - 2, "-", STONE[3])
      set(mid, row0 - 2, "+", STONE[3])
      set(mid + 1, row0 - 2, "-", STONE[3])
      set(mid, row0 - 1, "|", STONE[2])
    },
  })

// --- Lápidas y cruces ---

const tombPaint = (ch: string) => (/[A-Z+]/.test(ch) ? STONE[3] : ch === "_" ? STONE[1] : ch === " " ? STONE[0] : STONE[2])
const TOMB = {
  front: sprite([" .---. ", "/     \\", "| RIP |", "| --- |", "|     |", "|_____|"], tombPaint),
  back: sprite([" .---. ", "/  .  \\", "|     |", "|   . |", "| .   |", "|_____|"], tombPaint),
  side: sprite([" .", "||", "||", "||", "||", "||"], tombPaint),
}
const woodPaint = (ch: string) => (ch === "+" ? WOOD[3] : ch === "_" ? WOOD[1] : WOOD[2])
const CROSS = {
  front: sprite(["  .  ", "--+--", "  |  ", "  |  ", "  |  ", " _|_ "], woodPaint),
  side: sprite([".", "+", "|", "|", "|", "|"], woodPaint),
}

type Grave = { x: number; z: number; yaw: number; kind: "tomb" | "cross" }
const GRAVES: Grave[] = [
  { x: -0.55, z: 0.15, yaw: 0.15, kind: "tomb" },
  { x: -0.35, z: 0.45, yaw: -0.2, kind: "cross" },
  { x: 0.4, z: 0.35, yaw: 0.1, kind: "tomb" },
  { x: 0.6, z: -0.1, yaw: -0.25, kind: "cross" },
  { x: -0.2, z: -0.5, yaw: 0.2, kind: "tomb" },
  { x: 0.25, z: -0.55, yaw: -0.1, kind: "cross" },
  { x: -0.62, z: -0.3, yaw: 0.3, kind: "tomb" },
  { x: 0.05, z: 0.62, yaw: -0.15, kind: "tomb" },
  { x: 0.68, z: 0.42, yaw: 0.25, kind: "cross" },
]

const drawGrave = (f: Frame, g: Grave) =>
  drawBox(f, {
    x: g.x,
    z: g.z,
    yaw: g.yaw,
    ...(g.kind === "tomb"
      ? { w: 7, d: 2, h: 6, size: 0.12, front: TOMB.front, back: TOMB.back, side: TOMB.side }
      : { w: 5, d: 1, h: 6, size: 0.09, front: CROSS.front, back: CROSS.front, side: CROSS.side }),
    minScale: 1,
  })

// --- Palmeras secas ---

const DEAD_PALMS: Palm[] = [
  { x: -0.72, z: -0.62, h: 0.46, lean: [-0.3, -0.1], size: 0.2, phase: 0.6 },
  { x: 0.52, z: -0.68, h: 0.52, lean: [0.25, -0.15], size: 0.21, phase: 2.2 },
  { x: -0.7, z: 0.5, h: 0.3, lean: [-0.35, 0.2], size: 0.16, phase: 1.4 },
]
const DEAD_STYLE: PalmStyle = {
  leaf: (v) => mixRGB([40, 25, 40], [140, 105, 90], v),
  trunk: (v) => mixRGB([45, 35, 50], [165, 140, 135], v),
  fronds: 5,
  elev: [0.1, -0.25, 0.05, -0.35, -0.05],
  droop: 0.45,
  length: 0.85,
  ragged: 0.45,
}

// --- Calabazas: de frente se ve la cara encendida, de espaldas solo el zapallo ---

type Pumpkin = { x: number; z: number; yaw: number; phase: number }
const PUMPKINS: Pumpkin[] = [
  { x: -0.25, z: 0.28, yaw: 0, phase: 0 },
  { x: 0.3, z: 0.18, yaw: 0.4, phase: 1.7 },
  { x: 0.15, z: 0.45, yaw: -0.3, phase: 3.1 },
  { x: -0.45, z: -0.05, yaw: 0.6, phase: 4.4 },
  { x: 0.62, z: -0.35, yaw: -0.5, phase: 2.5 },
]
const drawPumpkin = (f: Frame, p: Pumpkin) => {
  const { R, t, cw, lh, setCell, project, ground } = f
  const wx = p.x * R
  const wz = p.z * R
  const [sx, sy] = project(wx, ground(wx, wz), wz)
  const c0 = Math.round(sx / cw) - 2
  const r0 = Math.floor((sy + lh * 0.6) / lh) - 2
  const shell = rgb([255, 120, 20], 0.7 + 0.3 * f.L)
  setCell(c0 + 1, r0, "_", shell)
  setCell(c0 + 2, r0, ")", rgb([110, 170, 60], 0.6 + 0.4 * f.L))
  setCell(c0 + 3, r0, "_", shell)
  setCell(c0, r0 + 1, "(", shell)
  setCell(c0 + 4, r0 + 1, ")", shell)
  if (Math.cos(f.angle + p.yaw) > 0) {
    // La vela de adentro titila
    const flick = clamp(0.7 + 0.3 * Math.sin(t * 13 + p.phase) * Math.sin(t * 7.7 + p.phase * 2), 0, 1)
    const face = rgb([255, 225, 90], flick)
    setCell(c0 + 1, r0 + 1, "^", face)
    setCell(c0 + 2, r0 + 1, "v", face)
    setCell(c0 + 3, r0 + 1, "^", face)
  } else {
    for (let j = 1; j <= 3; j++) setCell(c0 + j, r0 + 1, j === 2 ? "|" : ":", rgb([200, 90, 20], 0.6 + 0.3 * f.L))
  }
}

// --- Velas: frente a cada tumba, en la escalinata de la cripta y sueltas por el pasto ---

type Candle = { x: number; z: number; tall: number; phase: number }
const CANDLES: Candle[] = [
  ...GRAVES.flatMap((g, gi) =>
    [-0.045, 0.01, 0.05].slice(0, 2 + (gi % 2)).map((dx, k) => ({
      x: g.x + dx,
      z: g.z + 0.07,
      tall: k % 2,
      phase: gi * 3.1 + k * 1.7,
    })),
  ),
  ...[-0.17, -0.11, 0.11, 0.17].map((x, k) => ({ x, z: 0.16, tall: 1, phase: 20 + k * 2.3 })),
  ...Array.from({ length: 22 }, (_, k) => ({
    x: (hash(k, 91) - 0.5) * 1.4,
    z: (hash(k, 92) - 0.5) * 1.3,
    tall: hash(k, 93) > 0.6 ? 1 : 0,
    phase: k * 4.7,
  })).filter((c) => Math.hypot(c.x, c.z) < 0.75 && Math.hypot(c.x, c.z + 0.05) > 0.28),
]

const flicker = (t: number, phase: number) =>
  clamp(0.75 + 0.15 * Math.sin(t * 11 + phase) + 0.1 * Math.sin(t * 23.7 + phase * 3), 0, 1)

const candleBase = (f: Frame, c: Candle) => {
  const wx = c.x * f.R
  const wz = c.z * f.R
  const [sx, sy] = f.project(wx, f.ground(wx, wz), wz)
  return [Math.floor(sx / f.cw), Math.floor((sy + f.lh * 0.6) / f.lh) - 1] as const
}

// Charco de luz cálida alrededor de la vela, más fuerte de noche. Atraviesa la niebla.
const drawCandleLight = (f: Frame, c: Candle, lit: Kept[]) => {
  const { t, cols, rows, chars, colors } = f
  const [col, row] = candleBase(f, c)
  const k = flicker(t, c.phase) * (0.5 + 0.5 * f.night)
  for (let dr = -3; dr <= 2; dr++) {
    for (let dc = -8; dc <= 8; dc++) {
      const cc = col + dc
      const rr = row + dr
      if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue
      const d = Math.hypot(dc / 8, dr / 3)
      if (d >= 1) continue
      const i = rr * cols + cc
      // El suelo vacío también se ilumina: aparece la textura de la tierra
      if (!chars[i]) {
        if ((dr < 0 && d > 0.5) || hash(cc, rr) > 1.15 - d) continue
        const h = hash(rr, cc)
        chars[i] = d < 0.4 ? (h > 0.5 ? ":" : ";") : d < 0.7 ? (h > 0.5 ? "," : "'") : "."
      }
      colors[i] = rgb(mixRGB([255, 100, 30], [255, 210, 120], 1 - d), (0.45 + 0.75 * (1 - d)) * k)
      lit.push({ i, ch: chars[i], col: colors[i] })
    }
  }
}

const drawCandle = (f: Frame, c: Candle, lit: Kept[]) => {
  const { t, cols, rows, chars, colors } = f
  const setCell = (cc: number, rr: number, ch: string, col: string) => {
    if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) return
    const i = rr * cols + cc
    chars[i] = ch
    colors[i] = col
    lit.push({ i, ch, col })
  }
  const [col, row] = candleBase(f, c)
  const k = flicker(t, c.phase)
  const wax = rgb([235, 225, 200], 0.55 + 0.45 * f.L)
  for (let j = 0; j <= c.tall; j++) setCell(col, row - j, "|", wax)
  // Llama que baila con el viento
  const sway = Math.sin(t * 3 + c.phase) + f.wind * 8
  const top = row - c.tall - 1
  setCell(col, top, Math.sin(t * 17 + c.phase) > -0.3 ? "*" : "+", rgb([255, 240, 170], 0.9 + 0.2 * k))
  if (Math.abs(sway) > 0.6) setCell(col + (sway > 0 ? 1 : -1), top, sway > 0 ? "'" : "`", rgb([255, 150, 50], k))
}

// --- Reja de hierro alrededor, con algunos barrotes caídos ---

const POSTS = 40
const drawFencePost = (f: Frame, k: number) => {
  if (hash(k, 77) > 0.85) return
  const { Rx, R, lh, cw, plot, project, ground } = f
  const iron = rgb([95, 85, 130], 0.6 + 0.4 * f.sky.light)
  const tip = rgb([150, 140, 190], 0.6 + 0.4 * f.sky.light)
  const at = (j: number): [number, number] => {
    const a = (j / POSTS) * Math.PI * 2
    return [Math.cos(a) * Rx * 0.86, Math.sin(a) * Rx * 0.86]
  }
  const height = Math.max(lh * 1.6, R * 0.07)
  const [wx, wz] = at(k)
  const g = ground(wx, wz)
  const [, by] = project(wx, g, wz)
  const [tx, ty] = project(wx, g + height, wz)
  for (let y = ty; y <= by; y += lh) plot(tx, y, y === ty ? "+" : "|", y === ty ? tip : iron)
  // Baranda hasta el próximo barrote, si no está rota
  if (hash(k, 78) > 0.75 || hash(k + 1, 77) > 0.85) return
  const [nx, nz] = at(k + 1)
  const [ex, ey] = project(nx, ground(nx, nz) + height * 0.8, nz)
  const [sx, sy] = project(wx, g + height * 0.8, wz)
  const steps = Math.ceil(Math.abs(ex - sx) / cw)
  for (let s = 1; s < steps; s++) {
    const u = s / steps
    plot(sx + (ex - sx) * u, sy + (ey - sy) * u, "-", iron)
  }
}

// --- Vida: murciélagos, un fantasma y fuegos fatuos ---

const drawBats = (f: Frame) => {
  const { t, W, H, cw, lh, plot, night } = f
  const col = night > 0.5 ? rgb([160, 125, 220], 0.85) : rgb(mixRGB(f.sky.top, [18, 12, 30], 0.8))
  const count = Math.round((4 + night * 6) * (0.4 + 0.6 * f.calm))
  for (let b = 0; b < count; b++) {
    const dir = b % 2 ? -1 : 1
    const span = W + 400
    const run = (t * (40 + hash(b, 1) * 30) + b * 517) % span
    const x = dir > 0 ? run - 200 : span - run - 200
    // Vuelo errático: sube y baja rápido
    const y =
      H * (0.08 + hash(b, 2) * 0.3) + Math.sin(t * (3 + hash(b, 3) * 2) + b) * lh * 1.2 + Math.sin(t * 0.7 + b) * lh * 2
    const up = Math.sin(t * 14 + b * 2) > 0
    const wings = up ? "^v^" : "-v-"
    for (let j = 0; j < 3; j++) plot(x + (j - 1) * cw, y, wings[j], col)
  }
}

const GHOST = [" .-. ", "(o o)", "| O |"]
const drawGhost = (f: Frame) => {
  const { t, R, cw, lh, plot, project, ground } = f
  // Aparece y se desvanece cada tanto
  const vis = clamp(Math.sin(t * 0.21) * 1.6 + 0.2, 0, 1)
  if (vis < 0.05) return
  const g = t * 0.12
  const wx = Math.cos(g) * R * 0.55
  const wz = Math.sin(g) * R * 0.35
  const [gx, gy] = project(wx, ground(wx, wz) + R * 0.3 + Math.sin(t * 1.2) * lh, wz)
  const tail = Math.floor(t * 4) % 2 ? "'~^~'" : "'^~^'"
  const col = rgb([210, 255, 235], (0.35 + 0.65 * vis) * (0.7 + 0.3 * f.night))
  const tick = Math.floor(t * 8)
  ;[...GHOST, tail].forEach((line, r) => {
    for (let c = 0; c < line.length; c++) {
      if (line[c] === " " || hash(c + r * 7, tick) > vis) continue
      plot(gx + (c - 2) * cw, gy + (r - 2) * lh, line[c], col)
    }
  })
}

const drawWisps = (f: Frame) => {
  const { t, cw, lh, cx, Rx, R, shoreY, plot } = f
  const count = Math.round(24 * (0.3 + f.night * 0.7) * f.calm)
  const col: RGB = [120, 255, 200]
  for (let i = 0; i < count; i++) {
    const fx = cx + (hash(i, 41) - 0.5) * Rx * 1.4 + Math.sin(t * 0.2 + i) * cw * 6
    const fy = shoreY - hash(i, 42) * R * 0.35 + Math.sin(t * 0.4 + i * 1.3) * lh * 2
    const pulse = Math.sin(t * (0.8 + hash(i, 43)) + i * 3)
    if (pulse > -0.2) plot(fx, fy, pulse > 0.6 ? "o" : pulse > 0.2 ? "*" : ".", rgb(col, 0.45 + pulse * 0.5))
  }
}

export const cemetery: Scene = {
  backdrop: 0.6, // fondo oscuro: las tumbas y las velas resaltan
  id: "cementerio",
  name: "cementerio",
  label: "el cementerio",
  moon: { color: [255, 170, 80], full: true, size: 1.5 },
  sun: [255, 60, 35],
  water: [
    [26, 10, 46],
    [120, 18, 28],
  ],

  // Un infiernito: de noche cielo violeta con luna naranja, de día cielo rojo con nubes bordó
  mood: (sky, wea) => {
    const day = clamp((sky.light - 0.4) / 0.6, 0, 1)
    return [
      {
        ...sky,
        top: mixRGB(mixRGB(sky.top, [45, 20, 80], 0.45), [140, 14, 24], day * 0.85),
        hor: mixRGB(mixRGB(sky.hor, [255, 110, 40], 0.3), [255, 70, 20], day * 0.8),
        cloud: mixRGB(mixRGB(sky.cloud, [130, 80, 160], 0.45), [95, 16, 28], day * 0.8),
        ray: mixRGB(sky.ray, [255, 120, 50], 0.5 + day * 0.3),
        rays: sky.rays * (0.6 + day * 0.4),
        light: sky.light * 0.8,
      },
      // El cielo rojo no se agrisa del todo aunque llueva
      { ...wea, overcast: Math.min(wea.overcast, 0.3), fog: Math.max(wea.fog, 0.28), clouds: Math.max(wea.clouds, 0.3) },
    ]
  },

  // Tierra quemada con brasas que titilan, teñida de violeta de noche
  land: (f) => {
    const tint = mixRGB(f.sky.hor, [60, 40, 120], f.night)
    const m = 0.2 + f.night * 0.25
    return {
      hi: mixRGB([200, 140, 80], tint, m),
      mid: mixRGB([140, 85, 60], tint, m),
      lo: mixRGB([110, 60, 80], tint, m),
      ramp: " .,'`\";:",
      sparkle: [255, 120, 40],
    }
  },

  life: (f) => {
    drawSchools(f, [140, 255, 190])
    drawBats(f)
  },

  objects: (f) => {
    let crypt: Kept[] = []
    const lit: Kept[] = []
    const stones: Kept[] = []
    const { R, project } = f
    const items: { depth: number; draw: () => void }[] = [
      { depth: project(0, 0, -0.05 * R)[2], draw: () => void (crypt = drawCrypt(f)) },
      ...GRAVES.map((g) => ({ depth: project(g.x * R, 0, g.z * R)[2], draw: () => void stones.push(...drawGrave(f, g)) })),
      ...DEAD_PALMS.map((p) => ({ depth: project(p.x * R, 0, p.z * R)[2], draw: () => drawPalm(f, p, DEAD_STYLE) })),
      ...PUMPKINS.map((p) => ({ depth: project(p.x * R, 0, p.z * R)[2], draw: () => drawPumpkin(f, p) })),
      ...CANDLES.map((c) => ({ depth: project(c.x * R, 0, c.z * R)[2], draw: () => drawCandle(f, c, lit) })),
    ]
    // Primero la luz de las velas sobre el suelo, después los objetos
    for (const c of CANDLES) drawCandleLight(f, c, lit)
    for (let k = 0; k < POSTS; k++) {
      const a = (k / POSTS) * Math.PI * 2
      items.push({
        depth: project(Math.cos(a) * f.Rx * 0.86, 0, Math.sin(a) * f.Rx * 0.86)[2],
        draw: () => drawFencePost(f, k),
      })
    }
    items.sort((a, b) => a.depth - b.depth).forEach((item) => item.draw())
    // La cripta, las tumbas y la luz de las velas quedan por encima de la niebla, sin tapar lo que tienen delante
    return [...crypt, ...stones, ...lit]
  },

  front: (f) => {
    drawWisps(f)
    drawGhost(f)
  },
}
