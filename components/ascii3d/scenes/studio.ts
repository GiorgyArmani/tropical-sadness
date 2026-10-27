import type { LightCtx, Scene3D } from "./types"
import type { LightSet } from "../engine/lighting"

// --- El estudio: un cuarto chico y oscuro, forrado de espuma, con un sampler sobre la mesa bajo una
// lámpara colgante. Sus pads titilan solos como si alguien estuviera tocando. Acá no suena la radio:
// al entrar se abre el sampler (components/sampler) ---

const studio = /* glsl */ `
#define FOG 0.02
#define MAXD 30.0

const vec3 MPC = vec3(0.0, 0.83, -0.9); // centro del sampler
const vec3 DOOR = vec3(1.9, 1.05, -2.6);

// Cuántos pasos por segundo "toca" el sampler solo (90 bpm en semicorcheas)
float beat() { return floor(uTime * 6.0); }

vec2 map(vec3 p) {
  // Piso, paredes de los costados, pared del fondo y techo (el frente queda abierto: maqueta)
  vec2 r = vec2(p.y, 1.0);
  r = opU(r, vec2(3.2 - abs(p.x), 2.0));
  r = opU(r, vec2(p.z + 2.6, 2.0));
  r = opU(r, vec2(2.9 - p.y, 2.0));
  // La puerta de vuelta, metida en la pared del fondo
  float door = sdBox(p - vec3(DOOR.x, DOOR.y, -2.6), vec3(0.45, 1.05, 0.04));
  r = opU(r, vec2(door, 8.0));
  float frame = max(sdBox(p - vec3(DOOR.x, DOOR.y, -2.6), vec3(0.55, 1.12, 0.07)), -sdBox(p - vec3(DOOR.x, DOOR.y, -2.6), vec3(0.45, 1.05, 0.2)));
  r = opU(r, vec2(frame, 3.0));
  // Alfombra
  r = opU(r, vec2(sdBox(p - vec3(0.0, 0.005, -0.8), vec3(1.6, 0.005, 1.1)), 12.0));

  // Lejos de la mesa no hace falta calcular lo de encima
  float bound = sdBox(p - vec3(0.0, 0.9, -0.9), vec3(1.3, 0.95, 0.65));
  if (bound < r.x) {
    // Mesa: tapa y cuatro patas
    vec3 q = p - vec3(0.0, 0.74, -0.9);
    float top = sdBox(q, vec3(1.1, 0.03, 0.5));
    vec2 lq = vec2(abs(q.x) - 1.0, abs(q.z) - 0.4);
    float legs = sdBox(vec3(lq.x, p.y - 0.37, lq.y), vec3(0.03, 0.37, 0.03));
    r = opU(r, vec2(min(top, legs), 3.0));
    // El sampler: cuerpo claro con la franja negra de atrás un poco más alta
    vec3 m = p - MPC;
    float body = sdBox(m, vec3(0.2, 0.035, 0.23)) - 0.008;
    r = opU(r, vec2(body, 4.0));
    float strip = sdBox(m - vec3(0.0, 0.025, -0.16), vec3(0.19, 0.03, 0.06)) - 0.004;
    r = opU(r, vec2(strip, 5.0));
    // La pantalla
    r = opU(r, vec2(sdBox(m - vec3(-0.02, 0.057, -0.16), vec3(0.07, 0.004, 0.035)), 7.0));
    // Tres perillas
    float knobs = 1e3;
    for (int i = 0; i < 3; i++) knobs = min(knobs, sdCapsule(m, vec3(-0.08 + float(i) * 0.08, 0.035, -0.07), vec3(-0.08 + float(i) * 0.08, 0.06, -0.07), 0.014));
    r = opU(r, vec2(knobs, 4.0));
    // 4 x 4 pads
    vec3 pd = m - vec3(0.0, 0.04, 0.07);
    vec2 cell = clamp(floor(pd.xz / 0.06 + 2.0), 0.0, 3.0);
    vec2 cc = (cell - 1.5) * 0.06;
    float pads = sdBox(pd - vec3(cc.x, 0.0, cc.y), vec3(0.024, 0.006, 0.024)) - 0.002;
    r = opU(r, vec2(pads, 6.0));
    // Botones de colores a los dos lados de los pads (4 por lado), el vúmetro y el logo en la franja negra
    vec3 bq = m - vec3(0.0, 0.04, 0.075);
    bq.x = abs(bq.x) - 0.168;
    bq.z -= clamp(floor(bq.z / 0.05 + 0.5), -1.0, 2.0) * 0.05;
    float btn = sdBox(bq, vec3(0.014, 0.006, 0.014));
    vec3 vq = m - vec3(0.115, 0.058, -0.16);
    vq.z -= clamp(floor(vq.z / 0.018 + 0.5), -2.0, 2.0) * 0.018;
    float vu = sdBox(vq, vec3(0.014, 0.004, 0.006));
    float logo = sdBox(m - vec3(-0.14, 0.058, -0.19), vec3(0.04, 0.003, 0.012));
    r = opU(r, vec2(min(btn, min(vu, logo)), 14.0));
    // Parlantes a los costados, un poco girados hacia adelante
    vec3 s = p - vec3(0.0, 0.99, -1.05);
    s.x = abs(s.x) - 0.78;
    s.xz = mat2(0.94, 0.34, -0.34, 0.94) * s.xz;
    float spk = sdBox(s, vec3(0.13, 0.22, 0.13)) - 0.01;
    r = opU(r, vec2(spk, 9.0));
  }

  // Lámpara colgante: cable y pantalla
  float cord = sdCapsule(p, vec3(0.0, 2.9, -0.9), vec3(0.0, 1.95, -0.9), 0.008);
  vec3 lp = p - vec3(0.0, 1.88, -0.9);
  float shade = max(sdEllipsoid(lp, vec3(0.28, 0.16, 0.28)), -sdEllipsoid(lp + vec3(0.0, 0.02, 0.0), vec3(0.26, 0.15, 0.26)));
  shade = max(shade, lp.y - 0.08);
  shade = max(shade, -lp.y - 0.12);
  r = opU(r, vec2(min(cord, shade), 10.0));
  r = opU(r, vec2(length(lp - vec3(0.0, -0.02, 0.0)) - 0.06, 11.0)); // la bombita

  // Una planta en una maceta, en el rincón
  vec3 pp = p - vec3(-2.3, 0.0, -1.9);
  float pot = sdBox(pp - vec3(0.0, 0.22, 0.0), vec3(0.2, 0.22, 0.2)) - 0.02;
  r = opU(r, vec2(pot, 3.0));
  float leaves = 1e3;
  for (int i = 0; i < 6; i++) {
    float a = float(i) * 1.047 + 0.4;
    vec3 tip = vec3(cos(a) * 0.55, 1.0 + hash1(float(i)) * 0.5, sin(a) * 0.55);
    leaves = min(leaves, sdCapsule(pp, vec3(0.0, 0.4, 0.0), tip, 0.035));
    leaves = min(leaves, sdEllipsoid(pp - tip, vec3(0.18, 0.04, 0.12)));
  }
  r = opU(r, vec2(leaves, 13.0));
  return r;
}

vec3 sky(vec3 rd) {
  return vec3(0.015, 0.012, 0.02);
}

vec3 shade(vec3 p, vec3 n, vec3 rd, float m, float ao) {
  vec3 light = lighting(p, n, rd, 0.0) * (0.5 + 0.5 * ao);
  if (m < 1.5) {
    // Tablas de madera oscura
    float plank = floor(p.x * 4.0);
    float grain = 0.85 + 0.15 * noise2(vec2(p.z * 3.0, plank * 7.0));
    float seam = step(0.96, fract(p.x * 4.0));
    return vec3(0.16, 0.15, 0.17) * grain * (1.0 - seam * 0.5) * light;
  }
  if (m < 2.5) {
    // Espuma acústica: cuadros de cuñas que cambian de sentido
    vec2 uv = abs(n.x) > 0.5 ? p.zy : (abs(n.y) > 0.5 ? p.xz : p.xy);
    vec2 c = floor(uv * 2.5);
    vec2 f = fract(uv * 2.5);
    float w = mod(c.x + c.y, 2.0) < 0.5 ? f.x : f.y;
    float ridge = 0.75 + 0.25 * abs(fract(w * 4.0) - 0.5) * 2.0;
    return vec3(0.36, 0.33, 0.4) * ridge * light;
  }
  if (m < 3.5) return vec3(0.13, 0.13, 0.16) * light; // mesa negra, el marco y la maceta
  if (m < 4.5) return vec3(0.68, 0.67, 0.64) * light + vec3(0.02);
  if (m < 5.5) return vec3(0.07) * light + vec3(0.01);
  if (m < 6.5) {
    // Pads: los que "suenan" se prenden verdes y se apagan rápido
    vec3 pd = p - MPC - vec3(0.0, 0.04, 0.07);
    vec2 cell = clamp(floor(pd.xz / 0.06 + 2.0), 0.0, 3.0);
    float id = cell.x + cell.y * 4.0;
    float b = beat();
    float on = 0.0;
    for (int k = 0; k < 3; k++) {
      float bk = b - float(k);
      float fade = 1.0 - fract(uTime * 6.0) * 0.35 - float(k) * 0.3;
      float a = floor(hash1(bk * 3.7) * 16.0);
      float c = floor(hash1(bk * 5.1 + 2.0) * 16.0);
      on = max(on, step(abs(a - id), 0.5) * fade);
      on = max(on, step(abs(c - id), 0.5) * step(0.5, hash1(bk * 1.3)) * fade);
    }
    // El borde de cada pad queda siempre encendido en verde tenue, como en el aparato
    vec2 f = abs(fract(pd.xz / 0.06 + 2.0) - 0.5);
    float rim = smoothstep(0.3, 0.42, max(f.x, f.y));
    return vec3(0.12) * light + vec3(0.55, 1.1, 0.25) * (0.06 + rim * 0.6) + vec3(0.8, 1.6, 0.35) * on * 2.6;
  }
  if (m < 7.5) {
    // Pantalla: celeste con renglones
    float row = step(0.5, fract(p.z * 90.0 + 0.25));
    return vec3(0.5, 1.15, 1.6) * (0.75 + 0.25 * row);
  }
  if (m < 8.5) {
    // La puerta: luz amarilla del pasillo con estática
    float s = hash2(floor(p.xy * 30.0) + floor(uTime * 12.0) * 7.0);
    return vec3(0.95, 0.82, 0.42) * (0.55 + s * 0.45);
  }
  if (m < 9.5) {
    // Parlante: caja negra con el cono al frente
    vec3 s = p - vec3(0.0, 0.99, -1.05);
    s.x = abs(s.x) - 0.78;
    s.xz = mat2(0.94, 0.34, -0.34, 0.94) * s.xz;
    float cone = smoothstep(0.1, 0.08, length(s.xy + vec2(0.0, 0.05))) * step(0.1, s.z);
    float tweet = smoothstep(0.04, 0.03, length(s.xy - vec2(0.0, 0.13))) * step(0.1, s.z);
    return mix(vec3(0.1), vec3(0.03), max(cone, tweet)) * light;
  }
  if (m < 10.5) return n.y < -0.2 ? vec3(0.8, 0.95, 1.3) : vec3(0.12) * light; // pantalla de la lámpara
  if (m < 11.5) return vec3(1.0, 1.2, 1.6);
  if (m < 12.5) {
    // Alfombra rojo vino con un borde
    vec2 q = abs(p.xz - vec2(0.0, -0.8));
    float border = step(1.45, q.x) + step(0.95, q.y);
    return mix(vec3(0.16, 0.07, 0.12), vec3(0.3, 0.22, 0.32), min(border, 1.0)) * (0.85 + 0.15 * noise2(p.xz * 20.0)) * light;
  }
  if (m > 13.5) {
    // Las luces del sampler
    vec3 q = p - MPC;
    if (q.z < -0.09) {
      if (q.x < 0.0) return vec3(1.7, 0.12, 0.08); // el logo, rojo
      // Vúmetro: de atrás hacia adelante rojo, amarillo, amarillo, verde, verde; sube con cada golpe
      float row = clamp(floor((q.z + 0.16) / 0.018 + 0.5), -2.0, 2.0);
      float level = (1.0 - fract(uTime * 6.0)) * (0.55 + 0.45 * hash1(beat() * 2.3));
      float lit = step((2.0 - row) / 5.0, level);
      vec3 c = row < -1.5 ? vec3(1.8, 0.15, 0.1) : (row < 0.5 ? vec3(1.8, 1.3, 0.1) : vec3(0.5, 1.6, 0.3));
      return mix(c * 0.12, c, lit);
    }
    float idx = clamp(floor((q.z - 0.075) / 0.05 + 0.5), -1.0, 2.0);
    if (q.x > 0.0) {
      // Derecha: amarillo, REC rojo que titila, play verde, rojo
      if (idx < -0.5) return vec3(1.7, 1.25, 0.1);
      if (idx < 0.5) return vec3(1.9, 0.12, 0.08) * (0.35 + 0.65 * step(0.5, fract(uTime * 0.8)));
      if (idx < 1.5) return vec3(0.35, 1.5, 0.45);
      return vec3(1.6, 0.15, 0.1);
    }
    // Izquierda: dos naranjas, amarillo y rojo
    if (idx < 0.5) return vec3(1.8, 0.6, 0.12);
    if (idx < 1.5) return vec3(1.7, 1.25, 0.1);
    return vec3(1.5, 0.12, 0.1);
  }
  return vec3(0.18, 0.5, 0.22) * light; // hojas
}
`

const studioLights = ({ t }: LightCtx): LightSet => {
  // El verde de los pads late con el "tema" que se toca solo
  const pulse = 0.6 + 0.4 * Math.abs(Math.sin(t * Math.PI * 1.5))
  return {
    ambient: [0.1, 0.13, 0.22],
    lights: [
      // La lámpara: un charco de luz azulada y tenue sobre la mesa
      { type: "spot", pos: [0, 1.7, -0.9], dir: [0, -1, 0], angle: 0.75, softness: 0.6, color: [0.62, 0.78, 1], intensity: 4.2, range: 7, falloff: 0.2, wrap: 0.2, shadow: true },
      // La puerta del fondo deja pasar algo del pasillo
      { type: "point", pos: [1.9, 1.1, -2.3], color: [1, 0.9, 0.55], intensity: 0.9, range: 3.5, falloff: 0.8 },
      // El brillo de los pads y la pantalla sobre la mesa
      { type: "point", pos: [0, 0.98, -0.8], color: [0.55, 1, 0.4], intensity: 1.1 * pulse, range: 1.8, falloff: 2.5 },
    ],
  }
}

export const STUDIO: Scene3D = {
  id: "estudio",
  name: "estudio",
  label: "el estudio",
  blurb: "espacio 08 · un sampler sobre la mesa; acá la radio se calla y tocas tú",
  glsl: studio,
  lights: studioLights,
  exposure: 1.7,
  saturation: 0.95,
  grade: 0,
  camera: {
    target: [0, 0.95, -0.9],
    yaw: 0.22,
    pitch: 0.5,
    frame: 1.25,
    clip: 2.8,
    pitchRange: [0.05, 1.2],
    exitDoor: { at: [1.9, 1.05, -2.55], facing: [0, 0, 1] },
    action: { at: [0, 1.0, -0.9], near: 2.4, label: "tocar el sampler" }, // encima del sampler
  },
}
