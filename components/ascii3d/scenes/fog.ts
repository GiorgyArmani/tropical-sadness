import type { LightSet } from "../engine/lighting"
import type { V3 } from "../engine/camera"
import type { Scene3D, LightCtx } from "./types"

// --- La niebla: un desierto de ceniza y, detrás de la bruma, algo enorme que te mira ---
// Se camina hacia él (como en el pasillo) y nunca se lo alcanza: al acercarse demasiado, la estática
// te devuelve al pasillo. La puerta por la que se llegó queda parada en la arena, detrás.
// El monstruo no es geometría: está pintado en un plano lejano (MZ) adentro de sky(), así cuesta poco
// y la niebla lo tapa y lo destapa sola. El iris y los pilares de luz van en glow() (brillan a través).

const fog = /* glsl */ `
#define FOG 0.045
#define MAXD 95.0
#define HAS_GLOW

const float MZ = -125.0; // plano del monstruo
vec3 gSkyIris = vec3(0.0);
vec3 gGroundIris = vec3(0.0);
const vec2 EYE = vec2(0.0, 19.0); // el ojo en ese plano (x, altura)
const vec3 DOOR = vec3(0.0, 0.0, -4.5);
const vec3 FIG = vec3(1.6, 0.0, -88.0); // una figura quieta entre la niebla
const vec3 FIRE = vec3(0.0, 0.0, -78.0); // la hoguera, al final del camino: al llegar a ella se vuelve al pasillo (misma posición que FOG_FIRE)
const float FIRE_K = 2.6; // tamaño de la hoguera (1 = de las de campamento)

// Cuánto te acercaste a la hoguera, donde todo te mira más (0 al llegar, 1 junto al fuego)
float prog() { return clamp((72.0 - length(uRo.xz - vec2(0.0, -78.0))) / 66.0, 0.0, 1.0); }
float breath() { return sin(uTime * 0.18) * 1.2; }

float dunes(vec2 xz) {
  float h = (fbm2(xz * 0.045 + vec2(3.1, 7.7)) - 0.5) * 1.4 + sin(xz.x * 0.11 + xz.y * 0.04) * 0.25;
  h += smoothstep(46.0, 75.0, length(xz - vec2(0.0, -40.0))) * 2.5 * fbm2(xz * 0.02); // afuera del círculo las dunas crecen
  // La puerta y la hoguera sobre piso parejo
  return h * smoothstep(1.5, 5.0, length(xz - DOOR.xz)) * smoothstep(1.5 * FIRE_K, 4.0 * FIRE_K, length(xz - FIRE.xz));
}

float figure(vec3 p) {
  vec3 q = p - FIG;
  q.y -= 0.5 + sin(uTime * 0.3) * 0.08; // flota apenas
  float r = 0.1 + 0.22 * (1.0 - clamp(q.y / 2.2, 0.0, 1.0));
  float robe = max(length(q.xz) - r, abs(q.y - 1.1) - 1.1) * 0.8;
  return min(robe, length(q - vec3(0.0, 2.35, 0.0)) - 0.16);
}

vec2 map(vec3 p) {
  vec2 r = vec2((p.y - dunes(p.xz)) * 0.8, 1.0);
  // La puerta de vuelta (solo se calcula de cerca)
  vec3 dq = p - DOOR;
  if (sdBox(dq - vec3(0.0, 0.9, 0.0), vec3(0.7, 1.0, 0.2)) < r.x) {
    float jambs = min(sdBox(vec3(abs(dq.x) - 0.5, dq.y - 0.8, dq.z), vec3(0.07, 0.8, 0.07)), sdBox(dq - vec3(0.0, 1.62, 0.0), vec3(0.57, 0.07, 0.07)));
    r = opU(r, vec2(jambs, 2.0));
    r = opU(r, vec2(sdBox(dq - vec3(0.0, 0.8, 0.0), vec3(0.43, 0.78, 0.015)), 3.0));
  }
  if (sdBox(p - FIG - vec3(0.0, 1.6, 0.0), vec3(0.5, 1.6, 0.5)) < r.x) r = opU(r, vec2(figure(p), 4.0));
  // La hoguera: un anillo de piedras, leños quemados y una espada clavada en el medio
  vec3 fq = (p - FIRE) / FIRE_K; // se arma chica y se agranda (las distancias vuelven multiplicadas)
  if (sdBox(fq - vec3(0.0, 0.5, 0.0), vec3(0.8, 0.9, 0.8)) * FIRE_K < r.x) {
    float st = 1e3;
    for (int k = 0; k < 7; k++) {
      float a = float(k) * 0.8976;
      st = min(st, sdEllipsoid(fq - vec3(cos(a) * 0.55, 0.04, sin(a) * 0.55), vec3(0.16, 0.11, 0.13)));
    }
    r = opU(r, vec2(st * FIRE_K, 5.0));
    float logs = sdCapsule(fq, vec3(-0.35, 0.06, -0.2), vec3(0.3, 0.2, 0.15), 0.07);
    logs = min(logs, sdCapsule(fq, vec3(0.3, 0.06, -0.3), vec3(-0.2, 0.22, 0.25), 0.07));
    logs = min(logs, sdCapsule(fq, vec3(0.05, 0.06, 0.4), vec3(0.0, 0.26, -0.15), 0.06));
    r = opU(r, vec2(logs * FIRE_K, 6.0));
    vec3 sq = fq - vec3(0.0, 0.55, 0.0);
    sq.xy = mat2(0.97, -0.24, 0.24, 0.97) * sq.xy; // un poco inclinada
    float sword = min(sdBox(sq, vec3(0.025, 0.55, 0.006)), sdBox(sq - vec3(0.0, 0.5, 0.0), vec3(0.11, 0.015, 0.02)));
    r = opU(r, vec2(sword * FIRE_K, 7.0));
  }
  return r;
}

// Dónde cae el rayo en el plano del monstruo (q en metros) y a qué distancia (s)
bool onBeast(vec3 rd, out vec2 q, out float s) {
  q = vec2(0.0);
  s = 0.0;
  if (rd.z > -0.05) return false;
  s = (MZ - uRo.z) / rd.z;
  q = (uRo + rd * s).xy;
  q.y -= breath();
  return true;
}
float beastVis(float s) { return mix(0.75, 1.0, smoothstep(120.0, 50.0, s)); }

// El ojo: x adentro de los párpados, y iris, z pupila, w fibras del iris
vec4 eyeAt(vec2 q) {
  vec2 e = q - EYE;
  // Parpadea cada tanto (cerrado un cuarto de segundo)
  float k = floor(uTime / 11.0);
  float ph = uTime - k * 11.0 - hash1(k) * 7.0;
  float shut = smoothstep(0.0, 0.12, ph) * (1.0 - smoothstep(0.3, 0.45, ph));
  float o = (1.0 - shut) * mix(0.7, 1.0, prog()); // se abre más mientras te acercas
  float h = 6.5 * o * max(0.0, 1.0 - (e.x / 16.0) * (e.x / 16.0));
  float inside = smoothstep(0.4, -0.4, abs(e.y) - h);
  // La pupila te sigue, con saltitos de vez en cuando
  vec3 look = normalize(uRo - vec3(EYE.x, EYE.y + breath(), MZ));
  float j = floor(uTime * 0.45);
  vec2 pc = look.xy * 9.0 + (vec2(hash1(j * 3.1), hash1(j * 7.3)) - 0.5) * vec2(1.2, 0.5);
  vec2 d = e - pc;
  float iris = smoothstep(6.0, 5.3, length(d));
  float pupil = smoothstep(1.0, 0.75, length(d / vec2(mix(0.6, 1.8, prog()), 4.6))); // se dilata
  float fiber = 0.5 + 0.5 * sin(atan(d.y, d.x) * 14.0);
  return vec4(inside, iris, pupil, fiber);
}

// Un ojo en coordenadas locales e (sz = media anchura, look = hacia dónde mira, en unidades de sz,
// open = cuánto está abierto): x cuenca, y iris que brilla
vec2 eyeShape(vec2 e, float sz, vec2 look, float open) {
  float hh = sz * 0.48 * open * max(0.0, 1.0 - (e.x / sz) * (e.x / sz));
  float inside = smoothstep(sz * 0.06, -sz * 0.06, abs(e.y) - hh);
  vec2 d = e - look * sz;
  float iris = smoothstep(sz * 0.44, sz * 0.32, length(d));
  float pupil = smoothstep(1.0, 0.7, length(d / vec2(sz * 0.1, sz * 0.36)));
  return vec2(inside, iris * (1.0 - pupil) * inside);
}
// Parpadeo de cada ojo: 1 abierto, 0 cerrado
float lid(float seed) {
  float per = 5.0 + hash1(seed * 1.7) * 18.0;
  float ph = mod(uTime + hash1(seed * 3.1) * per, per);
  return 1.0 - smoothstep(0.0, 0.1, ph) * (1.0 - smoothstep(0.25, 0.4, ph));
}
vec3 eyeColor(float sel) { return sel > 0.75 ? vec3(0.95, 0.85, 0.35) : vec3(0.4, 0.95, 0.88); }

// La piel del monstruo: vetas oscuras y claras que se enroscan, con alguna de óxido (la misma de la masa)
vec3 fleshTex(vec2 w) {
  float sw = fbm2(w + fbm2(w * 0.7 + 3.0) * 1.4);
  vec3 k = mix(vec3(0.03, 0.04, 0.05), vec3(0.62, 0.68, 0.74), smoothstep(0.38, 0.66, sw));
  return mix(k, vec3(0.55, 0.36, 0.26), smoothstep(0.7, 0.8, sw) * 0.4);
}
vec2 rot2(vec2 v, float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)) * v; }

// El cielo entero es el monstruo: su piel asoma entre la bruma por todos lados y en ella se abren ojos,
// en todas direcciones (también a los costados y atrás). Alrededor de cada ojo la piel se enrosca.
// Quien mira está en el centro, así que todos te miran de frente. Devuelve el color del cielo encima de c
vec3 skyBeast(vec3 rd, vec3 c, float free) {
  float el = asin(clamp(rd.y, -1.0, 1.0));
  if (el < -0.03) return c;
  float az = atan(rd.x, -rd.z);
  // La piel se proyecta desde arriba (sin costuras), como las nubes
  vec2 w = rd.xz / (rd.y + 0.35) * 3.0 + vec2(uTime * 0.01, 0.0);
  float cover = smoothstep(0.42, 0.68, fbm2(w * 0.45 + 7.0)) * smoothstep(-0.03, 0.12, el) * mix(0.55, 0.9, prog());
  vec2 warp = vec2(0.0); // cuánto se enrosca la piel alrededor del ojo más cercano
  vec3 eye = vec3(0.0);
  float hugeCover = 0.0;
  // Tres ojos inmensos más: a la izquierda, a la derecha y detrás (sobre la puerta). Mires para donde
  // mires, algo enorme te está mirando
  for (int k = 0; k < 3; k++) {
    vec2 at = k == 0 ? vec2(-1.75, 0.3) : (k == 1 ? vec2(1.8, 0.33) : vec2(3.1416, 0.36));
    float da = az - at.x;
    da -= 6.2832 * floor(da / 6.2832 + 0.5); // atrás el rumbo da la vuelta
    vec2 e = vec2(da * cos(at.y), el - at.y);
    float r = length(e * vec2(1.0, 2.2));
    if (r > 1.0) continue;
    float pm = smoothstep(0.95, 0.45, r + (fbm2(e * 6.0 + float(k) * 9.0) - 0.5) * 0.35);
    cover = max(cover, pm);
    hugeCover = max(hugeCover, pm);
    warp += (rot2(e, 2.2 * pm * exp(-r * 2.5)) - e) * 6.0;
    float j = floor(uTime * 0.3 + float(k) * 3.0);
    vec2 look = (vec2(hash1(j * 1.3 + float(k)), hash1(j * 2.9 + float(k))) - 0.5) * vec2(0.2, 0.08);
    vec2 ey = eyeShape(e, 0.42, look, lid(float(k) * 17.0 + 5.0) * mix(0.75, 1.0, prog()));
    if (ey.x > eye.x) eye = vec3(ey, 0.0);
  }
  // Ojos chicos, uno por celda de rumbo y altura (2pi / 28: la costura de atrás cae en un borde)
  const float W = 0.2244;
  if (el > 0.04 && el < 1.1 && hugeCover < 0.05) { // nunca un ojo adentro de otro
    vec2 id = floor(vec2(az, el) / W);
    float h = hash2(id + 61.0);
    if (h < 0.5 + 0.4 * prog()) {
      vec2 cen = (id + 0.5) * W + (vec2(hash2(id + 2.0), hash2(id + 8.0)) - 0.5) * 0.02;
      float ce = cos(cen.y);
      vec2 e = vec2((az - cen.x) * ce, el - cen.y);
      float sz = min(0.05 + hash2(id + 4.0) * 0.05, W * ce * 0.3);
      float r = length(e * vec2(1.0, 1.5));
      float pm = smoothstep(W * ce * 0.45, sz * 1.1, r + (fbm2(e * 40.0 + h * 20.0) - 0.5) * sz);
      cover = max(cover, pm);
      warp = (rot2(e, 2.5 * pm * exp(-r / sz * 0.8)) - e) * 8.0;
      float j = floor(uTime * 0.4 + h * 9.0);
      vec2 look = (vec2(hash1(j + h * 50.0), hash1(j * 2.3 + h * 70.0)) - 0.5) * vec2(0.35, 0.15);
      eye = vec3(eyeShape(rot2(e, (hash2(id + 12.0) - 0.5) * 1.2), sz, look, lid(h * 91.0)), hash2(id + 23.0));
    }
  }
  // La piel, velada por la bruma; encima, las cuencas oscuras y los iris
  // (free: 0 donde la masa del fondo tapa el cielo; ahí no asoma nada)
  c = mix(c, fleshTex(w + warp) * 0.75, cover * 0.85 * free);
  c = mix(c, vec3(0.0, 0.01, 0.015), eye.x * 0.9 * free);
  gSkyIris = eyeColor(eye.z) * eye.y * 1.4 * free;
  return c;
}

// Y la ceniza: ojos que se abren en el piso y te siguen mientras caminas
vec3 groundEyes(vec2 xz, out float patchW, out vec2 patchT) {
  patchW = 0.0;
  patchT = vec2(0.0);
  const float C = 7.0;
  vec2 id = floor(xz / C);
  float h = hash2(id + 41.0);
  if (h > 0.2 + 0.45 * prog()) return vec3(0.0);
  vec2 cen = (id + 0.5) * C + (vec2(hash2(id + 6.0), hash2(id + 14.0)) - 0.5) * 2.5;
  if (length(cen - DOOR.xz) < 3.0 || length(cen - FIRE.xz) < 2.5 * FIRE_K) return vec3(0.0);
  float sz = 0.8 + hash2(id + 7.0) * 1.2;
  // De costado a quien mira, como si lo siguiera
  vec2 to = normalize(uRo.xz - cen);
  vec2 q = xz - cen;
  vec2 e = vec2(dot(q, vec2(to.y, -to.x)), dot(q, to));
  // Alrededor, la piel del monstruo que asoma de la ceniza
  float r = length(q);
  float pm = smoothstep(2.2, sz * 0.9, r + (fbm2(q * 2.0 + h * 30.0) - 0.5) * 0.8);
  patchW = pm;
  patchT = q * 1.4 + (rot2(q, 2.4 * pm * exp(-r / sz)) - q) * 2.0 + id * 5.0;
  return vec3(eyeShape(e, sz, vec2(0.0, 0.3), lid(h * 53.0)), hash2(id + 29.0));
}

// Ojos más chicos por toda la masa, torcidos, cada uno parpadeando a su ritmo. Todos te siguen, y
// mientras te acercas se abren más. Devuelve x cuenca, y iris (brilla), z cuál (para el color)
vec3 manyEyes(vec2 q) {
  const vec2 CELL = vec2(16.0, 11.0);
  vec2 id = floor(q / CELL);
  float h = hash2(id + 17.0);
  if (h > 0.3 + 0.6 * prog()) return vec3(0.0);
  vec2 cen = (id + 0.5) * CELL + (vec2(hash2(id + 3.0), hash2(id + 9.0)) - 0.5) * vec2(4.0, 2.5);
  // Solo adentro de la masa y lejos del ojo grande
  if (length((cen - vec2(0.0, 24.0)) / vec2(110.0, 33.0)) > 0.95 || cen.y < 6.0 || length((cen - EYE) / vec2(24.0, 11.0)) < 1.0) return vec3(0.0);
  float sz = 3.0 + hash2(id + 5.0) * 3.0; // media anchura
  vec2 e = q - cen;
  float ang = (hash2(id + 11.0) - 0.5) * 1.1;
  e = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * e;
  vec3 look = normalize(uRo - vec3(cen.x, cen.y + breath(), MZ));
  return vec3(eyeShape(e, sz, look.xy * 0.55, lid(h * 37.0)), hash2(id + 23.0));
}

vec3 fogCol(vec3 rd) {
  return mix(vec3(0.2, 0.22, 0.26), vec3(0.04, 0.05, 0.07), smoothstep(-0.05, 0.45, rd.y));
}

vec3 sky(vec3 rd) {
  vec3 c = fogCol(rd);
  vec2 q;
  float s;
  if (!onBeast(rd, q, s)) return skyBeast(rd, c, 1.0); // el cielo también es el monstruo
  // Una masa enorme que se enrosca alrededor del ojo: vetas que giran más cerca del centro
  vec2 e = (q - EYE) * vec2(1.0, 1.4);
  float a = 2.2 * exp(-length(e) * 0.03) + uTime * 0.004;
  vec2 w = mat2(cos(a), -sin(a), sin(a), cos(a)) * e;
  float sw = fbm2(w * vec2(0.025, 0.08) + fbm2(q * 0.03) * 1.4);
  float shape = 1.0 - length((q - vec2(0.0, 24.0)) / vec2(120.0, 38.0)) + (fbm2(q * 0.04 + 5.0) - 0.5) * 0.5;
  float body = smoothstep(-0.1, 0.12, shape) * smoothstep(-1.0, 4.0, q.y);
  c = skyBeast(rd, c, 1.0 - smoothstep(0.0, 0.3, body));
  vec3 skin = mix(vec3(0.015, 0.02, 0.03), vec3(0.42, 0.47, 0.52), smoothstep(0.38, 0.66, sw));
  // El borde de la masa, iluminado por la bruma de atrás
  skin += vec3(0.45, 0.5, 0.55) * smoothstep(0.05, 0.0, shape) * smoothstep(-0.1, 0.0, shape);
  skin = mix(skin, vec3(0.55, 0.36, 0.26), smoothstep(0.7, 0.8, sw) * 0.4); // vetas de óxido
  vec4 ey = eyeAt(q);
  skin = mix(skin, vec3(0.0, 0.01, 0.015), max(ey.x, manyEyes(q).x * body)); // las cuencas, oscuras (los iris brillan en glow)
  float vis = beastVis(s);
  c = mix(c, skin, body * mix(vis, 1.0, 0.6)); // la masa tapa bien lo que está detrás
  // La luz del ojo tiñe la bruma de alrededor
  return c + vec3(0.3, 0.75, 0.75) * exp(-length(q - EYE) / 14.0) * 0.18 * vis;
}

// Columnas de chispas que caen del cielo
vec3 pillar(vec3 rd, float t, vec2 at) {
  vec2 o = uRo.xz - at;
  vec2 d = rd.xz;
  float dd = dot(d, d);
  if (dd < 1e-4) return vec3(0.0);
  float a = -dot(o, d) / dd;
  if (a < 0.0 || a > t) return vec3(0.0);
  vec2 c = o + d * a;
  float r2 = dot(c, c);
  float y = uRo.y + rd.y * a;
  float side = (c.x * d.y - c.y * d.x) / sqrt(dd);
  float h = smoothstep(-1.0, 5.0, y) * smoothstep(55.0, 22.0, y);
  vec2 cell = vec2(floor(side * 1.6), floor(y * 1.2 + uTime * 2.2));
  float sp = step(0.93, hash2(cell)) * exp(-r2 * 0.15) * (0.6 + 0.4 * sin(uTime * 6.0 + hash2(cell + 3.0) * 30.0));
  // De cerca las chispas se apagan (si no, se ven como bloques)
  return vec3(0.55, 0.88, 1.0) * (exp(-r2 * 0.5) * 0.12 + sp * 1.3 * smoothstep(6.0, 18.0, a)) * h * exp(-a * 0.012);
}

// La llama y las brasas que suben (brillan a través de todo, como los ojos)
vec3 fireGlow(vec3 rd, float t) {
  vec3 o = (uRo - FIRE) / FIRE_K; // en el tamaño chico, como la geometría
  t /= FIRE_K;
  vec2 d = rd.xz;
  float dd = dot(d, d);
  if (dd < 1e-4) return vec3(0.0);
  float a = -dot(o.xz, d) / dd;
  if (a < 0.0 || a > t + 0.4) return vec3(0.0);
  vec2 c = o.xz + d * a;
  float y = o.y + rd.y * a; // altura sobre la base
  float side = (c.x * d.y - c.y * d.x) / sqrt(dd);
  float n = noise2(vec2(side * 3.0, y * 2.5 - uTime * 4.5));
  float w = 0.42 * (1.0 - clamp(y / 1.4, 0.0, 1.0)) * (0.55 + 0.9 * n);
  float flame = smoothstep(w, w * 0.25, abs(side)) * smoothstep(0.05, 0.15, y) * (1.0 - smoothstep(0.8, 1.4, y + n * 0.4));
  vec3 col = mix(vec3(1.0, 0.32, 0.05), vec3(1.25, 0.9, 0.45), smoothstep(0.7, 0.0, y)) * flame * 1.6;
  vec2 cell = vec2(floor(side * 12.0), floor(y * 9.0 - uTime * 6.0));
  float e = step(0.965, hash2(cell)) * smoothstep(0.7, 0.0, abs(side)) * smoothstep(0.4, 1.0, y) * smoothstep(3.0, 1.2, y);
  col += vec3(1.0, 0.45, 0.1) * e * 1.4;
  // Un halo grande, así de lejos se ve entre la niebla como un faro
  col += vec3(1.0, 0.4, 0.1) * 0.12 * exp(-(dot(c, c) + (y - 0.4) * (y - 0.4)) * 1.5);
  col += vec3(1.0, 0.45, 0.15) * 0.1 * exp(-(dot(c, c) + (y - 0.6) * (y - 0.6)) * 0.12);
  return col * mix(0.7, 1.0, exp(-a * FIRE_K * 0.01));
}

// Bancos de niebla a ras del piso que el viento arrastra: pasan por delante de todo, también del
// monstruo. Cinco muestras a lo largo del rayo alcanzan (de lejos el FOG hace el resto)
vec3 mist(vec3 rd, float t) {
  float end = min(t, 50.0);
  float acc = 0.0;
  for (int i = 0; i < 5; i++) {
    float a = 1.0 + (end - 1.0) * (float(i) + 0.5) / 5.0;
    vec3 q = uRo + rd * a;
    vec2 w = q.xz * 0.08 + vec2(uTime * 0.04, uTime * 0.015);
    float bank = smoothstep(0.35, 0.75, noise2(w) + 0.25 * noise2(q.xz * 0.3 - uTime * 0.08));
    acc += exp(-max(q.y, 0.0) * 0.45) * bank;
  }
  acc *= (end - 1.0) / 5.0 * 0.04;
  return vec3(0.5, 0.55, 0.6) * 0.35 * (1.0 - exp(-acc));
}

vec3 glow(vec3 rd, float t) {
  vec3 g = mist(rd, t) + pillar(rd, t, vec2(-17.0, -62.0)) + pillar(rd, t, vec2(17.0, -62.0));
  g += pillar(rd, t, vec2(-30.0, -100.0)) + pillar(rd, t, vec2(30.0, -100.0));
  vec2 q;
  float s;
  if (onBeast(rd, q, s) && t > s) {
    vec4 ey = eyeAt(q);
    vec3 iris = vec3(0.35, 0.95, 0.9) * (0.65 + 0.35 * ey.w);
    g += iris * ey.x * ey.y * (1.0 - ey.z) * mix(0.9, 1.6, beastVis(s));
    // Los ojos chicos: casi todos turquesa, algunos de un amarillo enfermo
    vec3 me = manyEyes(q);
    g += eyeColor(me.z) * me.y * mix(1.0, 1.5, beastVis(s));
  }
  g += fireGlow(rd, t);
  // Los iris del cielo (si el rayo no chocó con nada) y los del piso (si chocó)
  g += t > 1e3 ? gSkyIris : gGroundIris;
  return g;
}

vec3 shade(vec3 p, vec3 n, vec3 rd, float m, float ao) {
  // La luz viene de detrás del monstruo, de arriba: las caras que miran a la cámara quedan en penumbra
  vec3 L = normalize(vec3(0.0, 0.55, -0.85));
  float dif = max(dot(n, L), 0.0);
  vec3 amb = vec3(0.13, 0.15, 0.18) * (0.6 + 0.4 * n.y);
  vec3 lit = amb * (0.5 + 0.5 * ao) + vec3(0.75, 0.8, 0.85) * dif * 0.55 + lighting(p, n, rd, 0.0); // + la hoguera
  if (m < 1.5) {
    // Ceniza con ondas del viento (de lejos se alisan, si no hacen moiré)
    float rip = sin(dot(p.xz, vec2(0.35, 1.0)) * 5.0 + fbm2(p.xz * 0.5) * 6.0) * exp(-length(p - uRo) * 0.06);
    float g = 0.85 + 0.12 * rip + 0.1 * (noise2(p.xz * 3.0) - 0.5);
    vec3 ash = vec3(0.6, 0.62, 0.65) * g * lit;
    float pw;
    vec2 pt;
    vec3 ge = groundEyes(p.xz, pw, pt);
    ash = mix(ash, fleshTex(pt) * lit * 1.4, pw * 0.9);
    gGroundIris = eyeColor(ge.z) * ge.y * 1.5;
    return mix(ash, vec3(0.0, 0.01, 0.015), ge.x);
  }
  if (m < 2.5) return vec3(0.5, 0.5, 0.5) * lit;
  // Adentro de la puerta: el pasillo, que titila un poco
  if (m < 3.5) return vec3(1.25, 1.1, 0.6) * (0.85 + 0.15 * step(0.3, fract(sin(floor(uTime * 7.0)) * 43758.5)));
  if (m > 4.5) {
    if (m < 5.5) return vec3(0.35, 0.34, 0.33) * lit; // piedras
    // Leños quemados, con brasas que respiran
    if (m < 6.5) return vec3(0.08, 0.06, 0.05) * lit + vec3(1.0, 0.35, 0.05) * smoothstep(0.55, 0.8, noise2(p.xz * 12.0 + uTime * 0.7)) * 1.2;
    return vec3(0.55, 0.57, 0.6) * lit + vec3(1.0, 0.5, 0.2) * pow(max(dot(reflect(rd, n), normalize(FIRE + vec3(0.0, 1.3, 0.0) - p)), 0.0), 12.0) * 0.6; // la espada
  }
  // La figura: negra, apenas un borde
  return vec3(0.03, 0.035, 0.04) + vec3(0.3, 0.35, 0.4) * pow(1.0 - max(dot(-rd, n), 0.0), 3.0) * 0.4;
}
`

// --- La hoguera de la niebla: una luz que titila y deja un charco cálido en la ceniza ---
const FOG_FIRE: V3 = [0, 1.9, -77.5] // FIRE del shader, a la altura de la llama (y un poco adelante de la espada)
const fogLights = ({ t }: LightCtx): LightSet => {
  const flick = 0.78 + 0.12 * Math.sin(t * 9.3) + 0.07 * Math.sin(t * 23.1 + 1.7) + 0.05 * Math.sin(t * 4.1)
  return {
    ambient: [0, 0, 0], // la escena ya pone su penumbra
    lights: [{ type: "point", pos: FOG_FIRE, color: [1.0, 0.5, 0.18], intensity: 5 * flick, range: 22, falloff: 0.12, wrap: 0.2, shadow: true }],
  }
}

export const FOG: Scene3D = {
  id: "niebla",
  name: "niebla",
  label: "la niebla",
  blurb: "espacio 05 · algo enorme te mira desde la bruma",
  glsl: fog,
  lights: fogLights,
  exposure: 1.1,
  saturation: 0.4,
  grade: 0,
  outdoor: true,
  // Un plano redondo: se camina para cualquier lado. La hoguera del fondo es la vuelta: al llegar a
  // ella la estática te devuelve al pasillo. La puerta por la que se entró también sirve (queda atrás)
  camera: {
    target: [0, 1.65, 0],
    yaw: 0,
    pitch: -0.08,
    frame: 1.4,
    clip: 1e4,
    pitchRange: [-0.35, 0.45],
    walk: {
      drift: 0.35,
      loop: 75,
      fov: 72,
      flash: 4,
      start: 6,
      roam: { center: [0, -40], radius: 46, exitAt: [0, -78], exitR: 4.5 }, // exitAt: la hoguera (FIRE)
    },
    exitDoor: { at: [0, 1.0, -4.5], facing: [0, 0, -1] },
  },
}
