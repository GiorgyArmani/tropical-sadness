"use client"

import { useSyncExternalStore } from "react"
import { cleanNick } from "./ChatRoom"

// El nombre del chat queda guardado en el dispositivo (sin vencimiento): quien vuelve ya entra con su nombre.
const KEY = "ts-chat-nick"
const listeners = new Set<() => void>()

const read = () => {
  try {
    return cleanNick(localStorage.getItem(KEY) ?? "")
  } catch {
    return "" // modo privado o almacenamiento bloqueado: se pide el nombre cada vez
  }
}

export const saveNick = (nick: string) => {
  try {
    localStorage.setItem(KEY, nick)
  } catch {}
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  // Si se cambia en otra pestaña, esta también se entera
  const onStorage = (e: StorageEvent) => e.key === KEY && l()
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(l)
    window.removeEventListener("storage", onStorage)
  }
}

// null mientras no se sabe (en el servidor y en el primer render), "" si no hay nombre guardado
export const useSavedNick = (): string | null => useSyncExternalStore(subscribe, read, () => null)
