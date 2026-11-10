// Los sonidos de encender y apagar tropi.OS, hechos al vuelo con Web Audio (no hay archivos de sonido).
// Al encender: el chasquido del interruptor, el zumbido del tubo al cargarse, el pitido del BIOS, el
// disco que busca y, cuando se dibuja el logo, una campanada que sube nota por nota y queda flotando.
// Al apagar: la campanada baja de vuelta y la imagen se cierra con el quejido del tubo al descargarse.
//
// Los navegadores solo dejan sonar después de un toque, clic o tecla: por eso el arranque espera a
// que se encienda el monitor, y estas funciones se llaman dentro de ese gesto. (Por lo mismo no puede
// sonar nada al cerrar la pestaña de verdad: el navegador corta el audio en el acto.)
//
// Sonido limpio, como el resto de los efectos (ver ascii3d/sfx.ts): ondas suaves, sin limitador ni
// saturación, con el pico cerca de 0.5. La radio espera callada y entra de a poco con el escritorio.

import { DUCK_EVENT } from "./MusicBar"

// Con 1 el pico de todo junto queda en ~0.2 (medido); así llega a ~0.45
const VOLUME = 2.3

// Cuándo pasa cada cosa, en segundos desde el gesto: los mismos tiempos que .ts-boot--on y
// body.ts-power-off en globals.css
const BEEP_AT = 0.66 // primera línea del BIOS
const DISK_AT = [0.92, 1.0, 1.05, 1.27, 1.33, 1.52, 1.6, 1.66, 1.81] // el disco, mientras salen las demás
const LOGO_AT = 2.05 // el logo empieza a dibujarse: arranca la campanada
const LOGO_AT_QUICK = 0.25 // con movimiento reducido no hay BIOS: el logo sale enseguida
const NOTE_GAP = 0.18 // una nota cada tanto del barrido; la última cae cuando aparece "tropi.OS"
const OFF_AT = 0.25 // al apagar, la imagen empieza a cerrarse

// Re bemol mayor con séptima y novena, subiendo; abajo, el acorde que queda sonando
const NOTES = [277.18, 349.23, 415.3, 523.25, 622.25]
const LAST_NOTE = 830.61
const PAD = [138.59, 207.65, 349.23, 523.25]

const duck = (ms: number, to: number) => window.dispatchEvent(new CustomEvent(DUCK_EVENT, { detail: { ms, to } }))

// Lo común de los dos sonidos: el audio, su salida y las piezas con que se arman
const rig = () => {
  let ac: AudioContext
  try {
    ac = new AudioContext()
  } catch {
    return null // sin audio todo sigue igual
  }
  const t0 = ac.currentTime + 0.02
  const out = ac.createGain()
  out.gain.value = VOLUME
  out.connect(ac.destination)

  // Envolvente: sube a peak en attack, se queda hold y se apaga en release (segundos)
  const env = (g: GainNode, at: number, peak: number, attack: number, hold: number, release: number) => {
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(peak, at + attack)
    g.gain.setValueAtTime(peak, at + attack + hold)
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release)
    return at + attack + hold + release
  }
  const tone = (dest: AudioNode, type: OscillatorType, freq: number, at: number, peak: number, attack: number, hold: number, release: number) => {
    const osc = ac.createOscillator()
    osc.type = type
    osc.frequency.value = freq
    const g = ac.createGain()
    const end = env(g, at, peak, attack, hold, release)
    osc.connect(g).connect(dest)
    osc.start(at)
    osc.stop(end + 0.05)
    return osc
  }
  const noise = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.5), ac.sampleRate)
  const ch = noise.getChannelData(0)
  for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1
  // Un golpe de ruido filtrado (chasquido, estática, cabezal del disco)
  const burst = (at: number, freq: number, q: number, peak: number, release: number) => {
    const src = ac.createBufferSource()
    src.buffer = noise
    const f = ac.createBiquadFilter()
    f.type = "bandpass"
    f.frequency.value = freq
    f.Q.value = q
    const g = ac.createGain()
    const end = env(g, at, peak, 0.002, 0, release)
    src.connect(f).connect(g).connect(out)
    src.start(at, Math.random() * 0.3)
    src.stop(end + 0.02)
  }
  // Una campana: la fundamental y dos parciales más cortos, con un eco suave
  const bells = ac.createGain()
  const echo = ac.createDelay(1)
  echo.delayTime.value = 0.3
  const again = ac.createGain()
  again.gain.value = 0.3
  const wet = ac.createGain()
  wet.gain.value = 0.22
  bells.connect(out)
  bells.connect(echo)
  echo.connect(again).connect(echo)
  echo.connect(wet).connect(out)
  const bell = (freq: number, at: number, peak: number, ring: number) => {
    tone(bells, "sine", freq, at, peak, 0.006, 0, ring)
    tone(bells, "sine", freq * 2, at, peak * 0.28, 0.006, 0, ring * 0.45)
    tone(bells, "sine", freq * 3.01, at, peak * 0.1, 0.006, 0, ring * 0.28)
  }
  const close = () => {
    if (ac.state !== "closed") void ac.close()
  }
  return { ac, t0, out, tone, burst, bell, close }
}

// El encendido. quick: sin la parte del BIOS. Devuelve cómo cortarlo (para cuando se salta el arranque)
export const playBootSound = (quick: boolean): (() => void) => {
  duck(quick ? 4400 : 6500, 0)
  const r = rig()
  if (!r) return () => duck(60, 1)
  const { ac, t0, out, tone, burst, bell, close } = r

  // El chasquido del interruptor con su golpe grave
  burst(t0, 1700, 1.2, 0.14, 0.03)
  tone(out, "sine", 120, t0, 0.2, 0.004, 0, 0.12).frequency.exponentialRampToValueAtTime(48, t0 + 0.09)
  // El tubo se carga: zumbido de la corriente (dos graves casi iguales, que laten entre sí) y estática
  tone(out, "sine", 100, t0 + 0.04, 0.09, 0.05, 0.15, 0.9)
  tone(out, "sine", 109, t0 + 0.04, 0.06, 0.05, 0.15, 0.9)
  tone(out, "sine", 200, t0 + 0.04, 0.035, 0.05, 0.1, 0.6)
  burst(t0 + 0.08, 5200, 0.7, 0.07, 0.3)

  if (!quick) {
    // El silbido agudo del tubo, apenas (15.6 kHz: no todos lo oyen)
    tone(out, "sine", 15625, t0 + 0.1, 0.006, 0.3, 3.2, 0.6)
    tone(out, "triangle", 880, t0 + BEEP_AT, 0.11, 0.004, 0.1, 0.02)
    for (const at of DISK_AT) {
      burst(t0 + at, 2600, 4, 0.05, 0.012)
      burst(t0 + at, 420, 2, 0.04, 0.02)
    }
  }

  // La campanada, una nota por tramo del logo
  const tc = t0 + (quick ? LOGO_AT_QUICK : LOGO_AT)
  NOTES.forEach((freq, i) => bell(freq, tc + i * NOTE_GAP, 0.075, 1.9))
  const land = tc + NOTES.length * NOTE_GAP // se terminó de dibujar: sale el nombre del sistema
  bell(LAST_NOTE, land, 0.09, 2.8)
  burst(land, 3000, 1.5, 0.045, 0.07) // el chispazo del logo
  // El acorde de fondo: voces dobles apenas desafinadas, con un vaivén lento de cinta gastada
  const wobble = ac.createOscillator()
  wobble.frequency.value = 0.9
  const cents = ac.createGain()
  cents.gain.value = 5
  wobble.connect(cents)
  wobble.start(land)
  wobble.stop(land + 4)
  for (const freq of PAD) {
    for (const detune of [-4, 4]) {
      const osc = tone(out, "sine", freq, land, 0.028, 0.6, 0.5, 2.4)
      osc.detune.value = detune
      cents.connect(osc.detune)
    }
  }
  tone(out, "sine", 69.3, land, 0.06, 0.4, 0.4, 2)

  const closing = window.setTimeout(close, (land - t0 + 4.5) * 1000)
  return () => {
    duck(60, 1)
    clearTimeout(closing)
    if (ac.state === "closed") return
    out.gain.setTargetAtTime(0, ac.currentTime, 0.03)
    window.setTimeout(close, 250)
  }
}

// El apagado: la campanada baja de vuelta; después el interruptor corta y la imagen se cierra con un
// quejido que cae (el tubo al descargarse), una chispa de estática y el golpe del final
export const playShutdownSound = () => {
  const r = rig()
  if (!r) return
  const { t0, out, tone, burst, bell, close } = r
  ;[LAST_NOTE, ...[...NOTES].reverse()].forEach((freq, i) => bell(freq, t0 + i * 0.09, 0.06, 1.1))
  const at = t0 + OFF_AT
  burst(at, 1700, 1.2, 0.12, 0.03)
  tone(out, "sine", 900, at, 0.07, 0.01, 0.05, 0.4).frequency.exponentialRampToValueAtTime(60, at + 0.42)
  burst(at + 0.05, 5200, 0.7, 0.06, 0.35)
  tone(out, "sine", 90, at + 0.42, 0.14, 0.004, 0, 0.25).frequency.exponentialRampToValueAtTime(40, at + 0.6)
  window.setTimeout(close, 3200)
}
