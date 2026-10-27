"use client"

// El sampler de la sala del estudio: un aparato con la vibra de un MPC. 4 bancos de 16 pads, tres
// perillas para el pad elegido (afinación, largo, filtro), su fader de volumen, un secuenciador que
// graba lo que se toca (REC + PLAY) o se arma paso a paso (modo PASOS), y exportar la pieza en MP3.
// Los sonidos se cargan con el micrófono, subiendo un archivo o arrastrándolo a un pad.
//
// Teclado: 1 2 3 4 / Q W E R / A S D F / Z X C V son los pads (de arriba abajo), espacio toca o para,
// Esc cierra el panel.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react"
import { BANK_NAMES } from "./kits"
import { BANKS, getSampler, MAX_REC, PADS, recordMic, STEPS_PER_BAR, SWINGS, type MicTake, type Sampler as Engine } from "./engine"

// Cómo se ven los pads en la grilla: arriba el 13-16, abajo el 1-4 (como en el MPC)
const GRID = [12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3]
const KEYS = ["1", "2", "3", "4", "q", "w", "e", "r", "a", "s", "d", "f", "z", "x", "c", "v"]
const LETTER = ["A", "B", "C", "D"]
const BARS = [1, 2, 4]
const LOOPS = [1, 2, 4, 8]

type Mode = "pads" | "pasos"
type Dialog = null | "sample" | "export"

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const padLabel = (i: number) => `${LETTER[Math.floor(i / PADS)]}${String((i % PADS) + 1).padStart(2, "0")}`
// La marca, en letras de bloque
const BRAND = "▀█▀ █▀▀ ▄█ █▀\n █  ▄▄█  █ ██"
const BLOCKS = " ▁▂▃▄▅▆▇█"
const WAVE_COLS = 48
const waveCache = new WeakMap<AudioBuffer, string>()
// El pico de cada columna como un bloque más alto o más bajo; lo que LARGO recorta va aparte (apagado)
const waveText = (buf: AudioBuffer | null, decay: number) => {
  if (!buf) return { on: "▁".repeat(WAVE_COLS), off: "" }
  let txt = waveCache.get(buf)
  if (!txt) {
    const d = buf.getChannelData(0)
    const per = Math.max(1, Math.floor(d.length / WAVE_COLS))
    txt = ""
    for (let x = 0; x < WAVE_COLS; x++) {
      let m = 0
      for (let i = x * per; i < Math.min(d.length, (x + 1) * per); i += 8) m = Math.max(m, Math.abs(d[i]))
      txt += BLOCKS[Math.max(1, Math.round(Math.sqrt(m) * 8))]
    }
    waveCache.set(buf, txt)
  }
  const cut = Math.max(1, Math.round((0.04 + 0.96 * decay * decay) * WAVE_COLS))
  return { on: txt.slice(0, cut), off: txt.slice(cut) }
}
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`

// Para que React se entere de cada cambio del motor
const useEngine = (engine: Engine) => {
  const ver = useRef(0)
  const sub = useCallback(
    (fn: () => void) =>
      engine.subscribe(() => {
        ver.current++
        fn()
      }),
    [engine],
  )
  return useSyncExternalStore(
    sub,
    () => ver.current,
    () => 0,
  )
}

export default function Sampler({ onMinimize, onLeave }: { onMinimize: () => void; onLeave: () => void }) {
  const [engine] = useState(getSampler)
  useEngine(engine)

  const [sel, setSel] = useState(0) // pad elegido (0..63)
  const [bank, setBank] = useState(0)
  const [mode, setMode] = useState<Mode>("pads")
  const [viewBar, setViewBar] = useState(0) // en modo PASOS, qué compás se ve
  const [dialog, setDialog] = useState<Dialog>(null)
  const [msg, setMsg] = useState("")
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const say = useCallback((m: string, ms = 2200) => {
    setMsg(m)
    if (msgTimer.current) clearTimeout(msgTimer.current)
    msgTimer.current = setTimeout(() => setMsg(""), ms)
  }, [])
  useEffect(() => () => void (msgTimer.current && clearTimeout(msgTimer.current)), [])

  const pad = engine.pads[sel]
  const bar = Math.min(viewBar, engine.bars - 1)

  // --- Tocar ---
  const hitLocal = useCallback(
    (local: number) => {
      const i = bank * PADS + local
      engine.hit(i)
      setSel(i)
    },
    [engine, bank],
  )

  const stepTap = (local: number) => {
    const step = bar * STEPS_PER_BAR + local
    if (engine.toggleStep(sel, step) && !engine.playing) engine.hit(sel)
  }

  // --- Cuadro a cuadro: luces de los pads, la posición, el vúmetro ---
  const padEls = useRef<(HTMLButtonElement | null)[]>([])
  const posRef = useRef<HTMLSpanElement>(null)
  const vuRef = useRef<(HTMLSpanElement | null)[]>([])
  const live = useRef({ bank, mode, bar, sel })
  useEffect(() => {
    live.current = { bank, mode, bar, sel }
  })
  useEffect(() => {
    const flash = new Float64Array(PADS * BANKS).fill(-10)
    const wave = new Float32Array(engine.analyser.fftSize)
    let raf = 0
    let vu = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const now = engine.ac.currentTime
      const hits = engine.hits
      while (hits.length && hits[0].t <= now) {
        const h = hits.shift()!
        flash[h.pad] = h.t
      }
      const step = engine.currentStep()
      const { bank, mode, bar, sel } = live.current
      for (let k = 0; k < PADS; k++) {
        const el = padEls.current[k]
        if (!el) continue
        if (mode === "pads") {
          // En escalones de a cuarto, como un LED de pixel art
          const glow = Math.round(Math.exp(-(now - flash[bank * PADS + k]) * 7) * 4) / 4
          el.style.setProperty("--hit", String(glow))
          el.style.setProperty("--head", "0")
        } else {
          const s = bar * STEPS_PER_BAR + k
          el.style.setProperty("--head", step === s ? "1" : "0")
          el.style.setProperty("--hit", step === s && engine.seq[sel][s] ? "1" : "0")
        }
      }
      if (posRef.current) {
        posRef.current.textContent =
          step < 0
            ? "001.1.1"
            : `${String(Math.floor(step / 16) + 1).padStart(3, "0")}.${Math.floor((step % 16) / 4) + 1}.${(step % 4) + 1}`
      }
      engine.analyser.getFloatTimeDomainData(wave)
      let peak = 0
      for (let i = 0; i < wave.length; i++) peak = Math.max(peak, Math.abs(wave[i]))
      vu = Math.max(peak, vu * 0.9)
      const lit = Math.round(clamp01(vu / 0.9) * 5)
      vuRef.current.forEach((el, i) => el && (el.style.opacity = 4 - i < lit ? "1" : "0.18"))
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [engine])

  // --- La forma de onda del pad elegido, dibujada con caracteres de bloque ---
  const wave = waveText(pad.buf, pad.decay)

  // --- Teclado ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === "Escape") {
        if (dialog) setDialog(null)
        else onMinimize()
        return
      }
      if (dialog || e.repeat) return
      if (e.key === " ") {
        e.preventDefault()
        if (engine.playing) engine.stop()
        else engine.play()
        return
      }
      const k = KEYS.indexOf(e.key.toLowerCase())
      if (k < 0) return
      e.preventDefault()
      if (mode === "pads") hitLocal(GRID[k])
      else stepTap(GRID[k])
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  // --- Tap tempo ---
  const taps = useRef<number[]>([])
  const tap = () => {
    const now = performance.now()
    taps.current = [...taps.current.filter((t) => now - t < 2500), now].slice(-5)
    if (taps.current.length >= 2) {
      const gaps = taps.current.slice(1).map((t, i) => t - taps.current[i])
      const bpm = Math.round(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length))
      engine.set({ bpm })
    }
  }

  // BORRAR: el pad elegido; dos veces seguidas, todo el patrón
  const eraseArm = useRef(0)
  const erase = () => {
    if (performance.now() - eraseArm.current < 2000) {
      engine.clearAll()
      eraseArm.current = 0
      say("patrón borrado")
      return
    }
    engine.clearPad(sel)
    eraseArm.current = performance.now()
    say(`borrado ${padLabel(sel)} · otra vez: todo`)
  }

  // --- Cargar arrastrando un archivo sobre un pad ---
  const loadFile = async (i: number, file: File) => {
    try {
      say("cargando…", 10000)
      const buf = await engine.decode(await file.arrayBuffer())
      engine.assign(i, buf, file.name.replace(/\.[^.]+$/, "").toLowerCase())
      setSel(i)
      engine.hit(i)
      say(`${padLabel(i)} cargado`)
    } catch {
      say("ese archivo no se pudo leer")
    }
  }

  const screenLine = msg || (engine.recording ? "● grabando" : mode === "pasos" ? `pasos de ${pad.name}` : BANK_NAMES[bank])

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/75 px-2 pb-4 pt-12 backdrop-blur-[2px] sm:items-center sm:pt-4"
      role="dialog"
      aria-label="Sampler"
      onPointerUp={() => engine.resume()}
    >
      <div className="fixed left-2 right-2 top-2 z-10 flex justify-between gap-2 sm:left-4 sm:right-4 sm:top-4">
        <button type="button" onClick={onMinimize} className="ts-px-btn h-7 px-2 font-mono text-[10px] uppercase tracking-[0.15em]">
          ver la sala
        </button>
        <button type="button" onClick={onLeave} className="ts-px-btn ts-px-btn--primary h-7 px-2 font-mono text-[10px] uppercase tracking-[0.15em]">
          volver al pasillo
        </button>
      </div>

      {/* El aparato */}
      <div className="ts-mpc relative h-fit w-full max-w-[640px] select-none p-2.5 sm:p-4">
        {/* Franja negra de arriba: marca, volumen general, pantalla y vúmetro */}
        <div className="ts-mpc-box flex items-stretch gap-2.5 p-2.5 sm:gap-4 sm:p-3">
          <div className="hidden flex-col items-center justify-between sm:flex">
            <pre aria-label="TS-16" className="font-mono text-[8px] leading-[8px] text-[#ff3b3b]">{BRAND}</pre>
            <Knob label="volumen" value={engine.volume} onChange={(v) => engine.setVolume(v)} display={`${Math.round(engine.volume * 100)}`} size={46} defaultValue={0.8} />
          </div>

          {/* Pantalla */}
          <div className="ts-mpc-screen min-w-0 flex-1 px-2 py-1.5 font-mono text-[10px] leading-tight sm:text-[11px]">
            <div className="flex justify-between gap-2 text-[#9fe7ff]">
              <span className="truncate">
                <span className="mr-1 bg-[#9fe7ff] px-1 text-[#06121c]">{mode === "pasos" ? "PASOS" : "SEQ"}</span>
                {engine.bars} {engine.bars === 1 ? "compás" : "compases"}
              </span>
              <span>
                {engine.bpm} bpm · sw {SWINGS[engine.swing]}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span ref={posRef} className="text-[18px] font-bold tabular-nums tracking-wider text-white sm:text-[22px]">
                001.1.1
              </span>
              <span className="flex items-center gap-1.5 text-[9px] uppercase">
                {engine.metro && <span className="text-[#ffd84a]">metro</span>}
                {engine.recording ? <span className="ts-onair bg-[#ff3b3b] px-1 text-black">rec</span> : engine.playing ? <span className="text-[#5dff8f]">▶ play</span> : <span className="text-white/50">■ stop</span>}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-2 text-white">
              <span className="truncate">
                {padLabel(sel)} · {pad.name}
              </span>
              <span className="shrink-0 text-[#9fe7ff]">banco {LETTER[bank]}</span>
            </div>
            <p aria-hidden="true" className="mt-1 overflow-hidden whitespace-pre font-mono text-[11px] leading-none sm:text-[13px]">
              <span className="text-[#aee8ff]">{wave.on}</span>
              <span className="text-[#aee8ff]/30">{wave.off}</span>
            </p>
            <p className="truncate text-[9px] uppercase tracking-wider text-[#ffd84a] sm:text-[10px]">{screenLine}</p>
          </div>

          {/* Vúmetro */}
          <div className="flex flex-col justify-center gap-1" aria-hidden="true">
            {["#ff3b30", "#ff9f0a", "#ffd60a", "#5dff8f", "#5dff8f"].map((c, i) => (
              <span key={i} ref={(el) => void (vuRef.current[i] = el)} className="h-2 w-3.5 opacity-20 sm:h-2.5 sm:w-4" style={{ background: c }} />
            ))}
          </div>
        </div>

        {/* Perillas del pad elegido y su fader */}
        <div className="mt-2.5 flex items-end justify-between gap-1 px-1 sm:mt-3 sm:justify-center sm:gap-8">
          <div className="sm:hidden">
            <Knob label="volumen" value={engine.volume} onChange={(v) => engine.setVolume(v)} display={`${Math.round(engine.volume * 100)}`} size={40} defaultValue={0.8} />
          </div>
          <Knob
            label="afinar"
            value={(pad.tune + 12) / 24}
            onChange={(v) => engine.setPad(sel, { tune: Math.round(v * 24 - 12) })}
            display={`${pad.tune > 0 ? "+" : ""}${pad.tune} st`}
            defaultValue={0.5}
          />
          <Knob label="largo" value={pad.decay} onChange={(v) => engine.setPad(sel, { decay: v })} display={`${Math.round(pad.decay * 100)}%`} defaultValue={1} />
          <Knob
            label="filtro"
            value={pad.cutoff}
            onChange={(v) => engine.setPad(sel, { cutoff: v })}
            display={pad.cutoff > 0.995 ? "abierto" : `${Math.round(120 * Math.pow(20000 / 120, pad.cutoff))} hz`}
            defaultValue={1}
          />
          <Fader label="nivel" value={pad.gain} onChange={(v) => engine.setPad(sel, { gain: v })} />
        </div>

        {/* Cuerpo: botones a los costados (abajo en el celular) y los pads */}
        <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:mt-3 sm:grid-cols-[86px_1fr_86px] sm:gap-3">
          <div className="order-2 grid grid-cols-5 gap-1.5 sm:order-1 sm:grid-cols-1 sm:content-start sm:gap-2">
            <Btn on={mode === "pads"} onClick={() => setMode("pads")}>
              pads
            </Btn>
            <Btn on={mode === "pasos"} onClick={() => setMode("pasos")}>
              pasos
            </Btn>
            <Btn tone="orange" onClick={() => setDialog("sample")}>
              sample
            </Btn>
            <Btn
              onClick={() => {
                const b = (bank + 1) % BANKS
                setBank(b)
                setSel(b * PADS + (sel % PADS))
                say(`banco ${LETTER[b]} · ${BANK_NAMES[b]}`)
              }}
            >
              banco {LETTER[bank]}
            </Btn>
            <Btn onClick={erase}>borrar</Btn>
            <Btn onClick={() => say(engine.undo() ? "deshecho" : "nada que deshacer")}>deshacer</Btn>
            <Btn tone="blue" on={engine.metro} onClick={() => engine.set({ metro: !engine.metro })}>
              metro
            </Btn>
            <Btn tone="blue" onClick={tap}>
              tap
            </Btn>
            <Btn
              tone="blue"
              onClick={() => engine.set({ swing: (engine.swing + 1) % SWINGS.length })}
            >
              swing
            </Btn>
            <Btn
              tone="blue"
              onClick={() => {
                const bars = BARS[(BARS.indexOf(engine.bars) + 1) % BARS.length]
                engine.set({ bars })
                if (viewBar >= bars) setViewBar(0)
              }}
            >
              compás
            </Btn>
          </div>

          {/* Pads */}
          <div className="order-1 sm:order-2">
            {mode === "pasos" && engine.bars > 1 && (
              <div className="mb-1.5 flex gap-1.5">
                {Array.from({ length: engine.bars }, (_, b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setViewBar(b)}
                    className={`ts-mpc-btn h-6 flex-1 text-[10px] ${bar === b ? "ts-mpc-btn--on" : ""}`}
                  >
                    compás {b + 1}
                  </button>
                ))}
              </div>
            )}
            <div className="ts-mpc-box grid grid-cols-4 gap-2.5 p-2.5 sm:gap-3 sm:p-3">
              {GRID.map((local, k) => {
                const i = bank * PADS + local
                const p = engine.pads[i]
                const step = bar * STEPS_PER_BAR + local
                const stepOn = mode === "pasos" && engine.seq[sel][step] > 0
                return (
                  <button
                    key={local}
                    ref={(el) => void (padEls.current[local] = el)}
                    type="button"
                    aria-label={mode === "pads" ? `Pad ${local + 1}: ${p.name}` : `Paso ${local + 1}${stepOn ? " (prendido)" : ""}`}
                    className={`ts-mpc-pad ${mode === "pads" ? (p.buf ? "ts-mpc-pad--full" : "") : stepOn ? "ts-mpc-pad--step" : ""} ${mode === "pads" && i === sel ? "ts-mpc-pad--sel" : ""} ${mode === "pasos" && local % 4 === 0 ? "ts-mpc-pad--beat" : ""}`}
                    style={{ "--hit": 0, "--head": 0 } as CSSProperties}
                    onPointerDown={(e) => {
                      e.preventDefault()
                      if (mode === "pads") hitLocal(local)
                      else stepTap(local)
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return
                      e.preventDefault()
                      e.stopPropagation()
                      if (mode === "pads") hitLocal(local)
                      else stepTap(local)
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      const f = e.dataTransfer.files[0]
                      if (f) void loadFile(i, f)
                    }}
                  >
                    <span className="absolute left-1.5 top-1 font-mono text-[9px] text-white/55">{mode === "pads" ? local + 1 : step + 1}</span>
                    {mode === "pads" && <span className="absolute bottom-1 left-1.5 right-1 truncate text-left font-mono text-[9px] lowercase text-white/80 sm:text-[10px]">{p.name}</span>}
                    {mode === "pads" && engine.padUsed(i) && <span className="absolute right-1.5 top-1.5 h-1 w-1 bg-[#c8ff4a]" aria-hidden="true" />}
                    <span className="sr-only">{KEYS[k]}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Transporte */}
          <div className="order-3 grid grid-cols-5 gap-1.5 sm:grid-cols-2 sm:content-start sm:gap-2">
            <Btn onClick={() => engine.set({ bpm: engine.bpm - 1 })} label="Bajar el tempo">
              bpm −
            </Btn>
            <Btn onClick={() => engine.set({ bpm: engine.bpm + 1 })} label="Subir el tempo">
              bpm +
            </Btn>
            <Btn tone="red" on={engine.recording} onClick={() => engine.toggleRec()} className="sm:col-span-2">
              ● rec
            </Btn>
            <Btn tone="green" on={engine.playing} onClick={() => (engine.playing ? engine.stop() : engine.play())} className="sm:col-span-2">
              {engine.playing ? "■ stop" : "▶ play"}
            </Btn>
            <Btn tone="orange" onClick={() => setDialog("export")} className="sm:col-span-2">
              exportar
            </Btn>
          </div>
        </div>

        {/* El apoyamuñecas, con la marca */}
        <div className="ts-mpc-box mt-2.5 flex h-8 items-center justify-between gap-3 overflow-hidden px-3 font-mono sm:mt-3 sm:h-9">
          <span className="shrink-0 text-[9px] uppercase tracking-[0.2em] text-white/50">tropical sadness</span>
          <span aria-hidden="true" className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-[10px] text-white/15">
            {"░".repeat(80)}
          </span>
          <span className="shrink-0 text-[12px] font-bold uppercase tracking-[0.25em] text-[#d9d6cf] sm:text-[13px]">ts sample</span>
        </div>

        {dialog === "sample" && <SampleDialog engine={engine} pad={sel} onClose={() => setDialog(null)} onLoad={loadFile} say={say} />}
        {dialog === "export" && <ExportDialog engine={engine} onClose={() => setDialog(null)} />}
      </div>
    </div>
  )
}

// --- Piezas ---

function Btn({
  children,
  onClick,
  tone,
  on,
  className = "",
  label,
}: {
  children: ReactNode
  onClick: () => void
  tone?: "orange" | "blue" | "red" | "green"
  on?: boolean
  className?: string
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className={`ts-mpc-btn h-8 px-1 text-[9px] sm:h-8 sm:text-[10px] ${tone ? `ts-mpc-btn--${tone}` : ""} ${on ? "ts-mpc-btn--on" : ""} ${className}`}
    >
      {children}
    </button>
  )
}

// Perilla: se arrastra hacia arriba o abajo (o con la rueda, o con las flechas). Doble clic: valor original
function Knob({
  label,
  value,
  onChange,
  display,
  size = 44,
  defaultValue,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  display: string
  size?: number
  defaultValue: number
}) {
  const drag = useRef<{ y: number; v: number } | null>(null)
  const angle = -135 + value * 270
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        aria-valuetext={display}
        className="ts-mpc-knob relative touch-none outline-none"
        style={{ width: size, height: size }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { y: e.clientY, v: value }
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          onChange(clamp01(drag.current.v + (drag.current.y - e.clientY) / 160))
        }}
        onPointerUp={() => void (drag.current = null)}
        onPointerCancel={() => void (drag.current = null)}
        onDoubleClick={() => onChange(defaultValue)}
        onWheel={(e) => onChange(clamp01(value - e.deltaY * 0.0008))}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowRight") onChange(clamp01(value + 0.03))
          else if (e.key === "ArrowDown" || e.key === "ArrowLeft") onChange(clamp01(value - 0.03))
          else return
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        <span className="absolute inset-0 z-10" style={{ transform: `rotate(${Math.round(angle / 15) * 15}deg)` }}>
          <span className="absolute left-1/2 top-[9px] h-[6px] w-[6px] -translate-x-1/2 bg-[#0a0a0a]" />
        </span>
      </div>
      <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-white/50 sm:text-[9px]">{label}</span>
      <span className="font-mono text-[9px] tabular-nums text-white sm:text-[10px]">{display}</span>
    </div>
  )
}

// Fader vertical del nivel del pad
function Fader({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const drag = useRef<{ y: number; v: number } | null>(null)
  const H = 58
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        role="slider"
        tabIndex={0}
        aria-label={`${label} del pad`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        aria-orientation="vertical"
        className="relative w-8 touch-none outline-none focus-visible:outline-1 focus-visible:outline-[#ffd600]"
        style={{ height: H }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { y: e.clientY, v: value }
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          onChange(clamp01(drag.current.v + (drag.current.y - e.clientY) / (H - 14)))
        }}
        onPointerUp={() => void (drag.current = null)}
        onPointerCancel={() => void (drag.current = null)}
        onDoubleClick={() => onChange(0.6)}
        onWheel={(e) => onChange(clamp01(value - e.deltaY * 0.0008))}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") onChange(clamp01(value + 0.03))
          else if (e.key === "ArrowDown") onChange(clamp01(value - 0.03))
          else return
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        <span className="absolute left-1/2 top-0 h-full w-1.5 -translate-x-1/2 bg-[#2a2a2a]" />
        <span
          className="absolute left-1/2 h-3.5 w-7 -translate-x-1/2 bg-[#d9d6cf] shadow-[inset_-2px_-2px_0_#8f8c85,2px_2px_0_#000]"
          style={{ top: Math.round((1 - value) * (H - 14)) }}
        >
          <span className="absolute inset-x-1 top-1/2 h-0.5 -translate-y-1/2 bg-[#0a0a0a]" />
        </span>
      </div>
      <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-white/50 sm:text-[9px]">{label}</span>
      <span className="font-mono text-[9px] tabular-nums text-white sm:text-[10px]">{Math.round(value * 100)}</span>
    </div>
  )
}

function Sheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-3">
      <div className="ts-px-panel w-full max-w-sm p-4 font-mono text-white">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-[11px] uppercase tracking-[0.18em]">{title}</p>
          <button type="button" onClick={onClose} className="ts-px-btn h-6 px-2 text-[10px] uppercase tracking-[0.15em]">
            cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function SampleDialog({
  engine,
  pad,
  onClose,
  onLoad,
  say,
}: {
  engine: Engine
  pad: number
  onClose: () => void
  onLoad: (i: number, f: File) => Promise<void>
  say: (m: string, ms?: number) => void
}) {
  const p = engine.pads[pad]
  const fileRef = useRef<HTMLInputElement>(null)
  const take = useRef<MicTake | null>(null)
  const [rec, setRec] = useState<"idle" | "asking" | "rec" | "saving">("idle")
  const [secs, setSecs] = useState(0)
  const [err, setErr] = useState("")
  const meterRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (rec !== "rec") return
    const t0 = performance.now()
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      setSecs((performance.now() - t0) / 1000)
      if (meterRef.current && take.current) meterRef.current.style.width = `${Math.min(100, take.current.level() * 110)}%`
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [rec])

  // Si se cierra grabando, se corta el micrófono
  useEffect(() => () => take.current?.stop(), [])

  const finish = async (t: MicTake) => {
    setRec("saving")
    try {
      const blob = await t.done
      const buf = await engine.decode(await blob.arrayBuffer())
      engine.assign(pad, buf, engine.nextMicName(), MAX_REC)
      engine.hit(pad)
      say(`${padLabel(pad)} grabado`)
      onClose()
    } catch {
      setErr("no se pudo leer la grabación")
      setRec("idle")
    }
  }

  const startMic = async () => {
    setErr("")
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setErr("este navegador no deja grabar")
      return
    }
    engine.stop()
    setRec("asking")
    try {
      const t = await recordMic(() => void finish(t))
      take.current = t
      setSecs(0)
      setRec("rec")
    } catch {
      setErr("sin permiso para usar el micrófono")
      setRec("idle")
    }
  }

  const stopMic = () => {
    const t = take.current
    if (!t) return
    t.stop()
    void finish(t)
  }

  return (
    <Sheet title={`cargar en ${padLabel(pad)} · ${p.name}`} onClose={onClose}>
      {rec === "rec" ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-2">
              <span className="ts-onair h-2 w-2 bg-[#ff3b3b]" /> grabando
            </span>
            <span className="tabular-nums text-white/70">
              {secs.toFixed(1)} s / {MAX_REC} s
            </span>
          </div>
          <span className="block h-2 w-full bg-white/10">
            <span ref={meterRef} className="block h-full w-0 bg-[#5dff8f]" />
          </span>
          <button type="button" onClick={stopMic} className="ts-px-btn ts-px-btn--primary h-8 text-[11px] uppercase tracking-[0.15em]">
            ■ detener
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            disabled={rec !== "idle"}
            onClick={() => void startMic()}
            className="ts-px-btn ts-px-btn--primary h-8 text-[11px] uppercase tracking-[0.15em] disabled:opacity-60"
          >
            {rec === "asking" ? "pidiendo el micrófono…" : rec === "saving" ? "guardando…" : "● grabar con el micrófono"}
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className="ts-px-btn h-8 text-[11px] uppercase tracking-[0.15em]">
            subir un archivo de audio
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ""
              if (f) void onLoad(pad, f).then(onClose)
            }}
          />
          <div className="flex gap-2.5">
            {p.orig.buf && p.buf !== p.orig.buf && (
              <button type="button" onClick={() => (engine.restore(pad), onClose())} className="ts-px-btn h-7 flex-1 text-[10px] uppercase tracking-[0.12em]">
                volver al original
              </button>
            )}
            {p.buf && (
              <button type="button" onClick={() => (engine.empty(pad), onClose())} className="ts-px-btn h-7 flex-1 text-[10px] uppercase tracking-[0.12em]">
                vaciar pad
              </button>
            )}
          </div>
          <p className="text-[10px] leading-relaxed text-white/55">
            hasta {MAX_REC} s con el micrófono. también puedes arrastrar un archivo directo sobre un pad.
          </p>
          {err && <p className="text-[10px] text-[#ff6b6b]">{err}</p>}
        </div>
      )}
    </Sheet>
  )
}

function ExportDialog({ engine, onClose }: { engine: Engine; onClose: () => void }) {
  const [loops, setLoops] = useState(4)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const empty = engine.isEmpty()
  const secs = loops * engine.totalSteps * engine.stepDur

  const download = async () => {
    setBusy(true)
    setErr("")
    try {
      const blob = await engine.render(loops)
      const d = new Date()
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `tropical-sadness-${stamp}.mp3`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      onClose()
    } catch {
      setErr("no se pudo armar el mp3")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="exportar mp3" onClose={onClose}>
      {empty ? (
        <p className="text-[11px] leading-relaxed text-white/75">
          el patrón está vacío. graba lo que tocas con <span className="text-[#ff6b6b]">● rec</span> o arma pasos en el modo{" "}
          <span className="text-[#ffd600]">pasos</span>.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[10px] uppercase tracking-[0.15em] text-white/60">cuántas vueltas del patrón</p>
          <div className="grid grid-cols-4 gap-2">
            {LOOPS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setLoops(n)}
                aria-pressed={loops === n}
                className={`ts-px-btn h-7 text-[11px] ${loops === n ? "ts-px-btn--primary" : ""}`}
              >
                ×{n}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-white/55">
            {engine.bars} {engine.bars === 1 ? "compás" : "compases"} · {engine.bpm} bpm · dura {fmtTime(secs)}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void download()}
            className="ts-px-btn ts-px-btn--primary h-8 text-[11px] uppercase tracking-[0.15em] disabled:opacity-60"
          >
            {busy ? "armando el mp3…" : "descargar mp3"}
          </button>
          {err && <p className="text-[10px] text-[#ff6b6b]">{err}</p>}
        </div>
      )}
    </Sheet>
  )
}

