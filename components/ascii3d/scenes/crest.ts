import type { Scene3D } from "./types"
import { g } from "./types"

// --- La cresta: una escalera de madera con barandas sobre el lomo de una montaña verde, encima de un
// mar de nubes, con la curva del planeta y el sol de frente. Se camina libre (plano redondo con piso):
// por la escalera, entre las barandas, y por tres claros donde el lomo se abre en una meseta redonda,
// sin barandas ni helechos y con un círculo de piedras: la llegada, el mirador de la mitad y la cumbre.
// Son para quedarse mirando el mar de nubes o juntarse con otros (en esta escena se ven los avatares).
// En la cumbre, una puerta vuelve al pasillo.
// La forma del lomo (por dónde va, qué tan alto y dónde se abre) se define una vez acá: de ella salen el
// GLSL y crestFloor(), la altura del piso por donde se camina, así nunca se desfasan.

const CREST = { len: 260, x: [14, 0.021, 4, 0.057, 1.3], h: [6, 0.28, 6, 0.045, 1.2, 0.11] }
const crestX = (z: number) => Math.sin(z * CREST.x[1]) * CREST.x[0] + Math.sin(z * CREST.x[3] + CREST.x[4]) * CREST.x[2]
// La altura del lomo, sin los claros
const crestH0 = (z: number) =>
  CREST.h[0] +
  Math.max(0, -z) * CREST.h[1] +
  Math.sin(z * CREST.h[3]) * CREST.h[2] +
  Math.sin(z * CREST.h[5]) * CREST.h[4] -
  Math.max(0, z) * 0.6 - // detrás del principio el lomo baja a las nubes
  Math.max(0, -CREST.len - z) * 1.2 // y pasando la cima también

// Los claros: z de su centro (sobre el lomo) y r su radio. La llegada y el mirador van donde el lomo ya
// es casi plano; en la cumbre se aplana. x y h salen del lomo
const CLEARINGS = [
  { z: -9, r: 5 }, // la llegada
  { z: -121, r: 8 }, // el mirador, a mitad de camino y a 43 m sobre las nubes
  { z: -249, r: 5.5 }, // la cumbre, antes de la puerta
].map((c) => {
  // Hacia dónde sigue el camino ahí (x, z), para el círculo de piedras
  const dx = crestX(c.z - 1) - crestX(c.z + 1)
  const n = Math.hypot(dx, 2)
  return { ...c, x: crestX(c.z), h: crestH0(c.z), fw: [dx / n, -2 / n] as const }
})
const FLAT_T = 8 // metros en que el lomo pasa de su pendiente a la altura de un claro
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}
// La altura del lomo: alrededor de cada claro queda a la altura del claro (misma cuenta que rH en GLSL)
const crestH = (z: number) => {
  let h = crestH0(z)
  for (const c of CLEARINGS) h += (c.h - h) * (1 - smoothstep(c.r, c.r + FLAT_T, Math.abs(z - c.z)))
  return h
}
const CREST_DOOR_Z = -(CREST.len - 1)
const ARRIVE = 6 // se aparece a estos metros del principio: adentro del claro de la llegada
const PATH_HALF = 0.45 // medio ancho por donde se camina en la escalera (las barandas están a 0.65)

const RAIL_GAP = 0.6 // las barandas empiezan a estos metros del borde de cada claro (GLSL: RAIL_GAP - cd)
// La altura del pasto en (x, z) cerca del claro c: la meseta o la ladera del lomo (lo mismo que el GLSL,
// sin el ruido de la vegetación, que solo está en las laderas)
const grassAt = (x: number, z: number, c: (typeof CLEARINGS)[number]) => {
  const side = Math.max(0, Math.abs(x - crestX(z)) - 0.9)
  const rim = Math.max(0, Math.hypot(x - c.x, z - c.z) - c.r)
  return Math.max(crestH(z) - 0.3 - side * 1.1 - side * side * 0.05, c.h - 0.02 - rim * 1.1 - rim * rim * 0.05)
}

// La altura del piso en (x, z), o null donde no hay dónde pararse: los claros (con un margen en el
// borde) y la escalera entre las barandas, desde la llegada hasta la puerta de la cumbre
const crestFloor = (x: number, z: number): number | null => {
  if (z > CLEARINGS[0].z + CLEARINGS[0].r || z < CREST_DOOR_Z - 0.5) return null
  const off = Math.abs(x - crestX(z))
  const onPath = z <= CLEARINGS[0].z // detrás de la llegada no se baja
  for (const c of CLEARINGS) {
    const e = Math.hypot(x - c.x, z - c.z) - (c.r - 0.4)
    if (e <= 0) return c.h
    // Donde la escalera sale del claro se abre en embudo, así se entra sin tener que apuntar justo.
    // Se cierra en diagonal hasta donde empiezan las barandas; fuera de los tablones se pisa el pasto
    const open = RAIL_GAP + 0.4 - e
    if (open > 0 && onPath && off <= PATH_HALF + open * 1.4) return off <= 0.5 ? crestH(z) : grassAt(x, z, c)
  }
  return onPath && off <= PATH_HALF ? crestH(z) : null
}

const crest = /* glsl */ `
#define FOG 0.006
#define MAXD 220.0
#define HAS_GLOW

const vec3 SUN = vec3(0.15, 0.42, -1.0) / 1.095; // de frente, alto
#define AV_SUN SUN // los avatares se iluminan con este sol y no con el del cielo real

// Colores que giran (psicodelia): el tono h da la vuelta al arcoíris
vec3 pal(float h) { return 0.5 + 0.5 * cos(6.2832 * (h + vec3(0.0, 0.33, 0.67))); }
// Los claros (CLEARINGS en JS): centro x, z, radio y altura; y hacia dónde sigue el camino ahí
${CLEARINGS.map((c, i) => `const vec4 CL${i} = vec4(${g(c.x)}, ${g(c.z)}, ${g(c.r)}, ${g(c.h)});\nconst vec2 CF${i} = vec2(${g(c.fw[0])}, ${g(c.fw[1])});`).join("\n")}
// El claro más cercano al punto que mira map() (lo pone al empezar, con clearing). rH aplana solo
// alrededor de ese, que es el único que puede estar cerca (están a más de 100 m entre sí): map() llama
// a rH muchas veces y el compilador copia map() en cada lugar que la usa, así que cada cuenta pesa
vec4 gCl;
vec2 gFw;
// Misma cuenta que crestX y crestH en JS
float rX(float z) { return sin(z * ${g(CREST.x[1])}) * ${g(CREST.x[0])} + sin(z * ${g(CREST.x[3])} + ${g(CREST.x[4])}) * ${g(CREST.x[2])}; }
float rH(float z) {
  float h = ${g(CREST.h[0])} + max(0.0, -z) * ${g(CREST.h[1])} + sin(z * ${g(CREST.h[3])}) * ${g(CREST.h[2])} + sin(z * ${g(CREST.h[5])}) * ${g(CREST.h[4])}
    - max(0.0, z) * 0.6 - max(0.0, ${g(-CREST.len)} - z) * 1.2;
  return mix(h, gCl.w, 1.0 - smoothstep(gCl.z, gCl.z + ${g(FLAT_T)}, abs(z - gCl.y)));
}
// Busca el claro más cercano a q (en el plano) y lo deja en gCl y gFw. Devuelve cuánto falta para su
// borde (negativo adentro)
float clearing(vec2 q) {
  float d = 1e3;
${CLEARINGS.map((_, i) => `  { float e = length(q - CL${i}.xy) - CL${i}.z; if (e < d) { d = e; gCl = CL${i}; gFw = CF${i}; } }`).join("\n")}
  return d;
}

// Una fronda de helecho que sale de base hacia el rumbo a: sube, se arquea y cae. Es una cinta fina con
// foliolos (se angostan hacia la punta y se inclinan hacia adelante) y un nervio en el medio.
// L largo, W medio ancho, lift cuánto sube
float frond(vec3 p, vec3 base, float a, float L, float W, float lift) {
  vec3 q = p - base;
  vec2 d = vec2(cos(a), sin(a));
  float s = dot(q.xz, d);
  float w = q.x * d.y - q.z * d.x;
  float u = clamp(s / L, 0.0, 1.0);
  float ys = lift * (2.2 * u - 2.8 * u * u) + sin(uTime * 0.9 + a * 3.0) * 0.03 * u; // se mece en la punta
  float width = W * smoothstep(0.0, 0.18, u) * (1.0 - u * 0.85);
  float aw = abs(w);
  // Foliolos: dientes a lo largo, inclinados hacia la punta
  float pin = 0.25 + 0.75 * (1.0 - abs(fract(u * 15.0 - aw / max(W, 0.01) * 0.9) - 0.5) * 2.0);
  float lat = aw - width * pin;
  float vert = abs(q.y - ys + aw * 0.35) - 0.015; // los foliolos caen un poco hacia los costados
  float along = max(-s, s - L);
  float blade = max(max(vert, lat), along) * 0.6;
  float rib = length(vec2(q.y - ys, w)) - 0.022;
  return min(blade, max(rib, along));
}

vec2 map(vec3 p) {
  float z = p.z;
  // El claro más cercano: rH aplana el lomo a su alrededor
  float cd = clearing(p.xz);
  vec4 cl = gCl;
  float cx = rX(z);
  float h = rH(z);
  float dx = p.x - cx;
  float ax = abs(dx);
  // El lomo: angosto arriba (justo para la escalera) y cada vez más empinado hacia los costados, con
  // la vegetación que lo vuelve rugoso
  float side = max(0.0, ax - 0.9);
  float ground = h - 0.3 - side * 1.1 - side * side * 0.05;
  // Los claros: una meseta redonda y plana, al ras de los escalones, que cae como el lomo por los bordes
  float rim = max(0.0, cd);
  float mesa = cl.w - 0.02 - rim * 1.1 - rim * rim * 0.05;
  side = mesa > ground ? rim : side;
  ground = max(ground, mesa);
  // La vegetación de las laderas (ruido) solo donde hay ladera
  if (side > 0.5) ground += (fbm2(p.xz * 0.35) - 0.5) * 1.4 * smoothstep(0.5, 3.0, side);
  // El paso seguro depende de la pendiente de ahí: casi plano arriba del lomo (pasos largos), cada
  // vez más empinado a los costados (pasos cortos). Antes era 0.42 en todos lados
  float slope = 1.1 + side * 0.1 + (side > 0.5 ? 0.9 : 0.25);
  vec2 r = vec2((p.y - ground) * 0.9 * inversesqrt(1.0 + slope * slope), 1.0);
  // Mar de nubes abajo, que se curva con la distancia (el planeta). El ruido, solo si la nube puede
  // estar más cerca que la montaña (nunca sube más de 5 sobre -18)
  if ((p.y + 13.0) * 0.6 < r.x) {
    float dd = length(p.xz - uRo.xz);
    float cl = p.y + 18.0 + dd * dd * 0.0007 - fbm2(p.xz * 0.03 + vec2(uTime * 0.01, 0.0)) * 5.0;
    r = opU(r, vec2(cl * 0.6, 4.0));
  }
  // La escalera: escalones de madera, dos barandas y sus postes (solo cerca del lomo)
  if (max(ax - 2.0, abs(p.y - h - 0.25) - 1.75) * 0.85 < r.x && length(p - uRo) < 90.0) {
    float zq = (floor(z / 0.45) + 0.5) * 0.45;
    r = opU(r, vec2(sdBox(vec3(p.x - rX(zq), p.y - rH(zq) + 0.05, z - zq), vec3(0.5, 0.05, 0.16)), 2.0));
    float ry = p.y - h - 0.95;
    float rail = min(length(vec2(dx - 0.65, ry)), length(vec2(dx + 0.65, ry))) - 0.035;
    float zp = (floor(z / 1.8) + 0.5) * 1.8;
    vec3 pp = vec3(abs(p.x - rX(zp)) - 0.65, p.y - rH(zp), z - zp);
    float post = sdCapsule(pp, vec3(0.0), vec3(0.0, 0.95, 0.0), 0.03);
    // En los claros no hay barandas: el lomo queda abierto (empiezan a RAIL_GAP del borde)
    r = opU(r, vec2(max(min(rail * 0.85, post), ${g(RAIL_GAP)} - cd), 3.0));
  }
  // En cada claro, un círculo de piedras chatas para sentarse, partido en dos por el camino: tres de
  // cada lado, mirándose (solo de cerca y a la altura del claro)
  if (cd < 0.5 && abs(p.y - cl.w) < 1.2) {
    vec2 q = p.xz - cl.xy;
    vec2 l = vec2(abs(q.x * gFw.y - q.y * gFw.x), dot(q, gFw)); // al costado del camino (espejado) y a lo largo
    // Sobre un arco de radio R: la del medio enfrente, y las otras dos corridas a lo largo y un poco hacia el camino
    float R = cl.z * 0.55;
    float k = clamp(floor(l.y / (R * 0.565) + 0.5), -1.0, 1.0);
    // Una esfera aplastada (más barata que sdEllipsoid; para piedras alcanza)
    vec3 sq = vec3(l.x - R * (1.0 - 0.175 * abs(k)), p.y - cl.w - 0.08, l.y - k * R * 0.565);
    r = opU(r, vec2((length(sq * vec3(1.0, 1.8, 1.2)) - 0.55) * 0.55, 5.0));
  }
  // Vegetación de montaña a los dos lados de la escalera (solo cerca del lomo):
  //   matas de helecho: un racimo de frondas que se abren en roseta, y al pie una mata baja
  //   helechos arborescentes, más espaciados y más lejos: tronco fibroso y una corona de frondas grandes
  // (Optimización: solo a menos de 32 m de la cámara, que de lejos no se distinguen; y para cada punto
  // alcanza con su celda y la vecina más cercana)
  if (ax < 7.0 && abs(p.y - h) < 6.0 && length(p - uRo) < 32.0) {
    float zi = floor(z / 1.3);
    float zn = zi + (fract(z / 1.3) < 0.5 ? -1.0 : 1.0);
    for (int k = 0; k < 2; k++) {
      float zc = ((k == 0 ? zi : zn) + 0.5) * 1.3;
      // A lo ancho de un claro no hay: queda abierto (y así nunca quedan hundidos en la ladera de la meseta)
      if (abs(zc - cl.y) < cl.z + 3.0) continue;
      for (int sd = 0; sd < 2; sd++) {
        float sg = sd == 0 ? -1.0 : 1.0;
        float hv = hash2(vec2(zc, sg * 3.7));
        float off = 1.1 + hv * 2.2;
        vec3 c = vec3(rX(zc) + sg * off, rH(zc) - 0.3 - max(0.0, off - 0.9) * 1.1, zc + (hash1(zc * 1.9 + sg) - 0.5) * 0.6);
        float sz = 0.7 + hv * 0.8;
        if (length(p - c - vec3(0.0, 0.3 * sz, 0.0)) - sz * 1.6 > r.x) continue;
        // La mata baja del pie, con las hojas rugosas
        float bush = (length((p - c) * vec3(1.0, 1.6, 1.0)) - sz * 0.42) * 0.7 + (noise2(p.xz * 7.0 + p.y * 3.0) - 0.5) * 0.12;
        r = opU(r, vec2(bush, 7.0));
        // Las 5 frondas en roseta: cada punto solo mira la de su sector (repetición en ángulo)
        float a0 = hv * 6.0;
        float fi = floor((atan(p.z - c.z, p.x - c.x) - a0) / 1.2566 + 0.5);
        float fr = frond(p, c + vec3(0.0, sz * 0.15, 0.0), a0 + fi * 1.2566, sz * (1.1 + 0.3 * hash1(mod(fi, 5.0) + hv * 9.0)), sz * 0.24, sz * 0.75);
        r = opU(r, vec2(fr, 8.0));
      }
    }
    // Helechos arborescentes
    float ti = floor(z / 4.6);
    float tn = ti + (fract(z / 4.6) < 0.5 ? -1.0 : 1.0);
    for (int k = 0; k < 2; k++) {
      float zc = ((k == 0 ? ti : tn) + 0.5) * 4.6;
      if (abs(zc - cl.y) < cl.z + 3.0) continue;
      for (int sd = 0; sd < 2; sd++) {
        float sg = sd == 0 ? -1.0 : 1.0;
        float hv = hash2(vec2(zc * 1.3, sg * 9.1));
        if (hv < 0.35) continue;
        float off = 2.6 + hv * 2.4;
        vec3 c = vec3(rX(zc) + sg * off, rH(zc) - 0.3 - (off - 0.9) * 1.1, zc + (hash1(zc + sg * 5.0) - 0.5) * 2.0);
        float th = 1.6 + hv * 1.6;
        vec3 top = c + vec3(sg * 0.15, th, 0.0);
        if (length(p - c - vec3(0.0, th * 0.6, 0.0)) - th * 1.1 > r.x) continue;
        float trunk = sdCapsule(p, c, top, 0.11 + 0.04 * (1.0 - clamp((p.y - c.y) / th, 0.0, 1.0)));
        r = opU(r, vec2(trunk, 9.0));
        float a0 = hv * 4.0;
        float fi = floor((atan(p.z - top.z, p.x - top.x) - a0) / 1.0472 + 0.5);
        r = opU(r, vec2(frond(p, top, a0 + fi * 1.0472, 1.6 + hv * 0.4, 0.3, 0.45), 8.0));
      }
    }
  }
  // La puerta de la cima, de frente a quien sube
  vec3 dp = p - vec3(${g(crestX(CREST_DOOR_Z))}, ${g(crestH(CREST_DOOR_Z) + 1.2)}, ${g(CREST_DOOR_Z)});
  if (sdBox(dp, vec3(0.95, 1.35, 0.2)) < r.x) {
    float frame = min(min(sdBox(dp - vec3(-0.75, 0.0, 0.0), vec3(0.1, 1.2, 0.1)), sdBox(dp - vec3(0.75, 0.0, 0.0), vec3(0.1, 1.2, 0.1))), sdBox(dp - vec3(0.0, 1.2, 0.0), vec3(0.85, 0.1, 0.1)));
    r = opU(r, vec2(frame, 5.0));
    r = opU(r, vec2(sdBox(dp, vec3(0.64, 1.12, 0.02)), 6.0));
  }
  return r;
}

// Casi el espacio: arriba se oscurece, en el horizonte brilla la atmósfera y el sol está de frente
vec3 sky(vec3 rd) {
  float y = rd.y;
  // Horizonte naranja-rosado, medio magenta y violeta profundo arriba; todo el cielo va girando de tono
  float shift = sin(uTime * 0.05) * 0.08;
  vec3 hor = vec3(1.0, 0.5, 0.25);
  vec3 mid = vec3(0.95, 0.2, 0.65);
  vec3 top = vec3(0.18, 0.05, 0.42);
  vec3 c = mix(hor, mid, smoothstep(-0.02, 0.18, y));
  c = mix(c, top, smoothstep(0.15, 0.7, y));
  // Remolinos de color que se mueven (psicodelia)
  vec2 dir0 = rd.xz / max(length(rd.xz), 1e-3);
  vec2 sw = dir0 * 2.2 + vec2(y * 4.0, 0.0);
  float sa = fbm2(sw + vec2(uTime * 0.02, -uTime * 0.015));
  float sb = fbm2(sw * 1.7 + sa * 2.5 - uTime * 0.03);
  c = mix(c, pal(sb * 1.6 + shift + y * 0.6 + uTime * 0.015) * 1.1, smoothstep(0.35, 0.8, sb) * 0.55 * smoothstep(-0.02, 0.1, y));
  c += vec3(0.5, 0.95, 1.0) * exp(-abs(y + 0.04) * 16.0) * 0.6; // el borde del planeta, turquesa
  float s = max(dot(rd, SUN), 0.0);
  c += vec3(1.0, 0.95, 0.85) * (smoothstep(0.9985, 0.9993, s) * 1.6 + pow(s, 24.0) * 0.5 + pow(s, 4.0) * 0.12);
  vec2 sp = floor(rd.xy * 160.0) + floor(rd.zx * 160.0);
  c += step(0.997, hash2(sp)) * smoothstep(0.25, 0.6, y) * vec3(0.8, 0.85, 1.0) * 0.6; // estrellas, arriba de todo
  // Auroras: cintas de colores que se mueven despacio y cambian de tono
  vec2 dir = rd.xz / max(length(rd.xz), 1e-3);
  float rib = fbm2(dir * 1.8 + vec2(y * 3.0 - uTime * 0.03, uTime * 0.01));
  float aur = smoothstep(0.55, 0.75, rib) * smoothstep(0.1, 0.25, y) * smoothstep(0.75, 0.35, y);
  c += pal(rib * 1.5 + uTime * 0.02 + y) * aur * 0.7;
  return c;
}

// --- Criaturas del cielo: ballenas, delfines y peces hechos de luz ---
// No son geometría: cada una se dibuja donde el rayo pasa más cerca de su centro, como una silueta
// translúcida con el borde más brillante. Así son baratas y se ven etéreas; la montaña las tapa igual.
// q: el punto en coordenadas de la criatura (x hacia la cabeza, y arriba, z al costado), len el largo y
// rad el grosor. Devuelve cuánta luz da ahí y en qué parte del cuerpo está (u, de -0.5 cola a 0.5 cabeza)
vec2 body(vec3 q, float len, float rad, float fin) {
  float u = q.x / len;
  if (abs(u) > 0.62) return vec2(0.0);
  q.y += sin(u * 6.0 - uTime * 1.6) * rad * 0.18; // nada ondulando
  // Gorda adelante y finita hacia la cola
  float prof = rad * sqrt(max(0.0, 1.0 - 4.0 * u * u)) * (u < 0.0 ? 1.0 + u * 1.3 : 1.0);
  float e = length(q.yz) / max(prof, 1e-3);
  float lit = smoothstep(1.0, 0.8, e) * (0.2 + 0.8 * smoothstep(0.45, 1.0, e)); // el borde brilla más
  // La cola: dos aletas abiertas hacia los costados
  float tail = smoothstep(-0.42, -0.5, u) * step(-0.62, u) * step(abs(q.y), rad * 0.12) * step(abs(q.z), rad * 1.3 * (-0.42 - u) * 8.0);
  // Aleta de arriba (los delfines)
  float dorsal = fin * step(prof, q.y) * step(q.y, prof + rad * 0.9 * max(0.0, 1.0 - abs(u - 0.02) * 9.0)) * step(abs(q.z), rad * 0.12);
  return vec2(max(lit, max(tail, dorsal) * 0.7), u);
}

// Una criatura en c, mirando hacia f. Se suma a la luz del cielo si el rayo pasa por ella antes de chocar
vec3 creature(vec3 rd, float t, vec3 c, vec3 f, float len, float rad, float fin, float hue) {
  vec3 d = c - uRo;
  float a = dot(d, rd);
  if (a < 0.5 || a > t + rad) return vec3(0.0);
  vec3 off = uRo + rd * a - c;
  if (dot(off, off) > len * len * 0.4) return vec3(0.0);
  vec3 up = normalize(vec3(0.0, 1.0, 0.0) - f * f.y);
  vec3 sd = cross(f, up);
  vec2 b = body(vec3(dot(off, f), dot(off, up), dot(off, sd)), len, rad, fin);
  if (b.x <= 0.0) return vec3(0.0);
  // Iridiscente: el color corre a lo largo del cuerpo, con bandas de luz que lo recorren
  float bands = 0.75 + 0.5 * step(0.6, fract(b.y * 7.0 - uTime * 0.6));
  return pal(hue + b.y * 0.9 + uTime * 0.04) * b.x * bands * 1.3 * mix(0.45, 1.0, exp(-a * 0.006));
}

vec3 glow(vec3 rd, float t) {
  vec3 g = vec3(0.0);
  // Dos ballenas enormes cruzan a lo lejos, cada una para su lado (siempre por delante de quien sube)
  float w0 = mod(uTime * 5.0 + 160.0, 400.0) - 200.0; // una vuelta cada 80 s; al llegar ya está pasando
  g += creature(rd, t, vec3(uRo.x + w0, uRo.y + 22.0 + sin(uTime * 0.1) * 4.0, uRo.z - 130.0), vec3(1.0, sin(uTime * 0.13) * 0.08, 0.0), 45.0, 6.0, 0.0, 0.55);
  float w1 = mod(uTime * 4.0 + 20.0, 500.0) - 250.0;
  g += creature(rd, t, vec3(uRo.x - w1, uRo.y + 42.0, uRo.z - 210.0), vec3(-1.0, 0.0, 0.0), 60.0, 8.0, 0.0, 0.85);
  // Delfines que saltan del mar de nubes
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float ph = fract(uTime / 9.0 + fi * 0.33);
    float arc = sin(ph * 3.1416);
    vec3 c = vec3(uRo.x - 60.0 + fi * 50.0 + (ph - 0.5) * 34.0, -17.0 + arc * 12.0, uRo.z - 55.0 - fi * 22.0);
    vec3 f = normalize(vec3(1.0, cos(ph * 3.1416) * 1.1, 0.0));
    g += creature(rd, t, c, f, 6.0, 0.8, 1.0, 0.1 + fi * 0.2);
  }
  // Un cardumen de peces chicos que nada en círculos alrededor y te acompaña
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float h = hash1(fi * 7.3);
    float ang = uTime * (0.18 + h * 0.12) + fi * 0.63;
    float rr = 7.0 + h * 8.0;
    vec3 c = uRo + vec3(cos(ang) * rr, 1.5 + sin(uTime * 0.7 + fi) * 1.5 + h * 3.0, sin(ang) * rr);
    vec3 f = normalize(vec3(-sin(ang), cos(uTime * 0.7 + fi) * 0.15, cos(ang)));
    g += creature(rd, t, c, f, 1.8, 0.32, 0.0, h);
  }
  return g;
}

vec3 shade(vec3 p, vec3 n, vec3 rd, float m, float ao) {
  float dif = max(dot(n, SUN), 0.0);
  vec3 sun = vec3(1.0, 0.95, 0.85) * dif;
  vec3 amb = mix(vec3(0.22, 0.28, 0.36), vec3(0.4, 0.5, 0.65), 0.5 + 0.5 * n.y);
  if (m < 1.5) {
    // Vegetación: musgo y helechos, y roca donde es muy empinado
    float v = fbm2(p.xz * 1.3 + p.y * 0.7);
    vec3 green = mix(vec3(0.05, 0.35, 0.12), vec3(0.3, 0.8, 0.2), v);
    // Alfombra de helecho (como el uluhe): frondas chiquitas que se cruzan, en vetas claras y oscuras
    vec2 fq = p.xz * 2.2 + vec2(fbm2(p.xz * 0.4) * 3.0, 0.0);
    float fern = abs(fract(fq.x + abs(fract(fq.y) - 0.5) * 0.8) - 0.5);
    green *= 0.75 + 0.45 * smoothstep(0.32, 0.1, fern);
    green = mix(green, pal(v * 2.0 + p.z * 0.02 + uTime * 0.03) * 0.7, 0.18); // un brillo de arcoíris que corre
    vec3 c = mix(vec3(0.3, 0.28, 0.25), green, smoothstep(0.25, 0.55, n.y + v * 0.3));
    return c * (sun * 0.9 + amb * (0.5 + 0.5 * ao));
  }
  if (m < 2.5) return vec3(0.48, 0.34, 0.22) * (sun * 0.9 + amb * (0.5 + 0.5 * ao)); // escalones
  if (m < 3.5) {
    // Barandas de metal, con el brillo del sol
    vec3 h = normalize(SUN - rd);
    return vec3(0.55, 0.62, 0.7) * (sun * 0.8 + amb) + vec3(1.0, 0.95, 0.85) * pow(max(dot(n, h), 0.0), 30.0) * 0.8;
  }
  if (m < 4.5) {
    // Nubes que reflejan el cielo: rosadas, naranjas y lilas, con vetas de color que se mueven
    vec3 tint = mix(vec3(1.0, 0.7, 0.75), pal(fbm2(p.xz * 0.02 + uTime * 0.01) * 1.5 + uTime * 0.01), 0.35);
    return tint * (0.62 + 0.38 * dif) * (0.65 + 0.35 * ao);
  }
  if (m < 5.5) return vec3(0.85, 0.82, 0.78) * (sun * 0.8 + amb);
  if (m > 6.5) {
    // Matas y helechos: verdes intensos, con las puntas que se encienden de colores
    if (m > 8.5) {
      // Tronco del helecho arborescente: fibras marrones con anillos
      float ring = 0.8 + 0.2 * sin(p.y * 22.0 + noise2(p.xz * 30.0) * 3.0);
      return vec3(0.32, 0.2, 0.12) * ring * (sun * 0.8 + amb * (0.5 + 0.5 * ao));
    }
    float v = noise2(p.xz * 4.0 + p.y * 2.0);
    vec3 leaf = mix(vec3(0.04, 0.4, 0.15), vec3(0.35, 0.95, 0.3), v);
    if (m > 7.5) {
      // Fronda: verde claro arriba, más oscura abajo, y un brillo de colores que corre por las puntas
      leaf = mix(vec3(0.08, 0.45, 0.14), vec3(0.45, 1.0, 0.35), 0.5 + 0.5 * n.y);
      leaf = mix(leaf, pal(p.z * 0.05 + uTime * 0.05 + v), 0.25);
    }
    float rim = pow(1.0 - max(dot(-rd, n), 0.0), 2.5);
    return leaf * (sun * 0.9 + amb * (0.5 + 0.5 * ao)) + pal(p.z * 0.03 + uTime * 0.04) * rim * 0.35;
  }
  // Adentro de la puerta: el pasillo, que titila un poco
  return vec3(1.25, 1.1, 0.6) * (0.85 + 0.15 * step(0.3, fract(sin(floor(uTime * 7.0)) * 43758.5)));
}
`

export const CREST_SCENE: Scene3D = {
  id: "cresta",
  name: "cresta",
  label: "la cresta",
  blurb: "espacio 07 · una escalera sobre el lomo de la montaña, encima de las nubes",
  glsl: crest,
  avatars: true,
  exposure: 1.2,
  saturation: 1,
  grade: 0.1,
  outdoor: true,
  // Se camina libre por la escalera y los claros (el piso lo dice crestFloor). Sin avance solo: en los
  // claros uno se queda quieto mirando. Al llegar a la puerta de la cumbre se vuelve al pasillo
  camera: {
    target: [crestX(-ARRIVE), 1.6, 0], // y = altura de los ojos sobre el piso
    yaw: 0,
    pitch: 0.08,
    frame: 1.4,
    clip: 1e4,
    pitchRange: [-1.2, 1.2],
    walk: {
      drift: 0,
      loop: CREST.len,
      fov: 74,
      flash: 2.5,
      start: ARRIVE,
      speed: 1,
      roam: { center: [0, -130], radius: 142, floor: crestFloor, exitAt: [crestX(CREST_DOOR_Z), CREST_DOOR_Z], exitR: 0.7 },
    },
    exitDoor: { at: [crestX(CREST_DOOR_Z), crestH(CREST_DOOR_Z) + 1.2, CREST_DOOR_Z], facing: [0, 0, 1] },
  },
}
