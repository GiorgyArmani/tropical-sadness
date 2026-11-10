"use client"

import { useState, type FormEvent } from "react"
import { NOW_PLAYING } from "./MusicBar"
import { NICK_LEN, cleanNick } from "./ChatRoom"
import OsIcon from "./OsIcon"

// Pantalla de entrada, como el inicio de sesión de Windows: eliges tu nombre para el chat y te
// conectas a la radio, que ya está sonando
export default function RadioGate({ onConnect }: { onConnect: (nick: string) => void }) {
  const [draft, setDraft] = useState("")

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const n = cleanNick(draft)
    if (n) onConnect(n)
  }

  return (
    <div className="ts-dither fixed inset-0 z-50 flex items-center justify-center px-4">
      <form onSubmit={submit} aria-label="Conectarse a la radio" className="ts-win ts-win--float ts-os w-full max-w-sm">
        <p className="ts-win-title ts-bold">
          <OsIcon name="key" />
          <span className="min-w-0 flex-1 truncate">entrar a tropi.OS</span>
        </p>

        <div className="flex gap-3 px-2 pb-2 pt-3">
          <OsIcon name="radio" className="mt-0.5 h-8 w-8" />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <p className="ts-lcd px-2 py-1.5 leading-tight" title={`${NOW_PLAYING.title} · ${NOW_PLAYING.artist}`}>
              <span className="flex items-center gap-2 text-white">
                <span className="ts-onair h-2 w-2 bg-[#ff3b3b]" aria-hidden="true" />
                al aire
              </span>
              <span className="mt-1 block truncate">{NOW_PLAYING.title}</span>
              <span className="block truncate">{NOW_PLAYING.artist}</span>
            </p>

            <label htmlFor="ts-gate-nick" className="leading-tight">
              elige un nombre para el chat
            </label>
            <input
              id="ts-gate-nick"
              value={draft}
              onChange={(e) => setDraft(cleanNick(e.target.value))}
              maxLength={NICK_LEN}
              autoComplete="off"
              autoFocus
              placeholder="nombre"
              className="ts-field -mt-1.5 w-full min-w-0"
            />

            <div className="flex justify-end">
              <button type="submit" disabled={!draft} className="ts-px-btn ts-px-btn--primary h-7 min-w-24 px-3">
                conectar
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
