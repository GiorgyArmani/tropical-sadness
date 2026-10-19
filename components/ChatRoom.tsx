"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js"
import PixelIcon from "./PixelIcon"

// Chat a modo de foro: los mensajes quedan guardados en Supabase (tabla chat_messages, ver supabase/foro.sql)
// y quien entra ve lo último que se dijo. Cada dispositivo tiene una sesión anónima que no vence.
// Pensado para el plan gratis:
//   · los mensajes nuevos llegan en vivo por un canal privado que alimenta la base misma, al guardar
//   · no hay lista de "en línea" (Presence gasta mucha cuota de mensajes en vivo)
//   · solo se conecta con la ventana abierta, y se desconecta si la pestaña queda oculta un minuto
//   · el modo lento y los topes diarios los controla el servidor
const TOPIC = "foro"
const PAGE = 50 // mensajes por tanda al abrir y al pedir anteriores
const MAX_SHOWN = 500
const SLOW_MS = 5000
const HIDDEN_MS = 60 * 1000
const MAX_LEN = 200
export const NICK_LEN = 16
const COLORS = ["#ffd600", "#5cff8a", "#ff9a3c", "#7ad7ff", "#ff6fb5", "#c79bff"]
const FIELDS = "id,nick,body,created_at"

type Msg = { id: number; nick: string; text: string; at: number }
type Row = { id: number; nick: string; body: string; created_at: string }
type Status = "connecting" | "online" | "error"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

let client: SupabaseClient | null = null
// Supabase reusa el canal si ya existe uno con el mismo nombre, y cerrarlo es asíncrono: hay que esperar
// a que termine de irse antes de volver a entrar (pasa al cerrar y abrir rápido, y con StrictMode en dev)
let leaving: Promise<unknown> = Promise.resolve()
const getClient = () => {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    // La sesión anónima se guarda en el dispositivo y se renueva sola: dura mientras no se borren los datos
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "ts-foro-auth" },
    realtime: { params: { eventsPerSecond: 5 } },
  })
  return client
}

export const cleanNick = (s: string) => s.replace(/[^\p{L}\p{N}_.-]/gu, "").slice(0, NICK_LEN)

const cleanText = (s: string) =>
  s
    .replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LEN)

const toMsg = (r: Row): Msg => ({
  id: Number(r.id),
  nick: cleanNick(String(r.nick ?? "")),
  text: cleanText(String(r.body ?? "")),
  at: Date.parse(String(r.created_at)) || Date.now(),
})

// Junta mensajes sin repetir (el propio llega dos veces: al guardarlo y por el canal) y en orden
const merge = (prev: Msg[], add: Msg[]) => {
  const byId = new Map(prev.map((m) => [m.id, m]))
  for (const m of add) if (m.id && m.text && m.nick) byId.set(m.id, m)
  return [...byId.values()].sort((a, b) => a.id - b.id)
}

// Los errores que manda el servidor (supabase/foro.sql), en palabras
const reason = (message: string) => {
  if (message.includes("modo_lento")) return "modo lento: esperá unos segundos"
  if (message.includes("limite_diario")) return "llegaste al límite de mensajes de hoy"
  if (message.includes("foro_saturado")) return "el foro está saturado, probá en un rato"
  return "no se pudo enviar"
}

const colorOf = (nick: string) => {
  let h = 0
  for (const c of nick) h = (h * 31 + c.charCodeAt(0)) | 0
  return COLORS[Math.abs(h) % COLORS.length]
}

// Hora si es de hoy; si no, el día
const when = (at: number) => {
  const d = new Date(at)
  const today = new Date().toDateString() === d.toDateString()
  return today
    ? d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("es", { day: "2-digit", month: "2-digit" })
}

export default function ChatRoom({ nick }: { nick: string }) {
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(true)
  const [status, setStatus] = useState<Status>("connecting")
  const [attempt, setAttempt] = useState(0)
  const [messages, setMessages] = useState<Msg[]>([])
  const [hasOlder, setHasOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [text, setText] = useState("")
  const [notice, setNotice] = useState("")
  const [now, setNow] = useState(0)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const keepScroll = useRef<number | null>(null) // al cargar anteriores, no saltar al final

  // Pestaña oculta más de un minuto: se suelta la conexión (no gasta cuota) y al volver se retoma
  useEffect(() => {
    let timer = 0
    const onVis = () => {
      clearTimeout(timer)
      if (document.hidden) timer = window.setTimeout(() => setVisible(false), HIDDEN_MS)
      else setVisible(true)
    }
    document.addEventListener("visibilitychange", onVis)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [])

  // Conexión: sesión anónima, canal en vivo y los últimos mensajes guardados
  useEffect(() => {
    const supabase = getClient()
    if (!open || !nick || !visible || !supabase) return

    let stopped = false
    let channel: RealtimeChannel | null = null

    const start = async () => {
      setStatus("connecting")
      await leaving
      const { data: auth } = await supabase.auth.getSession()
      if (!auth.session) {
        const { error } = await supabase.auth.signInAnonymously()
        if (error) throw error
      }
      if (stopped) return
      await supabase.realtime.setAuth()

      // Primero el canal, después la historia: así no se pierde nada de lo que llegue en el medio
      channel = supabase
        .channel(TOPIC, { config: { private: true } })
        .on("broadcast", { event: "msg" }, ({ payload }) => {
          if (!payload || typeof payload !== "object") return
          setMessages((prev) => merge(prev, [toMsg(payload as Row)]).slice(-MAX_SHOWN))
        })
      channel.subscribe((s, err) => {
        if ((s === "CHANNEL_ERROR" || s === "TIMED_OUT") && !stopped) {
          console.warn("[chat]", s, err?.message ?? "")
          setStatus("error")
        }
      })

      const { data, error } = await supabase.from("chat_messages").select(FIELDS).order("id", { ascending: false }).limit(PAGE)
      if (error) throw error
      if (stopped) return
      const rows = (data ?? []) as Row[]
      setMessages((prev) => merge(prev, rows.map(toMsg)).slice(-MAX_SHOWN))
      setHasOlder((h) => h || rows.length === PAGE)
      setStatus("online")
    }

    start().catch((err: unknown) => {
      console.warn("[chat]", err instanceof Error ? err.message : err)
      if (!stopped) setStatus("error")
    })

    return () => {
      stopped = true
      if (channel) leaving = supabase.removeChannel(channel).catch(() => {})
    }
  }, [open, nick, visible, attempt])

  // Reloj del modo lento
  useEffect(() => {
    if (!open || cooldownUntil <= now) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [open, cooldownUntil, now])

  // Al llegar algo nuevo se baja al final; al cargar anteriores se queda donde estaba
  const lastId = messages.at(-1)?.id
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    if (keepScroll.current !== null) {
      list.scrollTop = list.scrollHeight - keepScroll.current
      keepScroll.current = null
    } else list.scrollTop = list.scrollHeight
  }, [lastId, messages.length, open])

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

  const loadOlder = async () => {
    const supabase = getClient()
    const oldest = messages[0]?.id
    if (!supabase || !oldest || loadingOlder) return
    setLoadingOlder(true)
    const { data, error } = await supabase.from("chat_messages").select(FIELDS).lt("id", oldest).order("id", { ascending: false }).limit(PAGE)
    setLoadingOlder(false)
    if (error) return
    const rows = (data ?? []) as Row[]
    if (listRef.current) keepScroll.current = listRef.current.scrollHeight - listRef.current.scrollTop
    // Al leer para atrás no se recorta: el tope de pantalla aplica solo a lo que llega en vivo
    setMessages((prev) => merge(prev, rows.map(toMsg)))
    setHasOlder(rows.length === PAGE)
  }

  const send = async (e: FormEvent) => {
    e.preventDefault()
    const supabase = getClient()
    const body = cleanText(text)
    if (!supabase || !body || status !== "online" || Date.now() < cooldownUntil) return
    const t = Date.now()
    setCooldownUntil(t + SLOW_MS)
    setNow(t)
    setText("")
    setNotice("")
    const { data, error } = await supabase.from("chat_messages").insert({ nick, body }).select(FIELDS).single()
    if (error) {
      setText(body) // no se pierde lo escrito
      setNotice(reason(error.message))
      return
    }
    setMessages((prev) => merge(prev, [toMsg(data as Row)]).slice(-MAX_SHOWN))
  }

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
      </button>

      {open && (
        <section
          id="ts-chat"
          aria-label="Chat"
          className="ts-px-panel fixed inset-x-3 bottom-[6rem] z-40 flex h-[min(50dvh,22rem)] flex-col font-mono text-[11px] text-white sm:left-auto sm:right-8 sm:bottom-[6.75rem] sm:w-80 lg:bottom-14"
        >
          <header className="flex items-center justify-between border-b border-dotted border-white/50 px-2.5 py-1.5">
            <p className="font-bold tracking-wide">
              <span className="text-[#5cff8a]">&gt;</span> chat
            </p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar chat" className="ts-px-btn h-5 w-5">
              <PixelIcon name="close" className="h-2 w-2" />
            </button>
          </header>

          {status === "error" ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-3 text-center">
              <p className="text-white/80">no se pudo conectar.</p>
              <button type="button" onClick={() => setAttempt((a) => a + 1)} className="ts-px-btn h-6 px-2 uppercase">
                reintentar
              </button>
            </div>
          ) : (
            <>
              <div ref={listRef} role="log" aria-live="polite" className="flex-1 space-y-1 overflow-y-auto px-2.5 py-2">
                {hasOlder && (
                  <button
                    type="button"
                    onClick={loadOlder}
                    disabled={loadingOlder}
                    className="mb-1 block w-full text-center text-[10px] uppercase tracking-[0.15em] text-white/45 hover:text-white/80 disabled:opacity-40"
                  >
                    {loadingOlder ? "cargando…" : "ver anteriores"}
                  </button>
                )}
                {status === "connecting" && messages.length === 0 && <p className="text-white/45">conectando…</p>}
                {status === "online" && messages.length === 0 && <p className="text-white/45">todavía nadie escribió. empezá vos…</p>}
                {messages.map((m) => (
                  <p key={m.id} className="break-words leading-snug">
                    <span className="float-right ml-2 text-[9px] tabular-nums text-white/30">{when(m.at)}</span>
                    <span className="font-bold" style={{ color: colorOf(m.nick) }}>
                      {m.nick}
                    </span>
                    <span className="text-white/40">: </span>
                    {m.text}
                  </p>
                ))}
              </div>
              {notice && <p className="border-t border-dotted border-white/30 px-2.5 py-1 text-[10px] text-[#ff9a3c]">{notice}</p>}
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
