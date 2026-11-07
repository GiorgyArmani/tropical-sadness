"use client"

import { useSyncExternalStore } from "react"
import { cleanLook, type Look } from "./ascii3d/engine/avatars"

// El avatar armado queda guardado en el dispositivo, como el nick (useSavedNick)
const KEY = "ts-avatar"
const listeners = new Set<() => void>()

// useSyncExternalStore pide el mismo objeto mientras no cambie: se guarda el texto leído y su avatar
let cache: { raw: string | null; look: Look | null } = { raw: null, look: null }
const read = () => {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    return null // modo privado o almacenamiento bloqueado: avatar según el nick
  }
  if (raw !== cache.raw) {
    let look: Look | null = null
    try {
      look = cleanLook(JSON.parse(raw ?? "null"))
    } catch {}
    cache = { raw, look }
  }
  return cache.look
}

export const saveLook = (look: Look) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(look))
  } catch {}
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  const onStorage = (e: StorageEvent) => e.key === KEY && l()
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(l)
    window.removeEventListener("storage", onStorage)
  }
}

// null si todavía no se armó ninguno (o en el servidor)
export const useSavedLook = (): Look | null => useSyncExternalStore(subscribe, read, () => null)
