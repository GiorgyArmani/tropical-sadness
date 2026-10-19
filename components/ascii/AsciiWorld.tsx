"use client"

import { useEffect, useRef, useState } from "react"
import PixelIcon from "../PixelIcon"
import { clamp, fbm, hash, mixRGB, noise, ramp, rgb, type RGB } from "./math"
import {
  SUNRISE,
  SUNSET,
  WEATHERS,
  WEATHER_FADE,
  canonHour,
  cycleWeather,
  lerpWeather,
  localHour,
  skyAt,
  toGray,
  weatherLabel,
  type Weather,
} from "./sky"
import type { Frame, Scene } from "./types"

// Motor de escenas en arte ASCII animado. Cada escena es 3D (una isla con objetos) proyectada
// a una grilla de caracteres, y se puede girar en pasos de 90° como las vistas de Blender.
// El motor pone el cielo según la hora real, el clima real, el mar y la cámara; la escena pone
// el suelo, los objetos y la vida (ver ./scenes).

const FPS = 20
const MAX_COLS = 360 // tope de la grilla ASCII (alcanza para pantallas de 2560 px sin agrandar la letra)
const MAX_ROWS = 140
const TILT = 0.2 // cuánto se ve el "piso" de la isla desde arriba
const VIEWS = ["Frente", "Derecha", "Atrás", "Izquierda"]
const ZOOM_MIN = 0.3 // alejado: la isla queda chiquita en medio del mar
const ZOOM_MAX = 2
const ISLAND_MAX_R = 420 // px CSS: con zoom out la isla no crece y queda sola en medio del mar
const SKY_RAMP = " .`'-:+*"
const SWITCH_MS = 900 // estática de tele al cambiar de escena

export default function AsciiWorld({ scene }: { scene: Scene }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glowRef = useRef<HTMLCanvasElement>(null)
  const targetRef = useRef(0) // ángulo objetivo, en pasos de 90°
  const layerRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(1) // zoom objetivo de la cámara (rueda, pinch o teclas + / -)
  const panRef = useRef({ x: 0, y: 0 }) // desplazamiento objetivo de la cámara, en px del mundo
  const sceneRef = useRef(scene)
  const [view, setView] = useState(0)
  const [clima, setClima] = useState<{ label: string; city: string } | null>(null)

  useEffect(() => {
    sceneRef.current = scene
  }, [scene])

  const zoomBy = (k: number) => {
    zoomRef.current = clamp(zoomRef.current * k, ZOOM_MIN, ZOOM_MAX)
  }
  // El paseo tiene límite: se puede recorrer el mar pero no perder la isla
  const panBy = (dx: number, dy: number) => {
    const p = panRef.current
    p.x = clamp(p.x + dx, -window.innerWidth, window.innerWidth)
    p.y = clamp(p.y + dy, -window.innerHeight * 0.4, window.innerHeight * 0.4)
  }
  const resetCamera = () => {
    zoomRef.current = 1
    panRef.current = { x: 0, y: 0 }
  }

  const rotate = (dir: 1 | -1) => {
    targetRef.current += dir * (Math.PI / 2)
    setView((v) => (v + dir + VIEWS.length) % VIEWS.length)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === "ArrowLeft") rotate(-1)
      if (e.key === "ArrowRight") rotate(1)
      if (e.ctrlKey || e.metaKey) return
      if (e.key === "+" || e.key === "=") zoomBy(1.25)
      if (e.key === "-") zoomBy(0.8)
      if (e.key === "0") resetCamera()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Cámara: la rueda (o el pinch del trackpad) acerca y aleja la escena en vez de la página,
  // arrastrar recorre el mar, dos dedos hacen zoom en el celular y el doble clic vuelve al inicio
  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    const pointers = new Map<number, { x: number; y: number }>()
    let pinchDist = 0

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)))
    }
    const onDown = (e: PointerEvent) => {
      layer.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y)
      }
    }
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId)
      if (!prev) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 1) {
        panBy((e.clientX - prev.x) / zoomRef.current, (e.clientY - prev.y) / zoomRef.current)
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        if (pinchDist > 0) zoomBy(dist / pinchDist)
        pinchDist = dist
      }
    }
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      pinchDist = 0
    }

    layer.addEventListener("wheel", onWheel, { passive: false })
    layer.addEventListener("pointerdown", onDown)
    layer.addEventListener("pointermove", onMove)
    layer.addEventListener("pointerup", onUp)
    layer.addEventListener("pointercancel", onUp)
    layer.addEventListener("dblclick", resetCamera)
    return () => {
      layer.removeEventListener("wheel", onWheel)
      layer.removeEventListener("pointerdown", onDown)
      layer.removeEventListener("pointermove", onMove)
      layer.removeEventListener("pointerup", onUp)
      layer.removeEventListener("pointercancel", onUp)
      layer.removeEventListener("dblclick", resetCamera)
    }
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
    let shade = new Uint8Array(0)
    let bgChars: string[] = [] // copia del fondo, para saber qué celdas pintó la escena
    let bgColors: string[] = []
    let fg = new Uint8Array(0) // 1 = objeto de la escena (se dibuja a pleno), 0 = fondo (atenuado)
    let shapeId = 0
    let frame = 0
    let last = -Infinity
    let angle = targetRef.current
    let zoom = zoomRef.current
    const pan = { ...panRef.current }
    // Cambio de escena: se cambia a mitad de la estática
    let shown = sceneRef.current
    let target = shown
    let switchAt = -1
    const startedAt = performance.now()
    const horaParam = parseFloat(new URLSearchParams(window.location.search).get("hora") ?? "")
    const forcedHour = Number.isFinite(horaParam) ? ((horaParam % 24) + 24) % 24 : null
    const climaParam = new URLSearchParams(window.location.search).get("clima") ?? ""
    const forcedWeather = Object.hasOwn(WEATHERS, climaParam) ? WEATHERS[climaParam] : null

    // Clima real de la ubicación (Open-Meteo vía /api/clima). Mientras no llega, o si falla, manda el ciclo propio
    let live: { from: Weather; to: Weather; at: number } | null = null
    let sun: { sunrise: number; sunset: number } | null = null
    let lastWea: Weather = forcedWeather ?? cycleWeather()
    let cancelled = false
    const isWeather = (w: unknown): w is Weather =>
      !!w && (["clouds", "overcast", "rain", "storm", "fog", "wind"] as const).every((k) => typeof (w as Weather)[k] === "number")
    // ?lat=..&lon=.. en la URL de la página fija la ubicación (útil en local, donde Vercel no la envía)
    const pageParams = new URLSearchParams(window.location.search)
    const coordsQuery =
      pageParams.has("lat") && pageParams.has("lon")
        ? `?lat=${encodeURIComponent(pageParams.get("lat")!)}&lon=${encodeURIComponent(pageParams.get("lon")!)}`
        : ""
    const fetchClima = async () => {
      try {
        const data = await (await fetch(`/api/clima${coordsQuery}`)).json()
        if (cancelled || !data?.ok || !isWeather(data.weather)) return
        live = { from: lastWea, to: data.weather, at: performance.now() }
        if (typeof data.code === "number") {
          setClima({ label: weatherLabel(data.code), city: typeof data.city === "string" ? data.city : "" })
        }
        if (typeof data.sunrise === "number" && typeof data.sunset === "number" && data.sunrise < data.sunset) {
          sun = { sunrise: data.sunrise, sunset: data.sunset }
        }
      } catch {
        // Sin conexión o sin ubicación: sigue el ciclo propio
      }
    }
    let climaTimer: ReturnType<typeof setInterval> | undefined
    if (forcedWeather) setClima({ label: climaParam, city: "" })
    else {
      fetchClima()
      climaTimer = setInterval(fetchClima, 15 * 60 * 1000)
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = canvas.clientWidth
      H = canvas.clientHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      glow.width = Math.ceil(W / 4)
      glow.height = Math.ceil(H / 4)

      const setFont = (px: number) => {
        ctx.font = `${px}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`
        return ctx.measureText("M").width
      }
      let fontSize = W < 640 ? 9 : W < 1200 ? 11 : 12
      cw = setFont(fontSize)
      // Con zoom out la ventana mide muchos más px CSS: se agranda la letra para que la grilla
      // no se multiplique (si no, cada cuadro dibuja 10 veces más celdas y se traba)
      const grow = Math.max(1, W / cw / MAX_COLS, H / (fontSize * 1.05) / MAX_ROWS)
      if (grow > 1) {
        fontSize *= grow
        cw = setFont(fontSize)
      }
      ctx.textBaseline = "top"
      lh = Math.round(fontSize * 1.05)
      cols = Math.ceil(W / cw)
      rows = Math.ceil(H / lh)
      chars = new Array(cols * rows)
      colors = new Array(cols * rows)
      tops = new Array(cols)
      shade = new Uint8Array(cols * rows)
      fg = new Uint8Array(cols * rows)
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
      // Estática al cambiar de escena: a mitad de camino ya se ve la nueva
      if (sceneRef.current !== target) {
        target = sceneRef.current
        switchAt = now
        // La escena elegida al cargar entra directo, sin estática
        if (now - startedAt < 1500) shown = target
      }
      let staticAmt = 0
      if (switchAt >= 0) {
        const p = (now - switchAt) / SWITCH_MS
        if (p >= 0.5 || reduceMotion) shown = target
        if (p >= 1 || reduceMotion || shown === target && p < 0.5) switchAt = -1
        else staticAmt = Math.sin(Math.PI * p)
      }
      const scene = shown

      const t = reduceMotion ? 8 : now / 1000
      angle = reduceMotion ? targetRef.current : angle + (targetRef.current - angle) * Math.min(1, dt * 5)
      const ease = reduceMotion ? 1 : Math.min(1, dt * 6)
      zoom += (zoomRef.current - zoom) * ease
      pan.x += (panRef.current.x - pan.x) * ease
      pan.y += (panRef.current.y - pan.y) * ease
      const cosA = Math.cos(angle)
      const sinA = Math.sin(angle)

      const portrait = H > W
      const R0 = Math.min(W * (portrait ? 0.82 : 0.42), H * 0.55, ISLAND_MAX_R)
      const Rx0 = portrait ? Math.max(W * 0.75, R0) : Math.min(R0 * 1.75, W * 0.46)
      const R = R0 * zoom
      const Rx = Rx0 * zoom // radio real de la isla (circular)
      const cx = W / 2 + pan.x * zoom
      // El zoom se centra un poco arriba de la isla, para que al acercarse no se salgan los objetos
      const focusY = H * 0.6
      const shoreY = focusY + (H * 0.74 - focusY) * zoom + pan.y * zoom
      // El horizonte queda lejos: casi no se mueve con el zoom, pero siempre detrás de la isla
      const horizonY = Math.min(H * 0.74 - Rx0 * TILT * 1.1 + pan.y * 0.3, shoreY - Rx * TILT * 1.1)
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
      // Con la salida y puesta del sol reales, el cielo sigue el día de la ubicación
      const realHour = localHour(forcedHour)
      const hour = sun && forcedHour === null ? canonHour(realHour, sun.sunrise, sun.sunset) : realHour
      const weaNow =
        forcedWeather ??
        (live ? lerpWeather(live.from, live.to, clamp((now - live.at) / (WEATHER_FADE * 1000), 0, 1)) : cycleWeather())
      lastWea = weaNow
      // Cada escena puede llevar el cielo y el clima a su clima
      const [base, wea] = scene.mood ? scene.mood(skyAt(hour), weaNow) : [skyAt(hour), weaNow]
      // Rayos: cada cuarto de segundo puede caer uno, y su destello se apaga en un segundo
      const slot = Math.floor(t * 4)
      let flash = 0
      let boltSeed = -1
      for (let k = 0; k < 4; k++) {
        if (wea.storm > 0.3 && hash(slot - k, 3.1) > 1 - 0.03 * wea.storm) {
          flash = Math.max(flash, 1 - (t * 4 - (slot - k)) / 4)
          if (k < 2 && boltSeed < 0) boltSeed = slot - k
        }
      }
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

      // El mar refleja el cielo
      const [waterNight, waterDay] = scene.water ?? [[16, 30, 92], [70, 215, 240]]
      const waterTint = mixRGB(waterNight, waterDay, dayK)
      const seaFar = mixRGB(sky.hor, waterTint, 0.35) // junto al horizonte refleja el horizonte
      const seaNear = mixRGB(sky.top, waterTint, 0.6) // más cerca, el agua profunda
      const seaCrest = mixRGB(sky.cloud, [255, 255, 255], 0.35)
      const foamCol = mixRGB([255, 255, 255], sky.hor, 0.3)
      // De noche el mar se calma: menos crestas
      const crestThr = 0.3 + night * 0.25 - dayK * 0.18 - wea.wind * 0.15
      const bodyRad = R0 * 0.11 // el sol y la luna están lejos: no cambian con el zoom
      const moonRad = bodyRad * (scene.moon?.size ?? 1)
      const fullMoon = scene.moon?.full ?? false
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
      const sunCol =
        scene.sun ?? mixRGB([255, 110, 50], [255, 240, 170], clamp(Math.sin(Math.PI * clamp(sunFrac, 0, 1)) * 2, 0, 1))
      const moonCol: RGB = scene.moon?.color ?? [225, 220, 255]
      // Los rayos salen del astro visible
      const ox = sunUp ? sunX : moonX
      const oy = sunUp ? sunY : moonY
      // Con el cielo cubierto no se ven el sol ni la luna
      const bodyVis = wea.clouds < 0.85
      const reflX = !bodyVis ? -9999 : sunUp ? sunX : moonUp ? moonX : -9999
      const reflCol = sunUp ? sunCol : moonCol
      const reflRad = sunUp ? bodyRad : moonRad

      shapeId = 0
      shade.fill(0)
      const f: Frame = {
        t,
        W,
        H,
        cw,
        lh,
        cols,
        rows,
        chars,
        colors,
        shade,
        tops,
        angle,
        R,
        Rx,
        cx,
        shoreY,
        sky,
        wea,
        L,
        night,
        dayK,
        // Con lluvia o tormenta la vida se esconde
        calm: clamp(1 - Math.max(wea.rain, wea.storm) * 1.4, 0, 1),
        wind: (Math.sin(t * 0.7) * 0.07 + Math.sin(t * 1.9) * 0.025) * (1 + wea.wind * 2.5),
        sunUp,
        moonUp,
        sunX,
        moonX,
        // Lado desde el que llega la luz del astro: -1 izquierda, 1 derecha
        lightSide: sunUp ? Math.sign(sunX - cx) || -1 : moonUp ? Math.sign(moonX - cx) || -1 : -1,
        seaNear,
        plot,
        setCell,
        project,
        ground,
        newShape: () => (shapeId = (shapeId % 254) + 1),
      }
      const land = scene.land(f)

      // --- Fondo: cielo, suelo, espuma y mar, celda por celda ---
      for (let r = 0; r < rows; r++) {
        const y = r * lh + lh / 2
        for (let c = 0; c < cols; c++) {
          const x = c * cw + cw / 2
          const i = r * cols + c
          const h = hash(c, r)
          const top = tops[c]
          let ch = ""
          let col = ""

          const nearIsland = Math.abs(x - cx) < Rx + cw * 3
          if (nearIsland && y >= shoreY + tide - lh * 0.6 && y < shoreY + tide + lh * 1.4) {
            // Espuma de la orilla
            const fo = noise((x + spin) * 0.03 - t * 0.8, r * 0.7) + Math.sin(x * 0.02 + t * 1.6) * 0.25
            if (fo > 0.35) {
              ch = fo > 0.75 ? "~" : h > 0.5 ? "-" : "~"
              col = rgb(foamCol, (0.4 + fo * 0.5 + h * 0.2) * L)
            }
          } else if (y > shoreY || (y < top && y > horizonY)) {
            // Mar con franjas diagonales
            const d = (y - horizonY) / (H - horizonY)
            const k = 0.016 / (0.3 + d)
            const sx = (x - cx) / zoom + spin * (0.6 + d)
            const wave =
              Math.sin((sx * 0.9 + y * 2.2) * k - t * 1.3) * 0.7 +
              Math.sin((sx * -0.35 + y * 1.3) * k * 1.9 + t * 0.8) * 0.3 +
              (noise(sx * 0.012, y * 0.05 - t * 0.3) - 0.5) * 0.7
            const glint = noise(sx * 0.008 + t * 0.05, y * 0.05)
            const refl = Math.abs(x - reflX) < reflRad * (0.9 + d * 2.5) && h > 0.25
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
            // Suelo de la escena: textura de dunas iluminada desde arriba a la izquierda
            const hr = clamp((shoreY - y) / A, 0, 1)
            const cl = Math.max(c - 1, 0)
            const cr = Math.min(c + 1, cols - 1)
            const slope = (tops[cr] - tops[cl]) / (2 * cw)
            const dune = fbm((x + spin) * 0.015 + t * 0.04, y * 0.05)
            const light = clamp(0.35 + hr * 0.35 + slope * 0.6 + (dune - 0.5) * 0.7 + (h - 0.5) * 0.25, 0, 0.999)
            const sparkle = land.sparkle !== null && hash(c + Math.floor(t * 3), r) > 0.985
            if (light > 0.12 || sparkle) {
              ch = sparkle ? "*" : ramp(land.ramp, light)
              const tone = hr > 0.62 ? land.hi : hr > 0.28 ? land.mid : land.lo
              col = sparkle && land.sparkle ? rgb(land.sparkle) : rgb(tone, (light + 0.15) * L)
            }
          } else {
            // Cielo: color según la hora, nubes, rayos del astro, sol/luna y estrellas
            const vy = y / horizonY
            const sunD = sunUp ? Math.hypot(x - sunX, y - sunY) : Infinity
            const moonD = moonUp ? Math.hypot(x - moonX, y - moonY) : Infinity
            if (bodyVis && sunD < bodyRad) {
              const e = sunD / bodyRad
              ch = e < 0.45 ? "@" : e < 0.8 ? "#" : "O"
              col = rgb(sunCol, 1.05 - e * 0.25)
            } else if (
              bodyVis &&
              moonD < moonRad * 0.75 &&
              (fullMoon || Math.hypot(x - moonX - moonRad * 0.4, y - moonY + moonRad * 0.15) > moonRad * 0.62)
            ) {
              // Luna (creciente o llena) con cráteres
              ch = h > 0.8 ? "o" : h > 0.6 ? ":" : "@"
              col = rgb(moonCol, 0.85 + h * 0.15)
            } else {
              const ang = Math.atan2(y - oy, x - ox)
              const ray = Math.pow(
                0.5 + 0.5 * Math.sin(ang * 7 + Math.sin(t * 0.12) * 0.6 + noise(ang * 3, t * 0.1) * 0.6),
                4,
              )
              const halo = Math.max(0, 1 - Math.min(sunD, (moonD * 1.6 * bodyRad) / moonRad) / (bodyRad * 3.2))
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

      // --- La escena: vida, objetos (de atrás hacia adelante) y lo que va delante ---
      bgChars = chars.slice()
      bgColors = colors.slice()
      scene.life?.(f)
      const kept = scene.objects(f)
      // Celdas guardadas que no tapó ningún objeto de adelante
      const keptVisible = kept.filter((cell) => chars[cell.i] === cell.ch && colors[cell.i] === cell.col)
      scene.front?.(f)
      // Lo que pintó la escena se dibuja a pleno; el cielo, el suelo y el mar quedan atenuados detrás
      for (let i = 0; i < chars.length; i++) fg[i] = chars[i] !== bgChars[i] || colors[i] !== bgColors[i] ? 1 : 0

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
            fg[i] = 0
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
          const landY = shoreY + lh + hash(k, 4) * (H - shoreY)
          const x = hash(k, 3) * travel - H * slant + y * slant
          if (y > landY) {
            if (y - landY < lh * 1.5) plot(x, landY, hash(k, 5) > 0.5 ? "o" : ".", rgb(rainCol, bright))
            continue
          }
          const b = bright * (0.75 + hash(k, 6) * 0.25)
          for (let j = 0; j < trail; j++) {
            plot(x - slant * lh * j, y - lh * j, j === 0 ? ch : j === trail - 1 ? "'" : ch, rgb(rainCol, b * (1 - j / trail) * 0.9 + 0.1))
          }
        }
      }

      // Lo que la escena quiere siempre visible (la tele, la cripta) queda por encima de la lluvia y la niebla
      for (const cell of keptVisible) {
        chars[cell.i] = cell.ch
        colors[cell.i] = cell.col
        fg[cell.i] = 1
      }

      // Estática de tele mientras se cambia de escena
      if (staticAmt > 0) {
        const tick = Math.floor(now / 50)
        for (let i = 0; i < chars.length; i++) {
          const n = hash((i % cols) + tick * 13, Math.floor(i / cols) + tick * 7)
          if (n > staticAmt * 0.95) continue
          chars[i] = ramp(" .:-=+*#%@", hash(i, tick))
          colors[i] = rgb([215, 220, 230], 0.35 + n * 0.6)
          fg[i] = 1
        }
      }

      // --- Render: una llamada a fillText por tramo del mismo color ---
      ctx.clearRect(0, 0, W, H)
      const pass = (layer: number) => {
        for (let r = 0; r < rows; r++) {
          let runColor = ""
          let runStart = 0
          let run = ""
          let pending = ""
          const y = r * lh
          for (let c = 0; c <= cols; c++) {
            const i = r * cols + c
            const ch = c < cols && fg[i] === layer ? chars[i] : ""
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
      }
      // Primero los objetos, que se llevan casi todo el halo de neón
      pass(1)
      gctx.clearRect(0, 0, glow.width, glow.height)
      gctx.globalCompositeOperation = "source-over"
      gctx.globalAlpha = 1
      gctx.drawImage(canvas, 0, 0, glow.width, glow.height)
      // Después el fondo, atenuado y por detrás, para que los objetos resalten
      ctx.globalCompositeOperation = "destination-over"
      ctx.globalAlpha = scene.backdrop ?? 0.6
      pass(0)
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = "source-over"
      gctx.globalCompositeOperation = "destination-over"
      gctx.globalAlpha = 0.45
      gctx.drawImage(canvas, 0, 0, glow.width, glow.height)
      gctx.globalAlpha = 1
      gctx.globalCompositeOperation = "source-over"

      // Fondo de día detrás de los caracteres (fuera del halo): cielo, isla y mar
      if (bgK > 0) {
        ctx.globalCompositeOperation = "destination-over"
        ctx.fillStyle = rgb(mixRGB(land.hi, [255, 150, 70], 0.4), 0.26 * bgK)
        ctx.beginPath()
        ctx.moveTo(0, shoreY)
        for (let c = 0; c < cols; c++) ctx.lineTo(c * cw + cw / 2, Math.min(tops[c], shoreY))
        ctx.lineTo(W, shoreY)
        ctx.closePath()
        ctx.fill()
        const s = clamp(horizonY / H, 0, 1)
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
      cancelled = true
      clearInterval(climaTimer)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return (
    <>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <canvas ref={glowRef} className="absolute inset-0 h-full w-full opacity-80 mix-blend-screen blur-md" />
        <div className="ascii-scanlines absolute inset-0" />
      </div>

      <div ref={layerRef} aria-hidden="true" className="absolute inset-0 touch-none select-none" />

      <div className="pointer-events-none absolute z-20 flex flex-col gap-2 left-3 bottom-[3.9rem] items-start sm:inset-x-0 sm:bottom-20 sm:items-center">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => rotate(-1)}
            className="ts-px-btn pointer-events-auto h-6 w-6"
            aria-label="Girar la escena a la izquierda"
          >
            <PixelIcon name="left" className="h-2.5 w-2.5" />
          </button>
          <span
            aria-live="polite"
            className="min-w-20 text-center font-mono text-[10px] uppercase tracking-[0.25em] text-white/80"
          >
            {VIEWS[view]}
          </span>
          <button
            type="button"
            onClick={() => rotate(1)}
            className="ts-px-btn pointer-events-auto h-6 w-6"
            aria-label="Girar la escena a la derecha"
          >
            <PixelIcon name="right" className="h-2.5 w-2.5" />
          </button>
        </div>
        {clima && (
          <p className="max-w-[55vw] truncate font-mono sm:max-w-[90vw] text-[10px] lowercase tracking-[0.15em] text-white/60">
            <span className="text-[#5cff8a]">&gt;</span> {clima.label}
            {clima.city && <span> · {clima.city}</span>}
          </p>
        )}
      </div>
    </>
  )
}
