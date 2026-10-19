"use client"

import { useState, type FormEvent } from "react"
import { NOW_PLAYING } from "./MusicBar"
import { NICK_LEN, cleanNick } from "./ChatRoom"

// Pantalla de entrada: elegís tu nombre para el chat y te conectás a la radio, que ya está sonando
export default function RadioGate({ onConnect }: { onConnect: (nick: string) => void }) {
  const [draft, setDraft] = useState("")

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const n = cleanNick(draft)
    if (n) onConnect(n)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <form
        onSubmit={submit}
        aria-label="Conectarse a la radio"
        className="ts-px-panel flex w-full max-w-xs flex-col gap-4 px-4 py-5 font-mono text-[11px] text-white"
      >
        <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/70">
          <span className="ts-onair h-1.5 w-1.5 bg-[#ff3b3b]" aria-hidden="true" />
          al aire
        </p>
        <p className="-mt-2 truncate uppercase tracking-[0.12em]" title={`${NOW_PLAYING.title} · ${NOW_PLAYING.artist}`}>
          {NOW_PLAYING.title}
          <span className="block text-white/50">{NOW_PLAYING.artist}</span>
        </p>

        <label htmlFor="ts-gate-nick" className="text-white/80">
          elegí un nombre para el chat
        </label>
        <div className="-mt-2 flex items-center gap-2">
          <span className="text-[#5cff8a]" aria-hidden="true">
            &gt;
          </span>
          <input
            id="ts-gate-nick"
            value={draft}
            onChange={(e) => setDraft(cleanNick(e.target.value))}
            maxLength={NICK_LEN}
            autoComplete="off"
            autoFocus
            placeholder="nombre"
            className="min-w-0 flex-1 border-b border-white/40 bg-transparent py-1 text-base text-white placeholder-white/30 outline-none focus:border-[#ffd600] sm:text-[11px]"
          />
        </div>

        <button
          type="submit"
          disabled={!draft}
          className="ts-px-btn ts-px-btn--primary h-8 w-full text-[11px] uppercase tracking-[0.2em] disabled:opacity-40"
        >
          conectar
        </button>
        
      </form>
    </div>
  )
}
