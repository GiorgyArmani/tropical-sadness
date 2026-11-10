import { readFile } from "node:fs/promises"
import path from "node:path"
import { NextResponse, type NextRequest } from "next/server"
import { createTransport, type Transporter } from "nodemailer"
import { CID, welcomeMail } from "./mail"

// El correo de bienvenida para quien arma su avatar y confirma su email (lo pide components/WelcomeMail).
// Quién es y a qué email va lo dice Supabase con la sesión de quien llama, nunca el pedido: así nadie
// puede usar esto para mandarle correos a otro. Sale una sola vez por cuenta (queda marcada en sus datos).
// El servidor de correo va en SMTP_HOST, SMTP_PORT, SMTP_USER y SMTP_PASSWORD.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const { SMTP_HOST, SMTP_USER, SMTP_PASSWORD } = process.env
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587

const HERE = path.join(process.cwd(), "app/api/bienvenida") // el logo y el ícono (ver next.config.mjs)
const MAX_SHOT = 700_000 // la foto en base64: unos 500 kB de imagen como mucho
const WAIT_MS = 60_000
const recent = new Map<string, number>() // último intento de cada cuenta: frena a quien insiste

type User = { id: string; email?: string; email_confirmed_at?: string; is_anonymous?: boolean; user_metadata?: { welcomed?: boolean } }

// La cuenta de quien llama, con su propia sesión: sin data se lee, con data se le agregan datos
const account = (token: string, data?: object) =>
  fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: data ? "PUT" : "GET",
    headers: { apikey: SUPABASE_KEY ?? "", Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: data && JSON.stringify({ data }),
  })

// La foto del avatar llega como data URL: se acepta solo si es un JPEG de verdad y no pesa de más
const parseShot = (v: unknown) => {
  const head = "data:image/jpeg;base64,"
  if (typeof v !== "string" || v.length > MAX_SHOT || !v.startsWith(head)) return null
  const jpeg = Buffer.from(v.slice(head.length), "base64")
  return jpeg[0] === 0xff && jpeg[1] === 0xd8 && jpeg[2] === 0xff ? jpeg : null
}

let transport: Transporter | null = null
const mailer = () =>
  (transport ??= createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // en 587 la conexión pasa a TLS sola (STARTTLS)
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  }))

const no = (status: number) => NextResponse.json({ ok: false }, { status })

export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /i, "")
  if (!token || !SUPABASE_URL) return no(401)
  const res = await account(token)
  if (!res.ok) return no(401)
  const user: User = await res.json()
  if (!user.email || !user.email_confirmed_at || user.is_anonymous) return no(403)
  if (user.user_metadata?.welcomed) return NextResponse.json({ ok: true, sent: false })

  const body = await request.json().catch(() => null)
  // Mismo filtro que el nombre del chat (cleanNick): no deja nada que pueda romper el HTML del correo
  const nick = String(body?.nick ?? "").replace(/[^\p{L}\p{N}_.-]/gu, "").slice(0, 16)
  const shot = parseShot(body?.shot)
  if (!nick || !shot) return no(400)
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) return no(503)
  if (Date.now() - (recent.get(user.id) ?? 0) < WAIT_MS) return no(429)
  recent.set(user.id, Date.now())

  try {
    const [logo, icon] = await Promise.all([readFile(path.join(HERE, "logo.png")), readFile(path.join(HERE, "icono.png"))])
    await mailer().sendMail({
      from: { name: "Tropical Sadness", address: SMTP_USER },
      to: user.email,
      ...welcomeMail(nick, request.nextUrl.origin),
      attachments: [
        { filename: "logo.png", content: logo, cid: CID.logo },
        { filename: "icono.png", content: icon, cid: CID.icon },
        { filename: "avatar.jpg", content: shot, cid: CID.avatar },
      ],
      signal: AbortSignal.timeout(20_000),
    })
    await account(token, { welcomed: true })
    return NextResponse.json({ ok: true, sent: true })
  } catch (err) {
    console.error("[bienvenida]", err instanceof Error ? err.message : err)
    return no(502)
  }
}
