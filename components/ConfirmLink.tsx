"use client"

// Quien llega desde un correo (confirmar la cuenta, o cambiar la contraseña) trae un código de un solo uso
// en la dirección. No se gasta al cargar la página: algunos programas de correo abren los enlaces por su
// cuenta para revisarlos y lo dejarían vencido. Se usa recién al tocar el botón de esta ventana, que va por
// encima de todo (también de la pantalla de encendido). Si el correo es el del cambio de contraseña
// (type=recovery), la ventana pide la nueva ahí mismo.

import { useRef, useState, type FormEvent } from "react"
import { useSearchParams } from "next/navigation"
import OsIcon from "./OsIcon"
import { confirmLink, setPassword } from "./profile"

const TEXT = {
  ask: "llegaste desde tu correo. confirma que eres tú y entras a tu cuenta en este dispositivo.",
  askReset: "escribe tu contraseña nueva: con ella entras a tu cuenta en cualquier dispositivo.",
  busy: "un momento…",
  ok: "listo: ya estás en tu cuenta.",
  okReset: "listo: contraseña cambiada. ya estás en tu cuenta.",
  bad: "este enlace ya se usó o venció. entra con tu email y tu contraseña, o pide otro enlace, en la pestaña «cuenta» de tu avatar.",
  weak: "esa contraseña es muy débil: usa una más larga.",
  error: "no se pudo guardar la contraseña. intenta de nuevo.",
}

export default function ConfirmLink() {
  const params = useSearchParams()
  // El código se lee una vez: después se saca de la dirección y la ventana sigue hasta que se cierra
  const [{ code, reset }] = useState(() => ({ code: params.get("token_hash"), reset: params.get("type") === "recovery" }))
  const [state, setState] = useState<"ask" | "busy" | "ok" | "bad" | "weak" | "error" | "closed">("ask")
  const [pass, setPass] = useState("")
  const inside = useRef(false) // el código ya se usó y se entró: si la contraseña no sirvió, solo falta guardarla
  if (!code || state === "closed") return null

  const confirm = async (e: FormEvent) => {
    e.preventDefault()
    setState("busy")
    if (!inside.current) {
      inside.current = await confirmLink(code, reset ? "recovery" : "email")
      // Ya no sirve: fuera de la dirección, así no queda en el historial ni se reintenta al recargar
      window.history.replaceState(null, "", window.location.pathname)
      if (!inside.current) return setState("bad")
    }
    if (!reset) return setState("ok")
    const r = await setPassword(pass)
    setState(r === "saved" ? "ok" : r === "weak" ? "weak" : "error")
  }
  const done = state === "ok" || state === "bad"
  const text = reset && state === "ask" ? TEXT.askReset : reset && state === "ok" ? TEXT.okReset : TEXT[state]

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="ts-confirm-title" className="ts-dither fixed inset-x-0 top-0 z-[80] flex h-dvh items-center justify-center p-2">
      <div className="ts-win ts-win--float ts-os w-full max-w-sm">
        <div className="ts-win-title ts-bold">
          <OsIcon name="avatar" />
          <h2 id="ts-confirm-title" className="min-w-0 flex-1 truncate">
            tu cuenta
          </h2>
        </div>
        <form onSubmit={confirm} className="grid gap-3 px-2 pb-2 pt-3">
          <p role="status" className="leading-tight">
            {text}
          </p>
          {reset && !done && (
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              autoFocus
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="contraseña nueva (8 o más)"
              aria-label="Contraseña nueva"
              className="ts-field h-7 min-w-0"
            />
          )}
          <div className="flex justify-end">
            {done ? (
              <button key="cerrar" type="button" autoFocus onClick={() => setState("closed")} className="ts-px-btn ts-px-btn--primary h-7 min-w-24 px-3">
                aceptar
              </button>
            ) : (
              <button key="usar" type="submit" autoFocus={!reset} disabled={state === "busy"} className="ts-px-btn ts-px-btn--primary h-7 min-w-24 px-3">
                {reset ? "guardar" : "confirmar"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
