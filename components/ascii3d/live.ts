// Cielo y clima en vivo para el 3D: la misma hora y el mismo clima real que la isla 2D
// (Open-Meteo vía /api/clima), con ?hora= y ?clima= para previsualizar.

import { clamp, mixRGB, type RGB } from "../ascii/math"
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
  type Weather,
} from "../ascii/sky"

export type LiveSky = {
  top: RGB // colores 0..1
  hor: RGB
  cloud: RGB
  light: number // 0 de noche, 1 a pleno sol
  stars: number
  dir: [number, number, number] // de dónde viene la luz principal (sol o luna)
  lightCol: RGB // color de esa luz
  wea: Weather
  flash: number // relámpago
}

const n = (c: RGB): RGB => [c[0] / 255, c[1] / 255, c[2] / 255]

export const createLiveSky = () => {
  const params = new URLSearchParams(window.location.search)
  const horaParam = parseFloat(params.get("hora") ?? "")
  const forcedHour = Number.isFinite(horaParam) ? ((horaParam % 24) + 24) % 24 : null
  const climaParam = params.get("clima") ?? ""
  const forcedWeather = Object.hasOwn(WEATHERS, climaParam) ? WEATHERS[climaParam] : null
  const coords =
    params.has("lat") && params.has("lon")
      ? `?lat=${encodeURIComponent(params.get("lat")!)}&lon=${encodeURIComponent(params.get("lon")!)}`
      : ""

  let live: { from: Weather; to: Weather; at: number } | null = null
  let sun: { sunrise: number; sunset: number } | null = null
  let lastWea: Weather = forcedWeather ?? cycleWeather()
  let cancelled = false

  const fetchClima = async () => {
    try {
      const data = await (await fetch(`/api/clima${coords}`)).json()
      if (cancelled || !data?.ok || !data.weather) return
      live = { from: lastWea, to: data.weather as Weather, at: performance.now() }
      if (typeof data.sunrise === "number" && typeof data.sunset === "number" && data.sunrise < data.sunset) {
        sun = { sunrise: data.sunrise, sunset: data.sunset }
      }
    } catch {
      // Sin conexión: sigue el ciclo propio
    }
  }
  let timer: ReturnType<typeof setInterval> | undefined
  if (!forcedWeather) {
    fetchClima()
    timer = setInterval(fetchClima, 15 * 60 * 1000)
  }

  const read = (now: number, t: number): LiveSky => {
    const real = localHour(forcedHour)
    const hour = sun && forcedHour === null ? canonHour(real, sun.sunrise, sun.sunset) : real
    const wea =
      forcedWeather ?? (live ? lerpWeather(live.from, live.to, clamp((now - live.at) / (WEATHER_FADE * 1000), 0, 1)) : cycleWeather())
    lastWea = wea
    const base = skyAt(hour)
    // Relámpagos de tormenta, unos pocos por minuto
    const slot = Math.floor(t * 4)
    const strike = Math.sin(slot * 91.7) * 43758.5
    const flash = wea.storm > 0.3 && strike - Math.floor(strike) > 1 - 0.03 * wea.storm ? 1 - (t * 4 - slot) : 0
    // El sol de día, la luna de noche: los dos cruzan el cielo de izquierda a derecha
    const day = hour > SUNRISE && hour < SUNSET
    const frac = day ? (hour - SUNRISE) / (SUNSET - SUNRISE) : ((hour - SUNSET + 24) % 24) / (24 - (SUNSET - SUNRISE))
    const a = Math.PI * clamp(frac, 0.04, 0.96)
    const el = Math.sin(a)
    const dir: [number, number, number] = [-Math.cos(a) * 0.8, 0.12 + el * 0.75, -0.6]
    const dusk = day ? 1 - el : 0
    const lightCol: RGB = day ? mixRGB([255, 244, 220], [255, 140, 90], dusk * 0.8) : [150, 165, 230]
    return {
      top: n(toGray(base.top, wea.overcast)),
      hor: n(toGray(base.hor, wea.overcast)),
      cloud: n(toGray(base.cloud, wea.overcast)),
      light: clamp(base.light * (1 - wea.overcast * 0.35) + flash * 0.5, 0, 1),
      stars: base.stars * (1 - wea.clouds),
      dir,
      lightCol: n(toGray(lightCol, wea.overcast * 0.6)),
      wea,
      flash,
    }
  }

  return {
    read,
    stop: () => {
      cancelled = true
      clearInterval(timer)
    },
  }
}
