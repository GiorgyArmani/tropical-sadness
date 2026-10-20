"use client"

// Motor ASCII en 3D: la GPU dibuja la escena con raymarching a una imagen chiquita
// (un píxel por celda) y cada píxel se vuelve un carácter: la luz elige qué tan lleno es,
// los bordes de profundidad eligen la dirección del trazo.
//
// Las piezas del motor están en engine/: shader (armar y compilar), camera (dónde está, qué mira y
// la foto en ASCII), ascii (la película que revela la foto en caracteres) y lighting (luces
// dinámicas). Este componente las junta con el juego: el laberinto, el susto y las transiciones.
//
// El zoom es un "dolly zoom": alejado, el lente es casi plano y todo se ve 2D; al acercarse el
// lente se abre, aparece la profundidad, y al final la cámara entra en el espacio.

import { useEffect, useImperativeHandle, useRef, type PointerEvent as ReactPointerEvent, type Ref } from "react"
import { clamp, hash, rgb } from "../ascii/math"
import PixelIcon, { type PixelIconName } from "../PixelIcon"
import { createLiveSky } from "./live"
import { AsciiFilm } from "./engine/ascii"
import { Camera, dolly, sub, GLSL_CAMERA, type V3 } from "./engine/camera"
import { GLSL_LIGHTING, LightRig } from "./engine/lighting"
import { createShaderCache, fullscreenTriangle, GLSL_HEADER, GLSL_LIB, GLSL_RAYMARCH } from "./engine/shader"
import { DOOR_GAP, DOORS, kindAt, sideOf, type Entry } from "./maze"
import { createSfx } from "./sfx"
import type { Scene3D } from "./scenes"

const FPS = 30
const ZOOM_MAX = 1.8 // de 1 a 1.8 la cámara ya no abre el lente: avanza hacia adentro
// Con el zoom al mínimo el lente es casi ortográfico (5°); al máximo, gran angular
const LENS = { fovFlat: 5, fovWide: 80, zoomMax: ZOOM_MAX }
const OUT_MS = 550 // al irse: la cámara se mete de golpe y todo se vuelve estática
const IN_MS = 1000 // al llegar: la estática se disuelve y el lente se abre desde plano
const ENTRY_ZOOM = 0.35

// Uniforms del mundo de este juego: el cielo en vivo, el laberinto y el susto
const GLSL_WORLD = /* glsl */ `
// Cielo y clima en vivo (colores de 0 a 1)
uniform vec3 uSkyTop;
uniform vec3 uSkyHor;
uniform vec3 uSkyCloud;
uniform float uLight;
uniform float uStars;
uniform vec3 uSunDir;
uniform vec3 uLightCol;
uniform float uClouds;
uniform float uRain;
uniform float uFlash;
// Laberinto: nivel del pasillo, número de la puerta que se abre y cuánto (0 cerrada, 1 abierta)
uniform float uLevel;
uniform float uDoor;
uniform float uOpen;
// Susto: dónde está el demonio (xyz) y si está (w), hacia dónde mira, y cuánto se apagan las luces
uniform vec4 uScare;
uniform float uScareA;
uniform float uDim;
// La aparición al fondo del pasillo: x = segundos desde que apareció (-1 = no está), y = qué es
// (0 demonio, 1 un par de ojos, 2 varios)
uniform vec2 uAppear;
`

const buildShader = (glsl: string) => GLSL_HEADER + GLSL_CAMERA + GLSL_WORLD + GLSL_LIGHTING + GLSL_LIB + glsl + GLSL_RAYMARCH

type GL = WebGLRenderingContext

// La puerta que se tiene al lado en el pasillo (para mostrar "entrar")
export type NearDoor = { door: number; kind: number }
export type Ascii3DHandle = { open: () => void }

type Props = {
  scene: Scene3D
  controlsClassName?: string // dónde van los controles de zoom (para no chocar con la radio)
  preload?: Scene3D[] // escenas que se preparan de antemano, así el cambio no se traba
  // Laberinto: dónde se aparece al entrar al pasillo, y un número que cambia en cada viaje
  // (de un pasillo a otro la escena es la misma, así que el número es lo que avisa que hay que viajar)
  entry?: Entry
  visit?: number
  onNear?: (door: NearDoor | null) => void
  onEnter?: (kind: number, from: Entry) => void // se cruzó una puerta del pasillo
  onLeave?: () => void // se llegó al final de una escena que sale (la puerta de arriba de la escalera)
  // false = montado pero en pausa (mientras se ve el 2D): no dibuja, solo termina de preparar shaders
  active?: boolean
  ref?: Ref<Ascii3DHandle>
}

const OPEN_MS = 1300 // la puerta se abre, la cámara gira y entra
const CLOSE_MS = 1500 // al llegar: se ve la puerta cerrándose y la cámara vuelve a mirar el pasillo
const NEAR_M = 1.8 // a cuántos metros de una puerta se la puede abrir
const EXIT_NEAR = 3.2 // a cuántos metros de la puerta de salida aparece "volver al pasillo"
const PASS_M = 1.6 // cuánto hay que seguir empujando para pasar de largo una puerta con luz

const SCARE_GRAB = 0.6 // metros que te jala hacia el demonio
const SCARE_SHOVE = 2 // metros que después te avienta para atrás (desde donde te jaló)

// Cruceta (compu): cuánto se mueve y gira cada 40 ms con la flecha apretada
// (0.05 de avance son 30 cm caminando: unos 7 m/s; 12 px de giro, unos 1.5 rad/s)
const DPAD_MOVE = 0.05
const DPAD_TURN = 12
// Joystick (celular): a fondo, cuánto avanza y gira por segundo (lo mismo que la cruceta)
// (1.25 de avance por segundo son unos 7 m/s caminando; 300 px de giro, unos 1.5 rad/s)
const PAD_MOVE = 1.25
const PAD_TURN = 300

const HOLD_MAX = 2500

// Que los sustos sean esporádicos: [mínimo, + al azar hasta], en ms (susto) o segundos (aparición)
const SCARE_FIRST = [50000, 50000] // el primer susto, después de llegar al pasillo
const SCARE_GAP = [150000, 100000] // entre un susto y el siguiente
const SCARE_ODDS = 1 / 130 // ya habilitado, la chance por segundo de que se corten las luces
const SCARE_TURN = 0.5 // ya habilitado, la chance de que esté atrás al darse la vuelta
const APP_FIRST = [50, 50] // la primera aparición al fondo
const APP_GAP = [100, 100] // entre una aparición y la siguiente
const APP_DARK = 0.85 // cuánta luz pierde el pasillo durante la aparición (el corte de luz pierde 0.65)
const APP_SECS = 4.5 // cuánto se queda // si el shader nuevo no termina en este tiempo, se espera de una

export default function Ascii3D({
  scene,
  controlsClassName = "inset-x-0 bottom-6 items-center",
  preload = [],
  entry,
  visit = 0,
  onNear,
  onEnter,
  onLeave,
  active = true,
  ref,
}: Props) {
  const preloadRef = useRef(preload)
  const activeRef = useRef(active)
  const wakeRef = useRef(false) // volvió a verse: hay que medir la pantalla de nuevo
  const wantVisit = useRef({ visit, entry }) // el viaje pedido (se lee junto con la escena)
  const calls = useRef({ onNear, onEnter, onLeave })
  const openReq = useRef(false) // se pidió abrir la puerta de al lado
  const lockRef = useRef(false) // mientras una puerta se abre o se cierra no se camina
  useImperativeHandle(ref, () => ({ open: () => void (openReq.current = true) }))
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glowRef = useRef<HTMLCanvasElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const wantRef = useRef(scene) // la escena pedida; el motor la muestra cuando termina la transición
  const sceneRef = useRef(scene) // la escena que se está dibujando
  // La cámara vive entre renders: los botones y los gestos le piden adónde mirar (want)
  // (se crea al montar, en el efecto del motor)
  const camRef = useRef<Camera | null>(null)
  const failRef = useRef<HTMLParagraphElement>(null)
  const doorBtnRef = useRef<HTMLButtonElement>(null) // "abrir puerta", que el motor pone encima de la puerta
  const exitBtnRef = useRef<HTMLButtonElement>(null) // "volver al pasillo", sobre la puerta de cada escena

  useEffect(() => {
    wantRef.current = scene
    wantVisit.current = { visit, entry }
  }, [scene, visit, entry])
  useEffect(() => {
    calls.current = { onNear, onEnter, onLeave }
  }, [onNear, onEnter, onLeave])
  useEffect(() => {
    if (active && !activeRef.current) wakeRef.current = true
    activeRef.current = active
  }, [active])

  const walkRef = useRef(0) // metros recorridos en las escenas para caminar
  // Las puertas con luz frenan: al llegar a una, se queda parado frente a ella. Para seguir hay que
  // empujar un poco más (PASS_M), o volver por donde se vino. held/passed son números de puerta sin dar
  // la vuelta; dir es el sentido en que se venía caminando (1 hacia -z, -1 hacia +z).
  const stopRef = useRef<{ held: number | null; passed: number | null; push: number; prev: number; dir: number }>({
    held: null,
    passed: null,
    push: 0,
    prev: 0,
    dir: 1,
  })
  const zoomBy = (d: number) => {
    // En las escenas para caminar la rueda no acerca: camina hacia donde se mira. Dándose la vuelta se
    // camina de verdad hacia atrás (mirando para allá), no en reversa.
    if (sceneRef.current.camera.walk) {
      if (lockRef.current) return
      const f = Math.cos(camRef.current?.want.yaw ?? 0)
      const m = d * 6 * (f < 0 ? -1 : 1) * Math.max(Math.abs(f), 0.3)
      const st = stopRef.current
      if (st.held !== null) {
        const onward = Math.sign(m) === st.dir
        if (onward) {
          st.push += Math.abs(m)
          if (st.push < PASS_M) return
          walkRef.current += st.dir * 0.6 // pasa de largo
        }
        st.passed = st.held
        st.held = null
        if (onward) return
      }
      walkRef.current += m
    } else {
      const w = camRef.current?.want
      if (w) w.zoom = clamp(w.zoom + d, 0, ZOOM_MAX)
    }
  }
  // Girar la vista (lo usan las flechas de costado de la cruceta); el motor lo conecta al montar
  const lookRef = useRef<(dx: number, dy: number) => void>(() => {})
  const turnAround = () => {
    if (!lockRef.current && camRef.current) camRef.current.want.yaw += Math.PI
  }

  useEffect(() => {
    const canvas = canvasRef.current!
    const glowCanvas = glowRef.current!
    const layer = layerRef.current!
    const gl = document.createElement("canvas").getContext("webgl", { premultipliedAlpha: false, antialias: false, alpha: true }) as GL | null
    if (!gl) {
      if (failRef.current) failRef.current.hidden = false
      return
    }
    fullscreenTriangle(gl)
    let hitch = false // este cuadro terminó un shader: no cuenta para la calidad automática
    const shaders = createShaderCache(gl, buildShader, () => (hitch = true))
    const { request, ready, parallel } = shaders
    const camera = new Camera()
    camera.reset(sceneRef.current.camera.yaw, sceneRef.current.camera.pitch)
    camRef.current = camera
    const rig = new LightRig()
    // Precarga: con compilación en paralelo se piden todas juntas; sin ella, una por vez y con calma
    let preloadAt = performance.now() + 1500
    const warmNext = (now: number) => {
      if (now < preloadAt) return
      // La hoja de estática se hace en un rato libre (tarda)
      if (film.warm()) {
        hitch = true
        preloadAt = now + 150
        return
      }
      const rest = preloadRef.current.filter((s) => !shaders.has(s.id))
      if (!rest.length) return
      if (parallel) {
        rest.forEach(request)
        rest.forEach((s) => ready(s, false))
        preloadAt = now + 200
      } else {
        ready(rest[0], true)
        preloadAt = now + 900
      }
    }
    const liveSky = createLiveSky()

    let frame = 0
    let last = -Infinity
    // Calidad automática (la película agranda o achica la letra): se revisa cada 2 segundos
    let cost = 0
    let costAt = performance.now()
    let walk = 0
    // Transición: "out" se mete en la escena actual, "in" aparece la nueva desde plano
    let phase: { kind: "in" | "out" | "none"; at: number } = { kind: "in", at: performance.now() }
    camera.want.zoom = ENTRY_ZOOM
    // Laberinto
    let level = wantVisit.current.entry?.level ?? 0
    let shownVisit = wantVisit.current.visit
    let door: { n: number; side: number; kind: number; type: "open" | "close"; at: number; fired: boolean } | null = null
    let nearKey = ""
    let nearAt: { n0: number; side: number } | null = null // la puerta de al lado, para poner el botón encima
    let btnShown = false
    // Jumpscare del pasillo: a veces el demonio está detrás de quien se da la vuelta, o se cortan las luces
    // y al volver lo tiene en la cara. dark = ms a oscuras antes; pos/ang se fijan cuando aparece.
    // behind: salió detrás (te jala y te avienta fuerte); side: para qué lado se ladea la cabeza
    let scare: { at: number; dark: number; pos: V3 | null; ang: number; behind: boolean; side: number } | null = null
    let scareReady = Infinity // antes de esto no hay susto (se arma al llegar al pasillo)
    let facingSign = 1 // hacia dónde se miraba la última vez que se miró derecho por el pasillo
    const sfx = createSfx() // el chillido del susto, la aparición y las puertas
    // La aparición al fondo del pasillo es esporádica (si no, no deja disfrutar el recorrido)
    let appAt = -Infinity // segundo en que empezó la última (en el reloj t)
    let appNext = Infinity // cuándo puede salir la próxima
    let appKind = 0 // 0 demonio, 1 un par de ojos, 2 varios
    let exitShown = false
    let exited = false // ya se salió por el final (escalera)
    const report = (d: NearDoor | null) => {
      const key = d ? `${level}:${d.door}` : ""
      if (key === nearKey) return
      nearKey = key
      calls.current.onNear?.(d)
    }
    const arrive = (now: number, sc: Scene3D) => {
      const e = wantVisit.current.entry
      level = e?.level ?? 0
      exited = false
      door = null
      if (sc.camera.walk?.start) walk = walkRef.current = sc.camera.walk.start
      stopRef.current = { held: null, passed: null, push: 0, prev: walk, dir: 1 }
      scare = null
      facingSign = 1
      // Recién llegado al pasillo hay un rato de calma antes del primer susto
      scareReady = sc.camera.doors ? now + SCARE_FIRST[0] + Math.random() * SCARE_FIRST[1] : Infinity
      appNext = sc.camera.doors ? (now - start) / 1000 + APP_FIRST[0] + Math.random() * APP_FIRST[1] : Infinity
      if (sc.camera.walk && sc.camera.doors && e) {
        // Se aparece justo frente a la puerta por la que se vuelve, mirándola mientras se cierra
        walk = walkRef.current = e.door * DOOR_GAP
        stopRef.current = { held: null, passed: e.door, push: 0, prev: walk, dir: 1 } // esa no frena al salir
        door = { n: e.door, side: sideOf(e.door), kind: kindAt(level, e.door), type: "close", at: now, fired: false }
      }
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    // En el celular (sobre todo Android) la pantalla muestra más oscuro: se abre más la luz
    const phone = window.matchMedia("(pointer: coarse)").matches || /Android/i.test(navigator.userAgent)
    const phoneBoost = phone ? 1.3 : 1
    rig.shadows = !phone // las sombras suaves cuestan: en el celular no
    // La película de la cámara: donde la foto se revela en ASCII
    const film = new AsciiFilm(canvas, glowCanvas, phone)
    const start = performance.now()

    const resize = () => film.resize()

    const draw = (now: number) => {
      const t = (now - start) / 1000
      const traveling = wantRef.current.id !== sceneRef.current.id || wantVisit.current.visit !== shownVisit
      if (traveling && phase.kind !== "out") {
        // Si se pide otra escena mientras la anterior todavía aparece, la estática sigue desde
        // donde estaba en vez de volver a cero (antes se veía un destello de la escena limpia)
        const left = phase.kind === "in" ? 1 - clamp((now - phase.at) / IN_MS, 0, 1) : 0
        phase = { kind: "out", at: now - left * OUT_MS }
      }
      let rush = 0
      let staticAmt = 0
      if (phase.kind === "out") {
        const p = clamp((now - phase.at) / OUT_MS, 0, 1)
        rush = p * p * 0.9
        staticAmt = p
        // La escena nueva empieza a compilarse apenas se pide; se pasa recién cuando está lista,
        // y mientras tanto la estática queda llena en vez de congelar la página
        const nextScene = wantRef.current
        request(nextScene)
        if (p >= 1 && !traveling) phase = { kind: "in", at: now } // se arrepintió: vuelve
        else if (p >= 1 && ready(nextScene, now - phase.at > HOLD_MAX || !parallel)) {
          sceneRef.current = nextScene
          // La escena nueva cuesta distinto: la calidad automática empieza a medir de cero
          cost = 0
          costAt = now
          camera.reset(nextScene.camera.yaw, nextScene.camera.pitch, 0, ENTRY_ZOOM)
          walk = 0
          walkRef.current = 0
          shownVisit = wantVisit.current.visit
          report(null)
          arrive(now, nextScene)
          phase = { kind: "in", at: now }
        }
      } else if (phase.kind === "in") {
        const p = clamp((now - phase.at) / IN_MS, 0, 1)
        staticAmt = 1 - p
        if (p >= 1) phase = { kind: "none", at: now }
      } else warmNext(now)
      const sc = sceneRef.current
      const cam = sc.camera
      // La primera escena: con compilación en paralelo no se congela la página esperándola,
      // se muestra estática hasta que esté (y la entrada empieza recién ahí)
      if (!ready(sc, !parallel || now - start > HOLD_MAX)) {
        film.clear()
        film.drawStatic(1, Math.floor(now / 50))
        if (phase.kind === "in") phase.at = now
        return
      }
      const program = shaders.get(sc.id)
      if (!program) return

      // Cámara suavizada hacia lo que pide el visitante
      camera.smooth()
      const { yaw, pitch } = camera
      const drift = reduced || cam.walk ? 0 : Math.sin(t * 0.07) * 0.06
      const { tan, dist } = dolly(camera.zoom + rush, cam.frame, LENS)
      const a = yaw + drift
      let ax = 0 // corrimiento de costado: entrar por una puerta
      let face = a
      let open = 0
      nearAt = null
      if (cam.walk) {
        const L = cam.walk.loop
        // Laberinto: la puerta de al lado, abrirla, y la animación de abrir o cerrar
        if (cam.doors) {
          // ¿Se cruzó una puerta con luz desde el cuadro anterior? Entonces frena ahí
          const st = stopRef.current
          const target = walkRef.current
          if (st.passed !== null && Math.abs(target - st.passed * DOOR_GAP) > 3) st.passed = null
          // (en los dos sentidos: dándose la vuelta también se frena en las puertas de atrás)
          if (st.held === null && !door && phase.kind === "none" && target !== st.prev) {
            const dir = target > st.prev ? 1 : -1
            const first = dir > 0 ? Math.ceil(st.prev / DOOR_GAP) : Math.floor(st.prev / DOOR_GAP)
            for (let c = first; dir > 0 ? c * DOOR_GAP <= target : c * DOOR_GAP >= target; c += dir) {
              if (c !== st.passed && kindAt(level, c) > 0) {
                st.held = c
                st.dir = dir
                st.push = 0
                walkRef.current = c * DOOR_GAP
                break
              }
            }
          }
          st.prev = walkRef.current
          const n0 = st.held ?? Math.round(walk / DOOR_GAP)
          const n = ((n0 % DOORS) + DOORS) % DOORS
          const kind = kindAt(level, n)
          const near = !door && phase.kind === "none" && Math.abs(walk - n0 * DOOR_GAP) < NEAR_M && kind > 0
          report(near ? { door: n, kind } : null)
          nearAt = near ? { n0, side: sideOf(n) } : null
          if (openReq.current && near) {
            door = { n, side: sideOf(n), kind, type: "open", at: now, fired: false }
            sfx.door()
          }
          openReq.current = false
          if (door) {
            const ease = (x: number) => x * x * (3 - 2 * x)
            // Girar para mirar la puerta, por el lado más corto (se puede venir mirando para cualquier lado)
            const raw = -door.side * Math.PI * 0.5
            const toDoor = a + (((raw - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI
            if (door.type === "open") {
              const p = clamp((now - door.at) / OPEN_MS, 0, 1)
              open = ease(clamp(p * 1.4, 0, 1))
              face = a + (toDoor - a) * ease(clamp(p * 2, 0, 1))
              ax = door.side * ease(clamp((p - 0.45) / 0.55, 0, 1)) * 1.5 + door.side * rush * 2
              walkRef.current = walk = walk + (Math.round(walk / DOOR_GAP) * DOOR_GAP - walk) * 0.2
              if (p >= 1 && !door.fired) {
                door.fired = true
                calls.current.onEnter?.(door.kind, { level, door: door.n })
              }
            } else {
              const p = clamp((now - door.at - IN_MS * 0.4) / CLOSE_MS, 0, 1)
              open = 1 - ease(p)
              // El chirrido y el golpe, a tiempo con la puerta que se cierra detrás
              if (p >= 0.25 && !door.fired) {
                door.fired = true
                sfx.door(true)
              }
              face = toDoor + (a - toDoor) * ease(clamp((p - 0.2) / 0.8, 0, 1))
              if (p >= 1) door = null
            }
          }
        }
        // Solo se deja de caminar mientras una puerta del pasillo se abre o se cierra
        lockRef.current = !!cam.doors && !!door
        // Primera persona: se avanza solo, despacito, y la rueda empuja; cerca de una puerta con luz se frena
        // Frente a una puerta con luz se queda quieto, esperando
        // (hacia donde se mira: si se mira la pared no se avanza, si se mira atrás se va para atrás)
        if (!reduced && !lockRef.current && stopRef.current.held === null) walkRef.current += (cam.walk.drift / FPS) * Math.cos(yaw)
        walk += (walkRef.current - walk) * 0.08
        // Al salir se empuja un poco hacia donde se mira (antes eran 27 m: en la escalera daba varias vueltas y parpadeaba)
        const push = walk + rush * 3 * Math.cos(face)
        let along = (((push % L) + L) % L)
        if (cam.walk.exit) {
          // Esta escena no da la vuelta: al llegar a la puerta del final se sale (y para atrás no se baja del primer escalón)
          walkRef.current = clamp(walkRef.current, cam.walk.start ?? 0, L)
          along = clamp(push, 0, L - 0.01)
          if (walk > L - 0.3 && !exited) {
            exited = true
            calls.current.onLeave?.()
          }
        }
        const bob = reduced ? 0 : Math.sin(walk * 2.2) * 0.025
        // En la escalera se sube: la altura sigue a los escalones
        const climb = cam.walk.climb
        const lift = climb ? clamp(along / climb.run, 0, climb.steps) * climb.rise : 0
        camera.firstPerson([cam.target[0] + Math.sin(walk * 1.1) * 0.04 + ax, cam.target[1] + lift + bob, cam.target[2] - along], face, pitch, cam.walk.fov)
        // Al cruzar el final (la puerta) todo se vuelve estática y se reaparece al principio
        if (cam.walk.flash) {
          const f = cam.walk.flash
          staticAmt = Math.max(staticAmt, clamp((along - (L - f)) / f, 0, 1), clamp(1 - along / f, 0, 1))
        }
      } else camera.orbit(cam.target, a, pitch, dist, tan)
      let ro = camera.pos // el susto la sacude y la empuja
      // El susto (solo en el pasillo, y nunca con movimiento reducido)
      let scareW = 0
      let dim = 0
      if (cam.doors && !reduced) {
        const cy = Math.cos(yaw)
        // (nunca pegado a una aparición)
        if (!scare && phase.kind === "none" && !door && now > scareReady && t - appAt > 20) {
          // Se terminó de dar la vuelta: a veces estaba ahí atrás. Si no, muy de vez en cuando, se cortan las luces
          const turned = Math.abs(cy) > 0.85 && Math.sign(cy) !== facingSign
          if ((turned && Math.random() < SCARE_TURN) || Math.random() < SCARE_ODDS / FPS) {
            scare = { at: now, dark: turned ? 0 : 700, pos: null, ang: 0, behind: turned, side: Math.random() < 0.5 ? -1 : 1 }
            scareReady = now + SCARE_GAP[0] + Math.random() * SCARE_GAP[1]
          }
        }
        if (Math.abs(cy) > 0.85) facingSign = Math.sign(cy)
        if (scare) {
          const hit = now - scare.at - scare.dark
          if (hit < 0) dim = 0.65
          else {
            if (!scare.pos) {
              // Parado en el piso, a un paso, mirando a la cámara
              scare.pos = [ro[0] - Math.sin(face) * 1.35, 0, ro[2] - Math.cos(face) * 1.35]
              scare.ang = face
              sfx.scream(scare.behind ? 1 : 0.7)
            }
            // El golpe: te jala hacia él (te mete la cara) y te avienta para atrás. Si salió detrás tuyo
            // es mucho más fuerte. La cabeza se ladea, el lente se cierra y se abre de golpe.
            const sec = hit / 1000
            const power = scare.behind ? 1 : 0.45
            const eo = (x: number) => 1 - (1 - clamp(x, 0, 1)) ** 3
            const grab = eo(sec / 0.12)
            const shove = eo((sec - 0.12) / 0.45)
            const settle = 1 - eo((sec - 0.65) / 0.35) // el ladeo y el lente vuelven al final
            const fwd = (SCARE_GRAB * grab - SCARE_SHOVE * shove) * power // metros hacia el demonio (negativo = atrás)
            const kick = (sec < 0.12 ? -12 * grab : -12 + 30 * eo((sec - 0.12) / 0.25)) * power * settle
            const nod = (sec < 0.12 ? -0.08 * grab : -0.08 + 0.24 * eo((sec - 0.12) / 0.3)) * power * settle
            const roll = 0.32 * power * eo((sec - 0.1) / 0.4) * settle * scare.side
            const k = hit < 650 ? 1 - hit / 650 : 0 // temblor
            camera.firstPerson(
              [
                clamp(ro[0] - Math.sin(scare.ang) * fwd + (Math.random() - 0.5) * 0.09 * k, -1.2, 1.2),
                ro[1] + (Math.random() - 0.5) * 0.09 * k,
                ro[2] - Math.cos(scare.ang) * fwd,
              ],
              face,
              pitch + nod,
              (cam.walk?.fov ?? 72) + kick,
              roll,
            )
            ro = camera.pos
            if (hit < 650) {
              scareW = 1
              if (hit < 140) staticAmt = Math.max(staticAmt, 0.55)
            } else staticAmt = Math.max(staticAmt, clamp(1 - (hit - 650) / 350, 0, 1) * 0.9)
            if (hit > 1000) {
              // Quedas donde te aventó: el empujón pasa a ser camino recorrido (sin saltos)
              const moved = Math.cos(scare.ang) * (SCARE_GRAB - SCARE_SHOVE) * power
              walk += moved
              walkRef.current += moved
              stopRef.current.prev = walkRef.current
              scare = null
            }
          }
          nearAt = null
        }
        if (scare) lockRef.current = true // durante el susto no se camina ni se abren puertas
      }

      // La aparición al fondo del pasillo: de vez en cuando (APP_GAP), el demonio o unos ojos se asoman
      // unos segundos (APP_SECS) y suena una vez. Nunca durante el susto ni mientras se abre una puerta
      if (cam.doors && t >= appNext && phase.kind === "none" && !scare && !door) {
        appAt = t
        appKind = Math.random() < 0.5 ? 0 : Math.random() < 0.5 ? 1 : 2
        appNext = t + APP_GAP[0] + Math.random() * APP_GAP[1]
        sfx.presence(appKind === 0)
      }
      const appT = cam.doors ? t - appAt : -1 // segundos desde que apareció
      const appOn = appT >= 0 && appT <= APP_SECS
      // Mientras está, el pasillo se oscurece fuerte para que resalte (entra y sale en una rampa corta)
      if (appOn) dim = Math.max(dim, APP_DARK * clamp(appT / 0.4, 0, 1) * clamp((APP_SECS - appT) / 0.6, 0, 1))

      // Los botones de las puertas van sobre la puerta misma: se proyecta su centro a la pantalla, igual
      // que el shader. Devuelve si quedó a la vista.
      const pin = (btn: HTMLElement | null, at: V3 | null, was: boolean) => {
        let show = false
        if (btn && at) {
          const q = camera.project(at)
          if (q) {
            const sp = film.toScreen(q)
            // Si la puerta queda medio afuera, el botón se queda pegado al borde de ese lado
            const x = clamp(sp.x, 80, film.W - 80)
            const y = clamp(sp.y, 40, film.H - 40)
            btn.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`
            show = true
          }
        }
        if (btn && show !== was) btn.style.visibility = show ? "visible" : "hidden"
        return show
      }
      // En el pasillo: la puerta con luz de al lado
      btnShown = pin(
        doorBtnRef.current,
        nearAt && cam.walk ? [nearAt.side * 1.8, 1.3, ro[2] - (nearAt.n0 * DOOR_GAP - walk)] : null,
        btnShown,
      )
      // En las otras escenas: la puerta de vuelta al pasillo (no mientras se entra o se sale, ni desde atrás)
      const ex = cam.exitDoor
      let exAt: V3 | null = null
      if (ex && phase.kind === "none" && !exited) {
        const exD = sub(ex.at, ro)
        const len = Math.hypot(exD[0], exD[1], exD[2])
        const f = ex.facing
        // Solo frente a la puerta: cerca, y si tiene frente, mirándola de ese lado (no de costado ni de lejos)
        if (len <= EXIT_NEAR && !(f && -(exD[0] * f[0] + exD[1] * f[1] + exD[2] * f[2]) / len < 0.25)) exAt = ex.at
      }
      exitShown = pin(exitBtnRef.current, exAt, exitShown)

      program.use()
      program.f1("uTime", t)
      program.f1("uStart", cam.walk ? 0 : Math.max(0, dist - cam.clip))
      program.f1("uFogRef", cam.walk ? 0 : Math.max(0, dist - cam.frame * 1.5))
      camera.upload(program)
      // Luces dinámicas: la escena las arma para este cuadro
      if (sc.lights) {
        rig.set(
          sc.lights({
            t,
            cam: { pos: ro, fw: camera.fw },
            level,
            door: door && open > 0 ? { n: door.n, side: door.side, kind: door.kind, open } : null,
            scare: scareW > 0.5 && scare?.pos ? scare.pos : null,
            dim,
          }),
        )
      } else rig.clear()
      rig.upload(program)
      const sky = liveSky.read(now, t)
      // De noche se puede abrir más la exposición; de día no, o el cielo se quema
      const exposure = (sc.exposure ?? 1) * (1 + (sc.nightBoost ?? 0) * (1 - sky.light)) * phoneBoost
      const wea = sky.wea
      const dl = Math.hypot(...sky.dir)
      program.f3("uSkyTop", sky.top)
      program.f3("uSkyHor", sky.hor)
      program.f3("uSkyCloud", sky.cloud)
      program.f1("uLight", sky.light)
      program.f1("uStars", sky.stars)
      program.f3("uSunDir", [sky.dir[0] / dl, sky.dir[1] / dl, sky.dir[2] / dl])
      program.f3("uLightCol", sky.lightCol)
      program.f1("uClouds", wea.clouds)
      program.f1("uRain", wea.rain)
      program.f1("uFogW", wea.fog)
      program.f1("uFlash", sky.flash)
      program.f1("uLevel", level)
      program.f1("uDoor", door ? door.n : -1)
      program.f1("uOpen", open)
      const sp = scare?.pos ?? [0, 0, 0]
      program.f4("uScare", sp[0], sp[1], sp[2], scareW)
      program.f1("uScareA", scare?.ang ?? 0)
      program.f1("uDim", dim)
      program.f2("uAppear", appOn ? appT : -1, appKind)
      // La foto, revelada en ASCII
      const tick = Math.floor(now / 50)
      camera.shoot(program, film, { exposure, saturation: sc.saturation, grade: sc.grade, detail: sc.detail }, staticAmt, tick)
      // Lluvia por delante, solo en los espacios abiertos
      if (sc.outdoor && wea.rain > 0.02 && staticAmt < 0.5) {
        const { ctx, W, H, lh } = film
        const drops = Math.floor(film.cols * film.rows * 0.012 * wea.rain)
        const slant = 0.15 + wea.wind * 0.35
        ctx.fillStyle = rgb([190, 205, 235], 0.55 + 0.3 * sky.light)
        const ch = slant > 0.3 ? "/" : "|"
        for (let k = 0; k < drops; k++) {
          const speed = H * (1 + wea.rain * 0.6) * (0.8 + hash(k, 2) * 0.4)
          const y = (hash(k, 1) * (H + 40) + t * speed) % (H + 40)
          const x = hash(k, 3) * (W + H * slant) - y * slant
          for (let j = 0; j < 3; j++) ctx.fillText(j === 2 ? "'" : ch, x + slant * lh * j, y - lh * j)
        }
      }
      film.glow()
    }

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop)
      if (!activeRef.current) {
        // En pausa: no se dibuja nada; con compilación en paralelo se siguen preparando las escenas
        if (parallel && now >= preloadAt) {
          preloadRef.current.forEach((s) => ready(s, false))
          preloadAt = now + 500
        }
        return
      }
      if (wakeRef.current) {
        // Volvió a verse: medir de nuevo (oculto mide cero) y aparecer desde la estática
        wakeRef.current = false
        // Solo se vuelve a medir si la pantalla cambió mientras estaba oculto (si no, la estática sirve)
        if (film.stale()) resize()
        phase = { kind: "in", at: now }
        cost = 0
        costAt = now
      }
      // Con margen: a 60 o 120 Hz los refrescos llegan cada 33,33 ms y a veces una milésima antes del
      // límite exacto; sin margen ese cuadro se salteaba y la animación caía a ~20 por segundo
      if (now - last >= 1000 / FPS - 3) {
        const t0 = performance.now()
        hitch = false
        draw(now)
        const ms = performance.now() - t0
        // Los cuadros que terminaron un shader son lentos una sola vez: no deben bajar la calidad
        if (!hitch) cost = cost ? cost * 0.9 + ms * 0.1 : ms
        // Durante una transición no se cambia el tamaño de letra (se vería un salto)
        if (phase.kind === "none" && cost && now - costAt > 2000) {
          costAt = now
          film.adapt(cost)
        }
        last = now
      }
    }

    // --- Controles: arrastrar para mirar, rueda o pinza para entrar ---
    const pointers = new Map<number, { x: number; y: number }>()
    let pinch = 0
    const look = (dx: number, dy: number) => {
      camera.look(dx, dy, sceneRef.current.camera)
    }
    const onDown = (e: PointerEvent) => {
      try {
        layer.setPointerCapture(e.pointerId)
      } catch {} // algunos navegadores no dejan capturar: el gesto sigue igual
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }
    const onMove = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId)
      if (!p) return
      if (pointers.size === 2) {
        p.x = e.clientX
        p.y = e.clientY
        const [a, b] = [...pointers.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (pinch) zoomBy((d - pinch) * 0.004)
        pinch = d
        return
      }
      // En el celular, en las escenas para caminar, deslizar el dedo es como hacer scroll:
      // hacia arriba se avanza, hacia abajo se retrocede, y de costado se mira
      if (e.pointerType === "touch" && sceneRef.current.camera.walk) {
        zoomBy(-(e.clientY - p.y) * 0.005)
        look(e.clientX - p.x, 0)
      } else look(e.clientX - p.x, e.clientY - p.y)
      p.x = e.clientX
      p.y = e.clientY
    }
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      pinch = 0
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomBy(-e.deltaY * 0.0012)
    }
    const onKey = (e: KeyboardEvent) => {
      if (!activeRef.current || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const walking = !!sceneRef.current.camera.walk
      const k = e.key.toLowerCase()
      if (e.key === "+" || e.key === "=") zoomBy(0.12)
      else if (e.key === "-") zoomBy(-0.12)
      else if (e.key === "ArrowLeft" || (walking && k === "a")) look(-40, 0)
      else if (e.key === "ArrowRight" || (walking && k === "d")) look(40, 0)
      // Caminando, arriba y abajo mueven (W/S también); en las demás escenas inclinan la vista
      else if (e.key === "ArrowUp" || (walking && k === "w")) walking ? zoomBy(0.12) : look(0, -30)
      else if (e.key === "ArrowDown" || (walking && k === "s")) walking ? zoomBy(-0.12) : look(0, 30)
      else if (walking && k === "q") turnAround()
      else if (k === "e" || (e.key === "Enter" && !(e.target instanceof HTMLButtonElement))) {
        // En el pasillo abre la puerta de al lado; en las demás escenas sale por su puerta
        const cam = sceneRef.current.camera
        if (cam.doors) openReq.current = true
        else if (cam.exitDoor && k === "e" && exitShown) calls.current.onLeave?.() // solo frente a la puerta
      }
    }
    // En el celular el audio se destraba con un toque (el iPhone no deja sonar sin eso). En la compu se
    // crea recién cuando hace falta: crearlo antes cambiaba la salida de audio y la radio pegaba un salto
    window.addEventListener("touchend", sfx.unlock, { capture: true })
    // Safari en el iPhone ignora el "sin zoom" de la página: pellizcar la acercaba en vez de mover la escena
    const noGesture = (e: Event) => e.preventDefault()
    document.addEventListener("gesturestart", noGesture)
    lookRef.current = look
    layer.addEventListener("pointerdown", onDown)
    layer.addEventListener("pointermove", onMove)
    layer.addEventListener("pointerup", onUp)
    layer.addEventListener("pointercancel", onUp)
    layer.addEventListener("wheel", onWheel, { passive: false })
    window.addEventListener("keydown", onKey)

    resize()
    window.addEventListener("resize", resize)
    frame = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(frame)
      liveSky.stop()
      sfx.close()
      window.removeEventListener("resize", resize)
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("touchend", sfx.unlock, { capture: true })
      document.removeEventListener("gesturestart", noGesture)
      layer.removeEventListener("pointerdown", onDown)
      layer.removeEventListener("pointermove", onMove)
      layer.removeEventListener("pointerup", onUp)
      layer.removeEventListener("pointercancel", onUp)
      layer.removeEventListener("wheel", onWheel)
      gl.getExtension("WEBGL_lose_context")?.loseContext()
    }
  }, [])

  return (
    <>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <canvas ref={glowRef} className="absolute inset-0 h-full w-full opacity-45 mix-blend-screen blur-md" />
        <div className="ascii-scanlines absolute inset-0" />
      </div>
      <div ref={layerRef} aria-hidden="true" className="absolute inset-0 cursor-grab touch-none select-none active:cursor-grabbing" />
      <p ref={failRef} hidden className="absolute inset-x-0 top-1/2 text-center font-mono text-xs text-white/60">
        este navegador no puede dibujar en 3d
      </p>
      {/* Siempre montado (el motor lo muestra y lo mueve); solo aparece al lado de una puerta con luz */}
      <button
        ref={doorBtnRef}
        type="button"
        onClick={() => void (openReq.current = true)}
        aria-label="Abrir la puerta"
        style={{ position: "absolute", left: 0, top: 0, visibility: "hidden" }}
        className="ts-px-btn ts-px-btn--primary pointer-events-auto z-20 h-6 gap-1.5 px-2 font-mono text-[10px] uppercase tracking-[0.15em] will-change-transform"
      >
        abrir puerta
        <PixelIcon name="right" className="h-2.5 w-2.5" />
      </button>
      <button
        ref={exitBtnRef}
        type="button"
        onClick={() => calls.current.onLeave?.()}
        aria-label="Volver al pasillo por la puerta"
        style={{ position: "absolute", left: 0, top: 0, visibility: "hidden" }}
        className="ts-px-btn ts-px-btn--primary pointer-events-auto z-20 h-6 gap-1.5 px-2 font-mono text-[10px] uppercase tracking-[0.15em] will-change-transform"
      >
        volver al pasillo
        <PixelIcon name="right" className="h-2.5 w-2.5" />
      </button>

      <div className={`pointer-events-none absolute z-20 flex flex-col gap-2 ${controlsClassName}`}>
        {/* En la compu, cruceta: arriba avanza, abajo retrocede (o acerca y aleja) y a los costados gira;
            mantener apretado sigue moviendo. En el celular, joystick: se arrastra con el pulgar sin soltar
            (tocar botón por botón hacía que el dedo resbalara a la página y la recargara). */}
        <div className="flex items-end gap-3">
          <div className="grid grid-cols-3 gap-1 pointer-coarse:hidden">
            <span />
            <HoldButton icon="up" label={scene.camera.walk ? "Avanzar" : "Acercarse"} onStep={() => zoomBy(DPAD_MOVE)} onTap={() => zoomBy(0.2)} />
            <span />
            <HoldButton icon="left" label="Girar a la izquierda" onStep={() => lookRef.current(-DPAD_TURN, 0)} onTap={() => lookRef.current(-40, 0)} />
            <HoldButton icon="down" label={scene.camera.walk ? "Retroceder" : "Alejarse"} onStep={() => zoomBy(-DPAD_MOVE)} onTap={() => zoomBy(-0.2)} />
            <HoldButton icon="right" label="Girar a la derecha" onStep={() => lookRef.current(DPAD_TURN, 0)} onTap={() => lookRef.current(40, 0)} />
          </div>
          <Joystick
            label={scene.camera.walk ? "Joystick: arriba avanza, abajo retrocede, a los lados gira" : "Joystick: arriba acerca, abajo aleja, a los lados gira"}
            onMove={(x, y, dt) => {
              if (y) zoomBy(-y * PAD_MOVE * dt)
              if (x) lookRef.current(x * PAD_TURN * dt, 0)
            }}
          />
          {scene.camera.walk && (
            <button
              type="button"
              onClick={turnAround}
              className="ts-px-btn pointer-events-auto h-8 px-2 font-mono text-[10px] uppercase tracking-[0.15em]"
              aria-label="Darse la vuelta"
            >
              vuelta
            </button>
          )}
        </div>
      </div>
    </>
  )
}

// Un botón de la cruceta: un toque da un paso (onTap); mantenerlo apretado repite onStep sin parar
function HoldButton({ icon, label, onStep, onTap }: { icon: PixelIconName; label: string; onStep: () => void; onTap: () => void }) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const held = useRef(false) // ya se movió manteniendo: al soltar no suma el paso del toque
  const stop = () => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
  }
  useEffect(() => stop, [])
  return (
    <button
      type="button"
      aria-label={label}
      className="ts-px-btn pointer-events-auto h-8 w-8 touch-none select-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        held.current = false
        stop()
        // Si se mantiene más de un instante, empieza a repetir
        timer.current = setInterval(() => {
          held.current = true
          onStep()
        }, 40)
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onClick={() => {
        if (!held.current) onTap() // un toque corto (o Enter / espacio con el teclado): un paso
        held.current = false
      }}
    >
      <PixelIcon name={icon} className="h-3 w-3" />
    </button>
  )
}

// Joystick: mientras el dedo lo arrastra, llama a onMove en cada cuadro con x, y entre -1 y 1
// (y positivo hacia abajo) y los segundos que pasaron. Al soltar, la perilla vuelve al centro.
const PAD_R = 34 // px que puede alejarse la perilla del centro
const PAD_DEAD = 0.15 // zona muerta en el centro, para que un dedo quieto no camine solo

function Joystick({ label, onMove }: { label: string; onMove: (x: number, y: number, dt: number) => void }) {
  const knobRef = useRef<HTMLSpanElement>(null)
  const move = useRef(onMove)
  useEffect(() => {
    move.current = onMove
  })
  const drag = useRef<{ id: number; cx: number; cy: number; x: number; y: number } | null>(null)
  const frame = useRef(0)
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const curve = (v: number) => {
    // Fuera de la zona muerta, suave al principio y rápido a fondo
    const a = Math.max(0, (Math.abs(v) - PAD_DEAD) / (1 - PAD_DEAD))
    return Math.sign(v) * a * a
  }
  const tick = (prev: number) => (now: number) => {
    const d = drag.current
    if (!d) return
    const dt = Math.min((now - prev) / 1000, 0.1)
    move.current(curve(d.x), curve(d.y), dt)
    frame.current = requestAnimationFrame(tick(now))
  }
  const place = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    let dx = e.clientX - d.cx
    let dy = e.clientY - d.cy
    const len = Math.hypot(dx, dy)
    if (len > PAD_R) {
      dx = (dx / len) * PAD_R
      dy = (dy / len) * PAD_R
    }
    d.x = dx / PAD_R
    d.y = dy / PAD_R
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`
  }
  const release = (e: ReactPointerEvent) => {
    if (drag.current?.id !== e.pointerId) return
    drag.current = null
    cancelAnimationFrame(frame.current)
    if (knobRef.current) knobRef.current.style.transform = ""
  }

  return (
    <div
      role="application"
      aria-label={label}
      className="ts-px-btn pointer-events-auto relative hidden h-24 w-24 touch-none select-none rounded-full pointer-coarse:inline-flex"
      onPointerDown={(e) => {
        if (drag.current) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        const r = e.currentTarget.getBoundingClientRect()
        drag.current = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2, x: 0, y: 0 }
        place(e)
        cancelAnimationFrame(frame.current)
        frame.current = requestAnimationFrame(tick(performance.now()))
      }}
      onPointerMove={place}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      {/* Marcas de las cuatro direcciones */}
      <PixelIcon name="up" className="absolute left-1/2 top-1.5 h-2 w-2 -translate-x-1/2 opacity-40" />
      <PixelIcon name="down" className="absolute bottom-1.5 left-1/2 h-2 w-2 -translate-x-1/2 opacity-40" />
      <PixelIcon name="left" className="absolute left-1.5 top-1/2 h-2 w-2 -translate-y-1/2 opacity-40" />
      <PixelIcon name="right" className="absolute right-1.5 top-1/2 h-2 w-2 -translate-y-1/2 opacity-40" />
      <span
        ref={knobRef}
        className="absolute left-1/2 top-1/2 -ml-5 -mt-5 h-10 w-10 rounded-full bg-white/80 shadow-[0_0_0_1px_rgba(0,0,0,0.8)] transition-transform duration-75 ease-out"
      />
    </div>
  )
}
