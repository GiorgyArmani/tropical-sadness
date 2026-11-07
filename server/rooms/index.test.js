import { test } from "node:test"
import assert from "node:assert/strict"
import WebSocket from "ws"

process.env.ALLOWED_ORIGINS = "https://ejemplo.test"
const { start, cleanNick, cleanPos, cleanLook, ROOM_MAX } = await import("./index.js")
const PORT = 18080
const URL = `ws://127.0.0.1:${PORT}`

// Un cliente que guarda lo que le llega y deja esperar un mensaje de cierto tipo
const client = (origin = "https://ejemplo.test") =>
  new Promise((ok, fail) => {
    const ws = new WebSocket(URL, { origin })
    const inbox = []
    const waiters = []
    ws.on("message", (d) => {
      const m = JSON.parse(d.toString())
      inbox.push(m)
      for (const w of [...waiters]) if (w.pred(m)) (waiters.splice(waiters.indexOf(w), 1), w.ok(m))
    })
    ws.on("open", () =>
      ok({
        ws,
        send: (m) => ws.send(JSON.stringify(m)),
        next: (pred) => {
          const found = inbox.find(pred)
          if (found) return Promise.resolve(found)
          return new Promise((ok2, fail2) => {
            waiters.push({ pred, ok: ok2 })
            setTimeout(() => fail2(new Error("no llegó")), 2000)
          })
        },
      }),
    )
    ws.on("unexpected-response", (_req, res) => fail(new Error(String(res.statusCode))))
    ws.on("error", fail)
  })

test("salas", async (t) => {
  const { stop } = start(PORT)
  t.after(stop)

  await t.test("dos personas se ven y se mueven", async () => {
    const a = await client()
    const b = await client()
    const look = { body: 1, hair: 0, dress: 2, wings: 3, crown: 1, tail: 0, skin: 4, cloth: 5, hairColor: 0, glow: 3 }
    a.send({ t: "hi", scene: "niebla", nick: "ana", look })
    const wa = await a.next((m) => m.t === "welcome")
    b.send({ t: "hi", scene: "niebla", nick: "beto" })
    const wb = await b.next((m) => m.t === "welcome")
    assert.equal(wa.room, wb.room)
    a.send({ t: "p", x: 1, y: 0, z: -5, yaw: 0.5, walk: 1 })
    const j = await b.next((m) => m.t === "join" && m.id === wa.id)
    assert.equal(j.nick, "ana")
    assert.deepEqual(j.look, look)
    const s = await b.next((m) => m.t === "s" && m.p.some((r) => r[0] === wa.id))
    assert.deepEqual(s.p.find((r) => r[0] === wa.id), [wa.id, 1, 0, -5, 0.5, 1])
    a.ws.close()
    await b.next((m) => m.t === "leave" && m.id === wa.id)
    b.ws.close()
  })

  await t.test("una sala llena abre otra", async () => {
    const clients = []
    const rooms = []
    for (let i = 0; i <= ROOM_MAX; i++) {
      const c = await client()
      c.send({ t: "hi", scene: "escalera", nick: `p${i}` })
      rooms.push((await c.next((m) => m.t === "welcome")).room)
      clients.push(c)
    }
    assert.equal(rooms.filter((r) => r === 1).length, ROOM_MAX)
    assert.equal(rooms[ROOM_MAX], 2)
    for (const c of clients) c.ws.close()
  })

  await t.test("otro dominio no entra", async () => {
    await assert.rejects(client("https://malo.test"), /403/)
  })
})

test("limpieza de datos", () => {
  assert.equal(cleanNick("  hola mundo\u0000xx  "), "holamundoxx")
  assert.equal(cleanNick(""), "anon")
  assert.equal(cleanNick({}), "anon")
  assert.equal(cleanPos({ x: NaN, y: 0, z: 0, yaw: 0, walk: 0 }), null)
  assert.equal(cleanPos({ x: "1", y: 0, z: 0, yaw: 0, walk: 0 }), null)
  assert.equal(cleanPos({ x: 1e9, y: 0, z: 0, yaw: 0, walk: 5 }).x, 2000)
  const ok = { body: 1, hair: 3, dress: 3, wings: 3, crown: 3, tail: 1, skin: 4, cloth: 5, hairColor: 5, glow: 5 }
  assert.deepEqual(cleanLook({ ...ok, extra: "x" }), ok)
  assert.equal(cleanLook({ ...ok, wings: 4 }), null)
  assert.equal(cleanLook({ ...ok, body: 2 }), null)
  assert.equal(cleanLook({ ...ok, dress: 4 }), null)
  assert.equal(cleanLook({ ...ok, hair: 1.5 }), null)
  assert.equal(cleanLook({ ...ok, glow: "1" }), null)
  assert.equal(cleanLook(null), null)
})
