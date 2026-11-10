// Burbujas de chat sobre los avatares: cuando alguien escribe en el chat estando en una sala, su mensaje
// aparece un rato sobre su cabeza, encima del nick. El chat avisa con SAY_EVENT (al guardarse el mensaje),
// el 3D lo manda a la sala (net.ts) y el servidor lo reparte a los demás. Se dibujan en el lienzo de
// encima de la película, como los nicks, con la letra y los colores de las ventanas de tropi.OS.

export const SAY_EVENT = "ts-say" // window.dispatchEvent(new CustomEvent(SAY_EVENT, { detail: texto }))
export type Said = { text: string; at: number } // at: performance.now() de cuando se dijo
export const SAY_MAX = 200 // como el chat

const COLS = 24 // letras por renglón
const LINES = 3 // más que esto se corta con "…"
const LH = 16 // la letra de tropi.OS es de 16 px
const PAD = 4
const FADE_IN = 150
const FADE_OUT = 600
const DARK = "#14101f"
const LIGHT = "#e4e1ee"

// Cuánto se ve (ms): más si el mensaje es largo
export const sayLife = (text: string) => Math.min(4000 + text.length * 60, 10000)

// Cuánto se ve ahora (0..1): aparece rápido y se desvanece al final
export const sayAlpha = (s: Said, now: number) => {
  const age = now - s.at
  const left = sayLife(s.text) - age
  return Math.min(1, Math.max(0, age / FADE_IN), Math.max(0, left / FADE_OUT))
}

// Renglones de hasta COLS letras, partiendo por palabras (una palabra larguísima se corta)
const wrap = (text: string) => {
  const lines: string[] = []
  let line = ""
  for (const word of text.split(" ")) {
    let w = word
    while (w.length > COLS) {
      if (line) lines.push(line)
      lines.push(w.slice(0, COLS))
      line = ""
      w = w.slice(COLS)
    }
    if (!line) line = w
    else if (line.length + 1 + w.length <= COLS) line += " " + w
    else {
      lines.push(line)
      line = w
    }
  }
  if (line) lines.push(line)
  if (lines.length > LINES) {
    lines.length = LINES
    lines[LINES - 1] = lines[LINES - 1].slice(0, COLS - 1) + "…"
  }
  return lines
}

// La letra de tropi.OS (next/font la deja en --font-dot)
let font = ""
const osFont = () =>
  font || (font = `${LH}px ${getComputedStyle(document.documentElement).getPropertyValue("--font-dot").trim() || "monospace"}`)

// Una burbuja con la colita hacia abajo: (x, y) es la punta de la colita, en px de pantalla
export const drawBubble = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, alpha: number) => {
  if (alpha <= 0) return
  const lines = wrap(text)
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.font = osFont()
  ctx.textAlign = "left"
  ctx.textBaseline = "top"
  const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))) + PAD * 2
  const h = lines.length * LH + PAD * 2 - 2
  // Siempre adentro del lienzo: si arriba no entra (la cabeza muy cerca del borde) baja lo justo, y
  // entonces va sin colita
  const W = ctx.canvas.clientWidth
  const H = ctx.canvas.clientHeight
  const tx = Math.round(x)
  const left = Math.round(Math.min(Math.max(x - w / 2, 4), W - w - 4))
  const want = Math.round(y) - 5 - h
  const top = Math.min(Math.max(want, 4), H - h - 4)
  const tail = top === want && tx - 5 > left && tx + 5 < left + w
  // La caja: borde oscuro de un píxel y fondo claro
  ctx.fillStyle = DARK
  ctx.fillRect(left - 1, top - 1, w + 2, h + 2)
  ctx.fillStyle = LIGHT
  ctx.fillRect(left, top, w, h)
  // La colita, en escalones de píxel (abre el borde de abajo donde se une)
  for (let i = 0; i < (tail ? 5 : 0); i++) {
    const half = 5 - i
    ctx.fillStyle = DARK
    ctx.fillRect(tx - half, top + h + i, half * 2 + 1, 1)
    if (half > 1) {
      ctx.fillStyle = LIGHT
      ctx.fillRect(tx - half + 1, top + h + i, half * 2 - 1, 1)
    }
  }
  ctx.fillStyle = DARK
  lines.forEach((l, i) => ctx.fillText(l, left + PAD, top + PAD + i * LH - 1))
  ctx.restore()
}
