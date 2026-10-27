"use client"

import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import MusicBar, { type RadioHandle } from "./MusicBar"
import AsciiWorld from "./ascii/AsciiWorld"
import { SCENES, useScene } from "./ascii/scenes"
import Ascii3D from "./ascii3d/Ascii3D"
import { KIND, LEVELS, SCENE_OF, nextDoorOf, type Entry } from "./ascii3d/maze"
import { SCENES_3D } from "./ascii3d/scenes"
import PixelIcon from "./PixelIcon"
import SocialLinks from "./SocialLinks"
import ChatRoom, { ChatToggle } from "./ChatRoom"
import RadioGate from "./RadioGate"
import StaticBurst, { type StaticBurstHandle } from "./StaticBurst"
import { saveNick, useSavedNick } from "./useSavedNick"

// El sampler pesa (motor de audio y su interfaz): se baja recién al entrar al estudio
const Sampler = dynamic(() => import("./sampler/Sampler"), { ssr: false })

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
  const [chatOpen, setChatOpen] = useState(false)
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
  const [place, setPlace] = useState(() => {
    const id = SCENES_3D.some((s) => s.id === params.get("escena")) ? params.get("escena")! : "pasillo"
    return { id, entry: undefined as Entry | undefined, visit: 0 }
  })
  // Si se llega directo a una escena (?escena=isla), se vuelve por la primera puerta de ese tipo
  const [origin, setOrigin] = useState<Entry>(() => {
    const kind = Number(Object.keys(SCENE_OF).find((k) => SCENE_OF[Number(k)] === place.id) ?? KIND.isla)
    return { level: 0, door: nextDoorOf(0, kind) }
  })
  const scene3d = SCENES_3D.find((s) => s.id === place.id) ?? SCENES_3D[0]

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

  // El estudio: la radio se calla. El sampler se abre con el botón que aparece encima de él al acercarse
  // (camera.action de la escena). Con el panel abierto el 3D queda en pausa (no se ve y ahorra batería)
  const inStudio = mode === "3d" && place.id === "estudio"
  // En qué visita al estudio está abierto el panel (al salir y volver a entrar arranca cerrado)
  const [openVisit, setOpenVisit] = useState<number | null>(null)
  const samplerOpen = inStudio && openVisit === place.visit
  const setSamplerOpen = (open: boolean) => setOpenVisit(open ? place.visit : null)
  const openSampler = useCallback(() => setOpenVisit(place.visit), [place.visit])
  // Al salir del estudio el sampler se para (lo armado queda guardado para cuando se vuelva)
  const usedSampler = useRef(false)
  useEffect(() => {
    if (samplerOpen) usedSampler.current = true
  }, [samplerOpen])
  useEffect(() => {
    if (inStudio || !usedSampler.current) return
    void import("./sampler/engine").then((m) => m.sleepSampler())
  }, [inStudio])

  const switchMode = () => {
    const to: Mode = mode === "2d" ? "3d" : "2d"
    if (to === "3d") setHas3d(true)
    burstRef.current?.play(() => {
      setMode(to)
      window.history.replaceState(null, "", to === "3d" ? "/3d" : "/")
    })
  }

  // Las entradas del 2D: la tele de la isla lleva al cementerio, y la cripta del cementerio a los
  // espacios 3D (se aparece en el pasillo, frente a la puerta del cementerio que se cierra detrás)
  const onPortal = useCallback(
    (from: string) => {
      if (from === "isla") {
        const cemetery = SCENES.find((s) => s.id === "cementerio")
        if (cemetery) go(cemetery)
        return
      }
      if (from === "cementerio") {
        setHas3d(true)
        const door = nextDoorOf(0, KIND.cementerio)
        setOrigin({ level: 0, door })
        burstRef.current?.play(() => {
          travel("pasillo", { level: 0, door })
          setMode("3d")
          window.history.replaceState(null, "", "/3d")
        })
      }
    },
    [go, travel],
  )

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
        <AsciiWorld scene={scene} active={mode === "2d"} onPortal={onPortal} />
      </div>
      {has3d && (
        <div className={mode === "3d" ? "absolute inset-0" : "hidden"}>
          <Ascii3D
            active={mode === "3d" && !samplerOpen}
            scene={scene3d}
            entry={place.entry}
            visit={place.visit}
            onEnter={onEnter}
            onLeave={backToHall}
            onAction={openSampler}
            preload={SCENES_3D}
            controlsClassName="left-3 bottom-[3.9rem] items-start sm:inset-x-0 sm:bottom-20 sm:items-center"
          />
        </div>
      )}

      {/* Pasar de mundo, el próximo escenario (en 2D) y el chat. En 3D las puertas no van acá: el motor
          pone sus botones sobre la puerta misma. En celular van apilados arriba del botón del chat, en la
          esquina; en pantallas grandes, en fila al centro, a la derecha de los controles de la escena. */}
      {nick && (
        <ChatToggle
          open={chatOpen}
          onClick={() => setChatOpen((o) => !o)}
          className="fixed bottom-[3.9rem] right-3 z-40 sm:bottom-[4.5rem] sm:right-8 lg:hidden"
        />
      )}
      <div className="fixed bottom-[5.9rem] right-3 z-30 flex flex-col items-end gap-2 sm:bottom-[6.5rem] sm:right-8 lg:bottom-[5.25rem] lg:left-[calc(50%+7rem)] lg:right-auto lg:flex-row lg:items-center">
        {/* Al 3D se entra por la isla (la tele y la cripta); desde el 3D se puede volver */}
        {mode === "3d" && (
          <button
            type="button"
            onClick={switchMode}
            aria-label="Volver a la isla 2D"
            className="ts-px-btn h-6 gap-1.5 px-2 font-mono text-[10px] uppercase tracking-[0.15em]"
          >
            2d
            <PixelIcon name="right" className="h-2.5 w-2.5" />
          </button>
        )}
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
        ) : null}
        {nick && <ChatToggle open={chatOpen} onClick={() => setChatOpen((o) => !o)} className="hidden lg:inline-flex" />}
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

      {nick && <ChatRoom nick={nick} open={chatOpen} onOpenChange={setChatOpen} />}
      <MusicBar ref={radioRef} silenced={inStudio} />

      {inStudio && samplerOpen && <Sampler onMinimize={() => setSamplerOpen(false)} onLeave={backToHall} />}

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
