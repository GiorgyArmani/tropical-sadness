import type { Scene3D } from "./types"

// --- El cementerio en 3D: cripta, lápidas, calabazas y velas sobre una isla en un mar violeta ---

const cemetery = /* glsl */ `
#define FOG 0.03
#define MAXD 110.0

float gy(vec2 q) {
  return -0.9 + 1.6 * sqrt(max(0.0, 1.0 - dot(q / vec2(5.5, 4.2), q / vec2(5.5, 4.2))));
}

// Lápidas en dos medias lunas delante de la cripta
vec3 tombPos(float i) {
  float a = -1.15 + i * 0.46;
  float rr = 2.35 + mod(i, 2.0) * 0.75;
  vec2 q = vec2(sin(a) * rr, cos(a) * rr * 0.7 - 0.2);
  return vec3(q.x, gy(q) - 0.05, q.y);
}
vec3 candlePos(float i) {
  if (i < 6.0) {
    vec3 t = tombPos(i);
    return vec3(t.x + 0.32, t.y, t.z + 0.22);
  }
  float x = -0.75 + (i - 6.0) * 0.5;
  return vec3(x, gy(vec2(x, 0.25)) + 0.02, 0.25);
}
vec3 pumpkinPos(float i) {
  vec2 q = vec2(-1.6 + i * 1.1, 1.6 + sin(i * 2.3) * 0.5);
  return vec3(q.x, gy(q) + 0.12, q.y);
}

vec2 deadPalm(vec3 p, vec2 lean, float h, float ph) {
  vec2 sway = lean + vec2(sin(uTime * 0.5 + ph), 0.0) * 0.04;
  vec3 top = vec3(sway.x, h, sway.y);
  float trunk = sdCapsule(p, vec3(0.0), top, 0.09);
  float fr = 1e3;
  for (int k = 0; k < 5; k++) {
    float ang = float(k) * 1.256 + ph;
    vec3 dir = vec3(cos(ang), 0.0, sin(ang));
    vec3 mid = top + dir * 0.55 + vec3(0.0, 0.05, 0.0);
    vec3 end = top + dir * 0.9 + vec3(0.0, -0.75, 0.0);
    fr = min(fr, min(sdCapsule(p, top, mid, 0.04), sdCapsule(p, mid, end, 0.03)));
  }
  return opU(vec2(trunk, 7.0), vec2(fr, 7.0));
}

vec2 map(vec3 p) {
  float sea = p.y - (sin(p.x * 0.5 + uTime * 0.5) * 0.05 + sin(p.z * 0.8 - uTime * 0.4) * 0.04);
  vec2 r = vec2(sea, 1.0);
  float isl = sdEllipsoid(p - vec3(0.0, -0.9, 0.0), vec3(5.5, 1.6, 4.2)) - fbm2(p.xz * 0.9) * 0.12;
  r = opU(r, vec2(isl, 2.0));
  // Lejos de la isla no hace falta calcular cada lápida y cada vela
  float bound = sdBox(p - vec3(0.0, 1.5, 0.0), vec3(5.0, 2.6, 3.8));
  if (bound > r.x) return r;
  // La cripta: cuerpo con puerta, techo a dos aguas, cruz y escalón
  vec3 cp = p - vec3(0.0, 0.62, -1.2);
  float door = sdBox(cp - vec3(0.0, 0.5, 0.9), vec3(0.3, 0.52, 0.18));
  float body = max(sdBox(cp - vec3(0.0, 0.72, 0.0), vec3(1.05, 0.72, 0.85)), -door);
  float roof = max(abs(cp.z) - 0.98, max(cp.y - 2.1 + abs(cp.x) * 0.6, 1.42 - cp.y)) * 0.8;
  float crs = min(sdBox(cp - vec3(0.0, 2.45, 0.0), vec3(0.05, 0.35, 0.05)), sdBox(cp - vec3(0.0, 2.55, 0.0), vec3(0.2, 0.05, 0.05)));
  float steps = sdBox(cp - vec3(0.0, 0.06, 1.05), vec3(0.6, 0.08, 0.25));
  r = opU(r, vec2(min(min(body, roof), min(crs, steps)), 3.0));
  r = opU(r, vec2(sdBox(cp - vec3(0.0, 0.5, 0.74), vec3(0.3, 0.5, 0.02)), 4.0));
  // Lápidas con el borde de arriba redondo
  for (int k = 0; k < 6; k++) {
    vec3 tp = p - tombPos(float(k));
    float a = (float(k) - 2.5) * -0.18;
    tp.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * tp.xz;
    float slab = sdBox(tp - vec3(0.0, 0.25, 0.0), vec3(0.24, 0.25, 0.06));
    float arch = max(length(tp.xy - vec2(0.0, 0.5)) - 0.24, abs(tp.z) - 0.06);
    r = opU(r, vec2(min(slab, arch) - 0.015, 5.0));
  }
  // Velas: el cirio y la llama
  for (int k = 0; k < 10; k++) {
    vec3 c = candlePos(float(k));
    float tall = 0.1 + mod(float(k), 3.0) * 0.05;
    float wax = sdCapsule(p, c, c + vec3(0.0, tall, 0.0), 0.028);
    float flick = sin(uTime * 9.0 + float(k) * 3.1) * 0.012;
    float flame = sdEllipsoid(p - c - vec3(flick, tall + 0.06, 0.0), vec3(0.025, 0.05, 0.025));
    r = opU(r, vec2(wax, 6.0));
    r = opU(r, vec2(flame, 8.0));
  }
  // Calabazas
  for (int k = 0; k < 4; k++) {
    vec3 q = p - pumpkinPos(float(k));
    float pk = sdEllipsoid(q, vec3(0.22, 0.16, 0.22));
    float stem = sdCapsule(q, vec3(0.0, 0.14, 0.0), vec3(0.03, 0.22, 0.0), 0.02);
    r = opU(r, vec2(pk, 9.0));
    r = opU(r, vec2(stem, 7.0));
  }
  // Palmeras secas
  r = opU(r, deadPalm(p - vec3(-2.6, gy(vec2(-2.6, -1.6)), -1.6), vec2(-0.5, -0.1), 2.3, 0.6));
  r = opU(r, deadPalm(p - vec3(2.5, gy(vec2(2.5, -1.9)), -1.9), vec2(0.45, -0.2), 2.6, 2.2));
  // Reja de hierro alrededor, con barrotes caídos
  float sector = 6.2832 / 44.0;
  float ang = atan(p.z, p.x);
  float ai = floor(ang / sector + 0.5);
  vec2 q = vec2(cos(ai * sector) * 4.7, sin(ai * sector) * 3.5);
  float g = gy(q);
  float post = hash1(ai + 7.0) > 0.85 ? 1e3 : sdCapsule(p, vec3(q.x, g - 0.2, q.y), vec3(q.x, g + 0.55, q.y), 0.025);
  vec2 e = p.xz / vec2(4.7, 3.5);
  float railY = gy(normalize(e) * vec2(4.7, 3.5)) + 0.42;
  float rail = length(vec2((length(e) - 1.0) * 3.5, p.y - railY)) - 0.02;
  if (hash1(ai * 3.0 + 1.0) > 0.75) rail = 1e3;
  r = opU(r, vec2(min(post, rail), 10.0));
  return r;
}

// Un infiernito: de noche violeta con luna naranja enorme, de día rojo con nubes bordó
vec3 sky(vec3 rd) {
  float y = pow(clamp(rd.y, 0.0, 1.0), 0.5);
  vec3 night = mix(vec3(0.42, 0.16, 0.36), vec3(0.08, 0.03, 0.17), y);
  vec3 day = mix(vec3(1.0, 0.32, 0.1), vec3(0.5, 0.04, 0.1), y);
  vec3 c = mix(night, day, smoothstep(0.35, 0.85, uLight));
  vec2 cp = rd.xz / max(rd.y, 0.05) * 1.1 + vec2(uTime * 0.015, 0.0);
  float cl = smoothstep(0.55 - uClouds * 0.3, 0.95, fbm2(cp)) * step(0.0, rd.y);
  c = mix(c, mix(vec3(0.3, 0.16, 0.38), vec3(0.37, 0.06, 0.11), uLight), cl * 0.85);
  float mo = dot(rd, uSunDir);
  c += vec3(1.0, 0.55, 0.22) * (smoothstep(0.993, 0.995, mo) * 1.4 * (1.0 - cl * 0.7) + pow(max(mo, 0.0), 24.0) * 0.35);
  vec2 sp = floor(rd.xy * 160.0) + floor(rd.zx * 160.0);
  c += step(0.997, hash2(sp)) * step(0.1, rd.y) * uStars * (1.0 - cl) * vec3(0.9, 0.8, 1.0);
  return c + uFlash * 0.4;
}

float flick(float k) {
  return 0.75 + 0.15 * sin(uTime * 11.0 + k * 1.9) + 0.1 * sin(uTime * 23.7 + k * 4.3);
}

vec3 shade(vec3 p, vec3 n, vec3 rd, float m, float ao) {
  vec3 L = uSunDir;
  float dif = max(dot(n, L), 0.0);
  vec3 moon = vec3(1.0, 0.55, 0.3) * (0.45 + 0.55 * uLight);
  vec3 amb = mix(vec3(0.4, 0.22, 0.5), vec3(0.55, 0.2, 0.17), uLight) * (0.6 + 0.4 * n.y);
  // Luz cálida de las velas y las calabazas
  vec3 warm = vec3(0.0);
  for (int k = 0; k < 10; k++) {
    vec3 d = candlePos(float(k)) + vec3(0.0, 0.2, 0.0) - p;
    warm += vec3(1.0, 0.5, 0.15) * flick(float(k)) * max(dot(n, normalize(d)), 0.0) / (1.0 + dot(d, d) * 9.0);
  }
  for (int k = 0; k < 4; k++) {
    vec3 d = pumpkinPos(float(k)) - p;
    warm += vec3(1.0, 0.45, 0.1) * 0.5 * flick(float(k) + 20.0) / (1.0 + dot(d, d) * 12.0);
  }
  warm *= 0.6 + 0.6 * (1.0 - uLight);
  vec3 lit = amb * (0.4 + 0.6 * ao) + moon * dif + warm * 2.2;
  if (m < 1.5) {
    float fres = pow(1.0 - max(dot(-rd, n), 0.0), 4.0);
    vec3 c = mix(mix(vec3(0.06, 0.02, 0.12), vec3(0.3, 0.04, 0.06), uLight), sky(reflect(rd, n)) * 0.6, 0.15 + 0.5 * fres);
    return c + vec3(1.0, 0.55, 0.25) * pow(max(dot(reflect(rd, n), L), 0.0), 50.0) * 1.3;
  }
  if (m < 2.5) {
    // Tierra quemada con pasto seco y brasas
    float grass = smoothstep(0.45, 0.7, fbm2(p.xz * 3.0));
    vec3 c = mix(vec3(0.38, 0.22, 0.16), vec3(0.42, 0.36, 0.18), grass);
    float ember = step(0.985, hash2(floor(p.xz * 14.0))) * (0.5 + 0.5 * sin(uTime * 3.0 + hash2(floor(p.xz * 14.0)) * 20.0));
    return c * lit + vec3(1.0, 0.4, 0.1) * ember * 0.8;
  }
  if (m < 3.5) {
    // Piedra de la cripta, con bloques y musgo abajo
    vec2 uv = abs(n.x) > 0.5 ? p.zy : p.xy;
    vec2 f = fract(uv * vec2(2.2, 3.5) + vec2(step(0.5, fract(uv.y * 1.75)) * 0.5, 0.0));
    float joint = max(step(0.93, f.x), step(0.9, f.y));
    vec3 c = mix(vec3(0.58, 0.55, 0.66), vec3(0.3, 0.42, 0.25), smoothstep(1.0, 0.6, p.y) * 0.6);
    return c * (1.0 - joint * 0.4) * lit;
  }
  if (m < 4.5) {
    // Por la puerta de la cripta se vuelve al pasillo: sale su luz amarilla, con estática y, a veces, dos ojos
    vec2 q = p.xy - vec2(0.0, 1.32);
    float eyes = step(length(vec2(abs(q.x) - 0.09, q.y)), 0.035) * step(0.1, sin(uTime * 0.7));
    float s = hash2(floor(p.xy * 30.0) + floor(uTime * 12.0) * 7.0);
    return mix(vec3(1.15, 1.0, 0.5) * (0.55 + s * 0.45), vec3(1.4, 0.15, 0.08), eyes);
  }
  if (m < 5.5) {
    // Lápida de mármol: una cruz grabada en el frente
    vec3 c = vec3(0.78, 0.76, 0.84);
    return c * lit;
  }
  if (m < 6.5) return vec3(0.95, 0.9, 0.8) * lit + warm * 0.8;
  if (m < 7.5) return vec3(0.35, 0.26, 0.22) * lit;
  if (m < 8.5) return vec3(1.4, 1.05, 0.5);
  if (m < 9.5) {
    // Calabaza: gajos y, de frente, la cara encendida
    float ribs = 0.8 + 0.2 * abs(sin(atan(n.z, n.x) * 4.0));
    vec3 c = vec3(1.0, 0.42, 0.06) * ribs * lit;
    vec3 k = p - pumpkinPos(floor((p.x + 1.6) / 1.1 + 0.5));
    float face = step(0.4, n.z) * (step(length(vec2(abs(k.x) - 0.08, k.y - 0.03)), 0.04) + step(abs(k.y + 0.05), 0.022) * step(abs(k.x), 0.1));
    return mix(c, vec3(1.4, 1.0, 0.35) * flick(k.x * 9.0), clamp(face, 0.0, 1.0));
  }
  return vec3(0.3, 0.28, 0.4) * lit + vec3(0.5, 0.45, 0.7) * pow(dif, 6.0) * 0.4;
}
`

export const CEMETERY: Scene3D = {
  id: "cementerio",
  name: "cementerio",
  label: "el cementerio",
  blurb: "espacio 04 · las velas no se apagan",
  glsl: cemetery,
  exposure: 1.8,
  saturation: 0.85,
  grade: 0.25,
  outdoor: true,
  camera: {
    target: [0, 0.9, -0.3],
    yaw: 0.1,
    pitch: 0.22,
    frame: 5.5,
    clip: 40,
    pitchRange: [0.02, 1.1],
    exitDoor: { at: [0, 1.12, -0.3], facing: [0, 0, 1] }, // la puerta de la cripta
  },
}
