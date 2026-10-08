"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js"
import PixelIcon from "./PixelIcon"

// Chat anónimo y efímero: nada se guarda en ningún lado.
// Los mensajes viajan en vivo por Supabase Realtime (Broadcast, sin base de datos). Cada persona cae
// sola en la primera sala con lugar (hasta 50, contadas con Presence) sin que se note, hay modo lento
// de 5 s, y cada mensaje se desvanece y desaparece a los 2 minutos.
const ROOM_SIZE = 50
const MAX_ROOMS = 20
const SLOW_MS = 5000
const MESSAGE_TTL = 2 * 60 * 1000
const FADE_LAST = 30 * 1000 // los últimos 30 s se va apagando
const MAX_MESSAGES = 30
const MAX_LEN = 200
const NICK_LEN = 16
const COLORS = ["#ffd600", "#5cff8a", "#ff9a3c", "#7ad7ff", "#ff6fb5", "#c79bff"]

type Msg = { id: string; nick: string; text: string; at: number }
type Status = "connecting" | "online" | "full" | "error"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

let client: SupabaseClient | null = null
// Supabase reusa el canal si ya existe uno con el mismo nombre, y cerrarlo es asíncrono: hay que esperar
// a que termine de irse antes de volver a entrar (pasa al cerrar y abrir rápido, y con StrictMode en dev)
let leaving: Promise<unknown> = Promise.resolve()
const getClient = () => {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 5 } },
  })
  return client
}

const cleanNick = (s: string) => s.replace(/[^\p{L}\p{N}_.-]/gu, "").slice(0, NICK_LEN)

const cleanText = (s: string) =>
  s
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LEN)

// crypto.randomUUID solo existe en HTTPS o localhost (no al probar desde el celular por la IP local)
const randomId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`

const colorOf = (nick: string) => {
  let h = 0
  for (const c of nick) h = (h * 31 + c.charCodeAt(0)) | 0
  return COLORS[Math.abs(h) % COLORS.length]
}

export default function ChatRoom() {
  const [open, setOpen] = useState(false)
  const [nick, setNick] = useState("")
  const [draftNick, setDraftNick] = useState("")
  const [status, setStatus] = useState<Status>("connecting")
  const [attempt, setAttempt] = useState(0)
  const [users, setUsers] = useState(0)
  const [messages, setMessages] = useState<Msg[]>([])
  const [text, setText] = useState("")
  const [now, setNow] = useState(0)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const meRef = useRef("")
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Conexión solo mientras la ventana está abierta y hay nombre
  useEffect(() => {
    const supabase = getClient()
    if (!open || !nick || !supabase) return

    const me = randomId()
    meRef.current = me
    let stopped = false
    let current: RealtimeChannel | null = null
    // Quién está en la sala (clave de Presence -> nombre) y cuándo habló cada uno por última vez
    let members = new Map<string, string>()
    const lastFrom = new Map<string, number>()

    // Prueba las salas en orden: la primera donde estemos entre los primeros ROOM_SIZE es la nuestra
    const tryRoom = (i: number) => {
      if (stopped) return
      if (i >= MAX_ROOMS) {
        setStatus("full")
        return
      }
      const joinedAt = Date.now()
      let placed = false
      const channel = supabase.channel(`tropical-chat-${i}`, {
        config: { broadcast: { self: true }, presence: { key: me } },
      })
      current = channel

      channel
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState<{ at: number; nick: string }>()
          if (!state[me]) return // todavía no llegó nuestro propio registro
          const entries = Object.entries(state).map(([key, metas]) => ({
            key,
            at: Number(metas[0]?.at) || 0,
            nick: cleanNick(String(metas[0]?.nick ?? "")),
          }))
          members = new Map(entries.map((e) => [e.key, e.nick]))
          if (!placed) {
            entries.sort((a, b) => a.at - b.at || a.key.localeCompare(b.key))
            if (entries.findIndex((e) => e.key === me) >= ROOM_SIZE) {
              leaving = supabase.removeChannel(channel).catch(() => {})
              tryRoom(i + 1)
              return
            }
            placed = true
            channelRef.current = channel
            setStatus("online")
          }
          setUsers(members.size)
        })
        .on("broadcast", { event: "msg" }, ({ payload }) => {
          if (!placed || !payload || typeof payload !== "object") return
          const { id, from, text: raw } = payload as Record<string, unknown>
          if (typeof id !== "string" || typeof from !== "string" || typeof raw !== "string") return
          // Solo de alguien presente en la sala, con su nombre de Presence, y respetando el modo lento
          const author = members.get(from)
          const body = cleanText(raw)
          const t = Date.now()
          if (!author || !body || t - (lastFrom.get(from) ?? 0) < SLOW_MS - 1000) return
          lastFrom.set(from, t)
          const m: Msg = { id: id.slice(0, 40), nick: author, text: body, at: t }
          setMessages((prev) => [...prev.filter((p) => p.id !== m.id), m].slice(-MAX_MESSAGES))
        })
        .subscribe(async (s, err) => {
          if (s === "SUBSCRIBED") await channel.track({ at: joinedAt, nick })
          else if ((s === "CHANNEL_ERROR" || s === "TIMED_OUT") && !stopped) {
            console.warn("[chat]", s, err?.message ?? "")
            setStatus("error")
          }
        })
    }

    setStatus("connecting")
    leaving.then(() => tryRoom(0))

    return () => {
      stopped = true
      channelRef.current = null
      if (current) leaving = supabase.removeChannel(current).catch(() => {})
      setMessages([])
      setUsers(0)
    }
  }, [open, nick, attempt])

  // Reloj para el modo lento y para desvanecer y borrar los mensajes viejos
  useEffect(() => {
    if (!open) return
    const tick = () => {
      const t = Date.now()
      setNow(t)
      setMessages((prev) => (prev.some((m) => t - m.at >= MESSAGE_TTL) ? prev.filter((m) => t - m.at < MESSAGE_TTL) : prev))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [open])

  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages.length])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  useEffect(() => {
    if (open && status === "online") inputRef.current?.focus()
  }, [open, status])

  if (!SUPABASE_URL || !SUPABASE_KEY) return null

  const join = (e: FormEvent) => {
    e.preventDefault()
    const n = cleanNick(draftNick)
    if (n) setNick(n)
  }

  const send = (e: FormEvent) => {
    e.preventDefault()
    const body = cleanText(text)
    const channel = channelRef.current
    if (!body || !channel || status !== "online" || Date.now() < cooldownUntil) return
    channel.send({ type: "broadcast", event: "msg", payload: { id: randomId(), from: meRef.current, text: body } })
    setCooldownUntil(Date.now() + SLOW_MS)
    setNow(Date.now())
    setText("")
  }

  const online = open && nick && status === "online"
  const wait = Math.max(0, Math.ceil((cooldownUntil - now) / 1000))

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="ts-chat"
        className="ts-px-btn fixed bottom-[3.9rem] right-3 z-40 h-6 gap-1.5 px-2 font-mono text-[10px] uppercase tracking-[0.15em] sm:bottom-[4.5rem] sm:right-8 lg:bottom-5"
      >
        <PixelIcon name="chat" className="h-2.5 w-2.5" />
        chat
        {online && users > 0 && <span className="tabular-nums text-[#5cff8a]">{users}</span>}
      </button>

      {open && (
        <section
          id="ts-chat"
          aria-label="Chat anónimo"
          className="ts-px-panel fixed inset-x-3 bottom-[6rem] z-40 flex h-[min(50dvh,22rem)] flex-col font-mono text-[11px] text-white sm:left-auto sm:right-8 sm:bottom-[6.75rem] sm:w-80 lg:bottom-14"
        >
          <header className="flex items-center justify-between border-b border-dotted border-white/50 px-2.5 py-1.5">
            <p className="font-bold tracking-wide">
              <span className="text-[#5cff8a]">&gt;</span> chat anónimo
            </p>
            <div className="flex items-center gap-2.5">
              {online && users > 0 && <span className="tabular-nums text-white/60">{users} en línea</span>}
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar chat" className="ts-px-btn h-5 w-5">
                <PixelIcon name="close" className="h-2 w-2" />
              </button>
            </div>
          </header>

          {!nick ? (
            <form onSubmit={join} className="flex flex-1 flex-col justify-center gap-3 px-3">
              <label htmlFor="ts-nick" className="text-white/80">
                elegí un nombre para entrar
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="ts-nick"
                  value={draftNick}
                  onChange={(e) => setDraftNick(cleanNick(e.target.value))}
                  maxLength={NICK_LEN}
                  autoComplete="off"
                  autoFocus
                  placeholder="nombre"
                  className="min-w-0 flex-1 border-b border-white/40 bg-transparent py-1 text-base text-white placeholder-white/30 outline-none focus:border-[#ffd600] sm:text-[11px]"
                />
                <button type="submit" disabled={!draftNick} className="ts-px-btn ts-px-btn--primary h-6 px-2 uppercase disabled:opacity-40">
                  entrar
                </button>
              </div>
              <p className="text-[10px] leading-relaxed text-white/45">nada se guarda · los mensajes se borran a los 2 min</p>
            </form>
          ) : status === "full" || status === "error" ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-3 text-center">
              <p className="text-white/80">{status === "full" ? "el chat está lleno. probá en un rato." : "no se pudo conectar."}</p>
              <button type="button" onClick={() => setAttempt((a) => a + 1)} className="ts-px-btn h-6 px-2 uppercase">
                reintentar
              </button>
            </div>
          ) : (
            <>
              <div ref={listRef} role="log" aria-live="polite" className="flex-1 space-y-1 overflow-y-auto px-2.5 py-2">
                {status === "connecting" && <p className="text-white/45">conectando…</p>}
                {status === "online" && messages.length === 0 && (
                  <p className="text-white/45">no hay mensajes aún…</p>
                )}
                {messages.map((m) => {
                  const left = MESSAGE_TTL - (now - m.at)
                  return (
                    <p
                      key={m.id}
                      className="break-words leading-snug transition-opacity duration-1000"
                      style={{ opacity: Math.max(0.15, Math.min(1, left / FADE_LAST)) }}
                    >
                      <span className="font-bold" style={{ color: colorOf(m.nick) }}>
                        {m.nick}
                      </span>
                      <span className="text-white/40">: </span>
                      {m.text}
                    </p>
                  )
                })}
              </div>
              <form onSubmit={send} className="flex items-center gap-2 border-t border-dotted border-white/50 px-2.5 py-1.5">
                <span className="text-[#5cff8a]" aria-hidden="true">
                  &gt;
                </span>
                <input
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={MAX_LEN}
                  autoComplete="off"
                  disabled={status !== "online"}
                  aria-label={`Mensaje como ${nick}`}
                  placeholder={wait ? `modo lento · ${wait}s` : `${nick}…`}
                  className="min-w-0 flex-1 bg-transparent py-1 text-base text-white placeholder-white/30 outline-none disabled:opacity-40 sm:text-[11px]"
                />
                <button
                  type="submit"
                  disabled={!text.trim() || status !== "online" || wait > 0}
                  aria-label={wait ? `Modo lento, esperá ${wait} segundos` : "Enviar"}
                  className="ts-px-btn ts-px-btn--primary h-6 min-w-6 px-1 tabular-nums disabled:opacity-40"
                >
                  {wait ? wait : <PixelIcon name="right" className="h-2.5 w-2.5" />}
                </button>
              </form>
            </>
          )}
        </section>
      )}
    </>
  )
}
