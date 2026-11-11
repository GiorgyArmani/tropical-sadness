"use client"

// El creador de avatares: a la izquierda (arriba en el celular) la figura en ASCII, girando; al lado,
// una pestaña por zona (los puntos de partida, el cuerpo, el pelo, la ropa, los extras) y la de la cuenta:
// así en el celular entra todo sin desplazarse. Lo armado se guarda en el dispositivo y en la cuenta, que
// se crea acá mismo con email y contraseña (sin cuenta no se guarda): con ella se recupera en otro
// dispositivo. Es lo que ven los demás en las salas.

import { useEffect, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react"
import dynamic from "next/dynamic"
import OsIcon, { type OsIconName } from "./OsIcon"
import PixelIcon from "./PixelIcon"
import { account, sendReset, setPassword, setPromo, signIn, signUp } from "./profile"
import { AUTH_EVENT, HAS_SUPABASE } from "./supabase"
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
const CUENTA = TABS.length - 1
// Lo que responde la cuenta (profile.ts), en palabras
const STATUS = {
  sending: "un momento…",
  confirm: "revisa tu correo y confirma tu cuenta. tu avatar ya quedó guardado.",
  exists: "ese email ya tiene cuenta: entra con tu contraseña.",
  wrong: "el email o la contraseña no coinciden.",
  unconfirmed: "falta confirmar tu email: abre el correo que te enviamos.",
  reset: "te enviamos un correo para cambiar tu contraseña: ábrelo y pon la nueva.",
  email: "escribe tu email primero.",
  weak: "esa contraseña es muy débil: usa una más larga.",
  saved: "contraseña guardada.",
  limit: "se enviaron muchos correos. prueba de nuevo en un rato.",
  error: "no se pudo. revisa los datos e intenta de nuevo.",
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

  // La cuenta: el avatar se guarda en ella, y con el email y la contraseña se recupera en otro dispositivo
  const [acct, setAcct] = useState<{ email: string; promo: boolean } | null>(null)
  const [entering, setEntering] = useState(false) // el formulario entra a una cuenta que ya existe, o crea una
  const [typed, setTyped] = useState("")
  const [pass, setPass] = useState("")
  const [fresh, setFresh] = useState("") // la contraseña nueva, ya con la cuenta abierta
  const [promo, setPromoBox] = useState(false)
  const [status, setStatus] = useState<keyof typeof STATUS | null>(null)
  const [sent, setSent] = useState(false) // cuenta creada: falta confirmarla desde el correo
  useEffect(() => {
    const load = () =>
      void account().then((a) => {
        setAcct(a)
        // Ya se entró: los avisos de "abre el correo" dejaron de valer
        if (a) setStatus((s) => (s === "confirm" || s === "unconfirmed" || s === "reset" ? null : s))
      })
    load()
    // Supabase pide no llamarlo desde adentro del aviso: se espera a que termine
    const onAuth = () => setTimeout(load, 0)
    window.addEventListener(AUTH_EVENT, onAuth)
    return () => window.removeEventListener(AUTH_EVENT, onAuth)
  }, [])
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (status === "sending") return
    setStatus("sending")
    if (entering) {
      const r = await signIn(typed.trim(), pass)
      // Ya adentro, el avatar de la cuenta baja solo (profile.ts): la ventana se cierra para verlo
      if (r === "in") onClose()
      else setStatus(r)
      return
    }
    const r = await signUp(typed.trim(), pass, promo)
    // Lo armado se guarda ya: cuando el correo confirme la cuenta, sube con ella
    if (r === "in" || r === "confirm") onSave(look)
    if (r === "in") return onClose()
    if (r === "confirm") setSent(true)
    setStatus(r)
  }
  const forgot = async () => {
    if (status === "sending") return
    if (!typed.trim()) return setStatus("email")
    setStatus("sending")
    setStatus(await sendReset(typed.trim()))
  }
  const changePass = async (e: FormEvent) => {
    e.preventDefault()
    if (status === "sending") return
    setStatus("sending")
    const r = await setPassword(fresh)
    if (r === "saved") setFresh("")
    setStatus(r)
  }
  // La casilla cambia al tocarla; si no se pudo guardar, vuelve a como estaba
  const togglePromo = async (on: boolean) => {
    setAcct((a) => a && { ...a, promo: on })
    if (!(await setPromo(on))) setAcct((a) => a && { ...a, promo: !on })
  }
  // Sin cuenta el avatar no se guarda: "listo" lleva a la pestaña donde se crea
  const done = async () => {
    if (HAS_SUPABASE && !sent && !(await account())) return setTab(CUENTA)
    onSave(look)
    onClose()
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
              className="ts-scroll flex h-48 min-h-0 flex-col gap-3 overflow-y-auto p-3 sm:h-auto sm:flex-1"
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

              {/* Arriba va la explicación, o lo que respondió la cuenta: así se ve sin desplazarse */}
              {current.name === "cuenta" &&
                (acct ? (
                  <div className="grid gap-2">
                    <p role="status" className="leading-tight">
                      {status
                        ? STATUS[status]
                        : `tu avatar está guardado en ${acct.email}. entra con tu email y tu contraseña en otro dispositivo y lo tendrás contigo.`}
                    </p>
                    <label className="flex items-center gap-2 leading-tight">
                      <input type="checkbox" checked={acct.promo} onChange={(e) => togglePromo(e.target.checked)} className="h-4 w-4 shrink-0 accent-[#8a2bb0]" />
                      recibir novedades por correo
                    </label>
                    <form onSubmit={changePass} className="flex gap-1">
                      <input
                        type="password"
                        required
                        minLength={8}
                        autoComplete="new-password"
                        value={fresh}
                        onChange={(e) => setFresh(e.target.value)}
                        placeholder="contraseña nueva"
                        aria-label="Contraseña nueva"
                        className="ts-field h-7 min-w-0 flex-1"
                      />
                      <button type="submit" disabled={status === "sending"} className="ts-px-btn h-7 px-3">
                        cambiar
                      </button>
                    </form>
                  </div>
                ) : (
                  <form onSubmit={submit} className="grid gap-2">
                    <p className="leading-tight">
                      <span role="status">
                        {status
                          ? STATUS[status]
                          : entering
                            ? "entra a tu cuenta y recupera tu avatar."
                            : "crea tu cuenta y guarda tu avatar, tus logros y los coleccionables que vienen."}
                      </span>{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setEntering(!entering)
                          setStatus(null)
                        }}
                        className="underline"
                      >
                        {entering ? "crear una cuenta" : "ya tengo cuenta"}
                      </button>
                    </p>
                    <input
                      type="email"
                      name="email"
                      required
                      autoComplete="email"
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                      placeholder="tu@email.com"
                      aria-label="Tu email"
                      className="ts-field h-7 min-w-0"
                    />
                    <div className="flex gap-1">
                      <input
                        type="password"
                        name="password"
                        required
                        minLength={entering ? undefined : 8}
                        autoComplete={entering ? "current-password" : "new-password"}
                        value={pass}
                        onChange={(e) => setPass(e.target.value)}
                        placeholder={entering ? "contraseña" : "contraseña (8 o más)"}
                        aria-label="Contraseña"
                        className="ts-field h-7 min-w-0 flex-1"
                      />
                      <button type="submit" disabled={status === "sending"} className="ts-px-btn h-7 px-3">
                        {entering ? "entrar" : "crear cuenta"}
                      </button>
                    </div>
                    {/* Aceptar los correos es aparte y opcional: la cuenta se crea igual sin marcarla */}
                    {!entering && (
                      <label className="flex items-start gap-2 leading-tight">
                        <input type="checkbox" checked={promo} onChange={(e) => setPromoBox(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#8a2bb0]" />
                        quiero recibir novedades por correo: lanzamientos, coleccionables y eventos.
                      </label>
                    )}
                    {entering && (
                      <button type="button" onClick={forgot} className="justify-self-start underline">
                        olvidé mi contraseña
                      </button>
                    )}
                  </form>
                ))}
            </div>

            <div className="flex shrink-0 justify-end gap-2 p-3 pt-1">
              <button type="button" onClick={onClose} className="ts-px-btn h-7 min-w-24 px-3">
                cancelar
              </button>
              <button type="button" onClick={done} className="ts-px-btn ts-px-btn--primary h-7 min-w-24 px-3">
                listo
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
