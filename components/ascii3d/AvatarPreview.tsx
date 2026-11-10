"use client"

// El avatar que se está armando, con el mismo motor ASCII que las salas: un vestidor oscuro con un
// foco de arriba y un contraluz del color de su brillo. Gira solo; arrastrando se lo da vuelta.

import { useEffect, useRef } from "react"
import { AsciiFilm } from "./engine/ascii"
import { LOOK_COLORS, uploadAvatars, withAvatars, type Avatar, type Look } from "./engine/avatars"
import { Camera } from "./engine/camera"
import { LightRig } from "./engine/lighting"
import { createShaderCache, fullscreenTriangle, type ShaderSource } from "./engine/shader"
import { buildShader } from "./world"

const VESTIDOR: ShaderSource = {
  id: "vestidor",
  glsl: /* glsl */ `
#define FOG 0.03
#define MAXD 30.0
vec2 map(vec3 p) {
  // Una plataforma redonda apenas levantada sobre el piso
  float stage = max(length(p.xz) - 0.9, p.y);
  return vec2(min(p.y + 0.06, max(stage, -p.y - 0.06)), 1.0);
}
vec3 sky(vec3 rd) { return mix(vec3(0.02, 0.015, 0.04), vec3(0.09, 0.05, 0.14), clamp(rd.y * 0.6 + 0.5, 0.0, 1.0)); }
vec3 shade(vec3 p, vec3 n, vec3 rd, float m, float ao) {
  return vec3(0.42, 0.38, 0.52) * (lighting(p, n, rd, 0.0) * ao + 0.03);
}
`,
}

const FPS = 30
const CAM_TAN = Math.tan((24 * Math.PI) / 360)
const SHOT_FRAME = 20 // la foto se saca con la figura ya dibujada y un poco girada

// onShot: si se pasa, recibe una sola vez una foto (JPEG, como data URL) de la figura. Es la que va en el
// correo de bienvenida (WelcomeMail)
export default function AvatarPreview({ look, className = "", onShot }: { look: Look; className?: string; onShot?: (jpeg: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLCanvasElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const lookRef = useRef(look)
  const shotRef = useRef(onShot)
  useEffect(() => {
    lookRef.current = look
    shotRef.current = onShot
  }, [look, onShot])

  useEffect(() => {
    const canvas = canvasRef.current!
    const text = textRef.current!
    const layer = layerRef.current!
    const gl = document.createElement("canvas").getContext("webgl", { premultipliedAlpha: false, antialias: false, alpha: true, preserveDrawingBuffer: true })
    if (!gl) return
    fullscreenTriangle(gl)
    const phone = window.matchMedia("(pointer: coarse)").matches || /Android/i.test(navigator.userAgent)
    const shaders = createShaderCache<ShaderSource>(gl, (s) => (phone ? "" : "#define CREASES\n") + buildShader(withAvatars(s.glsl)))
    const film = new AsciiFilm(canvas, text, null, phone)
    film.resize()
    const camera = new Camera()
    const rig = new LightRig()
    rig.shadows = !phone
    const avatar: Avatar = { pos: [0, 0, 0], yaw: Math.PI, look: lookRef.current, walk: 0, phase: 0, seed: 1 }
    const start = performance.now()
    let yaw = 0.5
    let spin = 0.35 // radianes por segundo; arrastrando se frena y se gira a mano
    let last = 0
    let frame = 0
    let shown = 0 // cuadros con la figura, para la foto

    let drag: { x: number } | null = null
    const onDown = (e: PointerEvent) => {
      drag = { x: e.clientX }
      layer.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (!drag) return
      yaw -= (e.clientX - drag.x) * 0.012
      drag.x = e.clientX
      spin = 0
    }
    const onUp = () => {
      drag = null
      spin = 0.35
    }
    layer.addEventListener("pointerdown", onDown)
    layer.addEventListener("pointermove", onMove)
    layer.addEventListener("pointerup", onUp)
    layer.addEventListener("pointercancel", onUp)

    const draw = (now: number) => {
      const t = (now - start) / 1000
      const tick = Math.floor(now / 50)
      if (film.stale()) film.resize()
      if (!shaders.ready(VESTIDOR, !shaders.parallel)) {
        film.drawStatic(1, tick)
        return
      }
      const program = shaders.get(VESTIDOR.id)
      if (!program) return
      yaw += spin / FPS
      avatar.look = lookRef.current
      const glow = LOOK_COLORS.glow[avatar.look.glow].rgb
      program.use()
      program.f1("uTime", t)
      program.f3("uSkyTop", [0.09, 0.05, 0.14])
      program.f3("uSkyHor", [0.05, 0.03, 0.08])
      program.f1("uLight", 0.25)
      program.f3("uSunDir", [0.3, 0.8, 0.5])
      program.f3("uLightCol", [0.8, 0.8, 1])
      rig.set({
        ambient: [0.04, 0.035, 0.06],
        lights: [
          { type: "spot", pos: [0.4, 3.4, 1.4], dir: [-0.12, -1, -0.4], angle: 0.5, softness: 0.5, range: 8, falloff: 0.05, color: [1, 0.96, 0.92], intensity: 2.6, shadow: true },
          { type: "point", pos: [0, 1.7, -1.6], range: 5, falloff: 0.3, color: glow, intensity: 1.6 },
        ],
      })
      rig.upload(program)
      uploadAvatars(program, [avatar])
      // Entra de pies a aureola, también el espectro que flota y las alas abiertas
      camera.orbit([0, 1.12, 0], yaw, 0.1, 5.6, CAM_TAN)
      camera.shoot(program, film, { exposure: 1.25, saturation: 0.8, grade: 0.12, detail: "fine" }, 0, tick)
      // La foto se copia acá mismo: las letras las estampa la GPU y, pasado el cuadro, ese lienzo ya está en blanco
      if (shotRef.current && ++shown === SHOT_FRAME) {
        const out = document.createElement("canvas")
        out.width = text.width
        out.height = text.height
        const ctx = out.getContext("2d")!
        ctx.fillRect(0, 0, out.width, out.height)
        ctx.drawImage(text, 0, 0)
        shotRef.current(out.toDataURL("image/jpeg", 0.85))
      }
    }
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop)
      if (now - last < 1000 / FPS - 3) return
      last = now
      draw(now)
    }
    frame = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(frame)
      layer.removeEventListener("pointerdown", onDown)
      layer.removeEventListener("pointermove", onMove)
      layer.removeEventListener("pointerup", onUp)
      layer.removeEventListener("pointercancel", onUp)
      gl.getExtension("WEBGL_lose_context")?.loseContext()
      film.dispose()
    }
  }, [])

  return (
    <div className={`relative overflow-hidden bg-black ${className}`}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <canvas ref={textRef} className="absolute inset-0 h-full w-full" />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <div className="ascii-scanlines absolute inset-0" />
      </div>
      <div ref={layerRef} aria-hidden="true" className="absolute inset-0 cursor-grab touch-none select-none active:cursor-grabbing" />
    </div>
  )
}
