"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

// Isla tropical en arte ASCII animado. La escena es 3D (palmeras, hojas y tele con
// sus cuatro caras) proyectada a una grilla de caracteres, y se puede girar en
// pasos de 90° como las vistas de Blender.

const FPS = 20
const TILT = 0.2 // cuánto se ve el "piso" de la isla desde arriba
const VIEWS = ["Frente", "Derecha", "Atrás", "Izquierda"]

// Cada paleta va de tenue a brillante (4 niveles)
const SKY_LAV = ["#2e2148", "#5a4290", "#9c7cf0", "#d6c4ff"]
const TV = ["#5a2a0c", "#b8561a", "#ff9a3c", "#ffd09a"]
const SCREEN = ["#0b3a20", "#1e9a4c", "#5cff8a", "#e6fff0"]

const SKY_RAMP = " .`'-:+*"

// Cielo según la hora local (0–24): arriba, horizonte, nubes, rayos, luz ambiente, estrellas
type RGB = [number, number, number]
type SkyKey = { h: number; top: RGB; hor: RGB; cloud: RGB; ray: RGB; rays: number; light: number; stars: number }
const NIGHT: Omit<SkyKey, "h"> = {
  top: [14, 14, 52],
  hor: [50, 34, 104],
  cloud: [70, 60, 140],
  ray: [140, 130, 220],
  rays: 0.25,
  light: 0.35,
  stars: 1,
}
const DAY: Omit<SkyKey, "h"> = {
  top: [70, 165, 255],
  hor: [170, 230, 255],
  cloud: [255, 255, 255],
  ray: [255, 250, 215],
  rays: 0.45,
  light: 1,
  stars: 0,
}
const SKY_KEYS: SkyKey[] = [
  { h: 0, ...NIGHT },
  { h: 5.2, ...NIGHT },
  { h: 6.3, top: [70, 70, 170], hor: [255, 150, 140], cloud: [255, 170, 210], ray: [255, 190, 150], rays: 0.8, light: 0.6, stars: 0.3 },
  { h: 7.5, top: [90, 160, 255], hor: [255, 220, 190], cloud: [255, 235, 245], ray: [255, 240, 200], rays: 0.6, light: 0.9, stars: 0 },
  { h: 9, ...DAY },
  { h: 16.5, ...DAY },
  { h: 17.8, top: [120, 120, 240], hor: [255, 190, 110], cloud: [255, 210, 160], ray: [255, 200, 110], rays: 0.8, light: 0.9, stars: 0 },
  { h: 18.8, top: [150, 60, 200], hor: [255, 100, 60], cloud: [255, 95, 185], ray: [255, 150, 70], rays: 1, light: 0.75, stars: 0 },
  { h: 19.6, top: [70, 36, 140], hor: [220, 70, 150], cloud: [170, 80, 210], ray: [230, 100, 160], rays: 0.6, light: 0.55, stars: 0.4 },
  { h: 20.6, ...NIGHT },
  { h: 24, ...NIGHT },
]
const SUNRISE = 6.3
const SUNSET = 19.2
const SAND_RAMP = " .,:;_=*"

// Clima: ciclo propio según el reloj real (igual para todos los visitantes); ?clima=lluvia lo fija
type Weather = { clouds: number; overcast: number; rain: number; storm: number; fog: number; wind: number }
const WEATHERS: Record<string, Weather> = {
  despejado: { clouds: 0, overcast: 0, rain: 0, storm: 0, fog: 0, wind: 0 },
  nublado: { clouds: 0.7, overcast: 0.45, rain: 0, storm: 0, fog: 0.1, wind: 0.3 },
  lluvia: { clouds: 0.9, overcast: 0.7, rain: 0.6, storm: 0, fog: 0.2, wind: 0.6 },
  tormenta: { clouds: 1, overcast: 0.9, rain: 1, storm: 1, fog: 0.15, wind: 1 },
  niebla: { clouds: 0.3, overcast: 0.55, rain: 0, storm: 0, fog: 1, wind: 0 },
}
// Peso de cada clima en el ciclo: lo más común es el cielo despejado
const WEATHER_ODDS: [string, number][] = [
  ["despejado", 4],
  ["nublado", 2.5],
  ["lluvia", 1.5],
  ["tormenta", 1],
  ["niebla", 1],
]
const WEATHER_SPAN = 240 // segundos que dura cada clima
const WEATHER_FADE = 25 // segundos de transición al siguiente

// Palmeras en coordenadas de mundo, relativas al radio de la isla.
// x: derecha, z: hacia la cámara en la vista "Frente". lean: inclinación (x, z).
const PALMS = [
  { x: -0.62, z: 0.2, h: 0.24, lean: [-0.4, 0.1], size: 0.17, phase: 0.0 },
  { x: -0.3, z: -0.4, h: 0.5, lean: [-0.2, -0.15], size: 0.24, phase: 1.3 },
  { x: -0.18, z: 0.45, h: 0.36, lean: [0.2, 0.25], size: 0.2, phase: 2.1 },
  { x: 0.26, z: -0.15, h: 0.26, lean: [0.1, -0.2], size: 0.17, phase: 0.7 },
  { x: 0.44, z: -0.45, h: 0.48, lean: [0.22, -0.2], size: 0.23, phase: 1.8 },
  { x: 0.62, z: 0.3, h: 0.2, lean: [0.45, 0.15], size: 0.15, phase: 2.6 },
  { x: 0.05, z: -0.75, h: 0.42, lean: [0.0, -0.3], size: 0.21, phase: 3.1 },
  { x: -0.6, z: -0.55, h: 0.3, lean: [-0.25, -0.25], size: 0.18, phase: 0.4 },
  { x: 0.34, z: 0.62, h: 0.22, lean: [0.15, 0.35], size: 0.15, phase: 1.1 },
]
const FRONDS = 9
const FROND_ELEV = [0.55, 0.2, 0.42, 0.05, 0.5, 0.28, 0.12, 0.6, 0.32]

// La tele: posición en el mundo, orientación y tamaño en celdas
const TV_POS = { x: 0.07, z: 0.22, yaw: 0 }
const TV_W = 13
const TV_D = 8
const TV_H = 7

const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}

const noise = (x: number, y: number) => {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash(xi, yi)
  const b = hash(xi + 1, yi)
  const c = hash(xi, yi + 1)
  const d = hash(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

const fbm = (x: number, y: number) => noise(x, y) * 0.6 + noise(x * 2.1, y * 2.1) * 0.3 + noise(x * 4.3, y * 4.3) * 0.1

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

const level = (palette: string[], v: number) => palette[clamp(Math.floor(v * 4), 0, 3)]

const mixRGB = (a: RGB, b: RGB, f: number): RGB => [
  a[0] + (b[0] - a[0]) * f,
  a[1] + (b[1] - a[1]) * f,
  a[2] + (b[2] - a[2]) * f,
]

const skyAt = (hour: number): SkyKey => {
  let i = 0
  while (i < SKY_KEYS.length - 2 && SKY_KEYS[i + 1].h <= hour) i++
  const a = SKY_KEYS[i]
  const b = SKY_KEYS[i + 1]
  let f = clamp((hour - a.h) / (b.h - a.h), 0, 1)
  f = f * f * (3 - 2 * f)
  const lerp = (x: number, y: number) => x + (y - x) * f
  return {
    h: hour,
    top: mixRGB(a.top, b.top, f),
    hor: mixRGB(a.hor, b.hor, f),
    cloud: mixRGB(a.cloud, b.cloud, f),
    ray: mixRGB(a.ray, b.ray, f),
    rays: lerp(a.rays, b.rays),
    light: lerp(a.light, b.light),
    stars: lerp(a.stars, b.stars),
  }
}

// Colores cuantizados para que el render pueda agrupar tramos del mismo color
const rgbCache = new Map<number, string>()
const rgb = (c: RGB, k = 1) => {
  const q = (v: number) => clamp(Math.round((v * k) / 12) * 12, 0, 255)
  const r = q(c[0])
  const g = q(c[1])
  const b = q(c[2])
  const key = (r << 16) | (g << 8) | b
  let str = rgbCache.get(key)
  if (!str) {
    str = `rgb(${r},${g},${b})`
    rgbCache.set(key, str)
  }
  return str
}

// Hora local en horas decimales; ?hora=18.5 en la URL la fija para previsualizar
const localHour = (forced: number | null) => {
  if (forced !== null) return forced
  const d = new Date()
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600
}

const weatherOfSegment = (seg: number) => {
  const total = WEATHER_ODDS.reduce((s, [, w]) => s + w, 0)
  let pick = hash(seg, 7.3) * total
  for (const [name, w] of WEATHER_ODDS) {
    pick -= w
    if (pick < 0) return WEATHERS[name]
  }
  return WEATHERS.despejado
}

const weatherNow = (forced: Weather | null): Weather => {
  if (forced) return forced
  const s = Date.now() / 1000
  const seg = Math.floor(s / WEATHER_SPAN)
  const cur = weatherOfSegment(seg)
  const into = s - seg * WEATHER_SPAN
  if (into >= WEATHER_FADE) return cur
  const prev = weatherOfSegment(seg - 1)
  let f = into / WEATHER_FADE
  f = f * f * (3 - 2 * f)
  const mix = (k: keyof Weather) => prev[k] + (cur[k] - prev[k]) * f
  return {
    clouds: mix("clouds"),
    overcast: mix("overcast"),
    rain: mix("rain"),
    storm: mix("storm"),
    fog: mix("fog"),
    wind: mix("wind"),
  }
}

// Lleva un color hacia un gris de su misma luminosidad (cielo encapotado)
const toGray = (c: RGB, k: number): RGB => {
  const m = (c[0] + c[1] + c[2]) / 3
  return mixRGB(c, [m * 0.82, m * 0.87, m * 0.95], k)
}

const ramp = (chars: string, v: number) => chars[clamp(Math.floor(v * chars.length), 0, chars.length - 1)]

// Carácter según la dirección del trazo (coordenadas de pantalla, y hacia abajo)
const dirChar = (dx: number, dy: number) => {
  let a = (Math.atan2(-dy, dx) * 180) / Math.PI
  a = ((a % 180) + 180) % 180
  if (a < 22.5 || a >= 157.5) return "-"
  if (a < 67.5) return "/"
  if (a < 112.5) return "|"
  return "\\"
}

type Cell = [string, string]

// Caras de la tele: cada una recibe columna/fila del sprite original y devuelve [carácter, color]
const tvFront = (c: number, r: number, t: number): Cell => {
  const tick = Math.floor(t * 12)
  if (c >= TV_W - 3) {
    if (r === 2 || r === 4) return ["o", TV[3]]
    return [c === TV_W - 3 ? "|" : ":", TV[1]]
  }
  // Pantalla: estática verde con una silueta que aparece y desaparece
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
  return [ramp(" .:-=+*#%@", n), level(SCREEN, n * 0.85 + (r % 2) * 0.1)]
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

export default function AsciiIsland() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glowRef = useRef<HTMLCanvasElement>(null)
  const targetRef = useRef(0) // ángulo objetivo, en pasos de 90°
  const [view, setView] = useState(0)

  const rotate = (dir: 1 | -1) => {
    targetRef.current += dir * (Math.PI / 2)
    setView((v) => (v + dir + VIEWS.length) % VIEWS.length)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === "ArrowLeft") rotate(-1)
      if (e.key === "ArrowRight") rotate(1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const glow = glowRef.current
    const ctx = canvas?.getContext("2d")
    const gctx = glow?.getContext("2d")
    if (!canvas || !glow || !ctx || !gctx) return

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let W = 0
    let H = 0
    let cw = 7
    let lh = 12
    let cols = 0
    let rows = 0
    let chars: string[] = []
    let colors: string[] = []
    let tops: number[] = []
    let shade = new Uint8Array(0) // 1 = celda de palmera, 2 = margen alrededor
    let frame = 0
    let last = -Infinity
    let angle = targetRef.current
    const horaParam = parseFloat(new URLSearchParams(window.location.search).get("hora") ?? "")
    const forcedHour = Number.isFinite(horaParam) ? ((horaParam % 24) + 24) % 24 : null
    const climaParam = new URLSearchParams(window.location.search).get("clima") ?? ""
    const forcedWeather = Object.hasOwn(WEATHERS, climaParam) ? WEATHERS[climaParam] : null

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = canvas.clientWidth
      H = canvas.clientHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      glow.width = Math.ceil(W / 4)
      glow.height = Math.ceil(H / 4)

      const fontSize = W < 640 ? 9 : W < 1200 ? 11 : 12
      ctx.font = `${fontSize}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`
      ctx.textBaseline = "top"
      cw = ctx.measureText("M").width
      lh = Math.round(fontSize * 1.05)
      cols = Math.ceil(W / cw)
      rows = Math.ceil(H / lh)
      chars = new Array(cols * rows)
      colors = new Array(cols * rows)
      tops = new Array(cols)
      shade = new Uint8Array(cols * rows)
    }

    const plot = (px: number, py: number, ch: string, color: string) => {
      const c = Math.floor(px / cw)
      const r = Math.floor(py / lh)
      if (c < 0 || r < 0 || c >= cols || r >= rows) return
      chars[r * cols + c] = ch
      colors[r * cols + c] = color
    }

    const setCell = (c: number, r: number, ch: string, color: string) => {
      if (c < 0 || r < 0 || c >= cols || r >= rows) return
      chars[r * cols + c] = ch
      colors[r * cols + c] = color
    }

    const draw = (now: number, dt: number) => {
      const t = reduceMotion ? 8 : now / 1000
      angle = reduceMotion ? targetRef.current : angle + (targetRef.current - angle) * Math.min(1, dt * 5)
      const cosA = Math.cos(angle)
      const sinA = Math.sin(angle)

      const portrait = H > W
      const R = Math.min(W * (portrait ? 0.82 : 0.42), H * 0.55)
      const Rx = Math.max(W * (portrait ? 0.75 : 0.56), R) // radio real de la isla (circular)
      const cx = W / 2
      const shoreY = H * 0.74
      const A = R * 0.3
      const tide = Math.sin(t * 0.55) * lh * 0.9
      const spin = angle * Rx * 0.8 // desplaza las texturas al girar

      // Altura del terreno en un punto del mundo (px)
      const ground = (wx: number, wz: number) => {
        const q = 1 - (wx * wx + wz * wz) / (Rx * Rx)
        return q <= 0 ? 0 : A * Math.pow(q, 0.85)
      }

      // Mundo -> pantalla. Devuelve [x, y, profundidad hacia la cámara]
      const project = (wx: number, wy: number, wz: number): [number, number, number] => {
        const x = wx * cosA - wz * sinA
        const z = wx * sinA + wz * cosA
        return [cx + x, shoreY - wy + z * TILT, z]
      }

      // Silueta de la isla vista desde la cámara: el punto más alto en cada columna
      for (let c = 0; c < cols; c++) {
        const x = c * cw + cw / 2 - cx
        let best = shoreY
        if (Math.abs(x) < Rx) {
          const zMax = Math.sqrt(Rx * Rx - x * x)
          for (let k = 0; k <= 16; k++) {
            const z = -zMax + (2 * zMax * k) / 16
            const q = 1 - (x * x + z * z) / (Rx * Rx)
            const y = shoreY - A * Math.pow(Math.max(q, 0), 0.85) + z * TILT
            if (y < best) best = y
          }
          best -= (noise((x + spin) * 0.012, 3.7) - 0.5) * A * 0.18 * (1 - (x * x) / (Rx * Rx))
        }
        tops[c] = best
      }

      // --- Hora del día: sol, luna y luz ambiente ---
      const hour = localHour(forcedHour)
      // Clima actual y rayos: cada cuarto de segundo puede caer uno, y su destello se apaga en un segundo
      const wea = weatherNow(forcedWeather)
      const slot = Math.floor(t * 4)
      let flash = 0
      let boltSeed = -1
      for (let k = 0; k < 4; k++) {
        if (wea.storm > 0.3 && hash(slot - k, 3.1) > 1 - 0.03 * wea.storm) {
          flash = Math.max(flash, 1 - (t * 4 - (slot - k)) / 4)
          if (k < 2 && boltSeed < 0) boltSeed = slot - k
        }
      }
      const base = skyAt(hour)
      const flashCol: RGB = [225, 232, 255]
      const sky = {
        ...base,
        top: mixRGB(toGray(base.top, wea.overcast), flashCol, flash * 0.55),
        hor: mixRGB(toGray(base.hor, wea.overcast), flashCol, flash * 0.6),
        cloud: mixRGB(toGray(mixRGB(base.cloud, base.top, wea.overcast * 0.45), wea.overcast), flashCol, flash * 0.7),
        rays: base.rays * (1 - wea.clouds * 0.85),
        light: clamp(base.light * (1 - wea.overcast * 0.3) + flash * 0.5, 0, 1),
        stars: base.stars * (1 - wea.clouds),
      }
      const L = 0.35 + 0.65 * sky.light
      const night = clamp((0.75 - sky.light) / 0.4, 0, 1) // 0 de día, 1 de noche cerrada
      const dayK = clamp((sky.light - 0.6) / 0.4, 0, 1) // 1 a pleno sol
      const bgK = clamp((sky.light - 0.45) / 0.55, 0, 1) // fondo claro: 0 de noche, 1 a pleno sol

      // El entorno toma su color del cielo: el mar lo refleja y la arena recibe su luz
      const waterTint = mixRGB([16, 30, 92], [70, 215, 240], dayK)
      const seaFar = mixRGB(sky.hor, waterTint, 0.35) // junto al horizonte refleja el horizonte
      const seaNear = mixRGB(sky.top, waterTint, 0.6) // más cerca, el agua profunda
      const seaCrest = mixRGB(sky.cloud, [255, 255, 255], 0.35)
      const foamCol = mixRGB([255, 255, 255], sky.hor, 0.3)
      const sandTint = mixRGB(sky.hor, [70, 80, 170], night)
      const sandMix = 0.2 + night * 0.45
      const sandHi = mixRGB([255, 228, 92], sandTint, sandMix)
      const sandMid = mixRGB([255, 194, 58], sandTint, sandMix)
      const sandLo = mixRGB([255, 138, 60], sandTint, sandMix)
      // De noche el mar se calma: menos crestas
      const crestThr = 0.3 + night * 0.25 - dayK * 0.18 - wea.wind * 0.15
      const bodyRad = R * 0.11
      const arc = (frac: number): [number, number] => [
        cx - W * 0.15 + (frac * 2 - 1) * W * 0.4,
        shoreY - Math.sqrt(Math.sin(Math.PI * clamp(frac, 0, 1))) * shoreY * 0.72,
      ]
      const sunFrac = (hour - SUNRISE) / (SUNSET - SUNRISE)
      const moonFrac = ((hour - SUNSET + 24) % 24) / (24 - (SUNSET - SUNRISE))
      const sunUp = sunFrac > -0.03 && sunFrac < 1.03
      const moonUp = moonFrac > -0.03 && moonFrac < 1.03
      const [sunX, sunY] = arc(sunFrac)
      const [moonX, moonY] = arc(moonFrac)
      const sunCol = mixRGB([255, 110, 50], [255, 240, 170], clamp(Math.sin(Math.PI * clamp(sunFrac, 0, 1)) * 2, 0, 1))
      const moonCol: RGB = [225, 220, 255]
      // Los rayos salen del astro visible
      const ox = sunUp ? sunX : moonX
      const oy = sunUp ? sunY : moonY
      // Con el cielo cubierto no se ven el sol ni la luna
      const bodyVis = wea.clouds < 0.85
      const reflX = !bodyVis ? -9999 : sunUp ? sunX : moonUp ? moonX : -9999
      const reflCol = sunUp ? sunCol : moonCol

      // --- Fondo: cielo, arena, espuma y mar, celda por celda ---
      for (let r = 0; r < rows; r++) {
        const y = r * lh + lh / 2
        for (let c = 0; c < cols; c++) {
          const x = c * cw + cw / 2
          const i = r * cols + c
          const h = hash(c, r)
          const top = tops[c]
          let ch = ""
          let col = ""

          if (y >= shoreY + tide - lh * 0.6 && y < shoreY + tide + lh * 1.4) {
            // Espuma de la orilla
            const f = noise((x + spin) * 0.03 - t * 0.8, r * 0.7) + Math.sin(x * 0.02 + t * 1.6) * 0.25
            if (f > 0.35) {
              ch = f > 0.75 ? "~" : h > 0.5 ? "-" : "~"
              col = rgb(foamCol, (0.4 + f * 0.5 + h * 0.2) * L)
            }
          } else if (y > shoreY) {
            // Mar con franjas diagonales, como el oasis de referencia
            const d = (y - shoreY) / (H - shoreY)
            const k = 0.016 / (0.3 + d)
            const sx = x + spin * (0.6 + d)
            const wave =
              Math.sin((sx * 0.9 + y * 2.2) * k - t * 1.3) * 0.7 +
              Math.sin((sx * -0.35 + y * 1.3) * k * 1.9 + t * 0.8) * 0.3 +
              (noise(sx * 0.012, y * 0.05 - t * 0.3) - 0.5) * 0.7
            const glint = noise(sx * 0.008 + t * 0.05, y * 0.05)
            const refl = Math.abs(x - reflX) < bodyRad * (0.9 + d * 2.5) && h > 0.25
            if (refl && wave > -0.2) {
              // Reflejo del sol o la luna sobre el agua
              ch = wave > 0.5 ? "=" : "-"
              col = rgb(reflCol, 0.55 + Math.max(0, wave) * 0.45)
            } else if (dayK > 0 && wave > 0 && hash(c + Math.floor(t * 4) * 7, r) > 1 - 0.014 * dayK) {
              // Destellos del sol sobre el agua
              ch = "*"
              col = rgb([255, 252, 230])
            } else if (wave > crestThr) {
              ch = wave > 0.8 ? "~" : h > 0.6 ? "=" : "-"
              let c3 = mixRGB(seaFar, seaNear, clamp(d * 1.4, 0, 1))
              if (glint > 0.6) c3 = mixRGB(c3, seaCrest, clamp((glint - 0.6) * 3, 0, 0.7))
              col = rgb(c3, (0.5 + (wave - crestThr) * 0.9 + h * 0.15) * (0.65 + 0.35 * sky.light + dayK * 0.3))
            } else if (wave > -0.1 && h > 0.5 + night * 0.2) {
              ch = h > 0.85 ? "~" : "-"
              col = rgb(mixRGB(seaFar, seaNear, clamp(d * 1.4, 0, 1)), (0.35 + d * 0.15) * (0.65 + 0.35 * sky.light + dayK * 0.3))
            } else if (h > 0.93) {
              ch = "."
              col = rgb(seaNear, (0.3 + dayK * 0.2) * L)
            }
          } else if (y >= top) {
            // Arena: textura de dunas iluminada desde arriba a la izquierda
            const hr = clamp((shoreY - y) / A, 0, 1)
            const cl = Math.max(c - 1, 0)
            const cr = Math.min(c + 1, cols - 1)
            const slope = (tops[cr] - tops[cl]) / (2 * cw)
            const dune = fbm((x + spin) * 0.015 + t * 0.04, y * 0.05)
            const light = clamp(0.35 + hr * 0.35 + slope * 0.6 + (dune - 0.5) * 0.7 + (h - 0.5) * 0.25, 0, 0.999)
            const sparkle = hash(c + Math.floor(t * 3), r) > 0.985
            if (light > 0.12 || sparkle) {
              ch = sparkle ? "*" : ramp(SAND_RAMP, light)
              const base = hr > 0.62 ? sandHi : hr > 0.28 ? sandMid : sandLo
              col = sparkle ? rgb(mixRGB([255, 250, 220], sandTint, night * 0.5)) : rgb(base, (light + 0.15) * L)
            }
          } else {
            // Cielo: color según la hora, nubes, rayos del astro, sol/luna y estrellas
            const vy = y / shoreY
            const sunD = sunUp ? Math.hypot(x - sunX, y - sunY) : Infinity
            const moonD = moonUp ? Math.hypot(x - moonX, y - moonY) : Infinity
            if (bodyVis && sunD < bodyRad) {
              const e = sunD / bodyRad
              ch = e < 0.45 ? "@" : e < 0.8 ? "#" : "O"
              col = rgb(sunCol, 1.05 - e * 0.25)
            } else if (
              bodyVis &&
              moonD < bodyRad * 0.75 &&
              Math.hypot(x - moonX - bodyRad * 0.4, y - moonY + bodyRad * 0.15) > bodyRad * 0.62
            ) {
              // Luna creciente con cráteres
              ch = h > 0.8 ? "o" : h > 0.6 ? ":" : "@"
              col = rgb(moonCol, 0.85 + h * 0.15)
            } else {
              const ang = Math.atan2(y - oy, x - ox)
              const ray = Math.pow(
                0.5 + 0.5 * Math.sin(ang * 7 + Math.sin(t * 0.12) * 0.6 + noise(ang * 3, t * 0.1) * 0.6),
                4,
              )
              const halo = Math.max(0, 1 - Math.min(sunD, moonD * 1.6) / (bodyRad * 3.2))
              const cloud = fbm((x + spin * 0.3) * 0.0035 + t * 0.025, y * 0.009 - t * 0.008)
              const cloudAmt = Math.max(0, cloud - (0.45 - wea.clouds * 0.25))
              const intensity =
                ray * 0.95 * sky.rays * (0.25 + vy * 0.75) + cloudAmt * 1.3 + halo * 0.7 + Math.pow(vy, 2.2) * 0.4 * sky.light
              const v = intensity + (h - 0.5) * 0.35
              if (v > 0.22 - dayK * 0.18) {
                ch = ramp(SKY_RAMP, clamp(v * 1.1, 0, 0.999))
                let c3 = mixRGB(sky.top, sky.hor, Math.pow(clamp(vy, 0, 1), 1.6))
                c3 = mixRGB(c3, sky.cloud, clamp(cloudAmt * 3.5, 0, 1))
                c3 = mixRGB(c3, sunUp ? sunCol : sky.ray, clamp(ray * sky.rays * 0.5 + halo, 0, 1))
                col = rgb(c3, 0.45 + dayK * 0.4 + clamp(v, 0, 1) * 0.75)
              } else if (sky.stars > 0 && vy < 0.85 && hash(c * 3.1, r * 1.7) > 1 - 0.025 * sky.stars) {
                // Estrellas que titilan
                const tw = Math.sin(t * (1.5 + h * 3) + h * 40)
                ch = tw > 0.6 ? "*" : tw > -0.2 ? "+" : "."
                col = rgb([235, 230, 255], (0.45 + 0.55 * (tw * 0.5 + 0.5)) * sky.stars)
              }
            }
          }

          chars[i] = ch
          colors[i] = col
        }
      }

      // --- Pájaros cruzando el cielo ---
      for (let b = 0; b < (sky.light > 0.6 ? 3 : 0); b++) {
        const speed = 18 + b * 7
        const bx = ((t * speed + b * 420) % (W + 200)) - 100
        const by = H * (0.16 + b * 0.07) + Math.sin(t * 0.8 + b) * lh * 1.5
        const flap = Math.sin(t * 7 + b * 2) > 0
        plot(bx, by, flap ? "v" : "^", SKY_LAV[3])
        if (b === 1) plot(bx + cw * 3, by + lh, flap ? "^" : "v", SKY_LAV[2])
      }

      // --- Objetos 3D, dibujados de atrás hacia adelante ---
      const wind = (Math.sin(t * 0.7) * 0.07 + Math.sin(t * 1.9) * 0.025) * (1 + wea.wind * 2.5)

      const step = cw * 0.85

      // Palmeras sombreadas: la forma la dan los trazos, la luz la dan el color y la densidad del carácter
      const DENSE_RAMP = ":-=+*#%@"
      const leafCol = (v: number): RGB =>
        v < 0.5 ? mixRGB([20, 95, 40], [45, 200, 75], v * 2) : mixRGB([45, 200, 75], [215, 255, 170], (v - 0.5) * 2)
      const trunkCol = (v: number): RGB =>
        v < 0.5 ? mixRGB([95, 38, 8], [215, 105, 25], v * 2) : mixRGB([215, 105, 25], [255, 215, 150], (v - 0.5) * 2)
      const pAmb = 0.75 + 0.25 * sky.light
      // Lado desde el que llega la luz del astro: -1 izquierda, 1 derecha
      const lightSide = sunUp ? Math.sign(sunX - cx) || -1 : moonUp ? Math.sign(moonX - cx) || -1 : -1
      shade.fill(0)
      let palmId = 0
      let palmCells: number[] = []
      const shadeCell = (px: number, py: number, ch: string, v: number, col: (v: number) => RGB) => {
        const c = Math.floor(px / cw)
        const r = Math.floor(py / lh)
        if (c < 0 || r < 0 || c >= cols || r >= rows) return
        const i = r * cols + c
        const k = clamp(v, 0, 1)
        chars[i] = ch || ramp(DENSE_RAMP, k)
        colors[i] = rgb(col(k), pAmb)
        if (shade[i] !== palmId) palmCells.push(i)
        shade[i] = palmId
      }

      const drawPalm = (palm: (typeof PALMS)[number]) => {
        palmId++
        palmCells = []
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
          shadeCell(lit, py, "", 0.85 - ring, trunkCol)
          if (palm.h > 0.3 && u < 0.85) shadeCell(dark, py, "", 0.3 - ring, trunkCol)
        }

        // Copa: hojas en espina de pescado, ordenadas por profundidad
        const L = palm.size * R
        const fronds = Array.from({ length: FRONDS }, (_, fi) => {
          const phi = (fi / FRONDS) * Math.PI * 2 + palm.phase + Math.sin(t * 1.6 + palm.phase + fi * 0.9) * 0.06
          const elev = FROND_ELEV[fi] + Math.sin(t * 1.3 + fi) * 0.04
          const len = L * (0.82 + hash(fi, palm.phase * 10) * 0.3)
          const dir = [Math.cos(elev) * Math.cos(phi), Math.sin(elev), Math.cos(elev) * Math.sin(phi)]
          const tipDepth = project(top[0] + dir[0] * len, top[1], top[2] + dir[2] * len)[2]
          return { dir, len, tipDepth, droop: 0.3 + (1 - dir[1]) * 0.4 }
        }).sort((a, b) => a.tipDepth - b.tipDepth)

        const [tsx, tsy, tdepth] = project(...top)
        for (const f of fronds) {
          // Las hojas de atrás quedan en sombra
          const facing = f.tipDepth > tdepth ? 0 : -0.3
          const samples = Math.ceil(f.len / step)
          let [lx0, ly0] = [tsx, tsy]
          for (let s = 1; s <= samples; s++) {
            const u = s / samples
            const wxp = top[0] + f.dir[0] * f.len * u + wind * f.len * u * u * 0.5
            const wyp = top[1] + f.dir[1] * f.len * u - f.droop * f.len * u * u
            const wzp = top[2] + f.dir[2] * f.len * u
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
            if (u > 0.1 && s % 2 === 0) {
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
                  shadeCell(px + lx * j * step, py + ly * j * step, ch, v, leafCol)
                }
              }
            }
            // Nervio central: carácter denso que se aclara hacia la base
            shadeCell(px, py, "", 0.55 + (1 - u) * 0.4 + facing, leafCol)
          }
        }

        // Cocos, iluminados del lado del astro
        for (const [ox, oy] of [[-1, 0.6], [1, 0.6], [0, 0]]) {
          shadeCell(tsx + ox * cw, tsy + oy * lh, ox === 0 ? "@" : "o", 0.6 + 0.3 * ox * lightSide, trunkCol)
        }

        // Contorno vacío de una celda: separa la palmera del cielo, la arena y las palmeras de atrás
        for (const i of palmCells) {
          const c = i % cols
          const around = [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, i - cols, i + cols]
          for (const j of around) {
            if (j < 0 || j >= chars.length || shade[j] === palmId) continue
            chars[j] = ""
            shade[j] = 255
          }
        }
      }

      // Tele: se ven una o dos caras según el ángulo, cada una escalada por su orientación
      const drawTV = () => {
        const wx = TV_POS.x * R
        const wz = TV_POS.z * R
        const [sx, sy] = project(wx, ground(wx, wz), wz)
        const a = angle + TV_POS.yaw
        const ca = Math.cos(a)
        const sa = Math.sin(a)
        type Face = { width: number; src: number; normalX: number; fn: (c: number, r: number) => Cell }
        const faces: Face[] = []
        const fw = Math.round(TV_W * Math.abs(ca))
        const sw = Math.round(TV_D * Math.abs(sa))
        if (fw > 0) {
          faces.push(
            ca > 0
              ? { width: fw, src: TV_W, normalX: -sa, fn: (c, r) => tvFront(c, r, t) }
              : { width: fw, src: TV_W, normalX: sa, fn: (c, r) => tvBack(TV_W - 1 - c, r) },
          )
        }
        if (sw > 0) {
          faces.push({ width: sw, src: TV_D, normalX: sa > 0 ? ca : -ca, fn: tvSide })
        }
        faces.sort((f1, f2) => f1.normalX - f2.normalX)

        const total = faces.reduce((s, f) => s + f.width, 0)
        let col0 = Math.round(sx / cw - total / 2)
        const row0 = Math.floor((sy + lh * 0.6) / lh) - TV_H
        const mid = col0 + Math.floor(total / 2)
        setCell(mid - 2, row0 - 2, "\\", TV[1])
        setCell(mid + 2, row0 - 2, "/", TV[1])
        setCell(mid - 1, row0 - 1, "\\", TV[2])
        setCell(mid + 1, row0 - 1, "/", TV[2])
        setCell(mid, row0 - 1, "o", TV[3])

        for (const face of faces) {
          for (let c = 0; c < face.width; c++) {
            const srcC = Math.min(face.src - 1, Math.floor(((c + 0.5) / face.width) * face.src))
            for (let r = 0; r < TV_H; r++) {
              const edgeT = r === 0
              const edgeB = r === TV_H - 1
              const edgeL = c === 0
              const edgeR = c === face.width - 1
              let cell: Cell
              if (edgeT || edgeB) cell = [edgeL || edgeR ? (edgeT ? "." : "'") : edgeT ? "-" : "=", TV[2]]
              else if (edgeL || edgeR) cell = ["|", TV[2]]
              else cell = face.fn(srcC, r)
              setCell(col0 + c, row0 + r, cell[0], cell[1])
            }
          }
          col0 += face.width
        }
      }

      const items: { depth: number; draw: () => void }[] = PALMS.map((palm) => ({
        depth: project(palm.x * R, 0, palm.z * R)[2],
        draw: () => drawPalm(palm),
      }))
      items.push({ depth: project(TV_POS.x * R, 0, TV_POS.z * R)[2], draw: drawTV })
      items.sort((a, b) => a.depth - b.depth).forEach((item) => item.draw())

      // --- Clima delante de la escena: niebla, rayo y lluvia ---
      if (wea.fog > 0.02) {
        // Bancos de niebla que se arrastran, más densos junto al horizonte
        const fogCol = mixRGB([205, 210, 222], sky.hor, 0.35)
        for (let r = 0; r < rows; r++) {
          const y = r * lh + lh / 2
          const band = Math.exp(-Math.pow((y - shoreY) / (H * 0.3), 2))
          if (band < 0.05) continue
          for (let c = 0; c < cols; c++) {
            const d = wea.fog * band * (0.45 + fbm((c * cw + spin * 0.5) * 0.005 + t * 0.06, y * 0.018))
            if (d < 0.25 || hash(c, r + 50) > d) continue
            const i = r * cols + c
            chars[i] = d > 0.75 ? "=" : d > 0.5 ? "-" : d > 0.4 ? ":" : "."
            colors[i] = rgb(fogCol, (0.5 + d * 0.5) * Math.max(L, 0.6))
          }
        }
      }

      if (boltSeed >= 0) {
        // Rayo en zigzag desde arriba hasta la isla o el horizonte, con alguna rama
        let x = W * (0.1 + hash(boltSeed, 9.2) * 0.8)
        for (let y = lh * 0.5; y < shoreY; y += lh) {
          const c = Math.floor(x / cw)
          if (c >= 0 && c < cols && y > tops[c]) break
          const dx = (hash(boltSeed, y) - 0.5) * cw * 3
          plot(x, y, dx > cw * 0.4 ? "\\" : dx < -cw * 0.4 ? "/" : "|", rgb([240, 244, 255]))
          if (hash(boltSeed + 1, y) > 0.9) {
            const dir = dx > 0 ? -1 : 1
            for (let b = 1; b <= 3; b++) plot(x + dir * b * cw, y + b * lh, dir > 0 ? "\\" : "/", rgb([190, 200, 255]))
          }
          x += dx
        }
      }

      if (wea.rain > 0.02) {
        // Gotas inclinadas por el viento con estela; al llegar al mar dejan una salpicadura
        const drops = Math.floor(cols * rows * 0.035 * wea.rain)
        const slant = 0.15 + wea.wind * 0.35
        const rainCol = mixRGB([205, 220, 250], sky.hor, 0.15)
        const bright = 0.7 + 0.3 * sky.light
        const travel = W + H * slant
        const trail = 2 + Math.round(wea.rain * 2)
        const ch = slant > 0.3 ? "\\" : "|"
        for (let k = 0; k < drops; k++) {
          const speed = H * (0.9 + wea.rain * 0.6) * (0.8 + hash(k, 2) * 0.4)
          const y = (hash(k, 1) * (H + lh * 6) + t * speed) % (H + lh * 6)
          const land = shoreY + lh + hash(k, 4) * (H - shoreY)
          const x = hash(k, 3) * travel - H * slant + y * slant
          if (y > land) {
            if (y - land < lh * 1.5) plot(x, land, hash(k, 5) > 0.5 ? "o" : ".", rgb(rainCol, bright))
            continue
          }
          const b = bright * (0.75 + hash(k, 6) * 0.25)
          for (let j = 0; j < trail; j++) {
            plot(x - slant * lh * j, y - lh * j, j === 0 ? ch : j === trail - 1 ? "'" : ch, rgb(rainCol, b * (1 - j / trail) * 0.9 + 0.1))
          }
        }
      }

      // --- Render: una llamada a fillText por tramo del mismo color ---
      ctx.clearRect(0, 0, W, H)
      for (let r = 0; r < rows; r++) {
        let runColor = ""
        let runStart = 0
        let run = ""
        let pending = ""
        const y = r * lh
        for (let c = 0; c <= cols; c++) {
          const i = r * cols + c
          const ch = c < cols ? chars[i] : ""
          const color = c < cols ? colors[i] : ""
          if (c < cols && (!ch || ch === " ")) {
            if (run) pending += " "
            continue
          }
          if (color !== runColor || c === cols) {
            if (run) {
              ctx.fillStyle = runColor
              ctx.fillText(run, runStart * cw, y)
            }
            runColor = color
            runStart = c
            run = ch
            pending = ""
          } else {
            run += pending + ch
            pending = ""
          }
        }
      }

      // Copia reducida para el halo de neón
      gctx.clearRect(0, 0, glow.width, glow.height)
      gctx.drawImage(canvas, 0, 0, glow.width, glow.height)

      // Fondo de día detrás de los caracteres (fuera del halo): cielo, isla y mar
      if (bgK > 0) {
        ctx.globalCompositeOperation = "destination-over"
        ctx.fillStyle = rgb(mixRGB(sandHi, [255, 150, 70], 0.4), 0.26 * bgK)
        ctx.beginPath()
        ctx.moveTo(0, shoreY)
        for (let c = 0; c < cols; c++) ctx.lineTo(c * cw + cw / 2, Math.min(tops[c], shoreY))
        ctx.lineTo(W, shoreY)
        ctx.closePath()
        ctx.fill()
        const s = clamp(shoreY / H, 0, 1)
        // La niebla aclara y agrisa el fondo
        const fogTint = (c: RGB) => mixRGB(c, [195, 200, 212], wea.fog * 0.5)
        const bg = ctx.createLinearGradient(0, 0, 0, H)
        bg.addColorStop(0, rgb(fogTint(sky.top), 0.42 * bgK))
        bg.addColorStop(s, rgb(fogTint(sky.hor), 0.5 * bgK))
        bg.addColorStop(Math.min(s + 0.001, 1), rgb(fogTint(seaFar), 0.5 * bgK))
        bg.addColorStop(1, rgb(fogTint(seaNear), 0.4 * bgK))
        ctx.fillStyle = bg
        ctx.fillRect(0, 0, W, H)
        ctx.globalCompositeOperation = "source-over"
      }
    }

    const loop = (now: number) => {
      const elapsed = now - last
      if (elapsed >= 1000 / FPS) {
        draw(now, Math.min(elapsed, 200) / 1000)
        last = now
      }
      frame = requestAnimationFrame(loop)
    }

    resize()
    window.addEventListener("resize", resize)
    frame = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("resize", resize)
    }
  }, [])

  const buttonClass =
    "pointer-events-auto inline-flex h-11 w-11 cursor-pointer items-center justify-center border border-white/30 bg-black/40 font-mono text-white backdrop-blur-sm transition-colors duration-200 hover:border-[#FFD600] hover:text-[#FFD600] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD600] focus-visible:ring-offset-2 focus-visible:ring-offset-black"

  return (
    <>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <canvas
          ref={glowRef}
          className="absolute inset-0 h-full w-full opacity-80 mix-blend-screen blur-md"
        />
        <div className="ascii-scanlines absolute inset-0" />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-36 z-20 flex items-center justify-center gap-4 sm:bottom-28">
        <button type="button" onClick={() => rotate(-1)} className={buttonClass} aria-label="Girar la isla a la izquierda">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <span
          aria-live="polite"
          className="min-w-24 text-center font-mono text-xs uppercase tracking-[0.25em] text-white/80"
        >
          {VIEWS[view]}
        </span>
        <button type="button" onClick={() => rotate(1)} className={buttonClass} aria-label="Girar la isla a la derecha">
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </>
  )
}
