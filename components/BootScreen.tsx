"use client"

// Encender y apagar tropi.OS. Lo primero que se ve al entrar es un monitor de tubo apagado: encenderlo
// (un toque, un clic o una tecla) larga la secuencia de arranque, que la lleva entera el CSS
// (.ts-boot--on en globals.css), y su sonido (bootSound.ts): el navegador solo deja sonar después de un
// gesto. Ya encendido, otro toque o tecla salta el arranque. La X de la ventana del navegador lo apaga:
// la página se cierra como la imagen de un tubo y se vuelve al monitor apagado.

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react"
import { playBootSound, playShutdownSound } from "./bootSound"
import OsIcon from "./OsIcon"
import { BOOTED_EVENT, POWER_EVENT, setPower } from "./power"

const POST = [
  "tropiBIOS 4.20 · tropical sadness 革命",
  "memoria: 640K de tristeza ... ok",
  "radio ... al aire",
  "isla ... encontrada",
  "iniciando tropi.OS",
]

// off: apagado · on: arrancando · done: en uso (esta pantalla no se ve) · closing: apagándose
type Phase = "off" | "on" | "done" | "closing"

export default function BootScreen() {
  const ref = useRef<HTMLDivElement>(null)
  const stopSound = useRef<(() => void) | null>(null)
  const [phase, setPhase] = useState<Phase>("off")

  const power = useCallback(() => {
    stopSound.current = playBootSound(window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    setPower(true)
    setPhase("on")
  }, [])
  const skip = useCallback(() => {
    stopSound.current?.()
    setPhase("done")
  }, [])

  // Las teclas hacen lo mismo que el toque. Se frenan acá para que no caigan en la página de abajo
  // (el campo del nombre ya tiene el foco)
  useEffect(() => {
    if (phase !== "off" && phase !== "on") return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key !== "Enter" && e.key !== "Escape" && e.key.length !== 1) return
      e.preventDefault()
      if (phase === "on") skip()
      else if (e.key !== "Escape") power() // Escape no cuenta como gesto para el audio
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [phase, power, skip])

  // En uso: avisa que terminó el arranque, y desde la página apagan el sistema (setPower(false))
  useEffect(() => {
    if (phase !== "done") return
    window.dispatchEvent(new Event(BOOTED_EVENT))
    const onPower = (e: Event) => {
      if ((e as CustomEvent).detail !== false) return
      playShutdownSound()
      setPhase("closing")
    }
    window.addEventListener(POWER_EVENT, onPower)
    return () => window.removeEventListener(POWER_EVENT, onPower)
  }, [phase])

  // Arrancando o apagándose: la animación del propio recuadro dura lo que la secuencia, y al terminar
  // se pasa a lo que sigue (el sonido sigue hasta apagarse solo). Si el navegador no informa la
  // animación, un rato fijo. Al apagar, además, la página se cierra (body.ts-power-off)
  useEffect(() => {
    if (phase !== "on" && phase !== "closing") return
    const next: Phase = phase === "on" ? "done" : "off"
    if (phase === "closing") document.body.classList.add("ts-power-off")
    let live = true
    const finish = () => {
      if (live) setPhase(next)
    }
    const life = ref.current?.getAnimations?.()[0]
    const fallback = life ? 0 : window.setTimeout(finish, phase === "on" ? 4700 : 1250)
    life?.finished.then(finish, () => {})
    return () => {
      live = false
      clearTimeout(fallback)
      document.body.classList.remove("ts-power-off")
    }
  }, [phase])

  if (phase === "done") return null

  if (phase === "closing") {
    return (
      <div ref={ref} className="ts-boot ts-boot--closing">
        <div className="ts-boot-dot" />
      </div>
    )
  }

  return (
    <div ref={ref} className={`ts-boot ts-os ${phase === "on" ? "ts-boot--on" : ""}`} onPointerDown={phase === "on" ? skip : undefined}>
      {phase === "off" && (
        <button type="button" onClick={power} autoFocus className="ts-boot-power">
          <OsIcon name="power" className="h-12 w-12" />
          <span>presiona para encender</span>
        </button>
      )}
      <div className="ts-boot-tube">
        <div className="ts-boot-post" aria-hidden="true">
          {POST.map((line, i) => (
            <p key={line} style={{ "--i": i } as CSSProperties}>
              {line}
              {i === POST.length - 1 && <span className="ts-boot-cursor">_</span>}
            </p>
          ))}
        </div>
        <div className="ts-boot-splash">
          <img
            src="/logo-trim.png"
            alt="Tropical Sadness 革命"
            width={634}
            height={701}
            className="ts-boot-logo select-none"
            draggable={false}
          />
          <p className="ts-boot-name">
            <OsIcon name="tropi" className="h-8 w-8" />
            tropi.OS
          </p>
          <div className="ts-boot-bar" aria-hidden="true" />
        </div>
      </div>
      <div aria-hidden="true" className="ts-crt" />
    </div>
  )
}
