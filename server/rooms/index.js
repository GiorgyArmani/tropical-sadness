// Salas en vivo de /3d: cada persona manda dónde está y el servidor lo reparte a las demás de su sala.
//
// Todo vive en memoria (nada va a la base): si el servidor se reinicia, cada navegador se vuelve a
// conectar solo. Una sala es una escena con hasta ROOM_MAX personas; si se llena, se abre otra igual.
//
// Protocolo (JSON):
//   cliente -> { t: "hi", scene, nick, look }                    entrar (o cambiar de escena o de avatar)
//   cliente -> { t: "p", x, y, z, yaw, walk, pose }               dónde está (hasta ~5 por segundo)
//   servidor -> { t: "welcome", id, room, players: [Player] }     al entrar: quiénes ya están
//   servidor -> { t: "join", ...Player } / { t: "leave", id }     alguien llegó o se fue
//   servidor -> { t: "s", p: [[id, x, y, z, yaw, walk, pose], ...] } posiciones, TICK_MS, solo si cambiaron
//   (walk: 0 quieto, 1 caminando, 2 corriendo; pose: 0 de pie, 1 agachado, 2 sentado)
//
// Variables: PORT (8080), ALLOWED_ORIGINS (dominios separados por coma; vacío = cualquiera, solo para probar)

import { createServer } from "node:http"
import { pathToFileURL } from "node:url"
import { WebSocketServer } from "ws"

const PORT = Number(process.env.PORT) || 8080
const ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
export const ROOM_MAX = 8
const TICK_MS = 200
const MAX_CONN = 500 // en total
const MAX_PER_IP = 12 // freno a quien abre muchas (alto: en datos móviles mucha gente comparte IP)
const MSG_PER_SEC = 20 // un cliente normal manda ~5; más del doble de esto lo desconecta
const SCENE = /^[a-z]{1,24}$/
const WORLD = 2000 // metros: nada legítimo está más lejos

// --- Validación: lo que llega del navegador no se cree ---
const num = (v, lim) => (typeof v === "number" && Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : null)
export const cleanNick = (v) => {
  const s = typeof v === "string" ? v.replace(/[\s\p{C}]/gu, "").slice(0, 16) : ""
  return s || "anon"
}
// El avatar: cada campo es el número de una opción del creador. Los topes son los de LOOK_LIMITS en
// components/ascii3d/engine/avatars.ts (si se agrega una opción allá, hay que subirlo acá)
const LOOK_LIMITS = { body: 2, hair: 6, dress: 5, wings: 7, crown: 6, tail: 2, skin: 5, cloth: 6, hairColor: 7, glow: 6 }
export const cleanLook = (v) => {
  if (!v || typeof v !== "object") return null
  const out = {}
  for (const [k, n] of Object.entries(LOOK_LIMITS)) {
    if (!Number.isInteger(v[k]) || v[k] < 0 || v[k] >= n) return null
    out[k] = v[k]
  }
  return out
}
export const cleanPos = (m) => {
  const x = num(m.x, WORLD)
  const y = num(m.y, WORLD)
  const z = num(m.z, WORLD)
  const yaw = num(m.yaw, 1e4)
  const walk = num(m.walk, 2)
  const pose = m.pose === 1 || m.pose === 2 ? m.pose : 0
  if (x === null || y === null || z === null || yaw === null || walk === null) return null
  return { x, y, z, yaw: yaw % (Math.PI * 2), walk: Math.max(0, walk), pose }
}
const r2 = (v) => Math.round(v * 100) / 100

// --- Salas ---
const rooms = new Map() // "escena#n" -> { key, n, players: Map<id, player>, dirty }
let nextId = 1

const roomFor = (scene) => {
  for (let n = 1; ; n++) {
    const key = `${scene}#${n}`
    const room = rooms.get(key)
    if (!room) {
      const fresh = { key, n, players: new Map(), dirty: false }
      rooms.set(key, fresh)
      return fresh
    }
    if (room.players.size < ROOM_MAX) return room
  }
}

const send = (p, msg) => {
  if (p.ws.readyState === p.ws.OPEN) p.ws.send(typeof msg === "string" ? msg : JSON.stringify(msg))
}
const broadcast = (room, msg, except) => {
  const s = JSON.stringify(msg)
  for (const p of room.players.values()) if (p !== except) send(p, s)
}
const publicOf = (p) => ({ id: p.id, nick: p.nick, look: p.look, ...(p.pos ?? {}) })

const leave = (p) => {
  const room = p.room
  if (!room) return
  room.players.delete(p.id)
  p.room = null
  if (room.players.size) broadcast(room, { t: "leave", id: p.id })
  else rooms.delete(room.key)
}

const join = (p, scene) => {
  leave(p)
  const room = roomFor(scene)
  room.players.set(p.id, p)
  p.room = room
  p.pos = null // hasta que mande dónde está no se dibuja
  send(p, { t: "welcome", id: p.id, room: room.n, players: [...room.players.values()].filter((o) => o !== p && o.pos).map(publicOf) })
}

const onMessage = (p, raw) => {
  const now = Date.now()
  if (now - p.windowAt >= 1000) {
    p.windowAt = now
    p.count = 0
  }
  if (++p.count > MSG_PER_SEC) {
    if (p.count > MSG_PER_SEC * 2) p.ws.close(1008, "demasiados mensajes")
    return
  }
  let m
  try {
    m = JSON.parse(raw)
  } catch {
    return
  }
  if (!m || typeof m !== "object") return
  if (m.t === "hi") {
    if (typeof m.scene !== "string" || !SCENE.test(m.scene)) return
    p.nick = cleanNick(m.nick)
    p.look = cleanLook(m.look) // null: cada navegador le pone uno según el nick
    join(p, m.scene)
  } else if (m.t === "p" && p.room) {
    const pos = cleanPos(m)
    if (!pos) return
    const first = !p.pos
    p.pos = pos
    // La primera posición lo presenta (hasta ahí no se sabía dónde dibujarlo)
    if (first) broadcast(p.room, { t: "join", ...publicOf(p) }, p)
    p.room.dirty = true
  }
}

// --- Cada TICK_MS: las posiciones de cada sala que cambió, en un solo mensaje ---
const tick = () => {
  for (const room of rooms.values()) {
    if (!room.dirty) continue
    room.dirty = false
    const list = []
    for (const p of room.players.values()) if (p.pos) list.push([p.id, r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r2(p.pos.yaw), r2(p.pos.walk), p.pos.pose])
    broadcast(room, { t: "s", p: list })
  }
}

// --- Servidor ---
const ipOf = (req) => (req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress) ?? "?"
const perIp = new Map()

export const start = (port = PORT) => {
  const http = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "text/plain" })
      res.end("ok")
      return
    }
    res.writeHead(404)
    res.end()
  })
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 })
  const refuse = (socket, code, text) => {
    socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`)
    socket.destroy()
  }
  http.on("upgrade", (req, socket, head) => {
    if (ORIGINS.length && !ORIGINS.includes(req.headers.origin ?? "")) return refuse(socket, 403, "Forbidden")
    const ip = ipOf(req)
    if (wss.clients.size >= MAX_CONN || (perIp.get(ip) ?? 0) >= MAX_PER_IP) return refuse(socket, 429, "Too Many Requests")
    wss.handleUpgrade(req, socket, head, (ws) => {
      perIp.set(ip, (perIp.get(ip) ?? 0) + 1)
      const p = { id: nextId++, ws, ip, nick: "anon", look: null, pos: null, room: null, alive: true, count: 0, windowAt: 0 }
      ws.on("pong", () => (p.alive = true))
      ws.on("message", (data, isBinary) => {
        if (!isBinary) onMessage(p, data.toString())
      })
      ws.on("close", () => {
        leave(p)
        const left = (perIp.get(ip) ?? 1) - 1
        if (left > 0) perIp.set(ip, left)
        else perIp.delete(ip)
      })
      ws.on("error", () => ws.terminate())
      // Conexiones muertas (el celular se quedó sin señal): un ping cada 30 s, sin respuesta se cierra
      ws.ping()
      p.heartbeat = setInterval(() => {
        if (!p.alive) return ws.terminate()
        p.alive = false
        ws.ping()
      }, 30000)
      ws.on("close", () => clearInterval(p.heartbeat))
    })
  })
  const timer = setInterval(tick, TICK_MS)
  http.listen(port)
  const stop = () =>
    new Promise((done) => {
      clearInterval(timer)
      for (const ws of wss.clients) ws.close(1001, "reinicio")
      http.close(() => done())
    })
  return { http, stop }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { stop } = start()
  console.log(`salas en :${PORT}${ORIGINS.length ? ` (solo ${ORIGINS.join(", ")})` : " (cualquier origen)"}`)
  const bye = () => stop().then(() => process.exit(0))
  process.on("SIGTERM", bye)
  process.on("SIGINT", bye)
}
