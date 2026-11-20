import type { LightCtx, Scene3D } from "./types"
import type { LightSet } from "../engine/lighting"
import { g } from "./types"

// --- La navidad: un claro nevado en el medio de un bosque de pinos, de noche, con un árbol de navidad
// enorme en el centro. El árbol es la luz del lugar: sus luces cambian de juego cada tanto (titilan,
// corren en espiral, suben en olas de color, respiran en blanco) y la estrella de arriba alumbra la
// nieve. En el cielo, una aurora boreal verde y violeta. Es para juntarse a chillear: se camina libre
// alrededor del árbol (se ven los avatares) y la puerta por la que se llegó vuelve al pasillo ---

const TREE: [number, number, number] = [0, 0, -16] // el pie del árbol
const TREE_R = 3.3 // no se pasa más cerca que esto del tronco (las ramas de abajo llegan a 3)
const STAR_Y = 7.75

const xmas = /* glsl */ `
#define FOG 0.022
#define MAXD 80.0
#define HAS_GLOW

const vec3 TREE = vec3(${g(TREE[0])}, ${g(TREE[1])}, ${g(TREE[2])});
const vec3 STAR = vec3(${g(TREE[0])}, ${g(STAR_Y)}, ${g(TREE[2])});
const vec3 DOOR = vec3(0.0, 0.0, -4.5);
#define AV_SUN normalize(vec3(0.0, 0.6, 0.8)) // los avatares se leen con la luz del árbol de frente

// Colores del arcoíris para las olas de luz del árbol
vec3 pal3(float h) { return 1.4 * (0.5 + 0.5 * cos(6.2832 * (h + vec3(0.0, 0.33, 0.67)))); }

// Los pisos del árbol: i de 0 (abajo) a 4. x = altura de la base, y = alto, z = radio
vec3 tier(float i) { return vec3(1.0 + i * 1.15, 2.4 - i * 0.15, 3.0 - i * 0.55); }

// Un cono con el borde de abajo ondulado (las puntas de las ramas). q relativo al pie del árbol
float cone(vec3 q, vec3 t, float rho, float wav) {
  float R = t.z + wav * t.z * 0.07;
  float top = t.x + t.y;
  float side = (rho * t.y + (q.y - top) * R) / sqrt(t.y * t.y + R * R);
  return max(side, t.x - q.y);
}

// Las 5 estrellas de 2D (la de la punta)
float star5(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809017, -0.587785);
  const vec2 k2 = vec2(-0.809017, -0.587785);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

// Los adornos: dos anillos de bolas por piso (en el borde de abajo y a media altura). Devuelve la
// distancia a la bola más cercana y en id cuál es (para el color)
float ornaments(vec3 q, float rho, float ang, out float id) {
  float d = 1e3;
  id = 0.0;
  for (int i = 0; i < 5; i++) {
    vec3 t = tier(float(i));
    for (int k = 0; k < 2; k++) {
      float fk = float(k);
      float y = t.x + 0.15 + fk * t.y * 0.38;
      if (abs(q.y - y) > 0.4) continue;
      float rr = t.z * (1.0 - (y - t.x) / t.y) + 0.05; // sobre la superficie del cono a esa altura
      float n = floor(rr * 2.6 + 3.0);
      float sec = 6.2832 / n;
      float off = hash1(float(i) * 3.1 + fk) * sec;
      float c = floor((ang - off) / sec + 0.5);
      float a = c * sec + off;
      float e = length(vec3(q.x - cos(a) * rr, q.y - y + 0.08, q.z - sin(a) * rr)) - 0.17;
      if (e < d) { d = e; id = float(i) * 31.0 + fk * 7.0 + mod(c, n); }
    }
  }
  return d;
}

// La nieve del suelo: lomitas suaves, lisa cerca de la puerta y del árbol
float snowH(vec2 xz) {
  float h = (fbm2(xz * 0.18) - 0.5) * 0.7 + (noise2(xz * 1.3) - 0.5) * 0.06;
  return h * smoothstep(1.2, 4.0, length(xz - DOOR.xz)) * smoothstep(3.5, 7.0, length(xz - TREE.xz));
}

// Un pino del bosque en c (pie), alto h: un cono con el borde serruchado en pisos de ramas
float pine(vec3 p, vec3 c, float h) {
  vec3 q = p - c;
  float rho = length(q.xz);
  float u = clamp(q.y / h, 0.0, 1.0);
  float R = h * 0.3 * (1.0 - u) * (0.6 + 0.4 * fract(u * 5.0 + 0.2));
  float d = max((rho - R) * 0.55, max(h * 0.12 - q.y, q.y - h));
  float trunk = max(rho - h * 0.035, max(-q.y, q.y - h * 0.2));
  return min(d, trunk);
}

// El bosque: dos anillos de pinos alrededor del claro, uno por sector (y el sector vecino)
vec2 forest(vec3 p, vec2 r) {
  vec2 q = p.xz - TREE.xz;
  float rho = length(q);
  float ang = atan(q.y, q.x);
  for (int ring = 0; ring < 2; ring++) {
    float fr = float(ring);
    float n = 26.0 + fr * 14.0;
    float sec = 6.2832 / n;
    float c0 = floor(ang / sec);
    float base = 18.5 + fr * 9.0;
    if (abs(rho - base - 4.0) > 9.0) continue;
    for (int k = 0; k < 2; k++) {
      float c = c0 + float(k);
      float hv = hash2(vec2(c, fr * 7.3));
      float a = (c + 0.2 + hv * 0.6) * sec;
      float rr = base + hv * 7.0;
      float h = 6.0 + hash1(c * 1.7 + fr) * 6.0 + fr * 2.0;
      vec3 pc = vec3(TREE.x + cos(a) * rr, snowH(TREE.xz + vec2(cos(a), sin(a)) * rr) - 0.2, TREE.z + sin(a) * rr);
      if (length(p.xz - pc.xz) - h * 0.32 > r.x) continue;
      r = opU(r, vec2(pine(p, pc, h), 8.0));
    }
  }
  return r;
}

vec2 map(vec3 p) {
  vec2 r = vec2((p.y - snowH(p.xz)) * 0.8, 1.0);
  // La puerta de vuelta (solo se calcula de cerca)
  vec3 dq = p - DOOR;
  if (sdBox(dq - vec3(0.0, 0.9, 0.0), vec3(0.7, 1.0, 0.2)) < r.x) {
    float jambs = min(sdBox(vec3(abs(dq.x) - 0.5, dq.y - 0.8, dq.z), vec3(0.07, 0.8, 0.07)), sdBox(dq - vec3(0.0, 1.62, 0.0), vec3(0.57, 0.07, 0.07)));
    r = opU(r, vec2(jambs, 2.0));
    r = opU(r, vec2(sdBox(dq - vec3(0.0, 0.8, 0.0), vec3(0.43, 0.78, 0.015)), 3.0));
  }
  // El árbol (solo dentro de su cilindro)
  vec3 q = p - TREE;
  float rho = length(q.xz);
  if (max(rho - 3.4, max(-q.y, q.y - 8.4)) < r.x) {
    float ang = atan(q.z, q.x);
    r = opU(r, vec2(max(rho - 0.28, q.y - 1.6), 4.0)); // el tronco
    float wav = sin(ang * 9.0 + q.y * 2.0);
    float fol = 1e3;
    for (int i = 0; i < 5; i++) fol = min(fol, cone(q, tier(float(i)), rho, wav));
    r = opU(r, vec2(fol * 0.8, 5.0));
    float id;
    r = opU(r, vec2(ornaments(q, rho, ang, id), 6.0));
    // La estrella: siempre de frente a quien la mira
    vec3 s = p - STAR;
    vec2 to = normalize(uRo.xz - STAR.xz + 1e-4);
    vec2 sx = vec2(s.x * to.y - s.z * to.x, dot(s.xz, to));
    float st = star5(vec2(sx.x, s.y), 0.55, 0.45);
    r = opU(r, vec2(max(st, abs(sx.y) - 0.06) - 0.03, 7.0));
  }
  if (rho > 14.0) r = forest(p, r);
  return r;
}

// El cielo de noche: azul casi negro, estrellas y la aurora
vec3 sky(vec3 rd) {
  float y = rd.y;
  vec3 c = mix(vec3(0.03, 0.05, 0.09), vec3(0.004, 0.008, 0.02), smoothstep(0.0, 0.5, y));
  float up = smoothstep(0.02, 0.25, y); // cerca del horizonte la bruma las tapa
  // La vía láctea: una franja de polvo que cruza el cielo en diagonal
  float mw = exp(-pow(dot(rd, normalize(vec3(0.35, 0.45, -0.82))) / 0.2, 2.0));
  float dust = fbm2(rd.xz / (y + 0.35) * 2.5);
  c += vec3(0.25, 0.27, 0.4) * mw * smoothstep(0.35, 0.8, dust) * 0.35 * up;
  // Estrellas en tres capas (pocas grandes, más medianas, muchas chiquitas; más dentro de la franja).
  // Cada celda del cielo tiene a lo sumo una, corrida al azar dentro de la celda, y titila a su ritmo
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float sc = 40.0 + fi * 45.0;
    vec3 q = rd * sc;
    vec3 cell = floor(q);
    float h = hash2(cell.xy + cell.z * 17.3 + fi * 5.1);
    if (h > 0.16 + fi * 0.08 + mw * 0.25) continue;
    vec3 ctr = cell + 0.5 + (vec3(hash1(h * 91.0), hash1(h * 53.0), hash1(h * 37.0)) - 0.5) * 0.5;
    float d = length(q - ctr);
    float tw = 0.65 + 0.35 * sin(uTime * (1.5 + h * 9.0) + h * 60.0);
    vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.9, 0.75), hash1(h * 13.0));
    c += tint * smoothstep(0.32 - fi * 0.06, 0.0, d) * (1.4 - fi * 0.4) * tw * up;
  }
  // Una estrella fugaz cada tanto (dura menos de un segundo)
  float sid = floor(uTime / 23.0);
  float sph = fract(uTime / 23.0) * 23.0;
  if (sph < 0.9) {
    float az = hash1(sid * 3.7) * 6.2832;
    vec3 a = normalize(vec3(cos(az), 0.55 + hash1(sid) * 0.3, sin(az)));
    vec3 b = normalize(a + vec3(-sin(az), -0.35, cos(az)) * 0.35);
    vec3 head = normalize(mix(a, b, sph / 0.9));
    vec3 ab = head - a;
    float k = clamp(dot(rd - a, ab) / max(dot(ab, ab), 1e-5), 0.0, 1.0);
    float ds = length(rd - a - ab * k);
    c += vec3(0.9, 0.95, 1.0) * smoothstep(0.006, 0.0, ds) * k * k * (1.0 - sph / 0.9) * 2.0;
  }
  if (y > 0.0) {
    // Dos cortinas: la base sube y baja con el rumbo, la luz cae hacia arriba y tiene rayos verticales.
    // El rumbo va como dirección (no ángulo) para que no haya costura detrás
    vec2 dir = rd.xz / max(length(rd.xz), 1e-3);
    for (int i = 0; i < 2; i++) {
      float fi = float(i);
      float w = fbm2(dir * (1.6 + fi) + vec2(uTime * 0.012, fi * 5.0 - uTime * 0.008));
      float b = 0.16 + fi * 0.12 + (w - 0.5) * 0.35;
      float e = y - b;
      float curtain = smoothstep(-0.015, 0.02, e) * exp(-max(e, 0.0) * (5.0 - fi * 1.5));
      float rays = 0.45 + 0.55 * noise2(dir * 38.0 + vec2(uTime * 0.25, fi * 9.0));
      float mask = smoothstep(0.35, 0.65, fbm2(dir * 1.1 + vec2(fi * 3.0, uTime * 0.01)));
      vec3 col = mix(vec3(0.15, 1.0, 0.5), vec3(0.6, 0.3, 1.0), smoothstep(0.02, 0.3, e));
      c += col * curtain * rays * mask * (0.85 - fi * 0.25);
    }
  }
  return c;
}

vec3 bulbs(vec3 q); // más abajo

// La luz que da el árbol: sus focos (por acá salen con su color puro en el ASCII), un halo suave
// alrededor y la estrella, que se ven a través de la niebla
vec3 glow(vec3 rd, float t) {
  vec3 g = vec3(0.0);
  if (t < 1e3) {
    vec3 q = uRo + rd * t - TREE;
    if (length(q.xz) < 3.3 && q.y > 1.0 && q.y < 7.4) g += bulbs(q) * 0.45;
  }
  vec3 dc = TREE + vec3(0.0, 3.6, 0.0) - uRo;
  float ac = dot(dc, rd);
  if (ac > 0.0) {
    vec3 off = dc - rd * ac;
    g += vec3(0.85, 0.9, 1.0) * exp(-length(off * vec3(1.0, 0.55, 1.0)) * 0.55) * 0.07;
  }
  vec3 d = STAR - uRo;
  float a = dot(d, rd);
  if (a > 0.0 && a < t + 1.0) {
    float k = length(d - rd * a);
    g += vec3(1.0, 0.92, 0.75) * (exp(-k * 9.0) * 0.9 + exp(-k * 1.6) * 0.12) * (0.9 + 0.1 * sin(uTime * 1.3));
  }
  return g;
}

// Las luces del árbol: puntos sobre una guirnalda en espiral. Devuelve el color del foco que hay en q (0 si no hay)
vec3 bulbs(vec3 q) {
  float ang = atan(q.z, q.x);
  float s = q.y * 0.55 + ang / 6.2832; // vueltas de la espiral
  float lane = floor(s * 3.0);
  float f = fract(s * 3.0);
  if (abs(f - 0.5) > 0.24) return vec3(0.0);
  float seg = ang * length(q.xz) / 0.2 + lane * 0.5; // un foco cada 20 cm a lo largo de la guirnalda
  float cell = floor(seg);
  vec2 cq = vec2(fract(seg) - 0.5, (f - 0.5) * 3.0);
  float lc = length(cq);
  float dot0 = smoothstep(0.42, 0.2, lc) + smoothstep(0.75, 0.3, lc) * 0.3; // el foco y su halo sobre las ramas
  if (dot0 <= 0.0) return vec3(0.0);
  float idx = lane * 37.0 + cell;
  float h = hash1(idx);
  // Cada 12 s cambia el juego de luces
  float mode = mod(floor(uTime / 12.0), 4.0);
  vec3 col = h < 0.25 ? vec3(1.6, 0.15, 0.1) : (h < 0.5 ? vec3(0.2, 1.4, 0.3) : (h < 0.75 ? vec3(0.25, 0.45, 1.7) : vec3(1.6, 1.1, 0.3)));
  float on;
  if (mode < 0.5) on = 0.35 + 0.65 * step(0.4, fract(uTime * (0.4 + h * 0.6) + h * 7.0)); // titilan sueltas
  else if (mode < 1.5) on = 0.15 + 0.85 * smoothstep(0.75, 1.0, fract(s * 0.5 - uTime * 0.35 + lane * 0.1)); // corren en espiral
  else if (mode < 2.5) { col = pal3(q.y * 0.12 - uTime * 0.15); on = 1.0; } // olas de color que suben
  else { col = vec3(1.5, 1.45, 1.35); on = 0.45 + 0.55 * (0.5 + 0.5 * sin(uTime * 1.8 + q.y * 0.6)); } // blanco que respira
  return col * on * dot0 * 2.4;
}

vec3 shade(vec3 p, vec3 n, vec3 rd, float m, float ao) {
  vec3 light = lighting(p, n, rd, 0.0);
  if (m < 1.5) {
    // Nieve azulada con destellos chiquitos que brillan al moverse
    float spark = step(0.985, hash2(floor(p.xz * 22.0))) * step(0.5, fract(hash2(floor(p.xz * 22.0) + 3.0) + uTime * 0.3));
    // Más oscura que blanca y con vetas: así el ASCII no la llena de letras pesadas y se lee el relieve
    float drift = 0.7 + 0.3 * fbm2(p.xz * 1.7 + vec2(p.z * 0.3, 0.0));
    return vec3(0.45, 0.5, 0.62) * drift * light * (0.6 + 0.4 * ao) +vec3(0.9, 0.95, 1.0) * spark * 0.35 * exp(-length(p - uRo) * 0.15);
  }
  if (m < 2.5) return vec3(0.35, 0.3, 0.28) * light;
  // Adentro de la puerta: el pasillo, que titila un poco
  if (m < 3.5) return vec3(1.25, 1.1, 0.6) * (0.85 + 0.15 * step(0.3, fract(sin(floor(uTime * 7.0)) * 43758.5)));
  if (m < 4.5) return vec3(0.25, 0.15, 0.09) * light;
  if (m < 5.5) {
    // Las ramas: verde con agujas en vetas, algo de nieve arriba, y las luces encima
    vec3 q = p - TREE;
    float ndl = noise2(vec2(atan(q.z, q.x) * 18.0, q.y * 9.0));
    vec3 leaf = mix(vec3(0.03, 0.22, 0.08), vec3(0.15, 0.55, 0.2), ndl);
    leaf = mix(leaf, vec3(0.75, 0.8, 0.9), smoothstep(0.55, 0.9, n.y) * 0.35);
    vec3 b = bulbs(q);
    // El árbol brilla un poco desde adentro (es la luz del lugar)
    return leaf * (light + vec3(0.18, 0.22, 0.18)) * (0.5 + 0.5 * ao) + b;
  }
  if (m < 6.5) {
    // Las bolas: rojas, azules, doradas y plateadas, con el brillo de la estrella
    vec3 q = p - TREE;
    float id;
    ornaments(q, length(q.xz), atan(q.z, q.x), id);
    float h = hash1(id * 1.37);
    vec3 c = h < 0.35 ? vec3(0.85, 0.06, 0.06) : (h < 0.6 ? vec3(0.1, 0.25, 0.95) : (h < 0.85 ? vec3(0.95, 0.7, 0.2) : vec3(0.8, 0.82, 0.88)));
    float spec = pow(max(dot(reflect(rd, n), normalize(STAR - p)), 0.0), 24.0);
    return c * (light * 0.9 + 0.22) + vec3(1.0) * spec * 0.9;
  }
  if (m < 7.5) return vec3(1.7, 1.45, 0.9) * (0.9 + 0.1 * sin(uTime * 1.3)); // la estrella
  // Pinos del bosque: verde oscuro con nieve en las ramas
  float sn = smoothstep(0.35, 0.75, n.y + (noise2(p.xz * 3.0 + p.y) - 0.5) * 0.4);
  return mix(vec3(0.03, 0.12, 0.07), vec3(0.7, 0.76, 0.88), sn) * light * (0.55 + 0.45 * ao);
}
`

// Colores del arcoíris para las olas de luz del árbol (va antes de shade)
const PAL = "vec3 pal3(float h) { return 1.4 * (0.5 + 0.5 * cos(6.2832 * (h + vec3(0.0, 0.33, 0.67)))); }\n"

// La luz del árbol sobre la nieve: la estrella arriba (blanca, apenas cálida), un foco adentro que late
// con los focos y tres luces de color que giran alrededor. Siguen el mismo juego que los focos del shader
// (cada 12 s: titilan, corren, olas de color, blanco que respira). La aurora tiñe todo de un verde muy suave
const hue = (h: number): [number, number, number] => [0, 0.33, 0.67].map((o) => 0.5 + 0.5 * Math.cos(6.2832 * (h + o))) as [number, number, number]
const ORBIT: [number, number, number][] = [
  [1, 0.25, 0.2],
  [0.3, 1, 0.45],
  [0.35, 0.5, 1],
]
const xmasLights = ({ t }: LightCtx): LightSet => {
  const [x, , z] = TREE
  const mode = Math.floor(t / 12) % 4
  const breath = 0.5 + 0.5 * Math.sin(t * 1.8)
  const orbit = (k: number) => {
    const a = (mode === 1 ? t * 1.2 : t * 0.25) + (k * Math.PI * 2) / 3
    let color = ORBIT[k]
    let intensity = 1.8
    if (mode === 0) intensity *= Math.sin(Math.floor(t * 3 + k * 7) * 12.9898) > -0.3 ? 1 : 0.35 // titilan
    if (mode === 2) color = hue(t * 0.15 + k / 3) // olas de color
    if (mode === 3) {
      color = [0.95, 0.95, 1]
      intensity *= 0.45 + 0.55 * breath // blanco que respira
    }
    return { type: "point" as const, pos: [x + Math.cos(a) * 3.6, 1.4 + k * 1.3, z + Math.sin(a) * 3.6] as [number, number, number], color, intensity, range: 11, falloff: 0.35, wrap: 0.3 }
  }
  return {
    ambient: [0.05, 0.08, 0.12],
    lights: [
      { type: "point", pos: [x, STAR_Y, z], color: [1, 0.95, 0.88], intensity: 3.6 * (0.95 + 0.05 * Math.sin(t * 1.3)), range: 26, falloff: 0.05, wrap: 0.25, shadow: true },
      { type: "point", pos: [x, 2.2, z + 1.5], color: [0.95, 0.95, 1], intensity: 1.4 + 0.8 * breath, range: 13, falloff: 0.15, wrap: 0.3 },
      orbit(0),
      orbit(1),
      orbit(2),
      { type: "directional", dir: [0.2, -1, 0.4], color: [0.35, 0.9, 0.6], intensity: 0.12, wrap: 0.5 }, // la aurora
    ],
  }
}

// La altura del piso: plano (la nieve sube y baja poco) menos alrededor del árbol, que no se atraviesa
const xmasFloor = (px: number, pz: number) => (Math.hypot(px - TREE[0], pz - TREE[2]) < TREE_R ? null : 0)

export const XMAS: Scene3D = {
  id: "navidad",
  name: "navidad",
  label: "la navidad",
  blurb: "espacio 09 · un árbol encendido en el medio del bosque, bajo la aurora",
  glsl: xmas,
  lights: xmasLights,
  avatars: true,
  exposure: 1.35,
  saturation: 0.95,
  grade: 0,
  outdoor: true,
  // Un plano redondo alrededor del árbol: se llega por la puerta, de frente a él
  camera: {
    target: [0, 1.6, 0],
    yaw: 0,
    pitch: -0.3, // mirando un poco hacia arriba: se llega viendo el árbol entero y la aurora
    frame: 1.4,
    clip: 1e4,
    pitchRange: [-1.2, 1.2],
    walk: {
      drift: 0,
      loop: 30,
      fov: 72,
      flash: 2,
      start: 7.5,
      roam: { center: [TREE[0], TREE[2]], radius: 12, floor: xmasFloor },
    },
    exitDoor: { at: [0, 1.0, -4.5], facing: [0, 0, -1] },
  },
}
