"use client"

import { useRef, useState, type FormEvent } from "react"
import OsIcon, { type OsIconName } from "./OsIcon"

// La barra de dirección del navegador: dice dónde se está y se puede escribir a dónde ir
// (tropi://isla, tropi://3d/pasillo…). Enter o "ir" viajan; Escape deja la dirección como estaba.
export default function AddressBar({
  address,
  icon,
  onGo,
}: {
  address: string
  icon: OsIconName
  onGo: (typed: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  // Lo que se está escribiendo, y sobre qué dirección: si se viaja por otro lado (una puerta), se descarta
  const [draft, setDraft] = useState<{ at: string; text: string } | null>(null)
  const text = draft?.at === address ? draft.text : address

  const submit = (e: FormEvent) => {
    e.preventDefault()
    onGo(text)
    setDraft(null)
    inputRef.current?.blur() // el teclado vuelve a mover la escena
  }

  return (
    <form onSubmit={submit} className="flex min-w-0 flex-1 items-center gap-1">
      <span aria-hidden="true" className="hidden pl-1 sm:inline">
        dirección
      </span>
      <div className="ts-field flex h-7 min-w-0 flex-1 items-center gap-1.5">
        <OsIcon name={icon} />
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setDraft({ at: address, text: e.target.value })}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return
            setDraft(null)
            e.currentTarget.blur()
          }}
          aria-label="Dirección"
          inputMode="url"
          enterKeyHint="go"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent outline-none selection:bg-[#2a1670] selection:text-white"
        />
      </div>
      <button type="submit" className="ts-px-btn h-7 px-2">
        ir
      </button>
    </form>
  )
}
