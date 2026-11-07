// Bots para probar los avatares sin red (?bots=N en /3d): caminan solos por el plano redondo de la
// escena, cerca de donde se llega, con paradas cortas. Cuando haya red, los reemplazan las personas.

import { LOOK_PRESETS, STRIDE, presetLook, randomLook, type Avatar } from "./engine/avatars"
import type { Scene3D } from "./scenes"

const SPEED = 1.3 // metros por segundo
const SPREAD = 12 // a cuántos metros de la llegada andan

type Bot = Avatar & { goal: [number, number]; wait: number }
type Roam = NonNullable<NonNullable<Scene3D["camera"]["walk"]>["roam"]>

export const createBots = (n: number, cam: Scene3D["camera"]) => {
  const roam = cam.walk?.roam
  if (!roam || n <= 0) return []
  const home: [number, number] = [cam.target[0], cam.target[2] - (cam.walk?.start ?? 0)]
  // Un punto al azar cerca de la llegada, dentro del plano y donde haya piso
  const pick = (): [number, number] => {
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * Math.PI * 2
      const r = 2 + Math.random() * SPREAD
      const x = home[0] + Math.sin(a) * r
      const z = home[1] - Math.abs(Math.cos(a)) * r // adelante de la llegada, donde se los ve
      if (Math.hypot(x - roam.center[0], z - roam.center[1]) > roam.radius - 1) continue
      if (roam.floor && roam.floor(x, z) === null) continue
      return [x, z]
    }
    return home
  }
  const bots: Bot[] = []
  for (let i = 0; i < n; i++) {
    const [x, z] = pick()
    bots.push({
      pos: [x, floorAt(roam, x, z), z],
      yaw: Math.random() * Math.PI * 2,
      // Los primeros, los puntos de partida del creador, uno femenino y uno masculino (para verlos en
      // escena); después, al azar
      look: i < LOOK_PRESETS.length * 2 ? presetLook(LOOK_PRESETS[i >> 1], i & 1) : randomLook(),
      seed: Math.random() * 10,
      walk: 0,
      phase: 0,
      goal: pick(),
      wait: Math.random() * 2,
    })
  }
  return Object.assign(bots, { pick, roam })
}

const floorAt = (roam: Roam, x: number, z: number) => roam.floor?.(x, z) ?? 0

// Avanza dt segundos
export const stepBots = (bots: ReturnType<typeof createBots>, dt: number) => {
  if (!("pick" in bots)) return
  for (const b of bots) {
    const dx = b.goal[0] - b.pos[0]
    const dz = b.goal[1] - b.pos[2]
    const dist = Math.hypot(dx, dz)
    const moving = b.wait <= 0 && dist > 0.3
    b.walk += ((moving ? 1 : 0) - b.walk) * Math.min(1, dt * 4)
    if (!moving) {
      b.wait -= dt
      if (dist <= 0.3 && b.wait <= 0) {
        b.goal = bots.pick()
        b.wait = 1 + Math.random() * 3
      }
      continue
    }
    // Gira hacia la meta por el lado más corto (yaw 0 = hacia -z)
    const want = Math.atan2(-dx, -dz)
    const turn = ((((want - b.yaw + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI
    b.yaw += turn * Math.min(1, dt * 5)
    const step = Math.min(dist, SPEED * dt * b.walk * Math.max(0, Math.cos(turn)))
    const x = b.pos[0] - Math.sin(b.yaw) * step
    const z = b.pos[2] - Math.cos(b.yaw) * step
    if (bots.roam.floor && bots.roam.floor(x, z) === null) {
      b.goal = bots.pick() // se topó con algo: otra meta
      continue
    }
    b.pos[0] = x
    b.pos[2] = z
    b.pos[1] += (floorAt(bots.roam, x, z) - b.pos[1]) * Math.min(1, dt * 10)
    b.phase += step * STRIDE
  }
}
