"use client"

// El perfil en Supabase (tabla profiles, ver supabase/perfiles.sql): el nick y el avatar de cada quien.
// El dispositivo guarda una copia (useSavedNick, useSavedLook) y la cuenta manda: al entrar se baja lo
// guardado y al cambiar algo se sube. Con un email la cuenta anónima se vuelve permanente y se
// recupera en otro dispositivo.

import { cleanLook } from "./ascii3d/engine/avatars"
import { cleanNick } from "./ChatRoom"
import { AUTH_EVENT, getClient, maybeSession } from "./supabase"
import { readLook, saveLook } from "./useSavedLook"
import { readNick, saveNick } from "./useSavedNick"

// Sube el nick y el avatar de este dispositivo. create: si no hay sesión, crea la anónima (solo al
// guardar un avatar: así no se crea una cuenta por cada visita)
export const pushProfile = async (create = false) => {
  const nick = readNick()
  // Sin sesión guardada no hay a dónde subir, salvo que haya que crearla
  if (!nick || (!create && !maybeSession())) return
  const sb = await getClient()
  if (!sb) return
  let { session } = (await sb.auth.getSession()).data
  if (!session && create) session = (await sb.auth.signInAnonymously()).data.session
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

// Una vez al cargar la página: baja el perfil, y otra vez cada vez que se entra con email (el enlace
// del correo vuelve a la página con la sesión nueva). Devuelve cómo dejar de escuchar
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
  return () => window.removeEventListener(AUTH_EVENT, onAuth)
}

// El email de la cuenta, o null si es anónima (o todavía no confirmó)
export const accountEmail = async () => {
  const sb = await getClient()
  const user = sb ? (await sb.auth.getSession()).data.session?.user : null
  return user && !user.is_anonymous ? (user.email ?? null) : null
}

// Guarda la cuenta con un email. Si ese email ya tiene cuenta, manda un enlace para entrar a ella en
// este dispositivo (y se baja su avatar). "linked": hay que confirmar desde el correo; "login": el enlace
// es para entrar; "limit": se mandaron muchos correos; "error": otra cosa
export const linkEmail = async (email: string): Promise<"linked" | "login" | "limit" | "error"> => {
  const sb = await getClient()
  if (!sb) return "error"
  const redirect = window.location.origin + window.location.pathname
  const fail = (code?: string) => (code === "over_email_send_rate_limit" ? "limit" : "error")
  await pushProfile(true)
  const user = (await sb.auth.getSession()).data.session?.user
  if (user?.is_anonymous) {
    const { error } = await sb.auth.updateUser({ email }, { emailRedirectTo: redirect })
    if (!error) return "linked"
    if (error.code !== "email_exists") return fail(error.code)
  }
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: redirect },
  })
  return error ? fail(error.code) : "login"
}
