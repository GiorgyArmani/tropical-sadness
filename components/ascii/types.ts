import type { RGB } from "./math"
import type { SkyKey, Weather } from "./sky"

// Una celda que la escena quiere mantener por encima de la lluvia y la niebla (la tele, la cripta)
export type Kept = { i: number; ch: string; col: string }

// Todo lo que el motor le pasa a una escena en cada cuadro
export type Frame = {
  t: number // segundos
  W: number
  H: number
  cw: number // ancho de una celda, px
  lh: number // alto de una celda, px
  cols: number
  rows: number
  chars: string[]
  colors: string[]
  shade: Uint8Array // marca de qué figura ocupa cada celda, para los contornos
  tops: number[] // borde de arriba de la isla en cada columna, px
  angle: number // giro de la cámara
  R: number // radio de referencia de la escena (con zoom), px
  Rx: number // radio real de la isla, px
  cx: number // centro horizontal de la isla, px
  shoreY: number // línea de la orilla, px
  sky: SkyKey
  wea: Weather
  L: number // luz general (0.35 de noche a 1 de día)
  night: number // 0 de día, 1 de noche cerrada
  dayK: number // 1 a pleno sol
  calm: number // 1 sin lluvia, 0 con tormenta
  wind: number // balanceo por el viento
  sunUp: boolean
  moonUp: boolean
  sunX: number
  moonX: number
  lightSide: number // de qué lado llega la luz: -1 izquierda, 1 derecha
  seaNear: RGB // color del agua profunda
  plot: (px: number, py: number, ch: string, col: string) => void
  setCell: (c: number, r: number, ch: string, col: string) => void
  project: (wx: number, wy: number, wz: number) => [number, number, number] // mundo -> [x, y, profundidad]
  ground: (wx: number, wz: number) => number // altura del terreno, px
  newShape: () => number // id para marcar las celdas de una figura en `shade`
}

// Colores del terreno de la isla: de la parte alta (hi) a la orilla (lo)
export type Land = { hi: RGB; mid: RGB; lo: RGB; ramp: string; sparkle: RGB | null }

export type Scene = {
  id: string
  name: string // corto, para el botón de salida
  label: string // con artículo, para lectores de pantalla ("el cementerio")
  moon?: { color: RGB; full?: boolean; size?: number }
  // Ajusta el cielo y el clima del momento al clima de la escena
  mood?: (sky: SkyKey, wea: Weather) => [SkyKey, Weather]
  land: (f: Frame) => Land
  life?: (f: Frame) => void // en el cielo y el mar, detrás de los objetos
  objects: (f: Frame) => Kept[] // objetos sobre la isla
  front?: (f: Frame) => void // delante de todo, antes del clima
}
