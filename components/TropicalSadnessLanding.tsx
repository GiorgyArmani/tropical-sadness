"use client"

import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import AddressBar from "./AddressBar"
import MusicBar, { type RadioHandle } from "./MusicBar"
import AsciiWorld, { type Clima } from "./ascii/AsciiWorld"
import { SCENES, useScene } from "./ascii/scenes"
import Ascii3D from "./ascii3d/Ascii3D"
import { KIND, LEVELS, SCENE_OF, nextDoorOf, type Entry } from "./ascii3d/maze"
import { SCENES_3D } from "./ascii3d/scenes"
import OsIcon, { type OsIconName } from "./OsIcon"
import PixelIcon from "./PixelIcon"
import { POWER_EVENT, setPower, usePowered } from "./power"
import SocialLinks from "./SocialLinks"
import ChatRoom, { ChatToggle } from "./ChatRoom"
import RadioGate from "./RadioGate"
import StaticBurst, { type StaticBurstHandle } from "./StaticBurst"
import { saveNick, useSavedNick } from "./useSavedNick"
import { saveLook, useSavedLook } from "./useSavedLook"
import { pushProfile, startProfileSync } from "./profile"

// El sampler pesa (motor de audio y su interfaz): se baja recién al entrar al estudio
const Sampler = dynamic(() => import("./sampler/Sampler"), { ssr: false })
// El creador de avatares trae su propio motor para la vista previa: se baja recién al abrirlo
const AvatarCreator = dynamic(() => import("./AvatarCreator"), { ssr: false })
const HAS_ROOMS = !!process.env.NEXT_PUBLIC_ROOMS_URL

type Mode = "2d" | "3d"

// El ícono de cada lugar (en la barra de dirección y en el botón que lleva a él); los demás, una puerta
const PLACE_ICON: Record<string, OsIconName> = { isla: "island", cementerio: "grave" }

// La puerta del pasillo que lleva a un espacio 3D: por ella se vuelve al salir de él
const doorTo = (id: string): Entry => {
  const kind = Number(Object.keys(SCENE_OF).find((k) => SCENE_OF[Number(k)] === id) ?? KIND.isla)
  return { level: 0, door: nextDoorOf(0, kind) }
}

// El reloj de la bandeja. En el servidor y en el primer render no hay hora: cada visitante tiene la suya
const clockTime = () => new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })
const clockTick = (tick: () => void) => {
  const id = setInterval(tick, 5000)
  return () => clearInterval(id)
}
function Clock() {
  const time = useSyncExternalStore(clockTick, clockTime, () => "")
  return <time className="ts-inset flex h-7 min-w-[3.25rem] items-center justify-center px-1.5">{time}</time>
}

// Una sola experiencia: la radio y el chat siguen mientras se pasa de la isla 2D a los espacios 3D.
// "/" abre en 2D y "/3d" en 3D; el botón cambia de mundo sin recargar (solo cambia la dirección).
// Todo pasa adentro de tropi.OS: la página es la de un navegador viejo (título, botones, dirección y
// vínculos arriba; barra de estado abajo) y la radio vive en la barra de tareas.
export default function TropicalSadnessLanding({ initialMode = "2d" }: { initialMode?: Mode }) {
  const radioRef = useRef<RadioHandle>(null)
  const burstRef = useRef<StaticBurstHandle>(null)
  // El nombre se guarda en el dispositivo: quien vuelve entra directo al chat, sin la pantalla de entrada
  const saved = useSavedNick()
  const nick = saved ?? ""
  const tuned = useRef(false) // la radio ya arrancó con un gesto en esta visita
  const [mode, setMode] = useState<Mode>(initialMode)
  // Con el sistema apagado (antes de encender el monitor, o después de cerrarlo con la X) los dos
  // mundos quedan en pausa
  const powered = usePowered()
  const [chatOpen, setChatOpen] = useState(false)
  const look = useSavedLook()
  const [avatarOpen, setAvatarOpen] = useState(false)
  const closeAvatar = useCallback(() => setAvatarOpen(false), [])
  // El nick y el avatar guardados en la cuenta (Supabase) llegan a este dispositivo
  useEffect(() => startProfileSync(), [])
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
  const [clima, setClima] = useState<Clima | null>(null)

  // El 3D es un laberinto: se está en un lugar, y se vuelve al pasillo por la puerta por la que se entró
  const [place, setPlace] = useState(() => {
    const id = SCENES_3D.some((s) => s.id === params.get("escena")) ? params.get("escena")! : "pasillo"
    return { id, entry: undefined as Entry | undefined, visit: 0 }
  })
  // Si se llega directo a una escena (?escena=isla), se vuelve por la primera puerta de ese tipo
  const [origin, setOrigin] = useState<Entry>(() => doorTo(place.id))
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
  // En el estudio suena un ambiente analógico leve (soplido de cinta y zumbido). Al salir, el sampler se
  // para y se apaga el ambiente (lo armado queda guardado para cuando se vuelva)
  // Con el sistema apagado el ambiente también calla
  const studioLive = inStudio && powered
  const visitedStudio = useRef(false)
  useEffect(() => {
    if (studioLive) {
      visitedStudio.current = true
      let live = true
      void import("./sampler/engine").then((m) => live && m.getSampler().ambience(true))
      return () => void (live = false)
    }
    if (visitedStudio.current) void import("./sampler/engine").then((m) => m.sleepSampler())
  }, [studioLive])
  // Mientras se usa el sampler, el ambiente baja casi a nada; al cerrar el panel vuelve
  useEffect(() => {
    if (!visitedStudio.current && !samplerOpen) return
    void import("./sampler/engine").then((m) => m.getSampler().setAmbienceLevel(samplerOpen ? 0.06 : 1))
  }, [samplerOpen])

  const switchMode = () => {
    const to: Mode = mode === "2d" ? "3d" : "2d"
    if (to === "3d") setHas3d(true)
    burstRef.current?.play(() => {
      setMode(to)
      window.history.replaceState(null, "", to === "3d" ? "/3d" : "/")
    })
  }

  // La barra de dirección: se escribe a dónde ir. tropi://isla y tropi://cementerio son los escenarios
  // 2D; tropi://3d/<espacio>, los espacios 3D (tropi://3d solo lleva al pasillo). El "tropi://" se puede
  // omitir. Si la dirección no existe, lo dice una ventana de error (lost)
  const [lost, setLost] = useState<string | null>(null)
  const goTo = (typed: string) => {
    const path = typed.trim().toLowerCase().replace(/^tropi:\/*/, "").replace(/^\/+|\/+$/g, "")
    if (!path) return
    const in3d = path === "3d" || path.startsWith("3d/")
    const id = in3d ? path.slice(3) || "pasillo" : path
    const scene2d = in3d ? undefined : SCENES.find((s) => s.id === id)
    if (scene2d) {
      if (mode === "2d") go(scene2d)
      else
        burstRef.current?.play(() => {
          go(scene2d)
          setMode("2d")
          window.history.replaceState(null, "", "/")
        })
    } else if (!SCENES_3D.some((s) => s.id === id)) {
      setLost(typed.trim().slice(0, 48))
    } else {
      setOrigin(doorTo(id))
      if (mode === "3d") travel(id)
      else {
        setHas3d(true)
        burstRef.current?.play(() => {
          travel(id)
          setMode("3d")
          window.history.replaceState(null, "", "/3d")
        })
      }
    }
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

  // Al apagar el sistema la radio se corta; al volver a encenderlo, la de quien ya tiene nombre se
  // conecta sola (el aviso llega dentro del mismo gesto, así el navegador la deja sonar)
  useEffect(() => {
    const onPower = (e: Event) => {
      if ((e as CustomEvent).detail !== true) radioRef.current?.disconnect()
      else if (saved) {
        tuned.current = true
        radioRef.current?.connect()
      }
    }
    window.addEventListener(POWER_EVENT, onPower)
    return () => window.removeEventListener(POWER_EVENT, onPower)
  }, [saved])


  // Dónde se está, para el título, la dirección y la barra de estado
  const here = mode === "2d" ? scene : scene3d
  const address = mode === "2d" ? `tropi://${scene.id}` : `tropi://3d/${scene3d.id}`
  const status = mode === "3d" ? scene3d.blurb : clima ? [clima.label, clima.city].filter(Boolean).join(" · ") : scene.label

  return (
    <main className="ts-cursor relative flex h-dvh w-full flex-col overflow-hidden bg-black">
      {/* El navegador: una ventana maximizada. En pantallas bajas se queda solo con botones y dirección */}
      <div className="ts-win flex min-h-0 flex-1 flex-col">
        <header className="ts-os shrink-0">
          <div className="ts-win-title ts-bold short:hidden">
            <OsIcon name="globe" />
            <p className="min-w-0 flex-1 truncate">Tropical Sadness 革命 - {here.label}</p>
            {/* Minimizar y maximizar son de adorno; cerrar la ventana apaga el sistema */}
            <span aria-hidden="true" className="flex">
              <span className="ts-win-ctl">
                <PixelIcon name="min" className="h-2 w-2" />
              </span>
              <span className="ts-win-ctl">
                <PixelIcon name="max" className="h-2 w-2" />
              </span>
            </span>
            <button
              type="button"
              onClick={() => setPower(false)}
              aria-label="Apagar tropi.OS"
              title="apagar"
              className="ts-win-ctl -ml-1"
            >
              <PixelIcon name="close" className="h-2 w-2" />
            </button>
          </div>

          {/* Al 3D se entra por la isla (la tele y la cripta); desde el 3D, "atrás" vuelve */}
          <div className="flex items-center gap-1 py-[3px]">
            <button
              type="button"
              onClick={switchMode}
              disabled={mode === "2d"}
              aria-label="Volver a la isla 2D"
              title="volver a la isla 2D"
              className="ts-px-btn h-7 gap-1.5 px-1.5"
            >
              <OsIcon name="back" />
              <span className="hidden sm:inline">atrás</span>
            </button>
            {mode === "2d" && (
              <button type="button" onClick={() => go(next)} aria-label={`Ir a ${next.label}`} className="ts-px-btn h-7 gap-1.5 px-1.5">
                <OsIcon name={PLACE_ICON[next.id] ?? "door"} />
                {next.name}
              </button>
            )}
            {/* Solo con el servidor de salas conectado: sin él nadie más vería el avatar */}
            {mode === "3d" && nick && HAS_ROOMS && (
              <button type="button" onClick={() => setAvatarOpen(true)} aria-haspopup="dialog" className="ts-px-btn h-7 gap-1.5 px-1.5">
                <OsIcon name="avatar" />
                avatar
              </button>
            )}
            <AddressBar address={address} icon={PLACE_ICON[here.id] ?? "door"} onGo={goTo} />
          </div>

          <SocialLinks className="pb-[3px] short:hidden" />
        </header>

        {/* La página: los dos mundos, el logo y la ventana del chat */}
        <div className="ts-well min-h-0 flex-1">
          <div className="relative h-full w-full overflow-hidden bg-black text-white">
            <div className={mode === "2d" ? "absolute inset-0" : "hidden"}>
              <AsciiWorld scene={scene} active={powered && mode === "2d"} onPortal={onPortal} onClima={setClima} />
            </div>
            {has3d && (
              <div className={mode === "3d" ? "absolute inset-0" : "hidden"}>
                <Ascii3D
                  active={powered && mode === "3d" && !samplerOpen && !avatarOpen}
                  nick={nick}
                  look={look}
                  scene={scene3d}
                  entry={place.entry}
                  visit={place.visit}
                  onEnter={onEnter}
                  onLeave={backToHall}
                  onAction={openSampler}
                  preload={SCENES_3D}
                  controlsClassName="bottom-3 left-3 items-start sm:inset-x-0 sm:bottom-4 sm:items-center"
                />
              </div>
            )}

            {/* El logo, chico en la esquina como el de un canal de tele: así no tapa la escena */}
            <section className="pointer-events-none absolute right-2 top-2 z-10 sm:right-3 sm:top-3">
              <h1 className="sr-only">Tropical Sadness</h1>
              <img
                src="/logo-trim.png"
                alt="Tropical Sadness 革命"
                width={634}
                height={701}
                className="logo-float h-auto w-11 select-none sm:w-14"
                draggable={false}
              />
            </section>

            {/* El vidrio de la pantalla: las líneas de barrido pasan sobre los dos mundos y el logo, y
                quedan debajo de los controles y las ventanas (z-20 en adelante) */}
            <div aria-hidden="true" className="ascii-scanlines pointer-events-none absolute inset-0 z-[15]" />

            {nick && <ChatRoom nick={nick} open={chatOpen} onOpenChange={setChatOpen} />}

            {lost !== null && (
              <div
                role="alertdialog"
                aria-labelledby="ts-lost-title"
                aria-describedby="ts-lost-text"
                onKeyDown={(e) => e.key === "Escape" && setLost(null)}
                className="ts-win ts-win--float ts-os absolute left-1/2 top-1/2 z-40 w-[min(23rem,calc(100%-1rem))] -translate-x-1/2 -translate-y-1/2"
              >
                <div className="ts-win-title ts-bold">
                  <OsIcon name="globe" />
                  <p id="ts-lost-title" className="min-w-0 flex-1 truncate">
                    dirección no encontrada
                  </p>
                  <button type="button" onClick={() => setLost(null)} aria-label="Cerrar" className="ts-win-ctl">
                    <PixelIcon name="close" className="h-2 w-2" />
                  </button>
                </div>
                <div className="flex gap-3 px-2 pb-2 pt-3">
                  <OsIcon name="error" className="h-8 w-8" />
                  <div className="min-w-0 flex-1">
                    <p id="ts-lost-text" className="break-words leading-tight">
                      no existe «{lost}». revisa cómo está escrita, o prueba con tropi://isla o tropi://3d/pasillo.
                    </p>
                    <div className="mt-3 flex justify-end">
                      <button type="button" autoFocus onClick={() => setLost(null)} className="ts-px-btn h-7 min-w-24 px-3">
                        aceptar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <footer className="ts-os flex shrink-0 gap-0.5 pt-[3px] short:hidden">
          <p role="status" className="ts-inset flex h-[22px] min-w-0 flex-1 items-center px-1.5">
            <span className="truncate">{status}</span>
          </p>
          <p className="ts-inset flex h-[22px] shrink-0 items-center px-2">{mode}</p>
        </footer>
      </div>

      {/* La barra de tareas: la radio a la izquierda; el chat y la hora a la derecha */}
      <div className="ts-taskbar ts-os">
        <MusicBar ref={radioRef} silenced={inStudio} />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {nick && <ChatToggle open={chatOpen} onClick={() => setChatOpen((o) => !o)} />}
          <Clock />
        </div>
      </div>

      {inStudio && samplerOpen && <Sampler onMinimize={() => setSamplerOpen(false)} onLeave={backToHall} />}

      {avatarOpen && nick && (
        <AvatarCreator
          nick={nick}
          initial={look}
          onClose={closeAvatar}
          onSave={(l) => {
            saveLook(l)
            pushProfile(true)
            setAvatarOpen(false)
          }}
        />
      )}

      {saved === "" && (
        <RadioGate
          onConnect={(n) => {
            // connect() va primero y dentro del click, así el navegador deja arrancar el audio
            tuned.current = true
            radioRef.current?.connect()
            saveNick(n)
            pushProfile()
          }}
        />
      )}

      <StaticBurst ref={burstRef} />
    </main>
  )
}
