// Motor · iluminación dinámica: luces que la escena arma en cada cuadro (se mueven, titilan, se
// apagan) y que el shader suma con atenuación, conos y sombras suaves.
//
// La escena devuelve sus luces desde JS (Scene3D.lights) y en su shade() las usa así:
//   vec3 light = lighting(p, n, rd, 0.0);      // toda la luz que llega a ese punto
//   vec4 lamp  = lightAt(p, 0.8);              // el color de la lámpara que está ahí mismo (el tubo)
// Hasta MAX_LIGHTS por cuadro: para espacios que se repiten (el pasillo) se eligen las más cercanas.

import type { V3 } from "./camera"
import type { Program } from "./shader"

export const MAX_LIGHTS = 8

type Base = {
  color: V3 // cómo se ve la lámpara (0..1, puede pasarse de 1)
  intensity: number // cuánto ilumina alrededor (0 = apagada; bajarla no cambia cómo se ve la lámpara)
  shadow?: boolean // sombra suave (cuesta: mejor en una o dos luces)
}
// Atenuación: intensity / (1 + falloff * d²), y se apaga del todo al llegar a range
export type PointLight = Base & { type: "point"; pos: V3; range: number; falloff?: number; wrap?: number }
// Igual que la puntual, pero solo dentro de un cono. angle = medio ángulo en radianes
export type SpotLight = Base & { type: "spot"; pos: V3; dir: V3; angle: number; softness?: number; range: number; falloff?: number; wrap?: number }
// Sol o luna: viene de lejos, misma dirección en todos lados. dir = hacia dónde va la luz
export type DirLight = Base & { type: "directional"; dir: V3; wrap?: number }
export type Light = PointLight | SpotLight | DirLight

export type LightSet = { ambient: V3; lights: Light[] }

export const GLSL_LIGHTING = /* glsl */ `
#define MAX_LIGHTS ${MAX_LIGHTS}
uniform int uLightN;
uniform vec4 uLPos[MAX_LIGHTS]; // xyz posición, w tipo (0 puntual, 1 cono, 2 direccional)
uniform vec4 uLCol[MAX_LIGHTS]; // rgb color, w intensidad
uniform float uLRange[MAX_LIGHTS]; // alcance en metros
uniform vec4 uLDir[MAX_LIGHTS]; // xyz hacia dónde apunta, w coseno del borde del cono
uniform vec4 uLOpt[MAX_LIGHTS]; // x coseno del centro del cono, y sombra, z caída, w envoltura
uniform vec3 uAmbient;
uniform float uShadows; // 0 = sin sombras (celulares)

float softShadow(vec3 ro, vec3 rd, float tmax) {
  float res = 1.0;
  float t = 0.04;
  for (int i = 0; i < 20; i++) {
    float h = map(ro + rd * t).x;
    res = min(res, 8.0 * h / t);
    t += clamp(h, 0.03, 0.5);
    if (res < 0.02 || t > tmax) break;
  }
  return clamp(res, 0.0, 1.0);
}

// Toda la luz que llega a p (con normal n). spec: brillo especular (0 = mate, 30 = lustroso)
vec3 lighting(vec3 p, vec3 n, vec3 rd, float spec) {
  vec3 sum = uAmbient;
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uLightN) break;
    vec4 lp = uLPos[i];
    vec4 lc = uLCol[i];
    vec4 ld = uLDir[i];
    vec4 lo = uLOpt[i];
    vec3 L;
    float att = 1.0;
    float dist = 40.0;
    if (lp.w > 1.5) L = -ld.xyz;
    else {
      vec3 d = lp.xyz - p;
      dist = length(d);
      L = d / dist;
      float x = dist / uLRange[i];
      float win = clamp(1.0 - x * x * x * x, 0.0, 1.0);
      att = win * win / (1.0 + lo.z * dist * dist);
      if (lp.w > 0.5) att *= smoothstep(ld.w, lo.x, dot(-L, ld.xyz));
    }
    if (att < 0.002) continue;
    // Envoltura: con w > 0 la luz da la vuelta un poco (las caras de costado no quedan negras)
    float dif = clamp((dot(n, L) + lo.w) / (1.0 + lo.w), 0.0, 1.0);
    if (dif <= 0.0) continue;
    float sh = 1.0;
    if (lo.y > 0.5 && uShadows > 0.5) sh = softShadow(p + n * 0.01, L, dist - 0.08);
    float s = spec > 0.0 ? pow(max(dot(n, normalize(L - rd)), 0.0), spec) * 0.5 : 0.0;
    sum += lc.rgb * lc.w * att * (dif + s) * sh;
  }
  return sum;
}

// El color de las lámparas que están a menos de r de p (sin la intensidad: una luz que se desvanece
// a lo lejos sigue viéndose encendida). Devuelve w = 1 si encontró alguna.
vec4 lightAt(vec3 p, float r) {
  vec4 c = vec4(0.0);
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uLightN) break;
    if (uLPos[i].w < 1.5 && length(uLPos[i].xyz - p) < r) c += vec4(uLCol[i].rgb, 1.0);
  }
  return c;
}
`

// Junta las luces del cuadro y las sube al shader
export class LightRig {
  private pos = new Float32Array(MAX_LIGHTS * 4)
  private col = new Float32Array(MAX_LIGHTS * 4)
  private dir = new Float32Array(MAX_LIGHTS * 4)
  private opt = new Float32Array(MAX_LIGHTS * 4)
  private range = new Float32Array(MAX_LIGHTS)
  private n = 0
  ambient: V3 = [0, 0, 0]
  shadows = true

  set({ ambient, lights }: LightSet) {
    this.ambient = ambient
    this.n = Math.min(lights.length, MAX_LIGHTS)
    for (let i = 0; i < this.n; i++) {
      const l = lights[i]
      const o = i * 4
      this.col.set([...l.color, l.intensity], o)
      this.range[i] = l.type === "directional" ? 1e3 : l.range
      if (l.type === "directional") {
        this.pos.set([0, 0, 0, 2], o)
        this.dir.set([...normalize(l.dir), 0], o)
        this.opt.set([1, l.shadow ? 1 : 0, 0, l.wrap ?? 0], o)
      } else {
        const spot = l.type === "spot"
        const outer = spot ? Math.cos(l.angle) : -1
        const inner = spot ? Math.cos(l.angle * (1 - (l.softness ?? 0.3))) : 1
        this.pos.set([...l.pos, spot ? 1 : 0], o)
        this.dir.set([...(spot ? normalize(l.dir) : ([0, -1, 0] as V3)), outer], o)
        this.opt.set([inner, l.shadow ? 1 : 0, l.falloff ?? 1, l.wrap ?? 0], o)
      }
    }
  }

  clear() {
    this.set({ ambient: [0, 0, 0], lights: [] })
  }

  upload(p: Program) {
    p.i1("uLightN", this.n)
    p.f3("uAmbient", this.ambient)
    p.f1("uShadows", this.shadows ? 1 : 0)
    if (!this.n) return
    p.v4("uLPos", this.pos)
    p.v4("uLCol", this.col)
    p.v4("uLDir", this.dir)
    p.v4("uLOpt", this.opt)
    p.v1("uLRange", this.range)
  }
}

const normalize = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
