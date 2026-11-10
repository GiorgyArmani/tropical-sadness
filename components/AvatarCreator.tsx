"use client"

// El creador de avatares: a la izquierda (arriba en el celular) la figura en ASCII, girando; al lado,
// una pestaña por zona (los puntos de partida, el cuerpo, el pelo, la ropa, los extras) y la de la cuenta:
// así en el celular entra todo sin desplazarse. Lo armado se guarda en el dispositivo y en la cuenta (con
// un email se recupera en otro dispositivo), y es lo que ven los demás en las salas.

import { useEffect, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react"
import dynamic from "next/dynamic"
import OsIcon, { type OsIconName } from "./OsIcon"
import PixelIcon from "./PixelIcon"
import { accountEmail, linkEmail } from "./profile"
import { LOOK_COLORS, LOOK_PARTS, LOOK_PRESETS, lookOf, presetLook, randomLook, type Look } from "./ascii3d/engine/avatars"

// El motor pesa y solo corre en el navegador: se baja recién al abrir el creador
const AvatarPreview = dynamic(() => import("./ascii3d/AvatarPreview"), { ssr: false })

const PART_LABELS: Record<keyof typeof LOOK_PARTS, string> = {
  body: "cuerpo",
  hair: "cabello",
  dress: "ropa",
  wings: "alas",
  crown: "cabeza",
  tail: "cola",
}
const COLOR_LABELS: Record<keyof typeof LOOK_COLORS, string> = {
  skin: "piel",
  cloth: "tela",
  hairColor: "pelo",
  glow: "brillo",
}
// El ícono de cada punto de partida (por su nombre en LOOK_PRESETS); el nombre queda como etiqueta del botón
const PRESET_ICONS: Record<string, OsIconName> = {
  ángel: "angel",
  demonio: "demon",
  espectro: "ghost",
  urbano: "street",
  caído: "fallen",
}
// Las pestañas: cada una junta las partes y los colores de una zona. "estilo" y "cuenta" traen lo suyo
const TABS: { name: string; parts?: (keyof typeof LOOK_PARTS)[]; colors?: (keyof typeof LOOK_COLORS)[] }[] = [
  { name: "estilo" },
  { name: "cuerpo", parts: ["body"], colors: ["skin"] },
  { name: "pelo", parts: ["hair"], colors: ["hairColor"] },
  { name: "ropa", parts: ["dress"], colors: ["cloth"] },
  { name: "extras", parts: ["wings", "crown", "tail"], colors: ["glow"] },
  { name: "cuenta" },
]
const EMAIL_STATUS = {
  sending: "enviando…",
  linked: "te enviamos un enlace: ábrelo para confirmar tu email.",
  login: "ese email ya tiene cuenta: te enviamos un enlace para entrar con ella en este dispositivo.",
  limit: "se enviaron muchos correos. prueba de nuevo en un rato.",
  error: "no se pudo enviar. revisa el email y prueba de nuevo.",
}
const css = (c: readonly number[]) => `rgb(${c.map((v) => Math.round(v * 255)).join(",")})`

export default function AvatarCreator({
  nick,
  initial,
  onSave,
  onClose,
}: {
  nick: string
  initial: Look | null
  onSave: (look: Look) => void
  onClose: () => void
}) {
  const [look, setLook] = useState<Look>(() => initial ?? lookOf(nick))
  const set = <K extends keyof Look>(k: K, v: number) => setLook((l) => ({ ...l, [k]: v }))
  const step = (k: keyof typeof LOOK_PARTS, d: number) => {
    const n = LOOK_PARTS[k].length
    set(k, (look[k] + d + n) % n)
  }

  const [tab, setTab] = useState(0)
  const current = TABS[tab]
  // Con las flechas se pasa de pestaña, como en cualquier ventana con pestañas
  const onTabKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0
    if (!d) return
    const next = (tab + d + TABS.length) % TABS.length
    setTab(next)
    ;(e.currentTarget.children[next] as HTMLElement).focus()
  }

  // La cuenta: con email, el avatar se recupera en otro dispositivo
  const [email, setEmail] = useState<string | null>(null)
  const [typed, setTyped] = useState("")
  const [mailStatus, setMailStatus] = useState<keyof typeof EMAIL_STATUS | null>(null)
  useEffect(() => {
    accountEmail().then(setEmail)
  }, [])
  const sendEmail = async (e: FormEvent) => {
    e.preventDefault()
    const v = typed.trim()
    if (!v || mailStatus === "sending") return
    setMailStatus("sending")
    setMailStatus(await linkEmail(v))
  }

  // Escape cierra sin guardar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ts-avatar-title"
      className="ts-dither fixed inset-x-0 top-0 z-50 flex h-dvh items-center justify-center p-2 sm:p-6"
    >
      <div className="ts-win ts-win--float ts-os flex max-h-full w-full max-w-3xl flex-col">
        <div className="ts-win-title ts-bold">
          <OsIcon name="avatar" />
          <h2 id="ts-avatar-title" className="min-w-0 flex-1 truncate">
            tu avatar
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar sin guardar" className="ts-win-ctl">
            <PixelIcon name="close" className="h-2 w-2" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-[3px] pt-[3px] sm:flex-row">
          <div className="ts-well shrink-0 bg-black sm:w-[46%]">
            <AvatarPreview look={look} className="h-[30dvh] w-full sm:h-full sm:min-h-[440px] sm:short:min-h-[65dvh]" />
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div role="tablist" aria-label="Partes del avatar" onKeyDown={onTabKey} className="flex shrink-0 gap-[2px]">
              {TABS.map((t, i) => (
                <button
                  key={t.name}
                  type="button"
                  role="tab"
                  id={`ts-avatar-tab-${i}`}
                  aria-selected={tab === i}
                  aria-controls="ts-avatar-panel"
                  tabIndex={tab === i ? 0 : -1}
                  onClick={() => setTab(i)}
                  className={`ts-px-btn h-7 min-w-0 flex-1 ${tab === i ? "ts-px-btn--on" : ""}`}
                >
                  {t.name}
                </button>
              ))}
            </div>

            {/* En el celular todas las pestañas miden lo mismo: la ventana no salta al pasar de una a otra */}
            <div
              role="tabpanel"
              id="ts-avatar-panel"
              aria-labelledby={`ts-avatar-tab-${tab}`}
              className="ts-scroll flex h-44 min-h-0 flex-col gap-3 overflow-y-auto p-3 sm:h-auto sm:flex-1"
            >
              {current.name === "estilo" && (
                <>
                  <p className="leading-tight">Elige tu estilo</p>
                  <div role="group" aria-labelledby="ts-avatar-presets" className="grid gap-2">
                    <p id="ts-avatar-presets">empezar como</p>
                    <div className="flex flex-wrap gap-2">
                      {LOOK_PRESETS.map((p) => (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => setLook((l) => presetLook(p, l.body))}
                          aria-label={p.name}
                          title={p.name}
                          className="ts-px-btn h-10 w-10"
                        >
                          <OsIcon name={PRESET_ICONS[p.name] ?? "avatar"} className="h-8 w-8" />
                        </button>
                      ))}
                      <button type="button" onClick={() => setLook(randomLook())} aria-label="azar" title="azar" className="ts-px-btn h-10 w-10">
                        <OsIcon name="dice" className="h-8 w-8" />
                      </button>
                    </div>
                  </div>
                </>
              )}

              {current.parts?.map((k) => (
                <div key={k} className="flex items-center justify-between gap-3">
                  <span>{PART_LABELS[k]}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => step(k, -1)} aria-label={`${PART_LABELS[k]}: anterior`} className="ts-px-btn h-7 w-7">
                      <PixelIcon name="left" className="h-2.5 w-2.5" />
                    </button>
                    <span aria-live="polite" className="ts-field flex h-7 w-28 items-center justify-center truncate">
                      {LOOK_PARTS[k][look[k]]}
                    </span>
                    <button type="button" onClick={() => step(k, 1)} aria-label={`${PART_LABELS[k]}: siguiente`} className="ts-px-btn h-7 w-7">
                      <PixelIcon name="right" className="h-2.5 w-2.5" />
                    </button>
                  </div>
                </div>
              ))}

              {current.colors?.map((k) => (
                <div key={k} role="group" aria-label={COLOR_LABELS[k]} className="flex items-center justify-between gap-3">
                  <span aria-hidden="true">{COLOR_LABELS[k]}</span>
                  <div className="flex flex-wrap justify-end gap-2">
                    {LOOK_COLORS[k].map((c, i) => (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => set(k, i)}
                        aria-label={`${COLOR_LABELS[k]} ${c.name}`}
                        aria-pressed={look[k] === i}
                        title={c.name}
                        style={{ background: css(c.rgb) }}
                        className={`h-6 w-6 outline-offset-2 ${look[k] === i ? "outline outline-2 outline-[var(--os-text)]" : "outline outline-1 outline-[var(--os-shadow)]"}`}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {current.name === "cuenta" &&
                (email ? (
                  <p className="leading-tight">guardado en {email}. entra con ese email en otro dispositivo y tendrás tu avatar.</p>
                ) : (
                  <form onSubmit={sendEmail} className="grid gap-2">
                    <p className="leading-tight">guarda tu avatar con tu email para usarlo en otro dispositivo.</p>
                    <div className="flex gap-1">
                      <input
                        type="email"
                        required
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        placeholder="tu@email.com"
                        aria-label="Tu email"
                        className="ts-field h-7 min-w-0 flex-1"
                      />
                      <button type="submit" disabled={mailStatus === "sending"} className="ts-px-btn h-7 px-3">
                        enviar
                      </button>
                    </div>
                    {mailStatus && (
                      <p role="status" className="leading-tight">
                        {EMAIL_STATUS[mailStatus]}
                      </p>
                    )}
                  </form>
                ))}
            </div>

            <div className="flex shrink-0 justify-end gap-2 p-3 pt-1">
              <button type="button" onClick={onClose} className="ts-px-btn h-7 min-w-24 px-3">
                cancelar
              </button>
              <button type="button" onClick={() => onSave(look)} className="ts-px-btn ts-px-btn--primary h-7 min-w-24 px-3">
                listo
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
