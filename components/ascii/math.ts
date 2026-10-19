// Utilidades del motor ASCII: ruido, colores y caracteres

export type RGB = [number, number, number]
export type Cell = [string, string] // [carácter, color]

export const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}

export const noise = (x: number, y: number) => {
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

export const fbm = (x: number, y: number) =>
  noise(x, y) * 0.6 + noise(x * 2.1, y * 2.1) * 0.3 + noise(x * 4.3, y * 4.3) * 0.1

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// Paletas de 4 niveles, de tenue a brillante
export const level = (palette: string[], v: number) => palette[clamp(Math.floor(v * 4), 0, 3)]

export const mixRGB = (a: RGB, b: RGB, f: number): RGB => [
  a[0] + (b[0] - a[0]) * f,
  a[1] + (b[1] - a[1]) * f,
  a[2] + (b[2] - a[2]) * f,
]

// Colores cuantizados para que el render pueda agrupar tramos del mismo color
const rgbCache = new Map<number, string>()
export const rgb = (c: RGB, k = 1) => {
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

export const ramp = (chars: string, v: number) => chars[clamp(Math.floor(v * chars.length), 0, chars.length - 1)]

// Carácter según la dirección del trazo (coordenadas de pantalla, y hacia abajo)
export const dirChar = (dx: number, dy: number) => {
  let a = (Math.atan2(-dy, dx) * 180) / Math.PI
  a = ((a % 180) + 180) % 180
  if (a < 22.5 || a >= 157.5) return "-"
  if (a < 67.5) return "/"
  if (a < 112.5) return "|"
  return "\\"
}
