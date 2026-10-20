// Sonidos del 3D, hechos al vuelo con Web Audio (no hay archivos de sonido).
//
// Los navegadores no dejan sonar nada hasta que la persona toca, hace clic o aprieta una tecla
// (la rueda del mouse no cuenta). En la compu alcanza con que ya haya tocado la página antes: el audio
// se crea recién al primer sonido. En el celular unlock() se llama con el toque (el iPhone lo exige).
//
// Mientras suena algo fuerte, la radio baja un momento (duck) para que se escuche.

import { DUCK_EVENT } from "../MusicBar"

// Volumen general de los efectos: con 1 cada uno llega a ~0.7 de pico; 0.7 los deja en ~0.5, así al
// sumarse con la radio la salida no pasa del máximo (si pasa, se escucha saturado)
const VOLUME = 0.7

// Baja la radio: a "to" (0..1 del volumen elegido) durante ms
const duck = (ms: number, to: number) => window.dispatchEvent(new CustomEvent(DUCK_EVENT, { detail: { ms, to } }))

export const createSfx = () => {
  let ac: AudioContext | null = null
  let noise: AudioBuffer | null = null

  const unlock = () => {
    try {
      ac ??= new AudioContext()
      if (ac.state === "suspended") void ac.resume()
      if (!noise) {
        noise = ac.createBuffer(1, Math.floor(ac.sampleRate * 1.5), ac.sampleRate)
        const ch = noise.getChannelData(0)
        for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1
      }
    } catch {} // sin audio el juego sigue igual
  }

  // Lo común de cada sonido: el audio listo, su salida y el momento de arranque. Sonido limpio: sin
  // limitador ni saturación; los volúmenes están puestos para que los picos queden debajo del máximo
  const begin = (level: number) => {
    unlock()
    if (!ac || !noise) return null
    const out = ac.createGain()
    out.gain.value = level * VOLUME
    out.connect(ac.destination)
    return { ctx: ac, buf: noise, out, t0: ac.currentTime + 0.01 }
  }

  // Envolvente: sube a peak en attack, se queda hold y se apaga en release (segundos)
  const env = (g: GainNode, t0: number, peak: number, attack: number, hold: number, release: number) => {
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack)
    g.gain.setValueAtTime(peak, t0 + attack + hold)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release)
    return t0 + attack + hold + release
  }

  // Ruido filtrado (estática, susurro, roce)
  const hiss = (ctx: AudioContext, buf: AudioBuffer, type: BiquadFilterType, freq: number, q: number) => {
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    src.connect(f).connect(g)
    return { src, f, g }
  }

  // El susto: un golpe grave (el empujón), un latigazo de estática y un chillido agudo que sube,
  // tiembla y se cae (limpio, sin distorsión). strength: 1 = sale detrás tuyo, menos = el de las luces cortadas
  const scream = (strength = 1) => {
    const s = begin(0.42 + 0.17 * strength) // pico ~0.7
    if (!s) return
    duck(1800, 0.15)
    try {
      const { ctx, buf, out, t0 } = s
      const end = t0 + 1.5
      // Golpe grave
      const thud = ctx.createOscillator()
      thud.frequency.setValueAtTime(95, t0)
      thud.frequency.exponentialRampToValueAtTime(32, t0 + 0.35)
      const tg = ctx.createGain()
      env(tg, t0, 0.9 * strength + 0.1, 0.01, 0, 0.44)
      thud.connect(tg).connect(out)
      thud.start(t0)
      thud.stop(t0 + 0.5)
      // Estática que cae de agudo a grave
      const st = hiss(ctx, buf, "bandpass", 3200, 0.9)
      st.f.frequency.exponentialRampToValueAtTime(350, t0 + 0.9)
      env(st.g, t0, 0.45, 0.01, 0, 0.89)
      st.g.connect(out)
      st.src.start(t0)
      st.src.stop(t0 + 1)
      // Chillido: cuatro tonos triangulares desafinados con vibrato rápido (la sierra sonaba áspera)
      const sg = ctx.createGain()
      env(sg, t0, 0.5, 0.025, 0.42, 1.05)
      const hp = ctx.createBiquadFilter()
      hp.type = "highpass"
      hp.frequency.value = 550
      const into = ctx.createGain()
      into.connect(hp).connect(sg).connect(out)
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 21
      lfo.start(t0)
      lfo.stop(end)
      for (const r of [1, 1.06, 1.49, 2.02]) {
        const f = 1150 * r
        const o = ctx.createOscillator()
        o.type = "triangle"
        o.frequency.setValueAtTime(f * 0.8, t0)
        o.frequency.exponentialRampToValueAtTime(f * 1.15, t0 + 0.07)
        o.frequency.exponentialRampToValueAtTime(f * 0.42, end)
        const depth = ctx.createGain()
        depth.gain.value = f * 0.045
        lfo.connect(depth).connect(o.frequency)
        const og = ctx.createGain()
        og.gain.value = r > 1.4 ? 0.12 : 0.22
        o.connect(og).connect(into)
        o.start(t0)
        o.stop(end)
      }
    } catch {}
  }

  // La aparición al fondo del pasillo, lejos. demon: el demonio gruñe grave y suelta un chillido
  // lejano; si no, los ojos: un susurro que va y viene sobre un zumbido
  const presence = (demon: boolean) => {
    const s = begin(demon ? 0.71 : 0.9) // pico ~0.7
    if (!s) return
    duck(4000, 0.45)
    try {
      const { ctx, buf, out, t0 } = s
      // Zumbido grave de fondo, que tiembla
      const drone = ctx.createOscillator()
      drone.type = demon ? "sawtooth" : "sine"
      drone.frequency.setValueAtTime(demon ? 52 : 41, t0)
      drone.frequency.linearRampToValueAtTime(demon ? 44 : 38, t0 + 3.5)
      const lp = ctx.createBiquadFilter()
      lp.type = "lowpass"
      lp.frequency.value = demon ? 380 : 200
      const dg = ctx.createGain()
      const end = env(dg, t0, demon ? 0.55 : 0.45, 0.6, 1.8, 1.2)
      const trem = ctx.createOscillator()
      trem.frequency.value = demon ? 9 : 3
      const td = ctx.createGain()
      td.gain.value = demon ? 0.25 : 0.15
      trem.connect(td).connect(dg.gain)
      drone.connect(lp).connect(dg).connect(out)
      drone.start(t0)
      drone.stop(end)
      trem.start(t0)
      trem.stop(end)
      // Susurro: ruido angosto que se abre y se cierra, como aire entre dientes
      const wh = hiss(ctx, buf, "bandpass", demon ? 900 : 2600, demon ? 3 : 7)
      const wl = ctx.createOscillator()
      wl.frequency.value = demon ? 1.7 : 2.6
      const wd = ctx.createGain()
      wd.gain.value = demon ? 500 : 1100
      wl.connect(wd).connect(wh.f.frequency)
      env(wh.g, t0 + 0.2, demon ? 0.35 : 0.5, 0.5, 1.6, 1.1)
      wh.g.connect(out)
      wh.src.start(t0)
      wh.src.stop(end)
      wl.start(t0)
      wl.stop(end)
      if (demon) {
        // Un chillido lejano y corto, apagado por la distancia
        const sc = ctx.createOscillator()
        sc.type = "sawtooth"
        sc.frequency.setValueAtTime(1300, t0 + 0.9)
        sc.frequency.exponentialRampToValueAtTime(700, t0 + 1.8)
        const far = ctx.createBiquadFilter()
        far.type = "bandpass"
        far.frequency.value = 1100
        far.Q.value = 2
        const sg = ctx.createGain()
        env(sg, t0 + 0.9, 0.22, 0.05, 0.25, 0.6)
        sc.connect(far).connect(sg).connect(out)
        sc.start(t0 + 0.9)
        sc.stop(t0 + 1.9)
      }
    } catch {}
  }

  // Una puerta vieja: el pestillo, las bisagras que chirrían y, al cerrarse, el golpe
  const door = (closing = false) => {
    const s = begin(closing ? 0.1 : 0.2) // pico ~0.17: de fondo, no tapa la radio (seguía sonando fuerte)
    if (!s) return
    duck(1700, 0.75)
    try {
      const { ctx, buf, out, t0 } = s
      // Pestillo: un clic seco
      const click = hiss(ctx, buf, "highpass", 2500, 0.7)
      env(click.g, closing ? t0 + 1.05 : t0, 0.6, 0.002, 0.01, 0.05)
      click.g.connect(out)
      click.src.start(t0)
      click.src.stop(t0 + 1.3)
      // Chirrido: una sierra grave que tiembla, pasada por un filtro angosto que se corre
      const cs = closing ? t0 : t0 + 0.06
      const creak = ctx.createOscillator()
      creak.type = "sawtooth"
      creak.frequency.setValueAtTime(closing ? 150 : 95, cs)
      creak.frequency.linearRampToValueAtTime(closing ? 100 : 145, cs + 0.95)
      const wob = ctx.createOscillator()
      wob.frequency.value = 11
      const wd = ctx.createGain()
      wd.gain.value = 18
      wob.connect(wd).connect(creak.frequency)
      const bp = ctx.createBiquadFilter()
      bp.type = "bandpass"
      bp.Q.value = 9
      bp.frequency.setValueAtTime(closing ? 1300 : 650, cs)
      bp.frequency.linearRampToValueAtTime(closing ? 700 : 1350, cs + 0.95)
      const cg = ctx.createGain()
      const end = env(cg, cs, closing ? 0.5 : 1.4, 0.08, 0.6, 0.3) // al abrir el chirrido es más grave: necesita más
      creak.connect(bp).connect(cg).connect(out)
      creak.start(cs)
      creak.stop(end)
      wob.start(cs)
      wob.stop(end)
      if (closing) {
        // El golpe de la puerta contra el marco
        const thud = ctx.createOscillator()
        thud.frequency.setValueAtTime(110, t0 + 1.05)
        thud.frequency.exponentialRampToValueAtTime(45, t0 + 1.3)
        const tg = ctx.createGain()
        env(tg, t0 + 1.05, 0.8, 0.005, 0, 0.3)
        thud.connect(tg).connect(out)
        thud.start(t0 + 1.05)
        thud.stop(t0 + 1.4)
      }
    } catch {}
  }

  const close = () => void ac?.close()

  return { unlock, scream, presence, door, close }
}
