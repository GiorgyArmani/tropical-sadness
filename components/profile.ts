"use client"

// El perfil en Supabase (tabla profiles, ver supabase/perfiles.sql): el nick y el avatar de cada quien.
// El dispositivo guarda una copia (useSavedNick, useSavedLook) y la cuenta manda: al entrar se baja lo
// guardado y al cambiar algo se sube. El chat sigue siendo anónimo; el avatar pide una cuenta con email
// y contraseña (se crea en el creador de avatares), y con ella se recupera en otro dispositivo sin
// esperar ningún correo.

import { cleanLook } from "./ascii3d/engine/avatars"
import { cleanNick } from "./ChatRoom"
import { AUTH_EVENT, getClient, maybeSession } from "./supabase"
import { readLook, saveLook } from "./useSavedLook"
import { readNick, saveNick } from "./useSavedNick"

// Sube el nick y el avatar de este dispositivo a la sesión que haya (sin sesión no hay a dónde subir)
export const pushProfile = async () => {
  const nick = readNick()
  if (!nick || !maybeSession()) return
  const sb = await getClient()
  if (!sb) return
  const { session } = (await sb.auth.getSession()).data
  if (!session) return
  const look = readLook()
  await sb.from("profiles").upsert({ user_id: session.user.id, nick, ...(look ? { look } : {}) })
}

// Aviso: la cuenta ya confirmó su email y todavía no recibió el correo de bienvenida (lo atiende WelcomeMail)
export const WELCOME_EVENT = "ts-bienvenida"

// Baja el perfil de la cuenta a este dispositivo. Si la cuenta todavía no tiene, sube lo de acá
const pullProfile = async () => {
  const sb = await getClient()
  const session = sb ? (await sb.auth.getSession()).data.session : null
  if (!sb || !session) return
  const { data: row, error } = await sb.from("profiles").select("nick,look").maybeSingle()
  if (error) return
  if (!row) await pushProfile()
  else {
    const nick = cleanNick(String(row.nick ?? ""))
    if (nick && nick !== readNick()) saveNick(nick)
    const look = cleanLook(row.look)
    if (look && JSON.stringify(look) !== JSON.stringify(readLook())) saveLook(look)
    // La cuenta todavía no tiene avatar (se confirmó en otro navegador): sube el de acá
    else if (!look && readLook()) await pushProfile()
  }
  // Con el avatar ya al día, la bienvenida: una sola vez, y recién con el email confirmado
  const { user } = session
  if (user.email && !user.is_anonymous && !user.user_metadata.welcomed) window.dispatchEvent(new Event(WELCOME_EVENT))
}

// Manda el correo de bienvenida con la foto del avatar (app/api/bienvenida). El servidor comprueba la
// cuenta con la sesión, manda el correo a su email y la deja marcada
export const sendWelcome = async (shot: string) => {
  const sb = await getClient()
  const session = sb ? (await sb.auth.getSession()).data.session : null
  if (!sb || !session) return
  const res = await fetch("/api/bienvenida", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ nick: readNick(), shot }),
  }).catch(() => null)
  // La marca quedó en la cuenta: se renueva la sesión para que este dispositivo también la tenga
  if (res?.ok) await sb.auth.refreshSession()
}

// La cuenta recién creada que espera la confirmación del correo, con lo que hace falta para entrar. Vive
// solo en memoria. En el celular el enlace del correo suele abrirse en otro navegador: al volver a esta
// página se entra sola, y el avatar armado acá sube a la cuenta
let pending: { email: string; password: string } | null = null
let entering = false
const enterPending = async () => {
  const p = pending
  if (!p || entering || document.hidden) return
  entering = true
  try {
    // Si el enlace se abrió en este mismo navegador, ya se entró
    if (await account()) pending = null
    else await signIn(p.email, p.password)
  } finally {
    entering = false
  }
}

// Una vez al cargar la página: baja el perfil, y otra vez cada vez que se entra a una cuenta (con la
// contraseña, o con el enlace del correo, que vuelve a la página con la sesión nueva). Devuelve cómo
// dejar de escuchar
export const startProfileSync = () => {
  // La bajada del arranque ya trae lo de la sesión guardada: mientras dura, los avisos son de esa misma
  // sesión (Supabase la anuncia al recuperarla) y repetirían el pedido
  let starting = maybeSession()
  if (starting) pullProfile().finally(() => (starting = false))
  const onAuth = (e: Event) => {
    const event = (e as CustomEvent).detail
    // Supabase pide no llamarlo desde adentro del aviso: se espera a que termine
    if (!starting && (event === "SIGNED_IN" || event === "USER_UPDATED")) setTimeout(pullProfile, 0)
  }
  window.addEventListener(AUTH_EVENT, onAuth)
  document.addEventListener("visibilitychange", enterPending)
  window.addEventListener("focus", enterPending)
  return () => {
    window.removeEventListener(AUTH_EVENT, onAuth)
    document.removeEventListener("visibilitychange", enterPending)
    window.removeEventListener("focus", enterPending)
  }
}

// La cuenta de este dispositivo: su email y si aceptó los correos de novedades. null si no hay cuenta
// (la sesión anónima del chat no cuenta)
export const account = async () => {
  const sb = await getClient()
  const user = sb ? (await sb.auth.getSession()).data.session?.user : null
  return user?.email && !user.is_anonymous ? { email: user.email, promo: !!user.user_metadata.promo } : null
}

// A dónde vuelven los enlaces de los correos: a esta misma página
const here = () => window.location.origin + window.location.pathname
const fail = (code?: string) => (code === "over_email_send_rate_limit" ? "limit" : code === "weak_password" ? "weak" : "error")
// Aceptar los correos de novedades queda en los datos de la cuenta, con la fecha (null lo quita)
const promoData = (promo: boolean) => ({ promo: promo ? new Date().toISOString() : null })

// Crea la cuenta. "in": ya se entró; "confirm": falta abrir el correo de confirmación; "exists": ese email
// ya tiene cuenta; "weak": contraseña floja; "limit": se mandaron muchos correos; "error": otra cosa
export const signUp = async (email: string, password: string, promo: boolean) => {
  const sb = await getClient()
  if (!sb) return "error"
  const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: here(), data: promoData(promo) } })
  if (error) return error.code === "user_already_exists" ? "exists" : fail(error.code)
  if (data.session) return "in"
  // Si el email ya está registrado Supabase no da error (no delata quién tiene cuenta): devuelve un
  // usuario sin identidades
  if (!data.user?.identities?.length) return "exists"
  pending = { email, password }
  return "confirm"
}

// Entra con email y contraseña: el avatar de la cuenta baja solo (startProfileSync). "wrong": no
// coinciden; "unconfirmed": falta confirmar el email
export const signIn = async (email: string, password: string) => {
  const sb = await getClient()
  if (!sb) return "error"
  const { error } = await sb.auth.signInWithPassword({ email, password })
  if (!error) {
    pending = null
    return "in"
  }
  return error.code === "invalid_credentials" ? "wrong" : error.code === "email_not_confirmed" ? "unconfirmed" : "error"
}

// Para quien olvidó la contraseña (o tiene una cuenta de antes, sin contraseña): un correo con el enlace
// para poner una nueva (la pide ConfirmLink al llegar)
export const sendReset = async (email: string) => {
  const sb = await getClient()
  if (!sb) return "error"
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: here() })
  return error ? fail(error.code) : "reset"
}

// Los enlaces de los correos (supabase/correos) llegan a esta web con un código de un solo uso en la
// dirección (?token_hash=). Con él se entra a la cuenta: el avatar sube o baja solo (startProfileSync).
// type: "email" confirma una cuenta nueva; "recovery" es el del cambio de contraseña. Devuelve si se pudo
// (false: el código ya se usó o venció)
export const confirmLink = async (code: string, type: "email" | "recovery") => {
  const sb = await getClient()
  if (!sb) return false
  return !(await sb.auth.verifyOtp({ token_hash: code, type })).error
}

export const setPassword = async (password: string) => {
  const sb = await getClient()
  if (!sb) return "error"
  const { error } = await sb.auth.updateUser({ password })
  return error ? fail(error.code) : "saved"
}

// Acepta o deja de recibir los correos de novedades. Devuelve si quedó guardado
export const setPromo = async (promo: boolean) => {
  const sb = await getClient()
  if (!sb) return false
  return !(await sb.auth.updateUser({ data: promoData(promo) })).error
}
