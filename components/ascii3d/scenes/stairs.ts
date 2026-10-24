import type { V3 } from "../engine/camera"
import type { Scene3D } from "./types"
import { g } from "./types"

// --- Escaleras: descansos de mármol flotando entre nubes, unidos por escaleras que suben y bajan ---
// Se camina libre (plano redondo con piso): por los descansos y por las escaleras, nunca por el aire.
// Casi todos los caminos terminan en puertas cerradas; una sola, arriba de todo, está encendida y
// devuelve al pasillo. El mapa se define una vez acá (LANDINGS, FLIGHTS): de él salen el GLSL que lo
// dibuja y stairsFloor(), la altura del piso por donde se camina, así nunca se desfasan.

type Landing = { c: [number, number]; h: number; door?: { at: [number, number]; lit?: boolean; alongX?: boolean } }
type Flight = { from: [number, number]; dir: [number, number]; steps: number; rise: number; h0: number }
const LAND_HALF = 2 // los descansos son de 4 x 4
const RUN = 0.6 // fondo de cada escalón
const FLIGHT_HALF = 1 // las escaleras son de 2 de ancho

const LANDINGS: Landing[] = [
  { c: [0, 0], h: 0 }, // donde se llega
  { c: [0, -10], h: 3.2 },
  { c: [8.8, -10], h: 5.76 },
  { c: [8.8, -20], h: 8.96, door: { at: [8.8, -21.7], lit: true } }, // la que vuelve al pasillo
  { c: [-8.8, -10], h: 0.64 },
  { c: [-8.8, -20], h: 3.84, door: { at: [-8.8, -21.7] } },
  { c: [0, 7.6], h: -1.92, door: { at: [0, 9.3] } }, // hundido en las nubes
  { c: [20, -10], h: 1.92, door: { at: [21.7, -10], alongX: true } },
]
const FLIGHTS: Flight[] = [
  { from: [0, -2], dir: [0, -1], steps: 10, rise: 0.32, h0: 0 },
  { from: [2, -10], dir: [1, 0], steps: 8, rise: 0.32, h0: 3.2 },
  { from: [8.8, -12], dir: [0, -1], steps: 10, rise: 0.32, h0: 5.76 },
  { from: [-2, -10], dir: [-1, 0], steps: 8, rise: -0.32, h0: 3.2 },
  { from: [-8.8, -12], dir: [0, -1], steps: 10, rise: 0.32, h0: 0.64 },
  { from: [0, 2], dir: [0, 1], steps: 6, rise: -0.32, h0: 0 },
  { from: [10.8, -10], dir: [1, 0], steps: 12, rise: -0.32, h0: 5.76 },
]
const EXIT_LANDING = LANDINGS.find((l) => l.door?.lit)!
// Una caja que contiene todos los descansos, escaleras y puertas (para saltearlos de lejos)
const STAIRS_BOX = (() => {
  const xs: number[] = []
  const ys: number[] = []
  const zs: number[] = []
  for (const l of LANDINGS) {
    xs.push(l.c[0] - LAND_HALF, l.c[0] + LAND_HALF)
    zs.push(l.c[1] - LAND_HALF, l.c[1] + LAND_HALF)
    ys.push(l.h - 0.4, l.h + 2.6)
  }
  const c: V3 = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2]
  const h: V3 = [(Math.max(...xs) - Math.min(...xs)) / 2 + 0.5, (Math.max(...ys) - Math.min(...ys)) / 2 + 0.5, (Math.max(...zs) - Math.min(...zs)) / 2 + 0.5]
  return { c, h }
})()

// La altura del piso en (x, z), o null si ahí no hay dónde pararse. Con un margen chico en los bordes;
// las escaleras se meten un poco en los descansos, así se pasa de uno a otro sin trabarse
const stairsFloor = (x: number, z: number): number | null => {
  const M = 0.25
  for (const l of LANDINGS) if (Math.abs(x - l.c[0]) <= LAND_HALF - M && Math.abs(z - l.c[1]) <= LAND_HALF - M) return l.h
  for (const f of FLIGHTS) {
    const dx = x - f.from[0]
    const dz = z - f.from[1]
    const along = dx * f.dir[0] + dz * f.dir[1]
    const side = dz * f.dir[0] - dx * f.dir[1]
    const len = f.steps * RUN
    if (Math.abs(side) <= FLIGHT_HALF - M && along >= -0.4 && along <= len + 0.4) {
      return f.h0 + (Math.min(Math.max(along, 0), len) / len) * f.steps * f.rise
    }
  }
  return null
}

const landingGlsl = (l: Landing) => {
  let out = `  r = opU(r, vec2(sdBox(p - vec3(${g(l.c[0])}, ${g(l.h - 0.16)}, ${g(l.c[1])}), vec3(${g(LAND_HALF)}, 0.16, ${g(LAND_HALF)})), 1.0));\n`
  if (l.door) {
    // Marco parado en el descanso; adentro la luz (encendida) o una puerta de madera (cerrada)
    out += `  {
    vec3 dp = p - vec3(${g(l.door.at[0])}, ${g(l.h + 1.2)}, ${g(l.door.at[1])});
    ${l.door.alongX ? "dp.xz = dp.zx;" : ""}
    if (sdBox(dp, vec3(0.95, 1.35, 0.2)) < r.x) {
      float frame = min(min(sdBox(dp - vec3(-0.75, 0.0, 0.0), vec3(0.1, 1.2, 0.1)), sdBox(dp - vec3(0.75, 0.0, 0.0), vec3(0.1, 1.2, 0.1))), sdBox(dp - vec3(0.0, 1.2, 0.0), vec3(0.85, 0.1, 0.1)));
      r = opU(r, vec2(frame, 2.0));
      r = opU(r, vec2(sdBox(dp, vec3(0.64, 1.12, 0.02)), ${l.door.lit ? "3.0" : "6.0"}));
    }
  }\n`
  }
  return out
}
const flightGlsl = (f: Flight) => {
  const h1 = f.h0 + f.steps * f.rise
  const len = f.steps * RUN
  // Escalones sueltos que flotan: para cada punto alcanza con mirar el suyo y los dos de al lado
  return `  {
    vec3 q = p - vec3(${g(f.from[0])}, 0.0, ${g(f.from[1])});
    float s = q.x * ${g(f.dir[0])} + q.z * ${g(f.dir[1])};
    float w = q.z * ${g(f.dir[0])} - q.x * ${g(f.dir[1])};
    if (sdBox(vec3(s - ${g(len / 2)}, q.y - ${g((f.h0 + h1) / 2 - 0.16)}, w), vec3(${g(len / 2)}, ${g(Math.abs(h1 - f.h0) / 2 + 0.32)}, ${g(FLIGHT_HALF)})) < r.x) {
      float i = clamp(floor(s / ${g(RUN)}), 0.0, ${g(f.steps - 1)});
      for (int k = -1; k <= 1; k++) {
        float j = clamp(i + float(k), 0.0, ${g(f.steps - 1)});
        float top = ${g(f.h0)} + (j + 1.0) * ${g(f.rise)};
        r = opU(r, vec2(sdBox(vec3(s - (j + 0.5) * ${g(RUN)}, q.y - top + 0.16, w), vec3(${g(RUN / 2)}, 0.16, ${g(FLIGHT_HALF)})), 1.0));
      }
    }
  }\n`
}

const stairs = /* glsl */ `
#define FOG 0.018
#define MAXD 90.0

vec2 map(vec3 p) {
  vec2 r = vec2(1e3, 0.0);
  // Descansos, puertas y escaleras (armados desde LANDINGS y FLIGHTS). Lejos de todo, una caja que los
  // contiene alcanza
  float bound = sdBox(p - vec3(${g(STAIRS_BOX.c[0])}, ${g(STAIRS_BOX.c[1])}, ${g(STAIRS_BOX.c[2])}), vec3(${g(STAIRS_BOX.h[0])}, ${g(STAIRS_BOX.h[1])}, ${g(STAIRS_BOX.h[2])}));
  if (bound > 1.0) r = vec2(bound, 1.0);
  else {
${LANDINGS.map(landingGlsl).join("")}${FLIGHTS.map(flightGlsl).join("")}  }
  // Mar de nubes abajo: el ruido se calcula solo si la nube puede estar más cerca que lo demás
  // (la nube nunca sube más de 1.8 sobre -2.6)
  if ((p.y + 0.8) * 0.6 < r.x) {
    float cloud = p.y + 2.6 - fbm2(p.xz * 0.12 + vec2(uTime * 0.02, 0.0)) * 1.8;
    r = opU(r, vec2(cloud * 0.6, 4.0));
  }
  // Cubos que flotan y giran despacio (no encima de los caminos)
  vec2 id = floor(p.xz / 11.0);
  vec2 q = mod(p.xz, 11.0) - 5.5;
  float h = hash2(id);
  vec3 cp = vec3(q.x, p.y - 1.0 - h * 4.0 - sin(uTime * 0.3 + h * 6.0) * 0.3, q.y);
  float a = uTime * 0.15 + h * 6.0;
  cp.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * cp.xz;
  bool path = id.x > -2.5 && id.x < 2.5 && id.y > -3.5 && id.y < 1.5;
  float cube = h > 0.55 && !path ? sdBox(cp, vec3(0.5)) : 1e3;
  r = opU(r, vec2(cube, 5.0));
  return r;
}

// Un cielo pastel que igual sigue la hora y el clima reales
vec3 sky(vec3 rd) {
  float y = clamp(rd.y * 1.6 + 0.2, 0.0, 1.0);
  vec3 pastel = mix(vec3(0.78, 0.6, 0.66), vec3(0.22, 0.28, 0.5), y);
  vec3 c = mix(pastel, mix(uSkyHor, uSkyTop, y), 0.55);
  float s = max(dot(rd, uSunDir), 0.0);
  return c + uLightCol * (pow(s, 40.0) * 0.8 + pow(s, 4.0) * 0.15) + uFlash * 0.4;
}

vec3 shade(vec3 p, vec3 n, vec3 rd, float m, float ao) {
  vec3 L = uSunDir;
  vec3 dif = uLightCol * max(dot(n, L), 0.0) * (0.6 + 0.5 * uLight);
  vec3 amb = mix(vec3(0.5), uSkyTop + 0.2, 0.5) * (0.45 + 0.35 * n.y);
  // Mármol: aunque la luz venga de atrás, el frente de cada escalón brilla un poco, y la huella más
  if (m < 1.5) return vec3(0.96, 0.94, 0.92) * (dif * 0.75 + amb * 0.55 + 0.3 + 0.25 * max(n.y, 0.0)) * (0.5 + 0.5 * ao);
  if (m < 2.5) return vec3(0.92, 0.9, 0.95) * (dif * 0.7 + amb * 0.5);
  if (m < 3.5) return vec3(1.4, 1.32, 1.15);
  if (m < 4.5) return mix(vec3(1.0, 0.82, 0.86) * 0.7, uSkyCloud + 0.35, 0.5) * (0.55 + 0.45 * max(dot(n, L), 0.0)) * (0.6 + 0.4 * ao);
  if (m < 5.5) return vec3(0.75, 0.82, 1.0) * (dif * 0.7 + amb * 0.45);
  // Las puertas que no abren: madera oscura
  return vec3(0.32, 0.26, 0.3) * (dif * 0.6 + amb * 0.5);
}
`

export const STAIRS: Scene3D = {
  id: "escalera",
  name: "escalera",
  label: "la escalera",
  blurb: "espacio 02 · escaleras que suben y bajan entre nubes; una sola puerta vuelve al pasillo",
  glsl: stairs,
  exposure: 1.5,
  outdoor: true,
  // Se camina libre por los descansos y las escaleras (el piso lo dice stairsFloor). Al entrar por la
  // puerta encendida de arriba se vuelve al pasillo
  camera: {
    target: [0, 1.6, 1.2], // y = altura de los ojos sobre el piso
    yaw: 0,
    pitch: -0.05,
    frame: 5.5,
    clip: 1e4,
    pitchRange: [-0.6, 0.45],
    walk: {
      drift: 0.2,
      loop: 1,
      fov: 70,
      flash: 1.5,
      roam: { center: [6, -6], radius: 40, floor: stairsFloor, exitAt: EXIT_LANDING.door!.at, exitR: 0.7 },
    },
    exitDoor: { at: [EXIT_LANDING.door!.at[0], EXIT_LANDING.h + 1.2, EXIT_LANDING.door!.at[1]], facing: [0, 0, 1] },
  },
}
