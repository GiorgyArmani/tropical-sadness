// Los sonidos que vienen cargados en el sampler. No hay archivos: cada uno se sintetiza una vez al
// abrir la sala (OfflineAudioContext), así no pesa nada la descarga y no hay licencias de por medio.
//
// Banco A: una batería tipo 909. Banco B: aves y texturas del trópico. Banco C: teclados (un piano
// eléctrico, acordes tristes, un colchón y bajos). El banco D viene vacío: es para tus sonidos.

export type Preset = { name: string; dur: number; make: (c: OfflineAudioContext, out: AudioNode, noise: AudioBuffer) => void; choke?: number }

// --- Ayudas ---

const ramp = (p: AudioParam, t0: number, peak: number, attack: number, decay: number) => {
  p.setValueAtTime(0.0001, t0)
  p.exponentialRampToValueAtTime(peak, t0 + Math.max(attack, 0.001))
  p.exponentialRampToValueAtTime(0.0001, t0 + attack + decay)
}

const osc = (c: BaseAudioContext, type: OscillatorType, f: number) => {
  const o = c.createOscillator()
  o.type = type
  o.frequency.value = f
  return o
}

const gain = (c: BaseAudioContext, v = 1) => {
  const g = c.createGain()
  g.gain.value = v
  return g
}

const filter = (c: BaseAudioContext, type: BiquadFilterType, f: number, q = 0.7) => {
  const b = c.createBiquadFilter()
  b.type = type
  b.frequency.value = f
  b.Q.value = q
  return b
}

const noiseSrc = (c: BaseAudioContext, buf: AudioBuffer, offset = 0) => {
  const s = c.createBufferSource()
  s.buffer = buf
  s.loop = true
  s.loopStart = 0
  s.loopEnd = buf.duration
  s.start(0, offset % buf.duration)
  return s
}

// Golpe con caída de tono (bombos y toms)
const drum = (c: OfflineAudioContext, out: AudioNode, f0: number, f1: number, bend: number, decay: number, level = 1) => {
  const o = osc(c, "sine", f0)
  o.frequency.setValueAtTime(f0, 0)
  o.frequency.exponentialRampToValueAtTime(f1, bend)
  const g = gain(c, 0)
  ramp(g.gain, 0, level, 0.002, decay)
  o.connect(g).connect(out)
  o.start(0)
  o.stop(decay + 0.05)
}

// Ruido con envolvente por un filtro
const burst = (c: OfflineAudioContext, out: AudioNode, noise: AudioBuffer, type: BiquadFilterType, f: number, q: number, level: number, attack: number, decay: number, at = 0) => {
  const s = noiseSrc(c, noise, at * 7.3)
  const fl = filter(c, type, f, q)
  const g = gain(c, 0)
  ramp(g.gain, at, level, attack, decay)
  s.connect(fl).connect(g).connect(out)
}

// Platillos: seis cuadradas en relaciones metálicas (como las de las cajas de ritmo) por un pasaaltos
const metal = (c: OfflineAudioContext, out: AudioNode, base: number, hp: number, level: number, decay: number) => {
  const mix = gain(c, 0.16)
  ;[1, 1.4471, 1.6170, 1.9265, 2.5028, 2.6637].forEach((r) => {
    const o = osc(c, "square", base * r)
    o.connect(mix)
    o.start(0)
    o.stop(decay + 0.05)
  })
  const bp = filter(c, "bandpass", 10000, 0.8)
  const h = filter(c, "highpass", hp, 0.7)
  const g = gain(c, 0)
  ramp(g.gain, 0, level, 0.001, decay)
  mix.connect(bp).connect(h).connect(g).connect(out)
}

// Piano eléctrico: una FM simple (portadora y moduladora 1:1, el índice se apaga rápido) más un
// "tine" agudo al ataque. Es el sonido de los Rhodes de los discos de bolero viejos
const epiano = (c: OfflineAudioContext, out: AudioNode, f: number, at: number, len: number, level: number) => {
  const car = osc(c, "sine", f)
  const mod = osc(c, "sine", f)
  const idx = gain(c, 0)
  idx.gain.setValueAtTime(f * 2.2, at)
  idx.gain.exponentialRampToValueAtTime(f * 0.15, at + 0.6)
  mod.connect(idx).connect(car.frequency)
  const tine = osc(c, "sine", f * 14)
  const tg = gain(c, 0)
  ramp(tg.gain, at, level * 0.05, 0.001, 0.12)
  const g = gain(c, 0)
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(level, at + 0.004)
  g.gain.exponentialRampToValueAtTime(level * 0.35, at + 0.5)
  g.gain.exponentialRampToValueAtTime(0.0001, at + len)
  // Trémolo suave, como el de los amplificadores
  const lfo = osc(c, "sine", 4.2)
  const lg = gain(c, level * 0.08)
  lfo.connect(lg).connect(g.gain)
  car.connect(g).connect(out)
  tine.connect(tg).connect(out)
  ;[car, mod, tine, lfo].forEach((o) => {
    o.start(at)
    o.stop(at + len + 0.05)
  })
}

// Un pájaro: un tono que salta de frecuencia según una curva (puntos [segundos, Hz]) con su volumen
const chirp = (c: OfflineAudioContext, out: AudioNode, at: number, pts: [number, number][], level: number, type: OscillatorType = "sine") => {
  const o = osc(c, type, pts[0][1])
  o.frequency.setValueAtTime(pts[0][1], at)
  pts.slice(1).forEach(([t, f]) => o.frequency.exponentialRampToValueAtTime(f, at + t))
  const end = pts[pts.length - 1][0]
  const g = gain(c, 0)
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(level, at + Math.min(0.01, end / 4))
  g.gain.setValueAtTime(level, at + end * 0.7)
  g.gain.exponentialRampToValueAtTime(0.0001, at + end)
  o.connect(g).connect(out)
  o.start(at)
  o.stop(at + end + 0.02)
}

const NOTE = (n: number) => 440 * 2 ** ((n - 69) / 12) // MIDI a Hz

// Un acorde con el piano eléctrico, con las notas apenas corridas (como tocado a mano)
const chord = (notes: number[], len: number): Preset["make"] => (c, out) =>
  notes.forEach((n, i) => epiano(c, out, NOTE(n), i * 0.012, len, 0.32 / Math.sqrt(notes.length) * 1.6))

// Colchón: sierras desafinadas por un pasabajos que se abre despacio
const pad = (notes: number[], len: number): Preset["make"] => (c, out) => {
  const lp = filter(c, "lowpass", 400, 1.2)
  lp.frequency.setValueAtTime(350, 0)
  lp.frequency.linearRampToValueAtTime(1800, len * 0.5)
  lp.frequency.linearRampToValueAtTime(700, len)
  const g = gain(c, 0)
  g.gain.setValueAtTime(0.0001, 0)
  g.gain.exponentialRampToValueAtTime(0.5, 0.8)
  g.gain.setValueAtTime(0.5, len - 1.4)
  g.gain.exponentialRampToValueAtTime(0.0001, len)
  lp.connect(g).connect(out)
  notes.forEach((n) =>
    [-7, 7].forEach((cents) => {
      const o = osc(c, "sawtooth", NOTE(n))
      o.detune.value = cents
      const og = gain(c, 0.12 / notes.length)
      o.connect(og).connect(lp)
      o.start(0)
      o.stop(len)
    }),
  )
}

// Bajo: seno con un poco de triángulo y un golpe de filtro
const bass = (n: number): Preset["make"] => (c, out) => {
  const f = NOTE(n)
  const s = osc(c, "sine", f)
  const t = osc(c, "triangle", f * 2)
  const tg = gain(c, 0.18)
  const g = gain(c, 0)
  g.gain.setValueAtTime(0.0001, 0)
  g.gain.exponentialRampToValueAtTime(0.9, 0.008)
  g.gain.exponentialRampToValueAtTime(0.5, 0.25)
  g.gain.exponentialRampToValueAtTime(0.0001, 1.5)
  s.connect(g)
  t.connect(tg).connect(g)
  g.connect(out)
  ;[s, t].forEach((o) => {
    o.start(0)
    o.stop(1.55)
  })
}

// --- Banco A: batería tipo 909 ---

const KIT: Preset[] = [
  {
    name: "bombo",
    dur: 0.7,
    make: (c, out, nz) => {
      drum(c, out, 190, 48, 0.09, 0.55)
      burst(c, out, nz, "highpass", 2500, 0.7, 0.25, 0.001, 0.012)
    },
  },
  {
    name: "bombo largo",
    dur: 1.6,
    make: (c, out, nz) => {
      drum(c, out, 160, 42, 0.12, 1.4, 0.95)
      burst(c, out, nz, "highpass", 3000, 0.7, 0.15, 0.001, 0.01)
    },
  },
  {
    name: "caja",
    dur: 0.45,
    make: (c, out, nz) => {
      drum(c, out, 330, 180, 0.04, 0.14, 0.45)
      drum(c, out, 190, 160, 0.05, 0.12, 0.35)
      burst(c, out, nz, "highpass", 1400, 0.7, 0.55, 0.001, 0.26)
    },
  },
  {
    name: "aplauso",
    dur: 0.5,
    make: (c, out, nz) => {
      ;[0, 0.011, 0.022].forEach((at) => burst(c, out, nz, "bandpass", 1150, 1.2, 0.8, 0.001, 0.012, at))
      burst(c, out, nz, "bandpass", 1150, 1.0, 0.6, 0.001, 0.3, 0.033)
    },
  },
  {
    name: "aro",
    dur: 0.15,
    make: (c, out, nz) => {
      const o = osc(c, "triangle", 1700)
      const g = gain(c, 0)
      ramp(g.gain, 0, 0.5, 0.001, 0.03)
      o.connect(g).connect(out)
      o.start(0)
      o.stop(0.1)
      burst(c, out, nz, "bandpass", 3000, 1.5, 0.4, 0.001, 0.03)
    },
  },
  { name: "hat cerrado", dur: 0.12, choke: 1, make: (c, out) => metal(c, out, 320, 7000, 0.7, 0.07) },
  { name: "hat abierto", dur: 0.6, choke: 1, make: (c, out) => metal(c, out, 320, 6500, 0.55, 0.45) },
  {
    name: "tom grave",
    dur: 0.6,
    make: (c, out, nz) => {
      drum(c, out, 130, 80, 0.2, 0.5, 0.8)
      burst(c, out, nz, "lowpass", 1200, 0.7, 0.08, 0.001, 0.05)
    },
  },
  {
    name: "tom medio",
    dur: 0.5,
    make: (c, out, nz) => {
      drum(c, out, 190, 120, 0.18, 0.42, 0.8)
      burst(c, out, nz, "lowpass", 1500, 0.7, 0.08, 0.001, 0.05)
    },
  },
  {
    name: "tom agudo",
    dur: 0.42,
    make: (c, out, nz) => {
      drum(c, out, 270, 175, 0.15, 0.35, 0.8)
      burst(c, out, nz, "lowpass", 1800, 0.7, 0.08, 0.001, 0.05)
    },
  },
  {
    name: "crash",
    dur: 2,
    make: (c, out, nz) => {
      metal(c, out, 280, 5000, 0.45, 1.8)
      burst(c, out, nz, "highpass", 6000, 0.7, 0.3, 0.001, 1.5)
    },
  },
  {
    name: "ride",
    dur: 1.6,
    make: (c, out) => {
      metal(c, out, 410, 7500, 0.35, 1.4)
      const b = osc(c, "sine", 3100)
      const g = gain(c, 0)
      ramp(g.gain, 0, 0.12, 0.001, 0.9)
      b.connect(g).connect(out)
      b.start(0)
      b.stop(1)
    },
  },
  {
    name: "cencerro",
    dur: 0.4,
    make: (c, out) => {
      const bp = filter(c, "bandpass", 800, 2)
      const g = gain(c, 0)
      ramp(g.gain, 0, 0.6, 0.001, 0.3)
      ;[540, 800].forEach((f) => {
        const o = osc(c, "square", f)
        o.connect(bp)
        o.start(0)
        o.stop(0.35)
      })
      bp.connect(g).connect(out)
    },
  },
  {
    name: "maracas",
    dur: 0.15,
    make: (c, out, nz) => burst(c, out, nz, "highpass", 5000, 0.7, 0.5, 0.015, 0.06),
  },
  {
    name: "güiro",
    dur: 0.4,
    make: (c, out, nz) => {
      for (let i = 0; i < 9; i++) burst(c, out, nz, "bandpass", 3200, 2, 0.6, 0.002, 0.018, i * 0.028)
    },
  },
  {
    name: "sub 808",
    dur: 2.2,
    make: (c, out) => drum(c, out, 70, 46, 0.08, 2, 0.85),
  },
]

// --- Banco B: aves y texturas ---

const BIRDS: Preset[] = [
  {
    name: "pajarito",
    dur: 1.4,
    make: (c, out) => {
      ;[0, 0.16, 0.3, 0.42, 0.75, 0.86].forEach((at, i) =>
        chirp(c, out, at, [[0, 2600 + i * 120], [0.05, 4800], [0.08, 3600]], 0.35),
      )
    },
  },
  {
    name: "trino",
    dur: 1.6,
    make: (c, out) => {
      const o = osc(c, "sine", 3900)
      o.frequency.setValueAtTime(3600, 0)
      o.frequency.linearRampToValueAtTime(4300, 1.3)
      const am = osc(c, "sine", 28)
      const amg = gain(c, 0.5)
      const g = gain(c, 0.5)
      am.connect(amg).connect(g.gain)
      const env = gain(c, 0)
      env.gain.setValueAtTime(0.0001, 0)
      env.gain.exponentialRampToValueAtTime(0.5, 0.08)
      env.gain.setValueAtTime(0.5, 1.1)
      env.gain.exponentialRampToValueAtTime(0.0001, 1.5)
      o.connect(g).connect(env).connect(out)
      ;[o, am].forEach((x) => {
        x.start(0)
        x.stop(1.55)
      })
    },
  },
  {
    name: "silbido",
    dur: 1.6,
    make: (c, out) => {
      chirp(c, out, 0, [[0, 2200], [0.25, 3200], [0.5, 3100]], 0.4)
      chirp(c, out, 0.7, [[0, 3300], [0.6, 1900]], 0.4)
    },
  },
  {
    name: "paloma",
    dur: 2,
    make: (c, out) => {
      ;[[0, 0.35], [0.45, 0.25], [0.8, 0.6]].forEach(([at, len]) => {
        const o = osc(c, "sine", 420)
        o.frequency.setValueAtTime(380, at)
        o.frequency.linearRampToValueAtTime(470, at + len * 0.4)
        o.frequency.linearRampToValueAtTime(400, at + len)
        const g = gain(c, 0)
        g.gain.setValueAtTime(0.0001, at)
        g.gain.exponentialRampToValueAtTime(0.5, at + len * 0.3)
        g.gain.exponentialRampToValueAtTime(0.0001, at + len)
        const lp = filter(c, "lowpass", 900, 0.7)
        o.connect(lp).connect(g).connect(out)
        o.start(at)
        o.stop(at + len + 0.02)
      })
    },
  },
  {
    name: "grillos",
    dur: 3,
    make: (c, out) => {
      const o = osc(c, "sine", 4600)
      const pulse = osc(c, "square", 32)
      const pg = gain(c, 0.5)
      const g = gain(c, 0.5)
      pulse.connect(pg).connect(g.gain)
      // Cantan en rachas
      const env = gain(c, 0)
      for (let i = 0; i < 6; i++) {
        const at = i * 0.48
        env.gain.setValueAtTime(0.0001, at)
        env.gain.exponentialRampToValueAtTime(0.22, at + 0.03)
        env.gain.setValueAtTime(0.22, at + 0.25)
        env.gain.exponentialRampToValueAtTime(0.0001, at + 0.3)
      }
      o.connect(g).connect(env).connect(out)
      ;[o, pulse].forEach((x) => {
        x.start(0)
        x.stop(3)
      })
    },
  },
  {
    name: "rana",
    dur: 1.2,
    make: (c, out) => {
      ;[0, 0.5].forEach((at) => {
        const o = osc(c, "sawtooth", 140)
        o.frequency.setValueAtTime(130, at)
        o.frequency.linearRampToValueAtTime(165, at + 0.25)
        const am = osc(c, "square", 45)
        const amg = gain(c, 0.5)
        const g = gain(c, 0.5)
        am.connect(amg).connect(g.gain)
        const bp = filter(c, "bandpass", 700, 3)
        const env = gain(c, 0)
        ramp(env.gain, at, 0.9, 0.02, 0.3)
        o.connect(bp).connect(g).connect(env).connect(out)
        ;[o, am].forEach((x) => {
          x.start(at)
          x.stop(at + 0.35)
        })
      })
    },
  },
  {
    name: "guacamayo",
    dur: 0.9,
    make: (c, out) => {
      const car = osc(c, "sawtooth", 1100)
      car.frequency.setValueAtTime(900, 0)
      car.frequency.linearRampToValueAtTime(1400, 0.12)
      car.frequency.linearRampToValueAtTime(800, 0.55)
      const mod = osc(c, "sine", 210)
      const mg = gain(c, 500)
      mod.connect(mg).connect(car.frequency)
      const bp = filter(c, "bandpass", 2200, 1.5)
      const env = gain(c, 0)
      ramp(env.gain, 0, 0.45, 0.02, 0.6)
      car.connect(bp).connect(env).connect(out)
      ;[car, mod].forEach((x) => {
        x.start(0)
        x.stop(0.7)
      })
    },
  },
  {
    name: "lluvia",
    dur: 4,
    make: (c, out, nz) => {
      const s = noiseSrc(c, nz)
      const lp = filter(c, "lowpass", 5000, 0.5)
      const hp = filter(c, "highpass", 400, 0.5)
      const g = gain(c, 0)
      g.gain.setValueAtTime(0.0001, 0)
      g.gain.exponentialRampToValueAtTime(0.35, 0.6)
      g.gain.setValueAtTime(0.35, 3.3)
      g.gain.exponentialRampToValueAtTime(0.0001, 4)
      s.connect(hp).connect(lp).connect(g).connect(out)
      // Gotas sueltas encima
      for (let i = 0; i < 40; i++) {
        const at = 0.2 + ((i * 0.6180339) % 1) * 3.4
        burst(c, out, nz, "bandpass", 2500 + ((i * 7919) % 2500), 4, 0.35, 0.001, 0.02, at)
      }
    },
  },
  {
    name: "viento",
    dur: 5,
    make: (c, out, nz) => {
      const s = noiseSrc(c, nz)
      const bp = filter(c, "bandpass", 500, 2.5)
      bp.frequency.setValueAtTime(350, 0)
      bp.frequency.linearRampToValueAtTime(900, 1.8)
      bp.frequency.linearRampToValueAtTime(420, 3.2)
      bp.frequency.linearRampToValueAtTime(700, 5)
      const g = gain(c, 0)
      g.gain.setValueAtTime(0.0001, 0)
      g.gain.exponentialRampToValueAtTime(0.8, 1.6)
      g.gain.linearRampToValueAtTime(0.45, 3)
      g.gain.exponentialRampToValueAtTime(0.0001, 5)
      s.connect(bp).connect(g).connect(out)
    },
  },
  {
    name: "olas",
    dur: 6,
    make: (c, out, nz) => {
      const s = noiseSrc(c, nz)
      const lp = filter(c, "lowpass", 600, 0.5)
      lp.frequency.setValueAtTime(400, 0)
      lp.frequency.linearRampToValueAtTime(2400, 1.6)
      lp.frequency.linearRampToValueAtTime(500, 5.5)
      const g = gain(c, 0)
      g.gain.setValueAtTime(0.0001, 0)
      g.gain.exponentialRampToValueAtTime(0.6, 1.5)
      g.gain.exponentialRampToValueAtTime(0.0001, 6)
      s.connect(lp).connect(g).connect(out)
    },
  },
  {
    name: "vinilo",
    dur: 4,
    make: (c, out, nz) => {
      // Soplido de fondo y chasquidos
      burst(c, out, nz, "bandpass", 3000, 0.4, 0.05, 0.3, 3.6)
      for (let i = 0; i < 60; i++) {
        const at = ((i * 0.7548776) % 1) * 3.8
        burst(c, out, nz, "highpass", 2000, 0.7, i % 7 === 0 ? 0.5 : 0.18, 0.0005, 0.004, at)
      }
    },
  },
  {
    name: "trueno",
    dur: 5,
    make: (c, out, nz) => {
      const s = noiseSrc(c, nz)
      const lp = filter(c, "lowpass", 200, 0.7)
      const g = gain(c, 0)
      g.gain.setValueAtTime(0.0001, 0)
      g.gain.exponentialRampToValueAtTime(1, 0.08)
      g.gain.exponentialRampToValueAtTime(0.4, 0.6)
      g.gain.linearRampToValueAtTime(0.6, 1.2)
      g.gain.exponentialRampToValueAtTime(0.0001, 5)
      s.connect(lp).connect(g).connect(out)
      burst(c, out, nz, "bandpass", 1200, 0.8, 0.3, 0.001, 0.3)
    },
  },
  {
    name: "gota",
    dur: 0.4,
    make: (c, out) => chirp(c, out, 0, [[0, 700], [0.04, 1700], [0.12, 1500]], 0.5),
  },
  {
    name: "campanita",
    dur: 3,
    make: (c, out) => {
      ;[1, 2.76, 5.4].forEach((r, i) => {
        const o = osc(c, "sine", 1320 * r)
        const g = gain(c, 0)
        ramp(g.gain, 0, 0.3 / (i + 1), 0.001, 2.6 / (i + 1))
        o.connect(g).connect(out)
        o.start(0)
        o.stop(2.8)
      })
    },
  },
  { name: "bruma", dur: 6, make: pad([45, 52, 60, 64, 71], 6) },
  {
    name: "selva",
    dur: 5,
    make: (c, out, nz) => {
      // Un rato de selva de noche: grillos, un pájaro lejos, hojas
      const lp = filter(c, "lowpass", 4000, 0.5)
      lp.connect(out)
      burst(c, lp, nz, "bandpass", 800, 0.5, 0.08, 1, 3.5)
      for (let i = 0; i < 8; i++) chirp(c, lp, 0.3 + i * 0.55, [[0, 4400], [0.03, 4700], [0.06, 4400]], 0.06)
      chirp(c, lp, 1.2, [[0, 2600], [0.2, 3300], [0.35, 2400]], 0.12)
      chirp(c, lp, 3.1, [[0, 2900], [0.2, 2100]], 0.12)
    },
  },
]

// --- Banco C: teclados (la menor, triste y tropical) ---

const KEYS: Preset[] = [
  ...[57, 60, 62, 64, 67, 69, 72, 76].map(
    (n, i): Preset => ({
      name: `piano ${["la", "do", "re", "mi", "sol", "la", "do", "mi"][i]}`,
      dur: 2.5,
      make: (c, out) => epiano(c, out, NOTE(n), 0, 2.4, 0.5),
    }),
  ),
  { name: "lam9", dur: 3, make: chord([45, 57, 60, 64, 71], 2.9) },
  { name: "fa maj7", dur: 3, make: chord([41, 57, 60, 64, 69], 2.9) },
  { name: "rem9", dur: 3, make: chord([50, 57, 60, 64, 65], 2.9) },
  { name: "mi7", dur: 3, make: chord([40, 56, 62, 64, 67], 2.9) },
  { name: "colchón lam", dur: 5, make: pad([57, 60, 64, 67], 5) },
  { name: "colchón fa", dur: 5, make: pad([53, 57, 60, 64], 5) },
  { name: "bajo la", dur: 1.6, make: bass(33) },
  { name: "bajo mi", dur: 1.6, make: bass(40) },
]

export const BANK_NAMES = ["batería 909", "aves y texturas", "teclados", "tus sonidos"]
export const PRESETS: (Preset | null)[][] = [KIT, BIRDS, KEYS, Array(16).fill(null)]

// Renderiza un preset a un buffer (mono), normalizado a un pico de 0.9
export const renderPreset = async (p: Preset, sampleRate: number): Promise<AudioBuffer> => {
  const len = Math.ceil(p.dur * sampleRate)
  const c = new OfflineAudioContext(1, len, sampleRate)
  const noise = c.createBuffer(1, sampleRate * 2, sampleRate)
  const ch = noise.getChannelData(0)
  let seed = 1
  for (let i = 0; i < ch.length; i++) {
    seed = (seed * 16807) % 2147483647 // siempre el mismo ruido: los sonidos salen iguales cada vez
    ch[i] = (seed / 2147483647) * 2 - 1
  }
  const out = c.createGain()
  out.connect(c.destination)
  p.make(c, out, noise)
  const buf = await c.startRendering()
  return normalize(buf, 0.9)
}

// Sube o baja todo para que el pico quede en peak
export const normalize = (buf: AudioBuffer, peak: number) => {
  let max = 0
  for (let k = 0; k < buf.numberOfChannels; k++) {
    const d = buf.getChannelData(k)
    for (let i = 0; i < d.length; i++) max = Math.max(max, Math.abs(d[i]))
  }
  if (max > 0) {
    const s = peak / max
    for (let k = 0; k < buf.numberOfChannels; k++) {
      const d = buf.getChannelData(k)
      for (let i = 0; i < d.length; i++) d[i] *= s
    }
  }
  return buf
}
