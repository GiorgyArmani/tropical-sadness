"use client"

// Motor ASCII en 3D: la GPU dibuja la escena con raymarching a una imagen chiquita
// (un píxel por celda) y cada píxel se vuelve un carácter: la luz elige qué tan lleno es,
// los bordes de profundidad eligen la dirección del trazo.
//
// El zoom es un "dolly zoom": alejado, el lente es casi plano y todo se ve 2D; al acercarse el
// lente se abre, aparece la profundidad, y al final la cámara entra en el espacio.

import { useEffect, useImperativeHandle, useRef, type Ref } from "react"
import { clamp, dirChar, hash, ramp, rgb } from "../ascii/math"
import PixelIcon from "../PixelIcon"
import { createLiveSky } from "./live"
import { DOOR_GAP, DOORS, kindAt, sideOf, type Entry } from "./maze"
import type { Scene3D } from "./scenes"

const FPS = 30
const FONT_PX = 8 // letra chica: más celdas, más detalle
const MAX_CELLS = 70000
const FOV_FLAT = 5 // grados con el zoom al mínimo: casi ortográfico
const FOV_WIDE = 80
const ZOOM_MAX = 1.8 // de 1 a 1.8 la cámara ya no abre el lente: avanza hacia adentro
const RAMP = " .,:;-=+*#%@"

// La paleta de la isla: de la sombra a la luz, azul profundo -> violeta -> rosa -> naranja -> arena
const GRADE: [number, number, number][] = [
  [16, 30, 92],
  [96, 40, 150],
  [235, 80, 170],
  [255, 150, 70],
  [255, 228, 120],
]
const gradeAt = (v: number): [number, number, number] => {
  const x = clamp(v, 0, 0.999) * (GRADE.length - 1)
  const i = Math.floor(x)
  const f = x - i
  const a = GRADE[i]
  const b = GRADE[i + 1]
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
}
const STATIC_TONES = [0.45, 0.7, 0.95].map((a) => rgb([200, 205, 215], a))
const STATIC_PAD = 8 // la hoja de estática tiene 8 celdas de más: se corre al azar y parece otra
const OUT_MS = 550 // al irse: la cámara se mete de golpe y todo se vuelve estática
const IN_MS = 1000 // al llegar: la estática se disuelve y el lente se abre desde plano
const ENTRY_ZOOM = 0.35

const PRELUDE = /* glsl */ `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uRo;
uniform vec3 uFw;
uniform vec3 uRt;
uniform vec3 uUp;
uniform float uTan;
uniform float uAspect;
uniform float uStart;
uniform float uFogRef;
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
uniform float uFogW;
uniform float uFlash;
// Laberinto: nivel del pasillo, número de la puerta que se abre y cuánto (0 cerrada, 1 abierta)
uniform float uLevel;
uniform float uDoor;
uniform float uOpen;

float hash1(float n) { return fract(sin(n) * 43758.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm2(vec2 p) { return noise2(p) * 0.55 + noise2(p * 2.03) * 0.28 + noise2(p * 4.01) * 0.17; }
float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a;
  vec3 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
float sdEllipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / k1;
}
vec2 opU(vec2 a, vec2 b) { return a.x < b.x ? a : b; }
`

const MAIN = /* glsl */ `
// Normal con 4 muestras (tetraedro) en vez de 6
vec3 calcNormal(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  const float h = 0.002;
  return normalize(k.xyy * map(p + k.xyy * h).x + k.yyx * map(p + k.yyx * h).x + k.yxy * map(p + k.yxy * h).x + k.xxx * map(p + k.xxx * h).x);
}
float calcAO(vec3 p, vec3 n) {
  float o = 0.0;
  float s = 1.0;
  for (int i = 1; i <= 3; i++) {
    float h = 0.08 * float(i * i);
    o += (h - map(p + n * h).x) * s;
    s *= 0.6;
  }
  return clamp(1.0 - o * 1.6, 0.0, 1.0);
}
void main() {
  vec2 uv = vec2((gl_FragCoord.x - 0.5 * uRes.x) * uAspect, gl_FragCoord.y - 0.5 * uRes.y) / uRes.y;
  vec3 rd = normalize(uFw + (uv.x * uRt + uv.y * uUp) * 2.0 * uTan);
  float t = uStart;
  float m = -1.0;
  // Si el corte de maqueta cae adentro de algo sólido, primero sale de ahí
  bool outside = map(uRo + rd * t).x > 0.0;
  for (int i = 0; i < 96; i++) {
    vec2 h = map(uRo + rd * t);
    if (outside && h.x < 0.002 * (1.0 + t - uStart)) { m = h.y; break; }
    if (!outside) { if (h.x > 0.0) outside = true; t += max(-h.x, 0.02) + 0.01; }
    else t += h.x * 0.85;
    if (t > uStart + MAXD) break;
  }
  vec3 col;
  float depth = 1.0;
  if (m >= 0.0) {
    vec3 p = uRo + rd * t;
    vec3 n = calcNormal(p);
    col = shade(p, n, rd, m, calcAO(p, n));
    float fd = max(t - uFogRef, 0.0);
    col = mix(col, sky(rd), 1.0 - exp(-FOG * (1.0 + uFogW * 2.5) * fd));
    depth = clamp(fd / MAXD, 0.0, 0.98);
  } else col = sky(rd);
#ifdef HAS_GLOW
  // Cosas que brillan a través de la niebla. Donde el brillo es fuerte, la profundidad vale 254
  // como marca: el ASCII pinta ese píxel con su color puro, sin mezclarlo con la paleta.
  vec3 gw = glow(rd, m >= 0.0 ? t : 1e4);
  col += gw;
  if (max(gw.r, max(gw.g, gw.b)) > 0.5) depth = 254.0 / 255.0;
#endif
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), depth);
}
`

const VERT = "attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }"

type GL = WebGLRenderingContext
type Program = { prog: WebGLProgram; u: Record<string, WebGLUniformLocation | null> }

// Compilar un shader de raymarching tarda bastante. Se hace en dos partes: arrancar (no espera)
// y terminar (pide el resultado). Con KHR_parallel_shader_compile el navegador compila en otro
// hilo y se puede preguntar si ya terminó sin trabar la página.
const startCompile = (gl: GL, scene: Scene3D): WebGLProgram => {
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    return s
  }
  const prog = gl.createProgram()!
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT))
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, PRELUDE + scene.glsl + MAIN))
  gl.bindAttribLocation(prog, 0, "a")
  gl.linkProgram(prog)
  return prog
}

const finishCompile = (gl: GL, scene: Scene3D, prog: WebGLProgram): Program | null => {
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    for (const s of gl.getAttachedShaders(prog) ?? []) {
      const log = gl.getShaderInfoLog(s)
      if (log) console.error(`[ascii3d] ${scene.id}:`, log)
    }
    console.error(`[ascii3d] ${scene.id}:`, gl.getProgramInfoLog(prog))
    return null
  }
  const names = [
    "uRes", "uTime", "uRo", "uFw", "uRt", "uUp", "uTan", "uAspect", "uStart", "uFogRef",
    "uSkyTop", "uSkyHor", "uSkyCloud", "uLight", "uStars", "uSunDir", "uLightCol", "uClouds", "uRain", "uFogW", "uFlash",
    "uLevel", "uDoor", "uOpen",
  ]
  return { prog, u: Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(prog, n)])) }
}

type V3 = [number, number, number]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

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
const PASS_M = 1.6 // cuánto hay que seguir empujando para pasar de largo una puerta con luz

const HOLD_MAX = 2500 // si el shader nuevo no termina en este tiempo, se espera de una

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
  const zoomRef = useRef(0)
  const viewRef = useRef({ yaw: scene.camera.yaw, pitch: scene.camera.pitch })
  const failRef = useRef<HTMLParagraphElement>(null)

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
  // empujar un poco más (PASS_M), o volver atrás. held/passed son números de puerta sin dar la vuelta.
  const stopRef = useRef<{ held: number | null; passed: number | null; push: number; prev: number }>({
    held: null,
    passed: null,
    push: 0,
    prev: 0,
  })
  const zoomBy = (d: number) => {
    // En el pasillo la rueda no acerca: camina hacia adelante (o atrás), sin fin
    if (sceneRef.current.camera.walk) {
      if (lockRef.current) return
      const st = stopRef.current
      if (st.held !== null) {
        if (d > 0) {
          st.push += d * 6
          if (st.push < PASS_M) return
          walkRef.current += 0.6 // pasa de largo
        }
        st.passed = st.held
        st.held = null
        if (d > 0) return
      }
      walkRef.current += d * 6
    } else zoomRef.current = clamp(zoomRef.current + d, 0, ZOOM_MAX)
  }

  useEffect(() => {
    const canvas = canvasRef.current!
    const glowCanvas = glowRef.current!
    const layer = layerRef.current!
    const ctx = canvas.getContext("2d")!
    const gctx = glowCanvas.getContext("2d")!
    const off = document.createElement("canvas")
    const gl = off.getContext("webgl", { premultipliedAlpha: false, antialias: false, alpha: true }) as GL | null
    if (!gl) {
      if (failRef.current) failRef.current.hidden = false
      return
    }
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    const programs = new Map<string, Program | null>()
    const pending = new Map<string, WebGLProgram>()
    const parallel = gl.getExtension("KHR_parallel_shader_compile") as { COMPLETION_STATUS_KHR: number } | null
    let hitch = false // este cuadro terminó un shader: no cuenta para la calidad automática
    const request = (s: Scene3D) => {
      if (!programs.has(s.id) && !pending.has(s.id)) pending.set(s.id, startCompile(gl, s))
    }
    // ¿Está lista? Sin esperar solo responde que sí si el navegador ya terminó en segundo plano
    const ready = (s: Scene3D, wait: boolean) => {
      if (programs.has(s.id)) return true
      request(s)
      const p = pending.get(s.id)!
      if (!wait && !(parallel && gl.getProgramParameter(p, parallel.COMPLETION_STATUS_KHR))) return false
      pending.delete(s.id)
      const prog = finishCompile(gl, s, p)
      if (prog) {
        // Un dibujo de 1 píxel obliga al driver a terminar ahora, tapado por la estática
        gl.viewport(0, 0, 1, 1)
        gl.useProgram(prog.prog)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
      }
      programs.set(s.id, prog)
      hitch = true
      return true
    }
    // Precarga: con compilación en paralelo se piden todas juntas; sin ella, una por vez y con calma
    let preloadAt = performance.now() + 1500
    const warmNext = (now: number) => {
      if (now < preloadAt) return
      if (!sheet && W > 0) {
        staticSheet()
        preloadAt = now + 150
        return
      }
      const rest = preloadRef.current.filter((s) => !programs.has(s.id))
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
    // Una sola hoja de estática hecha de antemano, un poco más grande que la pantalla. En cada cuadro se
    // muestra corrida unas celdas al azar: parece estática nueva sin tener que escribirla de nuevo.
    // (Se rehace si cambia el tamaño.)
    let sheet: HTMLCanvasElement | null = null
    const staticSheet = () => {
      if (sheet) return sheet
      const kx = canvas.width / W
      const ky = canvas.height / H
      const sc = document.createElement("canvas")
      sc.width = Math.ceil((W + STATIC_PAD * cw) * kx)
      sc.height = Math.ceil((H + STATIC_PAD * lh) * ky)
      const sx = sc.getContext("2d")!
      sx.setTransform(kx, 0, 0, ky, 0, 0)
      sx.font = ctx.font
      sx.textBaseline = "top"
      for (let tone = 0; tone < STATIC_TONES.length; tone++) {
        sx.fillStyle = STATIC_TONES[tone]
        for (let r = 0; r < rows + STATIC_PAD; r++) {
          let line = ""
          for (let c = 0; c < cols + STATIC_PAD; c++) {
            line += Math.floor(hash(c * 7, r * 3) * STATIC_TONES.length) === tone ? ramp(RAMP, hash(c, r * 11)) : " "
          }
          sx.fillText(line, 0, r * lh)
        }
      }
      sheet = sc
      hitch = true
      return sc
    }
    const drawStatic = (amount: number, tick: number) => {
      if (W <= 0) return
      const sh = staticSheet()
      const ox = Math.floor(hash(tick, 3) * STATIC_PAD) * cw * (canvas.width / W)
      const oy = Math.floor(hash(tick, 9) * STATIC_PAD) * lh * (canvas.height / H)
      ctx.globalAlpha = Math.min(1, amount)
      ctx.drawImage(sh, ox, oy, canvas.width, canvas.height, 0, 0, W, H)
      ctx.globalAlpha = 1
    }
    const liveSky = createLiveSky()

    let W = 0
    let H = 0
    let cw = 5
    let lh = 8
    let cols = 0
    let rows = 0
    let pixels = new Uint8Array(0)
    let frame = 0
    let last = -Infinity
    // Calidad automática: si los cuadros tardan, la letra crece un punto (menos celdas que dibujar);
    // si sobra tiempo, vuelve a achicarse. Se revisa cada 2 segundos.
    let coarse = 0
    let cost = 0
    let costAt = performance.now()
    let tickN = 0
    let zoom = zoomRef.current
    let walk = 0
    let yaw = viewRef.current.yaw
    let pitch = viewRef.current.pitch
    // Transición: "out" se mete en la escena actual, "in" aparece la nueva desde plano
    let phase: { kind: "in" | "out" | "none"; at: number } = { kind: "in", at: performance.now() }
    zoomRef.current = ENTRY_ZOOM
    // Laberinto
    let level = wantVisit.current.entry?.level ?? 0
    let shownVisit = wantVisit.current.visit
    let door: { n: number; side: number; kind: number; type: "open" | "close"; at: number; fired: boolean } | null = null
    let nearKey = ""
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
      stopRef.current = { held: null, passed: null, push: 0, prev: walk }
      if (sc.camera.walk && sc.camera.doors && e) {
        // Se aparece justo frente a la puerta por la que se vuelve, mirándola mientras se cierra
        walk = walkRef.current = e.door * DOOR_GAP
        stopRef.current = { held: null, passed: e.door, push: 0, prev: walk } // esa no frena al salir
        door = { n: e.door, side: sideOf(e.door), kind: kindAt(level, e.door), type: "close", at: now, fired: false }
      }
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const start = performance.now()

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = canvas.clientWidth
      H = canvas.clientHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      glowCanvas.width = Math.ceil(W / 4)
      glowCanvas.height = Math.ceil(H / 4)
      let px = (W < 640 ? 7 : FONT_PX) + coarse
      const measure = () => {
        ctx.font = `${px}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`
        return ctx.measureText("M").width
      }
      cw = measure()
      // Con pantallas enormes se agranda la letra para no pasarse de celdas
      while ((W / cw) * (H / (px * 1.1)) > MAX_CELLS) {
        px += 1
        cw = measure()
      }
      ctx.textBaseline = "top"
      lh = Math.round(px * 1.1)
      cols = Math.ceil(W / cw)
      rows = Math.ceil(H / lh)
      off.width = cols
      off.height = rows
      pixels = new Uint8Array(cols * rows * 4)
      sheet = null
    }

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
          viewRef.current = { yaw: nextScene.camera.yaw, pitch: nextScene.camera.pitch }
          yaw = nextScene.camera.yaw
          pitch = nextScene.camera.pitch
          zoom = 0
          zoomRef.current = ENTRY_ZOOM
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
        ctx.clearRect(0, 0, W, H)
        drawStatic(1, Math.floor(now / 50))
        if (phase.kind === "in") phase.at = now
        return
      }
      const program = programs.get(sc.id)
      if (!program) return

      // Cámara suavizada hacia lo que pide el visitante
      zoom += (zoomRef.current - zoom) * 0.1
      const v = viewRef.current
      yaw += (v.yaw - yaw) * 0.12
      pitch += (v.pitch - pitch) * 0.12
      const drift = reduced || cam.walk ? 0 : Math.sin(t * 0.07) * 0.06
      const zz = Math.min(zoom + rush, ZOOM_MAX)
      const z1 = Math.min(zz, 1)
      const fov = ((FOV_FLAT + (FOV_WIDE - FOV_FLAT) * z1 * z1) * Math.PI) / 180
      const tan = Math.tan(fov / 2)
      const inside = Math.max(0, zz - 1) / (ZOOM_MAX - 1)
      const dist = (cam.frame / tan) * (1 - inside * 0.85)
      const a = yaw + drift
      let ro: V3
      let fw: V3
      let walkTan = tan
      let ax = 0 // corrimiento de costado: entrar por una puerta
      let face = a
      let open = 0
      if (cam.walk) {
        const L = cam.walk.loop
        // Laberinto: la puerta de al lado, abrirla, y la animación de abrir o cerrar
        if (cam.doors) {
          // ¿Se cruzó una puerta con luz desde el cuadro anterior? Entonces frena ahí
          const st = stopRef.current
          const target = walkRef.current
          if (st.passed !== null && Math.abs(target - st.passed * DOOR_GAP) > 3) st.passed = null
          if (st.held === null && !door && phase.kind === "none" && target > st.prev) {
            for (let c = Math.ceil(st.prev / DOOR_GAP); c * DOOR_GAP <= target; c++) {
              if (c !== st.passed && kindAt(level, c) > 0) {
                st.held = c
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
          if (openReq.current && near) door = { n, side: sideOf(n), kind, type: "open", at: now, fired: false }
          openReq.current = false
          if (door) {
            const ease = (x: number) => x * x * (3 - 2 * x)
            const toDoor = -door.side * Math.PI * 0.5 // girar para mirar la puerta
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
              face = toDoor + (a - toDoor) * ease(clamp((p - 0.2) / 0.8, 0, 1))
              if (p >= 1) door = null
            }
          }
        }
        // Solo se deja de caminar mientras una puerta del pasillo se abre o se cierra
        lockRef.current = !!cam.doors && !!door
        // Primera persona: se avanza solo, despacito, y la rueda empuja; cerca de una puerta con luz se frena
        // Frente a una puerta con luz se queda quieto, esperando
        if (!reduced && !lockRef.current && stopRef.current.held === null) walkRef.current += cam.walk.drift / FPS
        walk += (walkRef.current - walk) * 0.08
        // Al salir se empuja un poco hacia adelante (antes eran 27 m: en la escalera daba varias vueltas y parpadeaba)
        let along = ((((walk + rush * 3) % L) + L) % L)
        if (cam.walk.exit) {
          // Esta escena no da la vuelta: al llegar a la puerta del final se sale
          walkRef.current = clamp(walkRef.current, 0, L)
          along = clamp(walk + rush * 3, 0, L - 0.01)
          if (walk > L - 0.3 && !exited) {
            exited = true
            calls.current.onLeave?.()
          }
        }
        const bob = reduced ? 0 : Math.sin(walk * 2.2) * 0.025
        // En la escalera se sube: la altura sigue a los escalones
        const climb = cam.walk.climb
        const lift = climb ? clamp(along / climb.run, 0, climb.steps) * climb.rise : 0
        ro = [cam.target[0] + Math.sin(walk * 1.1) * 0.04 + ax, cam.target[1] + lift + bob, cam.target[2] - along]
        // Al cruzar el final (la puerta) todo se vuelve estática y se reaparece al principio
        if (cam.walk.flash) {
          const f = cam.walk.flash
          staticAmt = Math.max(staticAmt, clamp((along - (L - f)) / f, 0, 1), clamp(1 - along / f, 0, 1))
        }
        fw = norm([-Math.sin(face) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(face) * Math.cos(pitch)])
        walkTan = Math.tan((cam.walk.fov * Math.PI) / 360)
      } else {
        ro = [
          cam.target[0] + dist * Math.cos(pitch) * Math.sin(a),
          cam.target[1] + dist * Math.sin(pitch),
          cam.target[2] + dist * Math.cos(pitch) * Math.cos(a),
        ]
        fw = norm(sub(cam.target, ro))
      }
      const rt = norm(cross(fw, [0, 1, 0]))
      const up = cross(rt, fw)

      gl.viewport(0, 0, cols, rows)
      gl.useProgram(program.prog)
      const u = program.u
      gl.uniform2f(u.uRes, cols, rows)
      gl.uniform1f(u.uTime, t)
      gl.uniform3f(u.uRo, ...ro)
      gl.uniform3f(u.uFw, ...fw)
      gl.uniform3f(u.uRt, ...rt)
      gl.uniform3f(u.uUp, ...up)
      gl.uniform1f(u.uTan, walkTan)
      gl.uniform1f(u.uAspect, cw / lh)
      gl.uniform1f(u.uStart, cam.walk ? 0 : Math.max(0, dist - cam.clip))
      gl.uniform1f(u.uFogRef, cam.walk ? 0 : Math.max(0, dist - cam.frame * 1.5))
      const sky = liveSky.read(now, t)
      // De noche se puede abrir más la exposición; de día no, o el cielo se quema
      const exposure = (sc.exposure ?? 1) * (1 + (sc.nightBoost ?? 0) * (1 - sky.light))
      const wea = sky.wea
      const dl = Math.hypot(...sky.dir)
      gl.uniform3f(u.uSkyTop, ...sky.top)
      gl.uniform3f(u.uSkyHor, ...sky.hor)
      gl.uniform3f(u.uSkyCloud, ...sky.cloud)
      gl.uniform1f(u.uLight, sky.light)
      gl.uniform1f(u.uStars, sky.stars)
      gl.uniform3f(u.uSunDir, sky.dir[0] / dl, sky.dir[1] / dl, sky.dir[2] / dl)
      gl.uniform3f(u.uLightCol, ...sky.lightCol)
      gl.uniform1f(u.uClouds, wea.clouds)
      gl.uniform1f(u.uRain, wea.rain)
      gl.uniform1f(u.uFogW, wea.fog)
      gl.uniform1f(u.uFlash, sky.flash)
      gl.uniform1f(u.uLevel, level)
      gl.uniform1f(u.uDoor, door ? door.n : -1)
      gl.uniform1f(u.uOpen, open)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      gl.readPixels(0, 0, cols, rows, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

      // Píxeles -> caracteres (la imagen de WebGL viene de abajo hacia arriba)
      const tick = Math.floor(now / 50)
      const at = (c: number, r: number) => ((rows - 1 - clamp(r, 0, rows - 1)) * cols + clamp(c, 0, cols - 1)) * 4
      ctx.clearRect(0, 0, W, H)
      // La estática no se escribe letra por letra (eran miles de dibujos por cuadro y eso trababa
      // las transiciones): las celdas tapadas se saltean y encima va una imagen de estática ya hecha.
      for (let r = 0; r < rows; r++) {
        let runColor = ""
        let runStart = 0
        let run = ""
        const y = r * lh
        for (let c = 0; c <= cols; c++) {
          let ch = ""
          let color = ""
          if (c < cols && staticAmt > 0 && hash(c + tick * 13, r + tick * 7) < staticAmt * 0.95) {
            if (run) run += " " // celda tapada por la estática: la escena no la dibuja
            continue
          }
          if (c < cols) {
            const i = at(c, r)
            const R = pixels[i]
            const G = pixels[i + 1]
            const B = pixels[i + 2]
            const lum = (0.299 * R + 0.587 * G + 0.114 * B) / 255
            // Borde de profundidad: el trazo sigue el contorno
            const gx = pixels[at(c + 1, r) + 3] - pixels[at(c - 1, r) + 3]
            const gy = pixels[at(c, r + 1) + 3] - pixels[at(c, r - 1) + 3]
            const d = pixels[i + 3]
            const edge = Math.abs(gx) + Math.abs(gy) > 6 + d * 0.12
            // Exposición baja: domina lo oscuro y solo lo iluminado llega a los caracteres llenos.
            // Nunca vacío: hasta la sombra tiene una textura tenue.
            const v = clamp(Math.pow(Math.min(lum * exposure, 1), 1.35) * 0.9, 0, 0.999)
            ch = edge && lum > 0.08 ? dirChar(-gy, gx) : ramp(RAMP, Math.max(v, 0.09))
            // Casi monocromo: el color se insinúa, la luz manda
            const gray = lum * 255
            const sat = sc.saturation ?? 0.5
            let k = (0.22 + 0.85 * v) / Math.max(lum, 0.1)
            if (edge) k *= 1.25
            // Mezcla el color de la escena con la paleta de la isla según la luz
            const g = gradeAt(v)
            const gr = sc.grade ?? 0.45
            const cr = (gray + (R - gray) * sat) * k
            const cg = (gray + (G - gray) * sat) * k
            const cb = (gray + (B - gray) * sat) * k
            const gk = 0.55 + 0.75 * v
            color = rgb([cr + (g[0] * gk - cr) * gr, cg + (g[1] * gk - cg) * gr, cb + (g[2] * gk - cb) * gr])
            if (d === 254) {
              // Brillo marcado por la escena (ojos): color puro y carácter lleno
              ch = R + G + B > 330 ? "@" : "o"
              color = rgb([R, G * 0.7, B * 0.7])
            }
            if (ch === " ") {
              if (run) run += " "
              continue
            }
          }
          if (color !== runColor || c === cols) {
            if (run.trim()) {
              ctx.fillStyle = runColor
              ctx.fillText(run, runStart * cw, y)
            }
            runColor = color
            runStart = c
            run = ch
          } else run += ch
        }
      }
      if (staticAmt > 0) drawStatic(staticAmt * 1.1, tick)
      // Lluvia por delante, solo en los espacios abiertos
      if (sc.outdoor && wea.rain > 0.02 && staticAmt < 0.5) {
        const drops = Math.floor(cols * rows * 0.012 * wea.rain)
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
      // El halo es borroso: alcanza con actualizarlo un cuadro sí y otro no
      if (tickN++ % 2 === 0) {
        gctx.clearRect(0, 0, glowCanvas.width, glowCanvas.height)
        gctx.drawImage(canvas, 0, 0, glowCanvas.width, glowCanvas.height)
      }
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
        if (canvas.clientWidth !== W || canvas.clientHeight !== H) resize()
        phase = { kind: "in", at: now }
        cost = 0
        costAt = now
      }
      if (now - last >= 1000 / FPS) {
        const t0 = performance.now()
        hitch = false
        draw(now)
        const ms = performance.now() - t0
        // Los cuadros que terminaron un shader son lentos una sola vez: no deben bajar la calidad
        if (!hitch) cost = cost ? cost * 0.9 + ms * 0.1 : ms
        // Durante una transición no se cambia el tamaño de letra (se vería un salto)
        if (phase.kind === "none" && cost && now - costAt > 2000) {
          costAt = now
          if (cost > 24 && coarse < 4) {
            coarse++
            resize()
          } else if (cost < 9 && coarse > 0) {
            coarse--
            resize()
          }
        }
        last = now
      }
    }

    // --- Controles: arrastrar para mirar, rueda o pinza para entrar ---
    const pointers = new Map<number, { x: number; y: number }>()
    let pinch = 0
    const look = (dx: number, dy: number) => {
      const cam = sceneRef.current.camera
      const v = viewRef.current
      v.yaw -= dx * 0.005
      if (cam.yawRange) v.yaw = clamp(v.yaw, cam.yaw + cam.yawRange[0], cam.yaw + cam.yawRange[1])
      v.pitch = clamp(v.pitch + dy * 0.004, cam.pitchRange[0], cam.pitchRange[1])
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
      if (!activeRef.current || e.target instanceof HTMLInputElement) return
      if (e.key === "+" || e.key === "=") zoomBy(0.12)
      else if (e.key === "-") zoomBy(-0.12)
      else if (e.key === "ArrowLeft") look(-40, 0)
      else if (e.key === "ArrowRight") look(40, 0)
      else if (e.key === "ArrowUp") look(0, -30)
      else if (e.key === "ArrowDown") look(0, 30)
      else if (e.key === "e" || e.key === "E" || e.key === "Enter") openReq.current = true
    }
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
      window.removeEventListener("resize", resize)
      window.removeEventListener("keydown", onKey)
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

      <div className={`pointer-events-none absolute z-20 flex flex-col gap-2 ${controlsClassName}`}>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => zoomBy(-0.2)} className="ts-px-btn pointer-events-auto h-6 w-6" aria-label={scene.camera.walk ? "Retroceder" : "Alejarse"}>
            <PixelIcon name="left" className="h-2.5 w-2.5" />
          </button>
          <span className="min-w-28 text-center font-mono text-[10px] uppercase tracking-[0.25em] text-white/70">{scene.camera.walk ? "atrás · adelante" : "plano · adentro"}</span>
          <button type="button" onClick={() => zoomBy(0.2)} className="ts-px-btn pointer-events-auto h-6 w-6" aria-label={scene.camera.walk ? "Avanzar" : "Acercarse"}>
            <PixelIcon name="right" className="h-2.5 w-2.5" />
          </button>
        </div>
        <p className="hidden font-mono text-[10px] lowercase tracking-[0.15em] text-white/45 sm:block">
          {scene.camera.doors
            ? "scrollea o usa la rueda del mouse para moverte · las puertas con luz se abren (E)"
            : scene.camera.walk
              ? "scrollea o usa la rueda del mouse para moverte"
              : "scrollea o usa la rueda del mouse para acercarte"}
        </p>
      </div>
    </>
  )
}
