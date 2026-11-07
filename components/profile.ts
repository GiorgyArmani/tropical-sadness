"use client"

// El perfil en Supabase (tabla profiles, ver supabase/perfiles.sql): el nick y el avatar de cada quien.
// El dispositivo guarda una copia (useSavedNick, useSavedLook) y la cuenta manda: al entrar se baja lo
// guardado y al cambiar algo se sube. Con un email la cuenta anónima se vuelve permanente y se
// recupera en otro dispositivo.

import { cleanLook } from "./ascii3d/engine/avatars"
import { cleanNick } from "./ChatRoom"
import { getClient } from "./supabase"
import { readLook, saveLook } from "./useSavedLook"
import { readNick, saveNick } from "./useSavedNick"

// Sube el nick y el avatar de este dispositivo. create: si no hay sesión, crea la anónima (solo al
// guardar un avatar: así no se crea una cuenta por cada visita)
export const pushProfile = async (create = false) => {
  const sb = getClient()
  const nick = readNick()
  if (!sb || !nick) return
  let { session } = (await sb.auth.getSession()).data
  if (!session && create) session = (await sb.auth.signInAnonymously()).data.session
  if (!session) return
  const look = readLook()
  await sb.from("profiles").upsert({ user_id: session.user.id, nick, ...(look ? { look } : {}) })
}

// Baja el perfil de la cuenta a este dispositivo. Si la cuenta todavía no tiene, sube lo de acá
const pullProfile = async () => {
  const sb = getClient()
  if (!sb || !(await sb.auth.getSession()).data.session) return
  const { data: row, error } = await sb.from("profiles").select("nick,look").maybeSingle()
  if (error) return
  if (!row) return pushProfile()
  const nick = cleanNick(String(row.nick ?? ""))
  if (nick && nick !== readNick()) saveNick(nick)
  const look = cleanLook(row.look)
  if (look && JSON.stringify(look) !== JSON.stringify(readLook())) saveLook(look)
}

// Una vez al cargar la página: baja el perfil, y otra vez cada vez que se entra con email (el enlace
// del correo vuelve a la página con la sesión nueva). Devuelve cómo dejar de escuchar
export const startProfileSync = () => {
  const sb = getClient()
  if (!sb) return () => {}
  pullProfile()
  const { data } = sb.auth.onAuthStateChange((event) => {
    // Supabase pide no llamarlo desde adentro del aviso: se espera a que termine
    if (event === "SIGNED_IN" || event === "USER_UPDATED") setTimeout(pullProfile, 0)
  })
  return () => data.subscription.unsubscribe()
}

// El email de la cuenta, o null si es anónima (o todavía no confirmó)
export const accountEmail = async () => {
  const sb = getClient()
  const user = sb ? (await sb.auth.getSession()).data.session?.user : null
  return user && !user.is_anonymous ? (user.email ?? null) : null
}

// Guarda la cuenta con un email. Si ese email ya tiene cuenta, manda un enlace para entrar a ella en
// este dispositivo (y se baja su avatar). "linked": hay que confirmar desde el correo; "login": el enlace
// es para entrar; "limit": se mandaron muchos correos; "error": otra cosa
export const linkEmail = async (email: string): Promise<"linked" | "login" | "limit" | "error"> => {
  const sb = getClient()
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
