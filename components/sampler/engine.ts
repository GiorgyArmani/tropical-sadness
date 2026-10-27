// El motor del sampler: 4 bancos de 16 pads, un secuenciador de hasta 4 compases (16 pasos cada uno),
// grabación con el micrófono, carga de archivos y exportación a MP3.
//
// Hay un solo sampler por visita (getSampler): si se sale de la sala y se vuelve, lo que se armó sigue ahí.
//
// Volúmenes: los sonidos se normalizan a 0.9 de pico y cada pad arranca en 0.6, así un golpe queda
// cerca de 0.5. Al final hay un compresor rápido que solo actúa si se suman muchos a la vez (que la
// salida nunca sature).

import { normalize, PRESETS, renderPreset } from "./kits"

export const PADS = 16
export const BANKS = 4
export const STEPS_PER_BAR = 16
export const MAX_BARS = 4
const MAX_STEPS = STEPS_PER_BAR * MAX_BARS
const LOOKAHEAD = 0.12 // segundos que se agendan por adelantado
export const MAX_REC = 12 // segundos máximos al grabar con el micrófono
const MAX_FILE = 30 // segundos máximos de un archivo subido
export const SWINGS = [50, 54, 58, 62, 66] // % de swing estilo MPC

export type Pad = {
  name: string
  buf: AudioBuffer | null
  orig: { name: string; buf: AudioBuffer | null } // el de fábrica, para volver a él
  gain: number // 0..1
  tune: number // semitonos, -12..12
  decay: number // 0..1: qué parte del sonido suena (1 = entero)
  cutoff: number // 0..1: pasabajos (1 = abierto)
  choke: number // 0 = ninguno; los pads del mismo grupo se cortan entre sí (hat abierto y cerrado)
}

type Voice = { src: AudioBufferSourceNode; g: GainNode; choke: number }

const cutoffHz = (v: number) => 120 * Math.pow(20000 / 120, v)
const lengthOf = (p: Pad) => (p.buf ? (p.buf.duration / 2 ** (p.tune / 12)) * (0.04 + 0.96 * p.decay * p.decay) : 0)

// Toca un pad en el contexto que sea (el de verdad o el de exportar)
const voice = (ctx: BaseAudioContext, dest: AudioNode, p: Pad, when: number, vel: number, voices: Voice[]) => {
  if (!p.buf) return
  if (p.choke) {
    for (const v of voices) {
      if (v.choke !== p.choke) continue
      v.g.gain.cancelScheduledValues(when)
      v.g.gain.setTargetAtTime(0, when, 0.008)
      try {
        v.src.stop(when + 0.06)
      } catch {}
    }
  }
  const src = ctx.createBufferSource()
  src.buffer = p.buf
  src.playbackRate.value = 2 ** (p.tune / 12)
  const g = ctx.createGain()
  const len = lengthOf(p)
  const level = Math.max(0.0001, p.gain * vel)
  g.gain.setValueAtTime(level, when)
  if (p.decay < 0.999) {
    // Recortado: se apaga en el último tramo
    g.gain.setValueAtTime(level, when + len * 0.6)
    g.gain.exponentialRampToValueAtTime(0.0001, when + len)
  }
  let node: AudioNode = src
  if (p.cutoff < 0.999) {
    const f = ctx.createBiquadFilter()
    f.type = "lowpass"
    f.frequency.value = cutoffHz(p.cutoff)
    f.Q.value = 0.9
    node = src.connect(f)
  }
  node.connect(g).connect(dest)
  src.start(when)
  src.stop(when + len + 0.02)
  const v = { src, g, choke: p.choke }
  voices.push(v)
  src.onended = () => {
    const i = voices.indexOf(v)
    if (i >= 0) voices.splice(i, 1)
  }
}

// La cadena de salida: volumen general y un compresor que funciona como red de seguridad
const masterChain = (ctx: BaseAudioContext, volume: number) => {
  const g = ctx.createGain()
  g.gain.value = volume
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -6
  comp.knee.value = 4
  comp.ratio.value = 12
  comp.attack.value = 0.002
  comp.release.value = 0.12
  g.connect(comp).connect(ctx.destination)
  return { g, comp }
}

export class Sampler {
  ac: AudioContext
  master: GainNode
  analyser: AnalyserNode
  pads: Pad[]
  seq: Float32Array[] // por pad, la fuerza en cada paso (0 = no suena)
  bpm = 90
  swing = 0 // índice en SWINGS
  bars = 1
  metro = false
  volume = 0.8
  playing = false
  recording = false
  ready: Promise<void>
  hits: { pad: number; t: number }[] = [] // golpes agendados (para que la pantalla los muestre)
  private voices: Voice[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private nextTime = 0
  private nextStep = 0
  private stepQueue: { step: number; t: number }[] = []
  private skip = new Set<number>()
  private undoStack: Float32Array[][] = []
  private listeners = new Set<() => void>()

  constructor() {
    this.ac = new AudioContext({ latencyHint: "interactive" })
    const { g, comp } = masterChain(this.ac, this.volume)
    this.master = g
    this.analyser = this.ac.createAnalyser()
    this.analyser.fftSize = 512
    comp.connect(this.analyser)
    this.pads = Array.from({ length: PADS * BANKS }, (_, i) => {
      const pre = PRESETS[Math.floor(i / PADS)][i % PADS]
      return { name: pre?.name ?? "vacío", buf: null, orig: { name: pre?.name ?? "vacío", buf: null }, gain: 0.6, tune: 0, decay: 1, cutoff: 1, choke: pre?.choke ?? 0 }
    })
    this.seq = Array.from({ length: PADS * BANKS }, () => new Float32Array(MAX_STEPS))
    this.ready = this.load()
  }

  // Sintetiza los sonidos de fábrica. Primero el banco A (es lo primero que se toca)
  private async load() {
    const sr = this.ac.sampleRate
    for (let b = 0; b < BANKS; b++) {
      await Promise.all(
        PRESETS[b].map(async (pre, i) => {
          if (!pre) return
          const buf = await renderPreset(pre, sr)
          const p = this.pads[b * PADS + i]
          p.orig.buf = buf
          if (!p.buf && p.name === pre.name) p.buf = buf
        }),
      )
      this.emit()
    }
  }

  // --- Avisos a la interfaz ---
  subscribe(fn: () => void) {
    this.listeners.add(fn)
    return () => void this.listeners.delete(fn)
  }
  emit() {
    this.listeners.forEach((fn) => fn())
  }

  resume() {
    if (this.ac.state !== "running") void this.ac.resume()
  }

  // Ajustes del secuenciador (tempo, swing, compases, metrónomo). Cambiar los compases tocando reinicia
  set(patch: Partial<Pick<Sampler, "bpm" | "swing" | "bars" | "metro">>) {
    const restart = patch.bars !== undefined && patch.bars !== this.bars && this.playing
    if (restart) this.stop()
    Object.assign(this, patch)
    this.bpm = Math.min(180, Math.max(60, Math.round(this.bpm)))
    if (restart) this.play()
    this.emit()
  }

  // Ajustes de un pad (afinación, largo, filtro, nivel)
  setPad(pad: number, patch: Partial<Pick<Pad, "tune" | "decay" | "cutoff" | "gain">>) {
    Object.assign(this.pads[pad], patch)
    this.emit()
  }

  private micCount = 0
  nextMicName() {
    return `mic ${String(++this.micCount).padStart(2, "0")}`
  }

  setVolume(v: number) {
    this.volume = v
    this.master.gain.setTargetAtTime(v, this.ac.currentTime, 0.02)
    this.emit()
  }

  get totalSteps() {
    return this.bars * STEPS_PER_BAR
  }
  get stepDur() {
    return 60 / this.bpm / 4
  }
  private swingAt(step: number, stepDur: number) {
    return step % 2 === 1 ? (SWINGS[this.swing] / 100 - 0.5) * 2 * stepDur : 0
  }

  // --- Tocar ---
  hit(pad: number, vel = 1) {
    this.resume()
    const t = this.ac.currentTime
    voice(this.ac, this.master, this.pads[pad], t, vel, this.voices)
    this.mark(pad, t)
    if (this.playing && this.recording) {
      // Se cuantiza al paso más cercano. Si ese paso todavía no sonó en esta vuelta, se saltea una
      // vez (ya sonó ahora, en vivo)
      const k = Math.round((t - this.nextTime) / this.stepDur)
      const step = (((this.nextStep + k) % this.totalSteps) + this.totalSteps) % this.totalSteps
      this.seq[pad][step] = vel
      if (k >= 0) this.skip.add(pad * MAX_STEPS + step)
      this.emit()
    }
  }

  // Anota el golpe para que la pantalla lo muestre (si el panel está cerrado nadie los lee: se descartan)
  private mark(pad: number, t: number) {
    this.hits.push({ pad, t })
    if (this.hits.length > 256) this.hits.splice(0, 128)
  }

  // Al salir de la sala: se para todo y el audio se suspende (no gasta batería ni molesta a la radio)
  sleep() {
    this.stop()
    if (this.ac.state === "running") void this.ac.suspend()
  }

  // --- Secuenciador ---
  play() {
    if (this.playing) return
    this.resume()
    this.playing = true
    this.nextTime = this.ac.currentTime + 0.06
    this.nextStep = 0
    this.stepQueue = []
    this.skip.clear()
    this.timer = setInterval(() => this.tick(), 25)
    this.tick()
    this.emit()
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.playing = false
    this.recording = false
    this.stepQueue = []
    const t = this.ac.currentTime
    for (const v of this.voices) {
      v.g.gain.cancelScheduledValues(t)
      v.g.gain.setTargetAtTime(0, t, 0.015)
    }
    this.emit()
  }

  // Grabar: si está parado, arranca a tocar grabando; si ya toca, prende o apaga la grabación
  toggleRec() {
    if (!this.recording) this.snapshot()
    this.recording = !this.recording
    if (this.recording && !this.playing) this.play()
    this.emit()
  }

  private tick() {
    const ac = this.ac
    while (this.nextTime < ac.currentTime + LOOKAHEAD) {
      const step = this.nextStep % this.totalSteps
      const t = this.nextTime + this.swingAt(step, this.stepDur)
      for (let p = 0; p < this.pads.length; p++) {
        const v = this.seq[p][step]
        if (!v) continue
        const key = p * MAX_STEPS + step
        if (this.skip.has(key)) {
          this.skip.delete(key)
          continue
        }
        voice(ac, this.master, this.pads[p], t, v, this.voices)
        this.mark(p, t)
      }
      if (this.metro && step % 4 === 0) this.click(t, step === 0)
      this.stepQueue.push({ step, t })
      this.nextTime += this.stepDur
      this.nextStep = (step + 1) % this.totalSteps
    }
  }

  private click(t: number, accent: boolean) {
    const o = this.ac.createOscillator()
    o.frequency.value = accent ? 1760 : 1180
    const g = this.ac.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.002)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
    o.connect(g).connect(this.master)
    o.start(t)
    o.stop(t + 0.06)
  }

  // El paso que está sonando ahora (-1 parado)
  currentStep() {
    if (!this.playing) return -1
    const now = this.ac.currentTime
    let cur = -1
    while (this.stepQueue.length && this.stepQueue[0].t <= now) cur = this.stepQueue.shift()!.step
    if (cur >= 0) this.lastStep = cur
    return this.lastStep
  }
  private lastStep = -1

  // --- Editar el patrón ---
  snapshot() {
    this.undoStack.push(this.seq.map((s) => s.slice()))
    if (this.undoStack.length > 30) this.undoStack.shift()
  }
  undo() {
    const prev = this.undoStack.pop()
    if (!prev) return false
    this.seq = prev
    this.emit()
    return true
  }
  toggleStep(pad: number, step: number) {
    this.snapshot()
    const on = !this.seq[pad][step]
    this.seq[pad][step] = on ? 1 : 0
    this.emit()
    return on
  }
  clearPad(pad: number) {
    this.snapshot()
    this.seq[pad].fill(0)
    this.emit()
  }
  clearAll() {
    this.snapshot()
    this.seq.forEach((s) => s.fill(0))
    this.emit()
  }
  isEmpty() {
    const n = this.totalSteps
    return this.seq.every((s, p) => !this.pads[p].buf || !s.subarray(0, n).some(Boolean))
  }
  padUsed(pad: number) {
    return this.seq[pad].subarray(0, this.totalSteps).some(Boolean)
  }

  // --- Cargar sonidos ---
  async decode(data: ArrayBuffer) {
    const buf = await this.ac.decodeAudioData(data)
    return buf
  }

  // Pone un sonido en un pad: se recorta el silencio del principio, se limita el largo y se normaliza
  assign(pad: number, buf: AudioBuffer, name: string, maxSec = MAX_FILE) {
    const p = this.pads[pad]
    p.buf = trim(this.ac, buf, maxSec)
    p.name = name.slice(0, 16) || "sin nombre"
    p.tune = 0
    p.decay = 1
    p.cutoff = 1
    this.emit()
  }
  restore(pad: number) {
    const p = this.pads[pad]
    p.buf = p.orig.buf
    p.name = p.orig.name
    this.emit()
  }
  empty(pad: number) {
    const p = this.pads[pad]
    p.buf = null
    p.name = "vacío"
    this.emit()
  }

  // --- Exportar: el patrón tocado `loops` veces, con la cola de los sonidos al final ---
  async render(loops: number) {
    const sr = 44100 // el MP3 no acepta cualquier frecuencia: se arma siempre a 44.1 kHz
    const stepDur = this.stepDur
    const total = this.totalSteps
    const tail = 2.5
    const len = loops * total * stepDur + tail
    const ctx = new OfflineAudioContext(2, Math.ceil(len * sr), sr)
    const { g } = masterChain(ctx, this.volume)
    const voices: Voice[] = []
    for (let l = 0; l < loops; l++)
      for (let s = 0; s < total; s++) {
        const t = (l * total + s) * stepDur + this.swingAt(s, stepDur) + 0.005
        for (let p = 0; p < this.pads.length; p++) {
          const v = this.seq[p][s]
          if (v) voice(ctx, g, this.pads[p], t, v, voices)
        }
      }
    const buf = await ctx.startRendering()
    // Se corta el silencio del final (deja medio segundo) y, por las dudas, nunca pasa de 0.95
    let end = buf.length
    const th = 0.001
    const l = buf.getChannelData(0)
    const r = buf.getChannelData(1)
    const minEnd = Math.ceil(loops * total * stepDur * sr)
    while (end > minEnd && Math.abs(l[end - 1]) < th && Math.abs(r[end - 1]) < th) end--
    end = Math.min(buf.length, end + Math.floor(sr * 0.5))
    let peak = 0
    for (let i = 0; i < end; i++) peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]))
    const scale = peak > 0.95 ? 0.95 / peak : 1
    return encodeMp3([l.subarray(0, end), r.subarray(0, end)], sr, scale)
  }

  dispose() {
    this.stop()
    void this.ac.close()
  }
}

// Recorta el silencio del principio y deja como mucho maxSec; lo pasa a mono y lo normaliza
const trim = (ac: BaseAudioContext, buf: AudioBuffer, maxSec: number) => {
  const n = buf.length
  const chs = Array.from({ length: buf.numberOfChannels }, (_, k) => buf.getChannelData(k))
  let peak = 0
  for (const d of chs) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]))
  const th = Math.max(0.004, peak * 0.04)
  let start = 0
  while (start < n && chs.every((d) => Math.abs(d[start]) < th)) start++
  start = Math.max(0, start - Math.floor(buf.sampleRate * 0.005)) // unos milisegundos antes del golpe
  const len = Math.max(1, Math.min(n - start, Math.floor(maxSec * buf.sampleRate)))
  const out = ac.createBuffer(1, len, buf.sampleRate)
  const o = out.getChannelData(0)
  for (const d of chs) for (let i = 0; i < len; i++) o[i] += d[start + i] / chs.length
  // Fundido corto al final para que no haga clic
  const fade = Math.min(len, Math.floor(buf.sampleRate * 0.01))
  for (let i = 0; i < fade; i++) o[len - 1 - i] *= i / fade
  return normalize(out, 0.9)
}

// MP3 a 192 kbps. El codificador (lamejs) se baja recién al exportar. Se codifica por tramos y se
// cede el hilo entre uno y otro, así la página no se congela con piezas largas
const MP3_KBPS = 192
const encodeMp3 = async (chs: Float32Array[], sr: number, scale = 1) => {
  const { Mp3Encoder } = await import("@breezystack/lamejs")
  const enc = new Mp3Encoder(2, sr, MP3_KBPS)
  const toInt = (d: Float32Array, from: number, to: number) => {
    const o = new Int16Array(to - from)
    for (let i = from; i < to; i++) {
      const v = Math.max(-1, Math.min(1, d[i] * scale))
      o[i - from] = v < 0 ? v * 0x8000 : v * 0x7fff
    }
    return o
  }
  const parts: BlobPart[] = []
  const n = chs[0].length
  const CHUNK = 1152 * 40
  for (let i = 0; i < n; i += CHUNK) {
    const to = Math.min(n, i + CHUNK)
    const out = enc.encodeBuffer(toInt(chs[0], i, to), toInt(chs[1] ?? chs[0], i, to))
    if (out.length) parts.push(new Uint8Array(out))
    if ((i / CHUNK) % 20 === 19) await new Promise((r) => setTimeout(r, 0))
  }
  const last = enc.flush()
  if (last.length) parts.push(new Uint8Array(last))
  return new Blob(parts, { type: "audio/mpeg" })
}

// Uno solo por visita
let instance: Sampler | null = null
export const getSampler = () => (instance ??= new Sampler())
export const sleepSampler = () => instance?.sleep()

// --- Micrófono ---
export type MicTake = { stop: () => void; level: () => number; done: Promise<Blob> }

export const recordMic = async (onAutoStop: () => void): Promise<MicTake> => {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  })
  const rec = new MediaRecorder(stream)
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  // Medidor de nivel mientras se graba
  const ac = getSampler().ac
  const srcNode = ac.createMediaStreamSource(stream)
  const an = ac.createAnalyser()
  an.fftSize = 512
  srcNode.connect(an)
  const arr = new Float32Array(an.fftSize)
  const done = new Promise<Blob>((resolve) => {
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      srcNode.disconnect()
      resolve(new Blob(chunks, { type: rec.mimeType || "audio/webm" }))
    }
  })
  rec.start()
  const auto = setTimeout(() => {
    if (rec.state === "recording") {
      rec.stop()
      onAutoStop()
    }
  }, MAX_REC * 1000)
  return {
    stop: () => {
      clearTimeout(auto)
      if (rec.state === "recording") rec.stop()
    },
    level: () => {
      an.getFloatTimeDomainData(arr)
      let m = 0
      for (let i = 0; i < arr.length; i++) m = Math.max(m, Math.abs(arr[i]))
      return m
    },
    done,
  }
}
