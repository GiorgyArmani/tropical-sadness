// La isla: palmeras, la tele con su silueta, peces, aves y la avioneta con el cartel

import { hash, level, mixRGB, ramp, rgb, type Cell, type RGB } from "../math"
import { drawBox, drawJumpers, drawPalm, drawSchools, type Palm, type PalmStyle } from "../props"
import type { Frame, Scene } from "../types"

const TV = ["#5a2a0c", "#b8561a", "#ff9a3c", "#ffd09a"]
const SCREEN = ["#0b3a20", "#1e9a4c", "#5cff8a", "#e6fff0"]

const PALMS: Palm[] = [
  { x: -0.62, z: 0.2, h: 0.24, lean: [-0.4, 0.1], size: 0.17, phase: 0.0 },
  { x: -0.3, z: -0.4, h: 0.5, lean: [-0.2, -0.15], size: 0.24, phase: 1.3 },
  { x: -0.42, z: 0.45, h: 0.36, lean: [0.2, 0.25], size: 0.2, phase: 2.1 },
  { x: 0.26, z: -0.15, h: 0.26, lean: [0.1, -0.2], size: 0.17, phase: 0.7 },
  { x: 0.44, z: -0.45, h: 0.48, lean: [0.22, -0.2], size: 0.23, phase: 1.8 },
  { x: 0.62, z: 0.3, h: 0.2, lean: [0.45, 0.15], size: 0.15, phase: 2.6 },
  { x: 0.05, z: -0.75, h: 0.42, lean: [0.0, -0.3], size: 0.21, phase: 3.1 },
  { x: -0.6, z: -0.55, h: 0.3, lean: [-0.25, -0.25], size: 0.18, phase: 0.4 },
  { x: 0.34, z: 0.62, h: 0.22, lean: [0.15, 0.35], size: 0.15, phase: 1.1 },
]

const PALM_STYLE: PalmStyle = {
  leaf: (v) => (v < 0.5 ? mixRGB([20, 95, 40], [45, 200, 75], v * 2) : mixRGB([45, 200, 75], [215, 255, 170], (v - 0.5) * 2)),
  trunk: (v) =>
    v < 0.5 ? mixRGB([95, 38, 8], [215, 105, 25], v * 2) : mixRGB([215, 105, 25], [255, 215, 150], (v - 0.5) * 2),
  fronds: 9,
  elev: [0.55, 0.2, 0.42, 0.05, 0.5, 0.28, 0.12, 0.6, 0.32],
  coconuts: true,
}

// La tele: 13 x 8 x 7 celdas
const TV_W = 13
const TV_D = 8

// Pantalla: estática verde con una silueta que aparece y desaparece
const tvFront = (c: number, r: number, t: number): Cell => {
  const tick = Math.floor(t * 12)
  if (c >= TV_W - 3) {
    if (r === 2 || r === 4) return ["o", TV[3]]
    return [c === TV_W - 3 ? "|" : ":", TV[1]]
  }
  const sc = c - 1
  const sr = r - 1
  if (sc < 0 || sr < 0 || sr > 4) return ["|", TV[2]]
  const figure =
    Math.sin(t * 0.9) > -0.2 &&
    ((sr === 1 && sc === 4) || (sr === 2 && sc >= 3 && sc <= 5) || (sr === 3 && (sc === 3 || sc === 5)))
  if (figure) {
    const ch = sr === 1 ? "O" : sr === 2 ? (sc === 4 ? "|" : sc === 3 ? "/" : "\\") : sc === 3 ? "/" : "\\"
    return [ch, SCREEN[3]]
  }
  const n = hash(c + tick * 13, r + tick * 7)
  return [ramp(" .:-=+*#%@", n), level(SCREEN, n * 0.85 + (r % 2) * 0.1), true]
}

const tvBack = (c: number, r: number): Cell => {
  if (r === 2 && c >= 4 && c <= 8) return ["#", TV[1]]
  if (r === 4 && c >= 3 && c <= 9) return [c % 2 ? "=" : "-", TV[1]]
  if (r === 3 && c === 6) return ["@", TV[3]]
  return [(c + r) % 3 === 0 ? "." : " ", TV[1]]
}

const tvSide = (c: number, r: number): Cell => {
  if (r >= 2 && r <= 4 && c >= 2 && c <= TV_D - 3) return [c % 2 ? "|" : ":", TV[1]]
  return [" ", TV[1]]
}

const drawTV = (f: Frame) =>
  drawBox(f, {
    x: 0,
    z: 0,
    yaw: 0,
    w: TV_W,
    d: TV_D,
    h: 7,
    size: 0.35,
    minScale: 0.45,
    front: tvFront,
    back: tvBack,
    side: tvSide,
    edge: TV[2],
    top: (set, mid, row0) => {
      // Antenas
      set(mid - 3, row0 - 3, "\\", TV[1])
      set(mid + 3, row0 - 3, "/", TV[1])
      set(mid - 2, row0 - 2, "\\", TV[1])
      set(mid + 2, row0 - 2, "/", TV[1])
      set(mid - 1, row0 - 1, "\\", TV[2])
      set(mid + 1, row0 - 1, "/", TV[2])
      set(mid, row0 - 1, "o", TV[3])
    },
  })

// Aves: siluetas oscuras contra el cielo, solo con luz y sin lluvia
const drawBirds = (f: Frame) => {
  const { t, W, H, cw, lh, cx, plot, sky } = f
  if (sky.light <= 0.45 || f.calm <= 0.4) return
  const birdCol = rgb(mixRGB(sky.top, [18, 22, 38], 0.75))
  // Bandadas en V cruzando a distinta altura y velocidad
  for (let fl = 0; fl < 2; fl++) {
    const dir = fl ? -1 : 1
    const span = W + 700
    const run = (t * (26 + fl * 9) + fl * 900) % span
    const lx = dir > 0 ? run - 350 : span - run - 350
    const ly = H * (0.12 + fl * 0.1) + Math.sin(t * 0.4 + fl) * lh
    const half = 2 + fl
    for (let j = -half; j <= half; j++) {
      const bx = lx - dir * Math.abs(j) * cw * 2.6
      const by = ly + j * lh * 0.55 + Math.abs(j) * lh * 0.35
      plot(bx, by, Math.sin(t * 6 + j * 1.3 + fl) > 0 ? "v" : "-", birdCol)
    }
  }
  // Una fragata planeando en círculos, alto sobre la isla
  const fa = t * 0.22
  const fx = cx + W * 0.18 + Math.cos(fa) * W * 0.06
  const fy = H * 0.14 + Math.sin(fa) * lh * 2.5
  const wings = Math.sin(t * 0.9) > 0.85 ? ["\\", "v", "/"] : ["-", "v", "-"]
  for (let j = 0; j < 3; j++) plot(fx + (j - 1) * cw, fy, wings[j], birdCol)
}

// Avioneta: pasa de vez en cuando, a veces con un cartel; de noche se ven sus luces
const drawPlane = (f: Frame) => {
  const { t, W, H, cw, lh, plot, wea, L } = f
  const planeSlot = Math.floor(t / 70)
  if (hash(planeSlot, 21) >= 0.85 * (1 - wea.storm) * (1 - wea.fog * 0.7) * (1 - wea.rain * 0.5)) return
  const dir = hash(planeSlot, 24) > 0.5 ? 1 : -1
  const elapsed = t - planeSlot * 70 - 4
  const banner = hash(planeSlot, 23) > 0.45 ? "[ TROPICAL SADNESS ]" : ""
  const tail = banner.length + 4
  const nose = dir > 0 ? -cw * 8 + elapsed * 55 : W + cw * 8 - elapsed * 55
  if (elapsed <= 0 || nose <= -cw * (tail + 8) || nose >= W + cw * (tail + 8)) return
  const py = H * (0.07 + hash(planeSlot, 22) * 0.12) + Math.sin(t * 0.6) * lh * 0.3
  const dark = f.night > 0.5
  const bodyCol = rgb(dark ? [70, 72, 96] : [238, 238, 244], dark ? 1 : L)
  const prop = ["|", "/", "-", "\\"][Math.floor(t * 20) % 4]
  const top = dir > 0 ? " _|\\_" : "_/|_ "
  const body = dir > 0 ? `=-==O${prop}` : `${prop}O==-=`
  // El sprite se dibuja desde la cola hacia la nariz
  const x0 = dir > 0 ? nose - (body.length - 1) * cw : nose
  for (let j = 0; j < body.length; j++) plot(x0 + j * cw, py, body[j], bodyCol)
  for (let j = 0; j < top.length; j++) if (top[j] !== " ") plot(x0 + j * cw, py - lh, top[j], bodyCol)
  if (dark) {
    if (Math.sin(t * 6) > 0.3) plot(x0 + (dir > 0 ? 0 : body.length - 1) * cw, py, "*", rgb([255, 255, 255]))
    plot(x0 + 2 * cw, py - lh, ".", rgb(dir > 0 ? [255, 70, 70] : [90, 255, 120]))
    plot(x0 + 3 * cw, py - lh, ".", rgb(dir > 0 ? [90, 255, 120] : [255, 70, 70]))
  }
  if (banner) {
    // Cuerda y cartel ondeando detrás de la cola
    const rope = dir > 0 ? x0 - cw : x0 + body.length * cw
    for (let j = 0; j < 3; j++) plot(rope - dir * j * cw, py, "~", rgb([150, 150, 160], dark ? 0.5 : L))
    const start = rope - dir * 3 * cw
    for (let j = 0; j < banner.length; j++) {
      const ch = banner[dir > 0 ? banner.length - 1 - j : j]
      if (ch === " ") continue
      const wave = Math.sin(t * 4 - j * 0.45) * lh * 0.45
      plot(start - dir * j * cw, py + wave, ch, rgb([255, 214, 0], dark ? 0.45 : 1))
    }
  }
}

export const island: Scene = {
  backdrop: 0.8,
  id: "isla",
  name: "isla",
  label: "la isla",

  // Arena que recibe la luz del cielo
  land: (f) => {
    const tint = mixRGB(f.sky.hor, [70, 80, 170], f.night)
    const m = 0.2 + f.night * 0.45
    return {
      hi: mixRGB([255, 228, 92], tint, m),
      mid: mixRGB([255, 194, 58], tint, m),
      lo: mixRGB([255, 138, 60], tint, m),
      ramp: " .,:;_=*",
      sparkle: mixRGB([255, 250, 220], tint, f.night * 0.5),
    }
  },

  life: (f) => {
    drawSchools(f, f.night > 0.5 ? [90, 255, 225] : null)
    drawJumpers(f)
    drawBirds(f)
    drawPlane(f)
  },

  objects: (f) => {
    let tv: ReturnType<typeof drawTV> = []
    const items = PALMS.map((palm) => ({
      depth: f.project(palm.x * f.R, 0, palm.z * f.R)[2],
      draw: () => drawPalm(f, palm, PALM_STYLE),
    }))
    items.push({ depth: f.project(0, 0, 0)[2], draw: () => void (tv = drawTV(f)) })
    items.sort((a, b) => a.depth - b.depth).forEach((item) => item.draw())
    return tv
  },

  // Luciérnagas: de noche flotan entre las palmeras
  front: (f) => {
    const { t, cw, lh, cx, Rx, R, shoreY, plot } = f
    const count = Math.round(70 * f.night * f.calm)
    const col: RGB = [225, 255, 130]
    for (let i = 0; i < count; i++) {
      const fx = cx + (hash(i, 31) - 0.5) * Rx * 1.5 + Math.sin(t * 0.3 + i) * cw * 3
      const fy = shoreY - hash(i, 32) * R * 0.55 + Math.sin(t * 0.5 + i * 1.7) * lh * 1.5
      const blink = Math.sin(t * (1 + hash(i, 33) * 2) + i * 5)
      if (blink > 0.1) plot(fx, fy, blink > 0.7 ? "*" : blink > 0.4 ? "+" : ".", rgb(col, 0.55 + blink * 0.5))
    }
  },
}
