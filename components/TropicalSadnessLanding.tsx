"use client"

import { useSearchParams } from "next/navigation"
import { useRef, useState } from "react"
import MusicBar, { type RadioHandle } from "./MusicBar"
import AsciiWorld from "./ascii/AsciiWorld"
import { useScene } from "./ascii/scenes"
import Ascii3D from "./ascii3d/Ascii3D"
import { SCENES_3D } from "./ascii3d/scenes"
import PixelIcon from "./PixelIcon"
import SocialLinks from "./SocialLinks"
import ChatRoom from "./ChatRoom"
import RadioGate from "./RadioGate"
import StaticBurst, { type StaticBurstHandle } from "./StaticBurst"

type Mode = "2d" | "3d"

// Una sola experiencia: la radio y el chat siguen mientras se pasa de la isla 2D a los espacios 3D.
// "/" abre en 2D y "/3d" en 3D; el botón cambia de mundo sin recargar (solo cambia la dirección).
export default function TropicalSadnessLanding({ initialMode = "2d" }: { initialMode?: Mode }) {
  const radioRef = useRef<RadioHandle>(null)
  const burstRef = useRef<StaticBurstHandle>(null)
  const [nick, setNick] = useState("")
  const [mode, setMode] = useState<Mode>(initialMode)
  const params = useSearchParams()
  const [index3d, setIndex3d] = useState(() => Math.max(0, SCENES_3D.findIndex((s) => s.id === params.get("escena"))))
  const { scene, next, go } = useScene()
  const scene3d = SCENES_3D[index3d]
  const next3d = SCENES_3D[(index3d + 1) % SCENES_3D.length]

  const switchMode = () => {
    const to: Mode = mode === "2d" ? "3d" : "2d"
    burstRef.current?.play(() => {
      setMode(to)
      window.history.replaceState(null, "", to === "3d" ? "/3d" : "/")
    })
  }

  const exit = mode === "2d" ? next : next3d

  return (
    <main className="ts-cursor relative min-h-dvh w-full overflow-hidden bg-black text-white">
      {mode === "2d" ? (
        <AsciiWorld scene={scene} />
      ) : (
        <div className="absolute inset-0">
          <Ascii3D scene={scene3d} preload={SCENES_3D} controlsClassName="left-3 bottom-[3.9rem] items-start sm:inset-x-0 sm:bottom-20 sm:items-center" />
        </div>
      )}

      {/* Junto al chat: pasar de mundo y la salida al próximo escenario de este mundo.
          En celular van apilados arriba del chat; en pantallas grandes, en fila a su izquierda. */}
      <div className="fixed bottom-[5.9rem] right-3 z-30 flex flex-col items-end gap-2 sm:bottom-[6.5rem] sm:right-8 lg:bottom-5 lg:right-[6.75rem] lg:flex-row-reverse lg:items-center">
        <button
          type="button"
          onClick={switchMode}
          aria-label={mode === "2d" ? "Pasar a los espacios 3D" : "Volver a la isla 2D"}
          className="ts-px-btn h-6 gap-1.5 px-2 font-mono text-[10px] uppercase tracking-[0.15em]"
        >
          {mode === "2d" ? "3d" : "2d"}
          <PixelIcon name="right" className="h-2.5 w-2.5" />
        </button>
        <button
          type="button"
          onClick={() => (mode === "2d" ? go(next) : setIndex3d((index3d + 1) % SCENES_3D.length))}
          aria-label={`Ir a ${exit.label}`}
          className="ts-px-btn h-6 gap-1.5 px-2 font-mono text-[10px] uppercase tracking-[0.15em]"
        >
          {exit.name}
          <PixelIcon name="right" className="h-2.5 w-2.5" />
        </button>
      </div>

      {/* Redes: centradas arriba en móvil, en la esquina superior derecha en desktop */}
      <header className="relative z-20 flex justify-center px-4 pt-4 sm:absolute sm:right-8 sm:top-7 sm:block sm:px-0 sm:pt-0">
        <SocialLinks />
      </header>

      <section className="pointer-events-none relative z-10 flex flex-col items-center px-4 pt-3 sm:pt-[4vh]">
        <h1 className="sr-only">Tropical Sadness</h1>
        <img
          src="/logo-trim.png"
          alt="Tropical Sadness 革命"
          width={634}
          height={701}
          className="logo-float h-auto w-[min(30vw,135px)] select-none"
          draggable={false}
        />
      </section>

      {nick && <ChatRoom nick={nick} />}
      <MusicBar ref={radioRef} />

      {!nick && (
        <RadioGate
          onConnect={(n) => {
            // connect() va primero y dentro del click, así el navegador deja arrancar el audio
            radioRef.current?.connect()
            setNick(n)
          }}
        />
      )}

      <StaticBurst ref={burstRef} />
    </main>
  )
}
