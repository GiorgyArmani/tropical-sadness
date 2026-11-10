"use client"

import { useSyncExternalStore } from "react"

// Si tropi.OS está encendido. Lo enciende la pantalla de arranque (BootScreen) y lo apaga la X de la
// ventana del navegador. Cada cambio se avisa por window dentro del mismo gesto, así quien lo escucha
// todavía puede hacer sonar audio (la radio, los sonidos de encender y apagar).
export const POWER_EVENT = "ts-power" // detail: true = se encendió, false = se apagó
export const BOOTED_EVENT = "ts-booted" // terminó (o se saltó) la animación de arranque

let powered = false

// La página avisa cuando ya escucha el encendido. Antes de eso encender no hace nada: el aviso se
// perdería y la radio no arrancaría dentro del toque (pasa en la primera visita, con la red lenta)
let ready = false
export const setReady = () => {
  ready = true
}
export const isReady = () => ready

export const setPower = (on: boolean) => {
  powered = on
  window.dispatchEvent(new CustomEvent(POWER_EVENT, { detail: on }))
}

const subscribe = (l: () => void) => {
  window.addEventListener(POWER_EVENT, l)
  return () => window.removeEventListener(POWER_EVENT, l)
}

// false en el servidor y hasta que se enciende. Quien monte después de encendido igual se entera
export const usePowered = () => useSyncExternalStore(subscribe, () => powered, () => false)
