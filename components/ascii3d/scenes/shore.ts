import type { Light, LightSet } from "../engine/lighting"
import type { V3 } from "../engine/camera"
import type { Scene3D, LightCtx } from "./types"

// --- La orilla: un monstruo pálido, muerto, tirado en una playa de piedras. Nadie sabe por qué ---

const shore = /* glsl */ `
#define FOG 0.05
#define MAXD 80.0

const vec3 MOON = vec3(0.5, 0.8, 0.6) / 1.118; // hacia la luna (normalizado)
const vec3 DOOR = vec3(0.0, 0.0, 6.5);
// El cuerpo está acostado al costado del camino: su x (piernas -> cabeza) va hacia -z, y la mano
// estirada cruza el camino. OX, OZ: dónde queda su centro
const float OX = 2.6;
const float OZ = -2.0;
// Los faroles (misma posición que SHORE_LAMPS y SHORE_DROPPED en JS)
vec3 lampAt(int k) {
  if (k == 0) return vec3(-1.05, 1.95, 3.5);
  if (k == 1) return vec3(-1.05, 1.95, -3.5);
  return vec3(1.0, 1.95, -9.5);
}
const vec3 DROPPED = vec3(0.9, 0.09, -4.2);

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float ground(vec2 xz) {
  float h = (fbm2(xz * 0.35) - 0.5) * 0.35 + (noise2(xz * 1.7) - 0.5) * 0.06;
  vec2 l = vec2(OZ - xz.y, OX - xz.x) - vec2(-0.5, 0.0); // el cuerpo, en sus coordenadas
  h *= 0.35 + 0.65 * smoothstep(3.0, 7.0, length(l * vec2(0.6, 1.0))); // debajo del cuerpo, más parejo
  h *= smoothstep(1.0, 3.0, length(xz - DOOR.xz));
  return h - smoothstep(11.0, 16.0, -xz.y) * 0.8; // al final del camino baja al mar
}

// Una vez cada tanto, un tentáculo se mueve. Está muerto. Debería estar muerto
float twitch() {
  float k = mod(uTime + 40.0, 83.0);
  return smoothstep(0.0, 0.15, k) * (1.0 - smoothstep(0.6, 1.4, k)) * sin(k * 18.0);
}

float tentacle(vec3 p, vec3 a, float ang, float len, float tw) {
  vec3 dir = vec3(cos(ang), 0.0, sin(ang));
  vec3 side = vec3(-dir.z, 0.0, dir.x);
  vec3 b = a + dir * len * 0.45 + vec3(0.0, 0.05, 0.0);
  vec3 c = a + dir * len + side * (0.3 * sin(ang * 5.0) + tw * 0.3);
  c.y = 0.05;
  vec3 d = c + (dir + side * cos(ang * 7.0)) * len * 0.4;
  d.y = 0.02;
  return min(min(sdCapsule(p, a, b, 0.075), sdCapsule(p, b, c, 0.05)), sdCapsule(p, c, d, 0.028));
}

// Un dedo largo con dos falanges y la garra
float finger(vec3 p, vec3 a, vec3 dir, float len) {
  vec3 b = a + dir * len * 0.55 + vec3(0.0, 0.05, 0.0);
  vec3 c = a + dir * len;
  c.y = 0.03;
  return min(sdCapsule(p, a, b, 0.04), sdCapsule(p, b, c, 0.03));
}

vec2 map(vec3 p) {
  vec2 r = vec2(p.y - ground(p.xz), 1.0);
  r = opU(r, vec2(p.y + 0.06, 2.0)); // charcos y mar
  // La puerta de vuelta al pasillo, parada sola al principio del camino
  vec3 dq = p - DOOR;
  if (sdBox(dq - vec3(0.0, 0.9, 0.0), vec3(0.7, 1.0, 0.2)) < r.x) {
    float jambs = min(sdBox(vec3(abs(dq.x) - 0.5, dq.y - 0.8, dq.z), vec3(0.07, 0.8, 0.07)), sdBox(dq - vec3(0.0, 1.62, 0.0), vec3(0.57, 0.07, 0.07)));
    r = opU(r, vec2(jambs, 6.0));
    r = opU(r, vec2(sdBox(dq - vec3(0.0, 0.8, 0.0), vec3(0.43, 0.78, 0.015)), 7.0));
  }
  // Faroles viejos a lo largo del camino: poste, brazo y el farol colgando (la luz la pone shoreLights)
  for (int k = 0; k < 3; k++) {
    vec3 lp = lampAt(k);
    vec3 post = vec3(lp.x + (lp.x < 0.0 ? -0.35 : 0.35), 0.0, lp.z);
    if (sdBox(p - vec3((lp.x + post.x) * 0.5, 1.15, lp.z), vec3(0.4, 1.25, 0.2)) < r.x) {
      float iron = min(sdCapsule(p, post, post + vec3(0.0, 2.3, 0.0), 0.04), sdCapsule(p, post + vec3(0.0, 2.25, 0.0), vec3(lp.x, 2.25, lp.z), 0.025));
      r = opU(r, vec2(iron, 6.0));
      r = opU(r, vec2(sdBox(p - lp, vec3(0.08, 0.12, 0.08)), 8.0));
    }
  }
  // Un farol caído junto a la mano, todavía prendido
  vec3 fq = p - DROPPED;
  fq.xy = mat2(0.0, -1.0, 1.0, 0.0) * fq.xy;
  r = opU(r, vec2(sdBox(fq, vec3(0.08, 0.12, 0.08)), 8.0));
  // El cadáver, armado en sus propias coordenadas y acostado al costado del camino
  p = vec3(OZ - p.z, p.y, OX - p.x);
  // Lejos del cuerpo no se calcula cada parte
  if (sdBox(p - vec3(-1.0, 0.6, -0.1), vec3(5.0, 1.1, 2.7)) > r.x) return r;
  // Torso, pecho, cadera, cuello y cabeza, fundidos
  float ribs = 0.03 * sin(p.x * 7.0) * smoothstep(0.3, 0.9, p.y);
  float b = sdEllipsoid(p - vec3(-1.0, 0.5, -0.4), vec3(1.9, 0.62, 1.0)) + ribs;
  b = smin(b, sdEllipsoid(p - vec3(0.6, 0.45, -0.1), vec3(0.9, 0.5, 0.8)), 0.4);
  b = smin(b, sdEllipsoid(p - vec3(-2.8, 0.38, -0.3), vec3(0.7, 0.38, 0.6)), 0.4);
  b = smin(b, sdCapsule(p, vec3(0.9, 0.45, 0.0), vec3(1.9, 0.3, 0.25), 0.24), 0.25);
  b = smin(b, sdEllipsoid(p - vec3(2.35, 0.3, 0.35), vec3(0.55, 0.32, 0.45)), 0.2);
  // Brazos: uno estirado hacia adelante, el otro doblado debajo
  float arm = sdCapsule(p, vec3(0.5, 0.55, 0.55), vec3(1.3, 0.3, 1.7), 0.17);
  arm = smin(arm, sdCapsule(p, vec3(1.3, 0.3, 1.7), vec3(2.6, 0.12, 2.05), 0.12), 0.1);
  arm = smin(arm, sdEllipsoid(p - vec3(2.85, 0.08, 2.1), vec3(0.24, 0.07, 0.18)), 0.08);
  arm = smin(arm, sdCapsule(p, vec3(0.2, 0.5, -1.1), vec3(0.9, 0.15, -2.1), 0.14), 0.1);
  arm = smin(arm, sdCapsule(p, vec3(0.9, 0.15, -2.1), vec3(1.9, 0.06, -2.3), 0.1), 0.08);
  // Piernas largas y flacas
  arm = min(arm, smin(sdCapsule(p, vec3(-3.2, 0.3, 0.1), vec3(-4.3, 0.2, 1.2), 0.15), sdCapsule(p, vec3(-4.3, 0.2, 1.2), vec3(-5.4, 0.07, 1.0), 0.1), 0.08));
  arm = min(arm, smin(sdCapsule(p, vec3(-3.2, 0.3, -0.6), vec3(-4.4, 0.18, -1.5), 0.15), sdCapsule(p, vec3(-4.4, 0.18, -1.5), vec3(-5.6, 0.06, -1.0), 0.1), 0.08));
  r = opU(r, vec2(smin(b, arm, 0.25), 3.0));
  // Dedos de la mano estirada (y tres de la otra)
  if (sdBox(p - vec3(3.3, 0.1, 2.1), vec3(0.7, 0.2, 0.6)) < r.x) {
    float f = 1e3;
    for (int k = 0; k < 4; k++) {
      float a = -0.55 + float(k) * 0.36;
      f = min(f, finger(p, vec3(3.0, 0.08, 2.1 + (float(k) - 1.5) * 0.08), vec3(cos(a), 0.0, sin(a) + 0.15), 0.75 + 0.1 * float(k == 1 || k == 2)));
    }
    r = opU(r, vec2(f, 5.0));
  }
  if (sdBox(p - vec3(2.2, 0.1, -2.3), vec3(0.6, 0.2, 0.5)) < r.x) {
    float f = 1e3;
    for (int k = 0; k < 3; k++) f = min(f, finger(p, vec3(1.95, 0.06, -2.3 + (float(k) - 1.0) * 0.08), vec3(1.0, 0.0, (float(k) - 1.0) * 0.4), 0.55));
    r = opU(r, vec2(f, 5.0));
  }
  // Espinas a lo largo del lomo
  if (sdBox(p - vec3(-1.1, 1.3, -0.45), vec3(1.9, 0.45, 0.3)) < r.x) {
    float s = 1e3;
    for (int k = 0; k < 6; k++) {
      float x = -2.6 + float(k) * 0.6;
      s = min(s, sdCapsule(p, vec3(x, 0.95, -0.42), vec3(x - 0.35, 1.4 + hash1(float(k)) * 0.25, -0.48), 0.035));
    }
    r = opU(r, vec2(s, 5.0));
  }
  // Tentáculos que salen de la cara y se derraman sobre las piedras
  if (sdBox(p - vec3(3.6, 0.15, 0.4), vec3(1.4, 0.3, 1.6)) < r.x) {
    float t = 1e3;
    float tw = twitch();
    for (int k = 0; k < 7; k++) {
      float a = -1.1 + float(k) * 0.37;
      t = min(t, tentacle(p, vec3(2.75, 0.25, 0.4) + vec3(0.0, 0.0, (float(k) - 3.0) * 0.06), a, 1.0 + hash1(float(k) * 3.7) * 0.6, k == 2 ? tw : 0.0));
    }
    r = opU(r, vec2(t, 4.0));
  }
  return r;
}


// Noche cerrada, una luna fría y bruma al ras del agua
vec3 sky(vec3 rd) {
  float y = clamp(rd.y, 0.0, 1.0);
  vec3 c = mix(vec3(0.13, 0.14, 0.17), vec3(0.02, 0.025, 0.045), pow(y, 0.6));
  float mo = max(dot(rd, MOON), 0.0);
  c += vec3(0.8, 0.85, 1.0) * (smoothstep(0.9985, 0.999, mo) * 1.2 + pow(mo, 12.0) * 0.18);
  return c + uFlash * 0.3;
}

vec3 shade(vec3 p, vec3 n, vec3 rd, float m, float ao) {
  vec3 moon = vec3(0.75, 0.82, 1.0) * 0.7; // la luna, más baja: la luz la ponen los faroles
  vec3 lamps = lighting(p, n, rd, m > 2.5 && m < 4.5 ? 30.0 : 8.0);
  float dif = max(dot(n, MOON), 0.0);
  vec3 amb = vec3(0.22, 0.25, 0.32) * (0.5 + 0.5 * n.y);
  vec3 h = normalize(MOON - rd);
  if (m < 1.5) {
    // Piedras mojadas: cantos rodados, algunos con un brillo de luna
    vec2 g = p.xz * 7.0;
    vec2 id = floor(g);
    float hv = hash2(id);
    float peb = smoothstep(0.45, 0.25, length(fract(g) - 0.5 + (vec2(hash2(id + 1.7), hash2(id + 4.1)) - 0.5) * 0.3));
    vec3 c = mix(vec3(0.1, 0.105, 0.115), vec3(0.22, 0.22, 0.24) * (0.7 + 0.6 * hv), peb);
    float sp = pow(max(dot(n, h), 0.0), 20.0);
    float glint = step(0.92, hv) * peb * sp * 3.0;
    return c * (amb * (0.5 + 0.5 * ao) + moon * dif * 0.7 + lamps * 2.4) + moon * (sp * sp * 0.3 * (0.6 + 0.4 * noise2(p.xz * 0.8)) + glint);
  }
  if (m < 2.5) {
    // Agua negra con la luna reflejada en ondas
    vec3 wn = normalize(vec3((noise2(p.xz * 2.0 + uTime * 0.3) - 0.5) * 0.25, 1.0, (noise2(p.zx * 2.0 - uTime * 0.25) - 0.5) * 0.25));
    float fres = pow(1.0 - max(dot(-rd, wn), 0.0), 4.0);
    return vec3(0.02, 0.025, 0.035) + sky(reflect(rd, wn)) * (0.3 + 0.6 * fres) + lamps * 0.25;
  }
  if (m < 4.5) {
    // Piel pálida y mojada; los tentáculos, rosados
    float wrap = clamp((dot(n, MOON) + 0.4) / 1.4, 0.0, 1.0);
    float rim = pow(1.0 - max(dot(-rd, n), 0.0), 2.0);
    float veins = smoothstep(0.02, 0.0, abs(noise2(p.xz * 5.0 + p.y * 3.0) - 0.5)) * 0.18;
    vec3 skin = (m < 3.5 ? vec3(0.82, 0.85, 0.88) : vec3(0.86, 0.7, 0.78)) * (1.0 - veins);
    float spec = pow(max(dot(n, h), 0.0), 30.0);
    return skin * (amb * 1.8 * (0.4 + 0.6 * ao) + moon * wrap * 1.05 + lamps) + vec3(0.6, 0.68, 0.8) * rim * 0.3 * ao + moon * spec * 0.8;
  }
  // Garras y espinas: hueso oscuro
  if (m < 5.5) return vec3(0.42, 0.4, 0.38) * (amb * 1.5 + moon * dif * 0.8 + lamps) + moon * pow(max(dot(n, h), 0.0), 20.0) * 0.3;
  if (m < 6.5) return vec3(0.3, 0.3, 0.32) * (amb * 1.5 + moon * dif + lamps); // hierro y madera
  if (m < 7.5) return vec3(1.25, 1.1, 0.6) * (0.85 + 0.15 * step(0.3, fract(sin(floor(uTime * 7.0)) * 43758.5)));
  // El vidrio de los faroles
  return vec3(1.4, 1.25, 1.0);
}
`

// --- Los faroles de la orilla: charcos de luz a lo largo del camino y uno caído junto a la mano ---
// Misma posición que lampAt() en el shader, pero la luz va justo debajo del farol: adentro de la caja
// su propia sombra la tapaba
const SHORE_LAMPS: V3[] = [
  [-1.05, 1.72, 3.5],
  [-1.05, 1.72, -3.5],
  [1.0, 1.72, -9.5],
]
const SHORE_DROPPED: V3 = [0.9, 0.2, -4.2] // DROPPED, un poco más arriba para que no quede adentro del piso
const LAMP_COLOR: V3 = [1.0, 0.88, 0.7] // blanco viejo, apenas cálido
const shoreLights = ({ t, cam }: LightCtx): LightSet => {
  const lamps: (Light & { d: number })[] = SHORE_LAMPS.map((pos, i) => ({
    type: "point",
    pos,
    color: LAMP_COLOR,
    intensity: 3.2 * (0.93 + 0.07 * Math.sin(t * 7.3 + i * 2.1)),
    range: 9,
    falloff: 0.28,
    wrap: 0.15,
    d: Math.hypot(pos[0] - cam.pos[0], pos[2] - cam.pos[2]),
  }))
  // Los dos más cercanos hacen sombra (en el celular las sombras van apagadas igual)
  ;[...lamps].sort((a, b) => a.d - b.d).slice(0, 2).forEach((l) => (l.shadow = true))
  const dropped: Light = { type: "point", pos: SHORE_DROPPED, color: [1.0, 0.82, 0.6], intensity: 2.2, range: 5.5, falloff: 0.6, wrap: 0.3 }
  return { ambient: [0, 0, 0], lights: [...lamps, dropped] }
}

export const SHORE: Scene3D = {
  id: "orilla",
  name: "orilla",
  label: "la orilla",
  blurb: "espacio 06 · nadie sabe qué es ni quién lo mató",
  glsl: shore,
  lights: shoreLights,
  exposure: 1.6,
  saturation: 0.45,
  grade: 0.15,
  outdoor: true,
  // Se camina por la orilla, al lado del cuerpo; al llegar al agua negra se vuelve al pasillo.
  // La puerta por la que se entró queda atrás (darse la vuelta)
  camera: {
    target: [0, 1.6, 8],
    yaw: 0,
    pitch: 0.18,
    frame: 1.4,
    clip: 1e4,
    pitchRange: [-0.3, 0.6],
    walk: { drift: 0.3, loop: 22, fov: 72, flash: 3, exit: true, start: 3 },
    exitDoor: { at: [0, 1.0, 6.5], facing: [0, 0, -1] },
  },
}
