// Motor · cámara: dónde está, hacia dónde mira, cuánto abre el lente y qué ve, en ASCII.
//
// Dos maneras de ubicarla:
//   orbit()       -> gira alrededor de un punto (las escenas tipo maqueta), con dolly zoom
//   firstPerson() -> parada en un lugar mirando hacia un lado (las escenas para caminar)
// Lo que pide el visitante (want) se persigue suave en smooth(). project() pasa un punto del mundo
// a la pantalla con la misma cuenta que el shader, para poner botones encima de las cosas.
// shoot() saca la foto: la GPU dibuja la escena y la película (ascii.ts) la revela en caracteres.

import type { AsciiFilm, AsciiLook } from "./ascii"
import { edgePass } from "./edges"
import type { Program } from "./shader"

export type V3 = [number, number, number]
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

export const GLSL_CAMERA = /* glsl */ `
uniform vec3 uRo; // posición
uniform vec3 uFw; // adelante
uniform vec3 uRt; // derecha
uniform vec3 uUp; // arriba
uniform float uTan; // tan(fov / 2)
`

// El lente del dolly zoom: alejado es casi plano (todo se ve 2D); al acercarse se abre y aparece la
// profundidad; pasado 1, la cámara ya no abre más: avanza hacia adentro.
export type Lens = { fovFlat: number; fovWide: number; zoomMax: number }
export const dolly = (zoom: number, frame: number, lens: Lens) => {
  const zz = Math.min(zoom, lens.zoomMax)
  const z1 = Math.min(zz, 1)
  const fov = ((lens.fovFlat + (lens.fovWide - lens.fovFlat) * z1 * z1) * Math.PI) / 180
  const tan = Math.tan(fov / 2)
  const inside = Math.max(0, zz - 1) / (lens.zoomMax - 1)
  return { tan, dist: (frame / tan) * (1 - inside * 0.85) }
}

export type LookLimits = { yaw: number; yawRange?: [number, number]; pitchRange: [number, number] }

export class Camera {
  // Lo que pide el visitante
  want = { yaw: 0, pitch: 0, zoom: 0 }
  // Lo que se muestra, que lo persigue
  yaw = 0
  pitch = 0
  zoom = 0
  pos: V3 = [0, 0, 0]
  fw: V3 = [0, 0, -1]
  rt: V3 = [1, 0, 0]
  up: V3 = [0, 1, 0]
  tan = 1

  // Salta a una vista sin transición (al llegar a una escena)
  reset(yaw: number, pitch: number, zoom = 0, wantZoom = zoom) {
    this.want = { yaw, pitch, zoom: wantZoom }
    this.yaw = yaw
    this.pitch = pitch
    this.zoom = zoom
  }

  smooth(zoomK = 0.1, viewK = 0.12) {
    this.zoom += (this.want.zoom - this.zoom) * zoomK
    this.yaw += (this.want.yaw - this.yaw) * viewK
    this.pitch += (this.want.pitch - this.pitch) * viewK
  }

  // Arrastrar para mirar: dx, dy en píxeles
  look(dx: number, dy: number, lim: LookLimits) {
    const w = this.want
    w.yaw -= dx * 0.005
    if (lim.yawRange) w.yaw = Math.min(Math.max(w.yaw, lim.yaw + lim.yawRange[0]), lim.yaw + lim.yawRange[1])
    w.pitch = Math.min(Math.max(w.pitch + dy * 0.004, lim.pitchRange[0]), lim.pitchRange[1])
  }

  // Gira alrededor de target a dist metros (yaw 0 = mirando hacia -z)
  orbit(target: V3, yaw: number, pitch: number, dist: number, tan: number) {
    this.pos = [
      target[0] + dist * Math.cos(pitch) * Math.sin(yaw),
      target[1] + dist * Math.sin(pitch),
      target[2] + dist * Math.cos(pitch) * Math.cos(yaw),
    ]
    this.fw = norm(sub(target, this.pos))
    this.tan = tan
    this.basis()
  }

  // Parada en pos, mirando hacia yaw (0 = -z) con la inclinación pitch. roll: ladeo de la cabeza
  // en radianes (positivo = hacia la derecha), para golpes y tropiezos
  firstPerson(pos: V3, yaw: number, pitch: number, fovDeg: number, roll = 0) {
    this.pos = pos
    this.fw = norm([-Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)])
    this.tan = Math.tan((fovDeg * Math.PI) / 360)
    this.basis()
    if (roll) {
      const c = Math.cos(roll)
      const s = Math.sin(roll)
      const [rt, up] = [this.rt, this.up]
      this.rt = [rt[0] * c - up[0] * s, rt[1] * c - up[1] * s, rt[2] * c - up[2] * s]
      this.up = [up[0] * c + rt[0] * s, up[1] * c + rt[1] * s, up[2] * c + rt[2] * s]
    }
  }

  // Derecha y arriba a partir de adelante (llamar si se toca pos o fw a mano)
  basis() {
    this.rt = norm(cross(this.fw, [0, 1, 0]))
    this.up = cross(this.rt, this.fw)
  }

  // Un punto del mundo en la pantalla: x, y en unidades de alto de pantalla desde el centro
  // (y hacia arriba). null si queda detrás de la cámara.
  project(p: V3): { x: number; y: number } | null {
    const d = sub(p, this.pos)
    const z = dot(d, this.fw)
    if (z <= 0.2) return null
    const k = 1 / (z * 2 * this.tan)
    return { x: dot(d, this.rt) * k, y: dot(d, this.up) * k }
  }

  // Saca la foto con el programa de la escena (ya en uso y con sus uniforms puestos) y la revela en
  // ASCII sobre la película. staticAmt: cuánta estática la tapa; tick: el reloj de la estática.
  shoot(p: Program, film: AsciiFilm, look: AsciiLook, staticAmt = 0, tick = 0) {
    const gl = p.gl
    const { cols, rows, sub } = film
    // La escena va a una imagen aparte de sub x sub píxeles por celda; edges.ts la resume en celdas
    const pass = edgePass(gl)
    pass.begin(cols, rows, sub)
    p.f2("uRes", cols * sub, rows * sub)
    p.f1("uAspect", film.cw / film.lh) // las celdas no son cuadradas
    p.f1("uCrease", film.creases ? 1 : 0)
    this.upload(p)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    pass.finish(cols, rows, sub, film.pixels)
    p.use() // el programa de la escena sigue en uso para el cuadro que viene
    film.develop(look, staticAmt, tick)
  }

  upload(p: Program) {
    p.f3("uRo", this.pos)
    p.f3("uFw", this.fw)
    p.f3("uRt", this.rt)
    p.f3("uUp", this.up)
    p.f1("uTan", this.tan)
  }
}
