import type { SupabaseClient } from "@supabase/supabase-js"

// Un solo cliente para el chat y los perfiles: así comparten la sesión (anónima o con email)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const STORAGE_KEY = "ts-foro-auth"

export const HAS_SUPABASE = !!(SUPABASE_URL && SUPABASE_KEY)

// Cada cambio de sesión se avisa por acá (detail: el evento de Supabase), cree quien cree el cliente
export const AUTH_EVENT = "ts-auth"

// La librería pesa unos 60 kB: no viene con la página, se baja recién cuando alguien pide el cliente.
// Da null si faltan las claves, o si no se pudo bajar (el próximo pedido lo intenta de nuevo)
let client: Promise<SupabaseClient | null> | null = null
export const getClient = () => {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null
  client ??= import("@supabase/supabase-js").then(
    ({ createClient }) => {
      const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
        // La sesión anónima se guarda en el dispositivo y se renueva sola: dura mientras no se borren los datos
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          storageKey: STORAGE_KEY,
        },
        realtime: { params: { eventsPerSecond: 5 } },
      })
      sb.auth.onAuthStateChange((event) => window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: event })))
      return sb
    },
    () => (client = null),
  )
  return client
}

// Si en este dispositivo puede haber una cuenta: hay una sesión guardada, o se vuelve del enlace del correo
// (la sesión llega en la dirección). Sin eso no hay nada que sincronizar: ni hace falta bajar la librería
export const maybeSession = () => {
  if (window.location.hash.includes("access_token")) return true
  try {
    return localStorage.getItem(STORAGE_KEY) !== null
  } catch {
    return false
  }
}
