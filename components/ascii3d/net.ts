// La conexión con las salas en vivo (server/rooms): manda dónde está uno y trae a los demás de la
// misma escena como avatares. También lleva lo que cada uno escribe en el chat (sus burbujas).
//
// Cuida la batería y el servidor: solo se conecta en una escena con avatares, con la pestaña visible;
// manda la posición hasta 5 veces por segundo y solo si cambió. Si se corta, reintenta cada vez más
// espaciado. Los demás llegan a saltos (5 por segundo) y acá se suavizan para que caminen parejo.

import { STRIDE, cleanLook, lookOf, type Avatar, type Look } from "./engine/avatars"
import type { V3 } from "./engine/camera"
import { SAY_MAX, type Said } from "./bubbles"

const SEND_MS = 200
const FOLLOW = 10 // qué tan rápido el avatar alcanza la última posición recibida (por segundo)
const RETRY_MS = [1000, 3000, 8000, 20000, 30000]

type Remote = Avatar & { id: number; nick: string; target: V3; targetYaw: number; targetWalk: number; pose: number; say?: Said }
// walk: 0 quieto, 1 caminando, 2 corriendo; pose: 0 de pie, 1 agachado, 2 sentado
export type Pose = { x: number; y: number; z: number; yaw: number; walk: number; pose: number }

export const createRoomLink = (url: string) => {
  let ws: WebSocket | null = null
  let scene: string | null = null // la escena donde se quiere estar (null = desconectado)
  let nick = ""
  let look: Look | null = null // el avatar armado; sin él, uno al azar según el nick
  let joined = "" // escena + nick que el servidor ya conoce
  let retry = 0
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let closed = false
  let lastSend = 0
  let lastPose = ""
  const others = new Map<number, Remote>()

  const key = () => `${scene}\n${nick}\n${JSON.stringify(look)}`
  const hello = () => {
    if (ws?.readyState !== WebSocket.OPEN || !scene) return
    ws.send(JSON.stringify({ t: "hi", scene, nick, look: look ?? lookOf(nick) }))
    joined = key()
    lastPose = "" // en la sala nueva hay que volver a decir dónde se está
    others.clear()
  }

  const upsert = (m: { id: number; nick?: string; look?: unknown; x?: number; y?: number; z?: number; yaw?: number; walk?: number; pose?: number }) => {
    let o = others.get(m.id)
    if (!o) {
      if (typeof m.x !== "number") return
      const pos: V3 = [m.x, m.y ?? 0, m.z ?? 0]
      const yaw = m.yaw ?? 0
      o = { id: m.id, nick: "", pos, target: [...pos], yaw, targetYaw: yaw, walk: 0, targetWalk: 0, phase: 0, look: lookOf(""), seed: m.id * 1.7, pose: 0, crouch: 0, sit: 0 }
      others.set(m.id, o)
    }
    if (typeof m.nick === "string") o.nick = m.nick
    if (typeof m.pose === "number") o.pose = m.pose
    o.look = cleanLook(m.look) ?? (o.nick ? lookOf(o.nick) : o.look)
  }

  const onMessage = (e: MessageEvent) => {
    let m
    try {
      m = JSON.parse(String(e.data))
    } catch {
      return
    }
    if (m.t === "welcome") {
      retry = 0
      others.clear()
      for (const p of m.players ?? []) upsert(p)
    } else if (m.t === "join") upsert(m)
    else if (m.t === "leave") others.delete(m.id)
    else if (m.t === "s") {
      for (const [id, x, y, z, yaw, walk, pose] of m.p ?? []) {
        const o = others.get(id)
        if (!o) continue
        o.target = [x, y, z]
        o.targetYaw = yaw
        o.targetWalk = walk
        o.pose = pose ?? 0 // un servidor viejo no la manda
      }
    } else if (m.t === "say") {
      // Alguien de la sala escribió en el chat: se ve un rato sobre su avatar
      const o = others.get(m.id)
      if (o && typeof m.text === "string" && m.text) o.say = { text: m.text.slice(0, SAY_MAX), at: performance.now() }
    }
  }

  const connect = () => {
    if (closed || ws || !scene || document.hidden) return
    const sock = new WebSocket(url)
    ws = sock
    sock.onopen = hello
    sock.onmessage = onMessage
    sock.onclose = () => {
      if (ws !== sock) return
      ws = null
      joined = ""
      others.clear()
      if (closed || !scene || document.hidden) return
      clearTimeout(retryTimer)
      retryTimer = setTimeout(connect, RETRY_MS[Math.min(retry++, RETRY_MS.length - 1)])
    }
  }

  const disconnect = () => {
    clearTimeout(retryTimer)
    const sock = ws
    ws = null
    joined = ""
    others.clear()
    sock?.close()
  }

  // Pestaña oculta: se suelta la conexión (como el chat); al volver, se reconecta
  const onVisibility = () => (document.hidden ? disconnect() : connect())
  document.addEventListener("visibilitychange", onVisibility)

  return {
    // Dónde se quiere estar: la escena (si tiene avatares), con qué nick y qué avatar. null = fuera
    // de las salas. Si cambia algo, se vuelve a presentar
    want(nextScene: string | null, nextNick: string, nextLook: Look | null) {
      scene = nextNick ? nextScene : null
      nick = nextNick
      look = nextLook
      if (!scene) {
        if (ws) disconnect()
        return
      }
      if (!ws) connect()
      else if (joined !== key()) hello()
    },
    // Dónde está uno (los pies), a lo sumo cada SEND_MS y solo si cambió
    send(now: number, p: Pose) {
      if (ws?.readyState !== WebSocket.OPEN || !joined || now - lastSend < SEND_MS) return
      const r = (v: number) => Math.round(v * 100) / 100
      const msg = {
        t: "p",
        x: r(p.x),
        y: r(p.y),
        z: r(p.z),
        yaw: r(p.yaw),
        walk: r(p.walk),
        pose: p.pose,
      }
      const key = `${msg.x},${msg.y},${msg.z},${msg.yaw},${msg.walk},${msg.pose}`
      if (key === lastPose) return
      lastPose = key
      lastSend = now
      ws.send(JSON.stringify(msg))
    },
    // Lo que uno escribió en el chat, para que los demás de la sala lo vean sobre su avatar
    say(text: string) {
      if (ws?.readyState !== WebSocket.OPEN || !joined) return
      ws.send(JSON.stringify({ t: "say", text: text.slice(0, SAY_MAX) }))
    },
    // Los demás, suavizados hasta este cuadro (dt en segundos)
    avatars(dt: number): (Avatar & { nick: string; say?: Said })[] {
      const k = 1 - Math.exp(-FOLLOW * dt)
      for (const o of others.values()) {
        const dx = o.target[0] - o.pos[0]
        const dz = o.target[2] - o.pos[2]
        // Si saltó lejos (otra parte de la escena), aparece ahí directamente
        if (dx * dx + dz * dz > 25) o.pos = [...o.target]
        else {
          o.pos[0] += dx * k
          o.pos[1] += (o.target[1] - o.pos[1]) * k
          o.pos[2] += dz * k
          o.phase += (Math.hypot(dx * k, dz * k) * STRIDE) / (1 + 0.5 * Math.max(o.walk - 1, 0))
        }
        const turn = ((((o.targetYaw - o.yaw + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI
        o.yaw += turn * k
        o.walk += (o.targetWalk - o.walk) * k
        o.crouch = (o.crouch ?? 0) + ((o.pose === 1 ? 1 : 0) - (o.crouch ?? 0)) * k
        o.sit = (o.sit ?? 0) + ((o.pose === 2 ? 1 : 0) - (o.sit ?? 0)) * k
      }
      return [...others.values()]
    },
    close() {
      closed = true
      document.removeEventListener("visibilitychange", onVisibility)
      disconnect()
    },
  }
}
