// Cielo y clima del motor: la hora real mueve el sol y la luna, el clima real (o un ciclo propio) los cubre

import { clamp, hash, mixRGB, type RGB } from "./math"

// Cielo según la hora local (0–24): arriba, horizonte, nubes, rayos, luz ambiente, estrellas
export type SkyKey = { h: number; top: RGB; hor: RGB; cloud: RGB; ray: RGB; rays: number; light: number; stars: number }
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
export const SUNRISE = 6.3
export const SUNSET = 19.2

// Clima: el real de la ubicación del visitante (/api/clima, Open-Meteo); si no está disponible, un ciclo
// propio según el reloj real (igual para todos). ?clima=lluvia lo fija para previsualizar
export type Weather = { clouds: number; overcast: number; rain: number; storm: number; fog: number; wind: number }
export const WEATHERS: Record<string, Weather> = {
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

// Nombre del clima real según el código WMO de Open-Meteo, para el cartel
export const weatherLabel = (code: number) => {
  if (code >= 95) return "tormenta"
  if (code >= 85 || (code >= 71 && code <= 77)) return "nieve"
  if (code >= 80) return "chubascos"
  if (code >= 61) return "lluvia"
  if (code >= 51) return "llovizna"
  if (code === 45 || code === 48) return "niebla"
  if (code === 3) return "nublado"
  if (code >= 1) return "algo nublado"
  return "despejado"
}

const WEATHER_SPAN = 240 // segundos que dura cada clima
export const WEATHER_FADE = 25 // segundos de transición al siguiente

export const skyAt = (hour: number): SkyKey => {
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

// Hora local en horas decimales; ?hora=18.5 en la URL la fija para previsualizar
export const localHour = (forced: number | null) => {
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

// Mezcla suave entre dos climas (f de 0 a 1)
export const lerpWeather = (a: Weather, b: Weather, f: number): Weather => {
  const s = f * f * (3 - 2 * f)
  const mix = (k: keyof Weather) => a[k] + (b[k] - a[k]) * s
  return {
    clouds: mix("clouds"),
    overcast: mix("overcast"),
    rain: mix("rain"),
    storm: mix("storm"),
    fog: mix("fog"),
    wind: mix("wind"),
  }
}

// Clima del ciclo propio en este momento, con transición entre segmentos
export const cycleWeather = (): Weather => {
  const s = Date.now() / 1000
  const seg = Math.floor(s / WEATHER_SPAN)
  const cur = weatherOfSegment(seg)
  const into = s - seg * WEATHER_SPAN
  if (into >= WEATHER_FADE) return cur
  return lerpWeather(weatherOfSegment(seg - 1), cur, into / WEATHER_FADE)
}

// Lleva la hora real a la hora "canónica" del cielo, para que el amanecer y el
// atardecer reales caigan donde los espera SKY_KEYS (SUNRISE y SUNSET)
export const canonHour = (hour: number, sunrise: number, sunset: number) => {
  if (hour >= sunrise && hour < sunset) return SUNRISE + ((hour - sunrise) / (sunset - sunrise)) * (SUNSET - SUNRISE)
  const nightLen = 24 - (sunset - sunrise)
  const into = (hour - sunset + 24) % 24
  return (SUNSET + (into / nightLen) * (24 - (SUNSET - SUNRISE))) % 24
}

// Lleva un color hacia un gris de su misma luminosidad (cielo encapotado)
export const toGray = (c: RGB, k: number): RGB => {
  const m = (c[0] + c[1] + c[2]) / 3
  return mixRGB(c, [m * 0.82, m * 0.87, m * 0.95], k)
}
