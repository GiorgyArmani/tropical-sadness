import { createClient, type SupabaseClient } from "@supabase/supabase-js"

// Un solo cliente para el chat y los perfiles: así comparten la sesión (anónima o con email)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

let client: SupabaseClient | null = null
export const getClient = () => {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    // La sesión anónima se guarda en el dispositivo y se renueva sola: dura mientras no se borren los datos
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: "ts-foro-auth",
    },
    realtime: { params: { eventsPerSecond: 5 } },
  })
  return client
}
