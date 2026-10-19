"use client"

import { useEffect, useState } from "react"
import { NOW_PLAYING } from "../../MusicBar"
import type { Scene } from "../types"
import { cemetery } from "./cemetery"
import { island } from "./island"

export const SCENES: Scene[] = [island, cemetery]
const byId = (id: string | undefined) => SCENES.find((s) => s.id === id)

// Escena según la hora local. Se pueden sumar franjas, por ejemplo
// { from: 20, to: 6, scene: "ciudad" } (cruza la medianoche) o filtrar por día con `days: [5, 6]`
type Slot = { from: number; to: number; scene: string; days?: number[] } // days: 0 domingo … 6 sábado
const SCHEDULE: Slot[] = [{ from: 0, to: 24, scene: "isla" }]

const byTime = (now: Date) => {
  const h = now.getHours() + now.getMinutes() / 60
  const slot = SCHEDULE.find(
    (s) =>
      (!s.days || s.days.includes(now.getDay())) && (s.from <= s.to ? h >= s.from && h < s.to : h >= s.from || h < s.to),
  )
  return byId(slot?.scene) ?? island
}

// Orden: ?escena= en la URL (para previsualizar), el escenario del mix al aire, y si no, la hora
export const pickScene = (now = new Date()): Scene => {
  const forced = byId(new URLSearchParams(window.location.search).get("escena") ?? undefined)
  return forced ?? byId(NOW_PLAYING.scene) ?? byTime(now)
}

// Escena actual: la elige el sistema hasta que el visitante usa una salida
export function useScene() {
  const [auto, setAuto] = useState<Scene>(island)
  const [manual, setManual] = useState<Scene | null>(null)

  useEffect(() => {
    const update = () => setAuto(pickScene())
    const first = setTimeout(update, 0)
    const id = setInterval(update, 60 * 1000)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [])

  const scene = manual ?? auto
  const next = SCENES[(SCENES.indexOf(scene) + 1) % SCENES.length]
  return { scene, next, go: (s: Scene) => setManual(s) }
}
