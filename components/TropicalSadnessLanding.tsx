"use client"

import { useSearchParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import MusicBar, { type RadioHandle } from "./MusicBar"
import AsciiWorld from "./ascii/AsciiWorld"
import { useScene } from "./ascii/scenes"
import Ascii3D, { type Ascii3DHandle, type NearDoor } from "./ascii3d/Ascii3D"
import { KIND, LEVELS, SCENE_OF, nextDoorOf, type Entry } from "./ascii3d/maze"
import { SCENES_3D } from "./ascii3d/scenes"
import PixelIcon from "./PixelIcon"
import SocialLinks from "./SocialLinks"
import ChatRoom from "./ChatRoom"
import RadioGate from "./RadioGate"
import StaticBurst, { type StaticBurstHandle } from "./StaticBurst"
import { saveNick, useSavedNick } from "./useSavedNick"

type Mode = "2d" | "3d"

// Una sola experiencia: la radio y el chat siguen mientras se pasa de la isla 2D a los espacios 3D.
// "/" abre en 2D y "/3d" en 3D; el botón cambia de mundo sin recargar (solo cambia la dirección).
export default function TropicalSadnessLanding({ initialMode = "2d" }: { initialMode?: Mode }) {
  const radioRef = useRef<RadioHandle>(null)
  const burstRef = useRef<StaticBurstHandle>(null)
  // El nombre se guarda en el dispositivo: quien vuelve entra directo al chat, sin la pantalla de entrada
  const saved = useSavedNick()
  const nick = saved ?? ""
  const tuned = useRef(false) // la radio ya arrancó con un gesto en esta visita
  const [mode, setMode] = useState<Mode>(initialMode)
  // Los dos mundos quedan montados y el que no se ve, en pausa: pasar de uno a otro no rearma nada.
  // El 3D se prepara solo en segundo plano a los pocos segundos (contexto y shaders), así el primer
  // cambio tampoco se traba.
  const [has3d, setHas3d] = useState(initialMode === "3d")
  useEffect(() => {
    if (has3d) return
    const id = window.setTimeout(() => setHas3d(true), 2500)
    return () => clearTimeout(id)
  }, [has3d])
  const params = useSearchParams()
  const { scene, next, go } = useScene()

  // El 3D es un laberinto: se está en un lugar, y se vuelve al pasillo por la puerta por la que se entró
  const engineRef = useRef<Ascii3DHandle>(null)
  const [place, setPlace] = useState(() => {
    const id = SCENES_3D.some((s) => s.id === params.get("escena")) ? params.get("escena")! : "pasillo"
    return { id, entry: undefined as Entry | undefined, visit: 0 }
  })
  // Si se llega directo a una escena (?escena=isla), se vuelve por la primera puerta de ese tipo
  const [origin, setOrigin] = useState<Entry>(() => {
    const kind = Number(Object.keys(SCENE_OF).find((k) => SCENE_OF[Number(k)] === place.id) ?? KIND.isla)
    return { level: 0, door: nextDoorOf(0, kind) }
  })
  const [near, setNear] = useState<NearDoor | null>(null)
  const scene3d = SCENES_3D.find((s) => s.id === place.id) ?? SCENES_3D[0]
  const inHall = place.id === "pasillo"

  const travel = useCallback((id: string, entry?: Entry) => setPlace((p) => ({ id, entry, visit: p.visit + 1 })), [])
  const onEnter = useCallback(
    (kind: number, from: Entry) => {
      if (kind === KIND.pasillo) {
        // La puerta roja lleva a otro nivel del pasillo: se sale por una puerta roja de allá
        const level = (from.level + 1) % LEVELS
        travel("pasillo", { level, door: nextDoorOf(level, KIND.pasillo, from.door) })
      } else {
        setOrigin(from)
        travel(SCENE_OF[kind])
      }
    },
    [travel],
  )
  const backToHall = useCallback(() => travel("pasillo", origin), [travel, origin])

  const switchMode = () => {
    const to: Mode = mode === "2d" ? "3d" : "2d"
    if (to === "3d") setHas3d(true)
    burstRef.current?.play(() => {
      setMode(to)
      window.history.replaceState(null, "", to === "3d" ? "/3d" : "/")
    })
  }

  // El navegador solo deja sonar audio después de un gesto: si ya hay nombre guardado, la radio
  // arranca con el primer toque, click o tecla en cualquier parte de la página
  useEffect(() => {
    if (!saved || tuned.current) return
    const start = () => {
      tuned.current = true
      radioRef.current?.connect()
      off()
    }
    const events = ["pointerup", "touchend", "keydown"] as const
    const off = () => events.forEach((e) => window.removeEventListener(e, start))
    events.forEach((e) => window.addEventListener(e, start))
    return off
  }, [saved])


  return (
    <main className="ts-cursor relative min-h-dvh w-full overflow-hidden bg-black text-white">
      <div className={mode === "2d" ? "absolute inset-0" : "hidden"}>
        <AsciiWorld scene={scene} active={mode === "2d"} />
      </div>
      {has3d && (
        <div className={mode === "3d" ? "absolute inset-0" : "hidden"}>
          <Ascii3D
            ref={engineRef}
            active={mode === "3d"}
            scene={scene3d}
            entry={place.entry}
            visit={place.visit}
            onNear={setNear}
            onEnter={onEnter}
            onLeave={backToHall}
            preload={SCENES_3D}
            controlsClassName="left-3 bottom-[3.9rem] items-start sm:inset-x-0 sm:bottom-20 sm:items-center"
          />
        </div>
      )}

      {/* Junto al chat: pasar de mundo y la salida. En 2D, el próximo escenario; en 3D, la puerta:
          en el pasillo aparece al lado de una puerta con luz, y en las demás escenas vuelve al pasillo.
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
        {mode === "2d" ? (
          <button
            type="button"
            onClick={() => go(next)}
            aria-label={`Ir a ${next.label}`}
            className="ts-px-btn h-6 gap-1.5 px-2 font-mono text-[10px] uppercase tracking-[0.15em]"
          >
            {next.name}
            <PixelIcon name="right" className="h-2.5 w-2.5" />
          </button>
        ) : inHall ? (
          near && (
            <button
              type="button"
              onClick={() => engineRef.current?.open()}
              aria-label="Abrir la puerta"
              className="ts-px-btn ts-px-btn--primary h-6 gap-1.5 px-2 font-mono text-[10px] uppercase tracking-[0.15em]"
            >
              abrir puerta
              <PixelIcon name="right" className="h-2.5 w-2.5" />
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={backToHall}
            aria-label="Volver al pasillo por la puerta"
            className="ts-px-btn h-6 gap-1.5 px-2 font-mono text-[10px] uppercase tracking-[0.15em]"
          >
            puerta · pasillo
            <PixelIcon name="right" className="h-2.5 w-2.5" />
          </button>
        )}
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

      {saved === "" && (
        <RadioGate
          onConnect={(n) => {
            // connect() va primero y dentro del click, así el navegador deja arrancar el audio
            tuned.current = true
            radioRef.current?.connect()
            saveNick(n)
          }}
        />
      )}

      <StaticBurst ref={burstRef} />
    </main>
  )
}
