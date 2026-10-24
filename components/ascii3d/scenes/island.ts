import type { Scene3D } from "./types"

// --- La isla en 3D: el mismo atardecer vaporwave, ahora con profundidad ---

const island = /* glsl */ `
#define FOG 0.025
#define MAXD 120.0
#define HAS_GLOW

// --- Vida marina ---
// Delfines que saltan alrededor de la isla, una ballena que sale a respirar a lo lejos (lomo, chorro y
// cola), y en el agua: arrecife de coral en la orilla, cardúmenes que pasan por debajo y, de noche,
// medusas y plancton que brillan. Los animales solo se calculan cerca de donde están (cajas que los
// contienen), así casi no cuestan.

// Un delfín en coordenadas propias (x hacia la cabeza, y arriba): cuerpo, hocico, aleta y cola
float dolphinSdf(vec3 q) {
  float b = sdEllipsoid(q, vec3(0.78, 0.2, 0.19));
  b = min(b, sdCapsule(q, vec3(0.62, -0.02, 0.0), vec3(0.95, -0.06, 0.0), 0.05)); // hocico
  b = min(b, sdCapsule(q, vec3(-0.05, 0.16, 0.0), vec3(-0.25, 0.4, 0.0), 0.035)); // aleta de arriba
  vec3 t = q - vec3(-0.85, 0.0, 0.0);
  b = min(b, sdBox(vec3(t.x, t.y, abs(t.z) - 0.14 + t.x * 0.4), vec3(0.08, 0.015, 0.14))); // cola
  b = min(b, sdCapsule(q, vec3(0.15, -0.12, 0.0), vec3(0.05, -0.2, 0.16), 0.03)); // aleta del costado
  return b;
}
// Dónde está el delfín i y hacia dónde mira: cada uno da saltos de 7 segundos alrededor de la isla
void dolphinAt(float i, out vec3 c, out vec3 f) {
  float ph = fract(uTime / 7.0 + i * 0.37);
  float a = i * 2.1 + floor(uTime / 7.0 + i * 0.37) * 0.9 + uTime * 0.02;
  float R = 7.5 + i * 1.3;
  vec3 tang = vec3(-sin(a), 0.0, cos(a));
  c = vec3(cos(a) * R, 0.0, sin(a) * R) + tang * (ph - 0.5) * 5.0;
  c.y = sin(ph * 3.1416) * 1.7 - 0.45; // sale, vuela y vuelve a entrar
  f = normalize(tang + vec3(0.0, cos(ph * 3.1416) * 1.3, 0.0));
}
vec3 toLocal(vec3 p, vec3 c, vec3 f) {
  vec3 up = normalize(vec3(0.0, 1.0, 0.0) - f * f.y);
  vec3 sd = cross(f, up);
  vec3 d = p - c;
  return vec3(dot(d, f), dot(d, up), dot(d, sd));
}

// La ballena: sale a respirar cada 40 s (el lomo asoma, tira el chorro) y se va mostrando la cola
const vec3 WHALE = vec3(-17.0, 0.0, -24.0);
float whalePhase() { return fract(uTime / 40.0); }
float whaleSdf(vec3 p) {
  float ph = whalePhase();
  float d = 1e3;
  // El lomo: sube y baja en la primera mitad
  float back = sin(clamp(ph / 0.5, 0.0, 1.0) * 3.1416);
  if (back > 0.01) d = sdEllipsoid(p - WHALE - vec3(0.0, -1.0 + back * 1.2, 0.0), vec3(3.6, 0.9, 1.0));
  // La cola: se levanta y se hunde al irse
  float tail = sin(clamp((ph - 0.55) / 0.3, 0.0, 1.0) * 3.1416);
  if (tail > 0.01) {
    vec3 q = p - WHALE - vec3(-4.5, -1.6 + tail * 2.6, 0.0);
    float stem = sdCapsule(q, vec3(0.0, -1.2, 0.0), vec3(0.0, 0.0, 0.0), 0.22);
    float fluke = sdBox(vec3(q.x, q.y - 0.2 + abs(q.z) * 0.25, abs(q.z) - 0.65), vec3(0.06, 0.18, 0.6));
    d = min(d, min(stem, fluke));
  }
  return d;
}

// El arrecife y el fondo de la orilla: qué tan lejos de la arena (0 = en la arena, crece hacia afuera)
float shoreDist(vec2 xz) { return length(xz / vec2(5.5, 4.2)) - 1.0; }

float sea(vec3 p) {
  return p.y - (sin(p.x * 0.6 + uTime * 0.8) * 0.07 + sin(p.z * 0.9 - uTime * 0.6) * 0.05 + (noise2(p.xz * 1.3 + uTime * 0.2) - 0.5) * 0.08);
}

vec2 palm(vec3 p, vec2 lean, float h, float ph) {
  vec2 sway = lean + vec2(sin(uTime * 0.9 + ph), cos(uTime * 0.7 + ph)) * 0.06;
  vec3 a = vec3(sway.x * 0.25, h * 0.5, sway.y * 0.25);
  vec3 top = vec3(sway.x, h, sway.y);
  float trunk = min(sdCapsule(p, vec3(0.0), a, 0.13), sdCapsule(p, a, top, 0.1));
  float fr = 1e3;
  for (int k = 0; k < 7; k++) {
    float ang = float(k) * 0.8976 + ph + sin(uTime * 1.3 + float(k)) * 0.05;
    vec3 dir = vec3(cos(ang), 0.0, sin(ang));
    vec3 mid = top + dir * 0.75 + vec3(0.0, 0.28, 0.0);
    vec3 end = top + dir * 1.55 + vec3(0.0, -0.45, 0.0);
    fr = min(fr, min(sdCapsule(p, top, mid, 0.08), sdCapsule(p, mid, end, 0.06)));
  }
  return opU(vec2(trunk, 3.0), vec2(fr, 4.0));
}

const vec3 TV = vec3(0.7, 1.05, 0.9);
// La puerta de vuelta al pasillo: parada sola en la arena, con la luz amarilla del pasillo adentro
const vec3 DOOR = vec3(2.1, 0.45, 1.3);

vec2 map(vec3 p) {
  vec2 r = vec2(sea(p), 1.0);
  // Delfines (solo cerca de donde saltan)
  for (int i = 0; i < 3; i++) {
    vec3 c;
    vec3 f;
    dolphinAt(float(i), c, f);
    if (length(p - c) - 1.1 < r.x) r = opU(r, vec2(dolphinSdf(toLocal(p, c, f)), 8.0));
  }
  if (length(p - WHALE) - 7.0 < r.x) r = opU(r, vec2(whaleSdf(p), 9.0));
  float isl = sdEllipsoid(p - vec3(0.0, -0.9, 0.0), vec3(5.5, 1.6, 4.2)) - fbm2(p.xz * 0.8) * 0.15;
  r = opU(r, vec2(isl, 2.0));
  // Lejos de las palmeras no hace falta calcular cada hoja
  float bound = sdBox(p - vec3(0.0, 2.4, -0.8), vec3(4.8, 2.7, 3.0));
  if (bound > r.x) return r;
  r = opU(r, palm(p - vec3(-2.3, 0.35, -0.9), vec2(-0.6, -0.2), 3.1, 0.0));
  r = opU(r, palm(p - vec3(-0.9, 0.55, -2.0), vec2(0.3, -0.4), 3.7, 1.7));
  r = opU(r, palm(p - vec3(2.6, 0.35, -1.0), vec2(0.7, 0.1), 2.7, 3.1));
  r = opU(r, vec2(sdBox(p - TV, vec3(0.55, 0.42, 0.4)) - 0.04, 5.0));
  vec3 dq = p - DOOR;
  dq.xz = mat2(0.8, 0.6, -0.6, 0.8) * dq.xz; // un poco girada hacia la cámara
  float jambs = min(sdBox(vec3(abs(dq.x) - 0.5, dq.y - 0.8, dq.z), vec3(0.07, 0.8, 0.07)), sdBox(dq - vec3(0.0, 1.62, 0.0), vec3(0.57, 0.07, 0.07)));
  r = opU(r, vec2(jambs, 6.0));
  r = opU(r, vec2(sdBox(dq - vec3(0.0, 0.8, 0.0), vec3(0.43, 0.78, 0.015)), 7.0));
  return r;
}

// El cielo es el de la hora y el clima reales: el sol de día, la luna de noche
// Una nube de gotas en c (radio r): brillo suave que se ve desde lejos
vec3 mistAt(vec3 rd, float t, vec3 c, float r, float k) {
  vec3 d = c - uRo;
  float a = dot(d, rd);
  if (a < 0.0 || a > t + r) return vec3(0.0);
  float q = length(d - rd * a) / r;
  return vec3(0.9, 0.95, 1.0) * exp(-q * q * 2.5) * k;
}
vec3 glow(vec3 rd, float t) {
  vec3 g = vec3(0.0);
  // El chorro de la ballena, al asomar el lomo
  float ph = whalePhase();
  float spout = smoothstep(0.12, 0.17, ph) * (1.0 - smoothstep(0.22, 0.32, ph));
  if (spout > 0.0) {
    for (int i = 0; i < 4; i++) {
      float h = float(i) * 0.7;
      g += mistAt(rd, t, WHALE + vec3(2.0, 0.4 + h * spout * 1.6, 0.0), 0.3 + h * 0.35, 0.35 * spout);
    }
  }
  // Salpicaduras: cuando cada delfín sale y cuando vuelve a entrar
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float ph = fract(uTime / 7.0 + fi * 0.37);
    vec3 c;
    vec3 f;
    dolphinAt(fi, c, f);
    float out1 = 1.0 - smoothstep(0.08, 0.2, ph);
    float in1 = smoothstep(0.82, 0.92, ph) * (1.0 - smoothstep(0.95, 1.0, ph));
    if (out1 + in1 > 0.01) g += mistAt(rd, t, vec3(c.x, 0.15, c.z), 0.5, 0.4 * (out1 + in1));
  }
  return g;
}

vec3 sky(vec3 rd) {
  float y = clamp(rd.y, 0.0, 1.0);
  vec3 c = mix(uSkyHor, uSkyTop, pow(y, 0.45));
  // Nubes que pasan, más con el clima nublado
  vec2 cp = rd.xz / max(rd.y, 0.05) * 1.2 + vec2(uTime * 0.02, 0.0);
  float cl = smoothstep(0.62 - uClouds * 0.4, 0.95, fbm2(cp)) * step(0.0, rd.y);
  c = mix(c, uSkyCloud, cl * 0.8);
  float mo = dot(rd, uSunDir);
  c += uLightCol * (smoothstep(0.9975, 0.999, mo) * 1.3 * (1.0 - cl) + pow(max(mo, 0.0), 30.0) * 0.3);
  vec2 sp = floor(rd.xy * 160.0) + floor(rd.zx * 160.0);
  c += step(0.9965, hash2(sp)) * step(0.08, rd.y) * uStars * (1.0 - cl) * vec3(0.9, 0.85, 1.0);
  // Con lluvia el cielo no queda negro: una bruma gris azulada
  c = max(c, vec3(0.2, 0.22, 0.3) * uRain);
  return c + uFlash * 0.4;
}

vec3 shade(vec3 p, vec3 n, vec3 rd, float m, float ao) {
  vec3 L = uSunDir;
  float dif = max(dot(n, L), 0.0);
  float rim = pow(1.0 - max(dot(-rd, n), 0.0), 2.0);
  vec3 lit = uLightCol * dif * (0.6 + 0.6 * uLight) + mix(uSkyTop, uSkyHor, 0.5) * 0.55 + vec3(0.22, 0.2, 0.3) * (1.0 - uLight * 0.6);
  vec3 glow = uSkyHor * rim * 0.4;
  if (m < 1.5) {
    float fres = pow(1.0 - max(dot(-rd, n), 0.0), 4.0);
    vec3 deep = mix(vec3(0.03, 0.05, 0.2), vec3(0.05, 0.62, 0.85), uLight);
    // Franjas de olas para que el mar se lea como mar
    float wave = smoothstep(0.55, 0.9, sin(p.z * 2.2 + p.x * 0.6 - uTime * 1.1) * 0.5 + 0.5 + (noise2(p.xz * 1.5) - 0.5) * 0.6);
    deep = mix(deep, deep * 1.6 + vec3(0.05, 0.1, 0.12), wave * 0.6);
    // La orilla: agua clara y turquesa sobre la arena, con el arrecife de coral debajo
    float sd = shoreDist(p.xz);
    float shallow = smoothstep(1.2, 0.05, sd);
    vec3 coral = mix(vec3(1.0, 0.45, 0.5), vec3(1.0, 0.7, 0.3), noise2(p.xz * 2.0));
    float reef = smoothstep(0.55, 0.75, noise2(p.xz * 1.6 + 7.0)) * smoothstep(0.1, 0.35, sd) * smoothstep(1.1, 0.6, sd);
    vec3 floorC = mix(vec3(0.55, 0.85, 0.8), coral, reef * 0.8);
    deep = mix(deep, floorC * mix(0.45, 1.0, uLight), shallow * 0.7);
    // Cardúmenes que pasan por debajo: sombras oscuras en grupo que se mueven en círculos
    vec2 sq = vec2(atan(p.z, p.x) * 6.0 - uTime * 0.35, length(p.xz) * 1.2);
    vec2 sc = floor(sq);
    float fish = step(0.8, hash2(sc)) * smoothstep(0.42, 0.2, length(fract(sq) - 0.5 + vec2(sin(uTime + sc.y) * 0.1, 0.0)));
    float school = smoothstep(0.55, 0.7, noise2(vec2(atan(p.z, p.x) * 2.0 - uTime * 0.12, length(p.xz) * 0.3)));
    deep = mix(deep, deep * 0.35, fish * school * smoothstep(-0.1, 0.2, sd) * smoothstep(9.0, 4.0, sd));
    vec3 c = mix(deep, sky(reflect(rd, n)) * 0.6, 0.12 + 0.35 * fres);
    // De noche: plancton que brilla en la cresta de las olas y medusas que flotan debajo
    float night = 1.0 - smoothstep(0.15, 0.5, uLight);
    float plank = step(0.93, hash2(floor(p.xz * 9.0) + floor(uTime * 3.0))) * wave;
    vec2 jq = p.xz * 0.6 + vec2(uTime * 0.05, -uTime * 0.03);
    vec2 jc = floor(jq);
    float jelly = step(0.85, hash2(jc + 3.0)) * smoothstep(0.3, 0.05, length(fract(jq) - 0.5)) * (0.6 + 0.4 * sin(uTime * 2.0 + hash2(jc) * 9.0));
    c += night * (vec3(0.3, 1.0, 0.9) * plank * 0.8 + vec3(1.0, 0.45, 0.85) * jelly * 0.9 * smoothstep(-0.1, 0.3, sd));
    // Camino de luz del sol o la luna sobre el agua
    return c + uLightCol * pow(max(dot(reflect(rd, n), L), 0.0), 60.0) * 1.5;
  }
  if (m < 2.5) {
    float dunes = 0.85 + 0.15 * sin(p.x * 3.0 + fbm2(p.xz * 2.0) * 4.0);
    // Con lluvia la arena se oscurece
    vec3 sand = mix(vec3(0.9, 0.72, 0.5), vec3(0.5, 0.42, 0.34), uRain * 0.7);
    return sand * dunes * lit * (0.5 + 0.5 * ao) + glow;
  }
  if (m < 3.5) return vec3(0.55, 0.36, 0.25) * lit + glow * 0.8;
  if (m < 4.5) return vec3(0.18, 0.62, 0.42) * lit + glow;
  if (m < 5.5) {
    // La tele: la pantalla mira hacia adelante y muestra estática
    vec3 lp = p - TV;
    if (n.z > 0.7 && abs(lp.x) < 0.42 && abs(lp.y) < 0.3) {
      float s = hash2(floor(lp.xy * 28.0) + floor(uTime * 12.0) * 7.0);
      return vec3(0.55, 0.95, 1.0) * (0.35 + s * 1.0);
    }
    return vec3(0.42, 0.36, 0.48) * lit + glow * 0.8;
  }
  if (m < 6.5) return vec3(0.85, 0.8, 0.62) * lit + glow * 0.6; // marco de la puerta
  if (m > 7.5) {
    // Delfines grises con la panza clara; la ballena, azul oscura. Mojados: brillan con el cielo
    float belly = smoothstep(0.1, -0.4, n.y);
    vec3 skin = m < 8.5 ? mix(vec3(0.45, 0.55, 0.68), vec3(0.85, 0.88, 0.92), belly) : mix(vec3(0.16, 0.22, 0.32), vec3(0.6, 0.62, 0.66), belly * 0.6);
    float spec = pow(max(dot(reflect(rd, n), L), 0.0), 25.0);
    // Al salir del agua chorrean: la parte de abajo queda más oscura cerca de la superficie
    float wet = smoothstep(0.4, 0.0, p.y);
    return skin * lit * (1.0 - wet * 0.3) + uLightCol * spec * 0.6 + glow;
  }
  // Adentro de la puerta: el pasillo, que titila un poco
  return vec3(1.25, 1.1, 0.6) * (0.85 + 0.15 * step(0.3, fract(sin(floor(uTime * 7.0)) * 43758.5)));
}
`

export const ISLAND: Scene3D = {
  id: "isla",
  name: "isla",
  label: "la isla",
  blurb: "espacio 03 · la tele sigue prendida; los delfines saltan y una ballena sale a respirar",
  glsl: island,
  exposure: 1.15,
  nightBoost: 0.9,
  saturation: 0.95,
  grade: 0.2,
  outdoor: true,
  camera: { target: [0, 1, 0], yaw: 0.15, pitch: 0.18, frame: 6.5, clip: 40, pitchRange: [0.02, 1.1], exitDoor: { at: [2.1, 1.25, 1.3], facing: [-0.6, 0, 0.8] } },
}
