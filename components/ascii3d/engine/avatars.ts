// Motor · avatares: las personas conectadas, dibujadas con formas dentro del mismo raymarch, así pasan
// al ASCII igual que el resto de la escena (luz, trazos, sombras, niebla).
//
// La figura sigue a Galatea (public/models): proporciones de anime, cabeza grande, piernas largas,
// vestido acampanado con mangas abullonadas, descalza. El cuerpo masculino ensancha hombros y cuello,
// angosta la cadera y endereza las mangas. Encima, lo fantástico que cada quien elige en el creador:
// pelo, ropa (vestido, túnica, pantalón; el espectro flota y se deshace en bruma), alas de plumas, de
// murciélago o de luz, aureola, cuernos, cola y colores. Los ojos y la aureola brillan a través de la niebla.
//
// Una escena los admite con withAvatars(), que le suma este GLSL. Los avatares NO van en el map() de
// la escena: el compilador copia map() en cada lugar que consulta el mundo (rayo, normales, sombras,
// rincones, esquinas) y con la figura adentro el shader tardaba 10 veces más en compilar (29 s la
// escalera). Por eso el raymarch (shader.ts) los traza aparte, después del mundo y solo hasta donde el
// mundo chocó (avatarsTrace, que también saca la normal), su luz sin sombras (avatarShade), los
// ojos (avatarAura) y una sombra de contacto en el piso (avatarBlob). Las figuras llegan cada cuadro
// por uniforms (uploadAvatars); un programa sin avatares ignora esos uniforms.
//
// Usa del mundo (world.ts) uSunDir, uLightCol, uLight, uSkyHor y uSkyTop: así un avatar se lee
// también afuera, de día o de noche, aunque la escena no tenga luces dinámicas.

import type { V3 } from "./camera"
import type { Program } from "./shader"

export const MAX_AVATARS = 8
export const STRIDE = 5.5 // radianes de paso por metro caminado (el balanceo de piernas y brazos)

// --- Cómo se ve alguien: cada campo es el número de una opción ---
export type Look = {
  body: number
  hair: number
  dress: number
  wings: number
  crown: number
  tail: number
  skin: number
  cloth: number
  hairColor: number
  glow: number
}

export const LOOK_PARTS = {
  body: ["femenino", "masculino"],
  hair: ["largo", "corto", "moño", "velo"],
  dress: ["vestido", "túnica", "espectro", "pantalón"],
  wings: ["sin alas", "plumas", "murciélago", "de luz"],
  crown: ["nada", "aureola", "cuernos", "caído"],
  tail: ["sin cola", "cola"],
} as const

type Swatch = { name: string; rgb: V3 }
export const LOOK_COLORS: Record<"skin" | "cloth" | "hairColor" | "glow", Swatch[]> = {
  skin: [
    { name: "porcelana", rgb: [1.0, 0.86, 0.8] },
    { name: "canela", rgb: [0.78, 0.55, 0.4] },
    { name: "ceniza", rgb: [0.62, 0.64, 0.72] },
    { name: "carmín", rgb: [0.85, 0.25, 0.22] },
    { name: "espectral", rgb: [0.6, 0.82, 1.0] },
  ],
  cloth: [
    { name: "perla", rgb: [0.95, 0.93, 1.0] },
    { name: "noche", rgb: [0.14, 0.11, 0.18] },
    { name: "sangre", rgb: [0.62, 0.06, 0.12] },
    { name: "lila", rgb: [0.72, 0.56, 0.96] },
    { name: "cielo", rgb: [0.55, 0.8, 1.0] },
    { name: "rosa", rgb: [1.0, 0.56, 0.8] },
  ],
  hairColor: [
    { name: "plata", rgb: [0.86, 0.88, 0.96] },
    { name: "negro", rgb: [0.12, 0.1, 0.14] },
    { name: "oro", rgb: [1.0, 0.82, 0.45] },
    { name: "rojo", rgb: [0.82, 0.16, 0.16] },
    { name: "rosa", rgb: [1.0, 0.6, 0.85] },
    { name: "azul", rgb: [0.4, 0.6, 1.0] },
  ],
  glow: [
    { name: "oro", rgb: [1.0, 0.85, 0.4] },
    { name: "blanco", rgb: [1.0, 1.0, 1.0] },
    { name: "rojo", rgb: [1.0, 0.18, 0.1] },
    { name: "celeste", rgb: [0.4, 0.85, 1.0] },
    { name: "violeta", rgb: [0.78, 0.42, 1.0] },
    { name: "verde", rgb: [0.4, 1.0, 0.6] },
  ],
}

// Cuántas opciones tiene cada campo (el servidor repite estos números en server/rooms/index.js)
export const LOOK_LIMITS: Record<keyof Look, number> = {
  body: LOOK_PARTS.body.length,
  hair: LOOK_PARTS.hair.length,
  dress: LOOK_PARTS.dress.length,
  wings: LOOK_PARTS.wings.length,
  crown: LOOK_PARTS.crown.length,
  tail: LOOK_PARTS.tail.length,
  skin: LOOK_COLORS.skin.length,
  cloth: LOOK_COLORS.cloth.length,
  hairColor: LOOK_COLORS.hairColor.length,
  glow: LOOK_COLORS.glow.length,
}
const KEYS = Object.keys(LOOK_LIMITS) as (keyof Look)[]

// Puntos de partida del creador. El cuerpo no lo cambian (lo conserva el creador); con cuerpo
// masculino se aplica male encima: en ASCII lo que más pesa es la silueta, y pelo largo con vestido
// acampanado se lee femenino aunque los hombros sean anchos
export const LOOK_PRESETS: { name: string; look: Look; male?: Partial<Look> }[] = [
  {
    name: "ángel",
    look: { body: 0, hair: 0, dress: 0, wings: 1, crown: 1, tail: 0, skin: 0, cloth: 0, hairColor: 0, glow: 0 },
    male: { hair: 1, dress: 1 }, // pelo corto y túnica larga
  },
  {
    name: "demonio",
    look: { body: 0, hair: 0, dress: 1, wings: 2, crown: 2, tail: 1, skin: 3, cloth: 1, hairColor: 1, glow: 2 },
    male: { hair: 1, dress: 3 }, // pelo corto, chaqueta y pantalón negros
  },
  { name: "espectro", look: { body: 0, hair: 3, dress: 2, wings: 0, crown: 0, tail: 0, skin: 4, cloth: 4, hairColor: 0, glow: 3 } },
  {
    name: "caído",
    look: { body: 0, hair: 0, dress: 0, wings: 3, crown: 3, tail: 0, skin: 2, cloth: 1, hairColor: 0, glow: 4 },
    male: { hair: 1, dress: 3 }, // pelo corto, chaqueta y pantalón
  },
]

// Un punto de partida con el cuerpo que se pide (0 femenino, 1 masculino)
export const presetLook = (p: (typeof LOOK_PRESETS)[number], body: number): Look => ({
  ...p.look,
  ...(body ? p.male : null),
  body,
})

// Lo que llega de afuera (el navegador guardado, la red) no se cree: null si no es un Look válido
export const cleanLook = (v: unknown): Look | null => {
  if (!v || typeof v !== "object") return null
  const out = {} as Look
  for (const k of KEYS) {
    const x = (v as Record<string, unknown>)[k]
    if (!Number.isInteger(x) || (x as number) < 0 || (x as number) >= LOOK_LIMITS[k]) return null
    out[k] = x as number
  }
  return out
}

export const randomLook = (rand: () => number = Math.random): Look => {
  const out = {} as Look
  for (const k of KEYS) out[k] = Math.floor(rand() * LOOK_LIMITS[k])
  return out
}

// Para quien todavía no armó su avatar: uno al azar, pero siempre el mismo para el mismo nick
export const lookOf = (nick: string) => {
  let h = 2166136261
  for (const c of nick) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return randomLook(() => {
    h = Math.imul(h ^ (h >>> 15), 2246822519) ^ Math.imul(h ^ (h >>> 13), 3266489917)
    return ((h >>> 0) % 10000) / 10000
  })
}

// Las partes en un solo número para el shader (avDigit lo desarma)
const lookCode = (l: Look) => l.hair + 4 * l.dress + 16 * l.wings + 64 * l.crown + 256 * l.tail + 512 * l.body

export type Avatar = {
  pos: V3 // los pies (en el piso, aunque flote)
  yaw: number // hacia dónde mira (0 = hacia -z, como la cámara)
  look: Look
  walk: number // 0 quieto, 1 caminando
  phase: number // el paso (radianes)
  seed: number // desfasa el vuelo, el aleteo y los pliegues entre avatares
}

const GLSL_AVATARS = /* glsl */ `
#define AVATARS
#define MAX_AV ${MAX_AVATARS}
#define AV_MAT 100.0
uniform int uAvN;
uniform vec4 uAvP[MAX_AV]; // xyz los pies, w hacia dónde mira
uniform vec4 uAvA[MAX_AV]; // x el paso, y cuánto camina, z las partes (lookCode), w semilla
uniform vec4 uAvC[MAX_AV]; // rgb la ropa, w la piel (r)
uniform vec4 uAvH[MAX_AV]; // rgb el pelo, w la piel (g)
uniform vec4 uAvG[MAX_AV]; // rgb el brillo, w la piel (b)
// Material: AV_MAT + número de avatar + parte / 10
// partes: 0 piel, 1 ropa, 2 pelo, 3 alas, 4 brillo (aureola, alas de luz), 5 cuernos y cola

// Un dígito del código de partes (con medio de margen: la división en la GPU no es exacta)
float avDigit(float code, float base, float n) {
  float x = floor((code + 0.5) / base);
  return x - n * floor((x + 0.5) / n);
}
float avHover(float dress, float seed) { return dress > 1.5 && dress < 2.5 ? 0.3 + 0.05 * sin(uTime * 1.7 + seed) : 0.0; }
float avSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
// Cono truncado centrado en y = 0, de alto 2h, radio r1 abajo y r2 arriba
float avCone(vec3 p, float h, float r1, float r2) {
  vec2 q = vec2(length(p.xz), p.y);
  vec2 k1 = vec2(r2, h);
  vec2 k2 = vec2(r2 - r1, 2.0 * h);
  vec2 ca = vec2(q.x - min(q.x, q.y < 0.0 ? r1 : r2), abs(q.y) - h);
  vec2 cb = q - k1 + k2 * clamp(dot(k1 - q, k2) / dot(k2, k2), 0.0, 1.0);
  float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
  return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
}
// Cápsula que se afina: radio r1 en a, r2 en b (aproximada; la exacta tiene muchas ramas y se
// copia en cada uso: el shader compilaba bastante más lento)
float avTaper(vec3 p, vec3 a, vec3 b, float r1, float r2) {
  vec3 pa = p - a;
  vec3 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - mix(r1, r2, h);
}
// Distancia a un triángulo (la tela de las alas de murciélago)
float avTri(vec3 p, vec3 a, vec3 b, vec3 c) {
  vec3 ba = b - a; vec3 pa = p - a;
  vec3 cb = c - b; vec3 pb = p - b;
  vec3 ac = a - c; vec3 pc = p - c;
  vec3 nor = cross(ba, ac);
  float inside = sign(dot(cross(ba, nor), pa)) + sign(dot(cross(cb, nor), pb)) + sign(dot(cross(ac, nor), pc));
  if (inside < 2.0) {
    vec3 e1 = ba * clamp(dot(ba, pa) / dot(ba, ba), 0.0, 1.0) - pa;
    vec3 e2 = cb * clamp(dot(cb, pb) / dot(cb, cb), 0.0, 1.0) - pb;
    vec3 e3 = ac * clamp(dot(ac, pc) / dot(ac, ac), 0.0, 1.0) - pc;
    return sqrt(min(min(dot(e1, e1), dot(e2, e2)), dot(e3, e3)));
  }
  return sqrt(dot(nor, pa) * dot(nor, pa) / dot(nor, nor));
}
void avU(inout vec2 r, float d, float part) { if (d < r.x) r = vec2(d, part); }

// La figura en su lugar: pies en el origen, el frente hacia -z. Devuelve distancia y parte
vec2 avatarSdf(vec3 q, vec4 a) {
  float code = a.z;
  float hair = avDigit(code, 1.0, 4.0);
  float dress = avDigit(code, 4.0, 4.0);
  float wings = avDigit(code, 16.0, 4.0);
  float crown = avDigit(code, 64.0, 4.0);
  float tail = avDigit(code, 256.0, 2.0);
  float body = avDigit(code, 512.0, 2.0); // 0 femenino, 1 masculino: las medidas se mezclan con él
  bool ghost = dress > 1.5 && dress < 2.5; // el espectro no camina: flota
  bool pants = dress > 2.5;
  float w = ghost ? 0.0 : a.y;
  q.y -= avHover(dress, a.w) + abs(sin(a.x)) * 0.03 * w;
  // Espejo: brazos, piernas, alas y cuernos se calculan de un solo lado (x > 0). Del lado izquierdo
  // el paso va al revés: la pierna que avanza de un lado es la que vuelve del otro
  float side = q.x < 0.0 ? 1.0 : -1.0;
  vec3 m = vec3(abs(q.x), q.y, q.z);
  float ms = sin(a.x) * w * side;
  vec2 r = vec2(1e5, 0.0);

  // Piel: cabeza grande (anime), cuello, manos, piernas largas y pies descalzos
  float spread = ghost ? 0.07 : 0.0; // flotando, los brazos se abren un poco
  vec3 hand = vec3(mix(0.22, 0.26, body) + spread, 0.84 + spread, 0.17 * ms);
  float skin = sdEllipsoid(q - vec3(0.0, 1.56, 0.0), vec3(0.1, 0.115, 0.105) * mix(1.0, 0.93, body));
  skin = avSmin(skin, sdCapsule(q, vec3(0.0, 1.36, 0.01), vec3(0.0, 1.47, 0.01), mix(0.034, 0.043, body)), 0.02);
  skin = min(skin, length(m - hand) - mix(0.032, 0.037, body));
  float legs = 1e5;
  float feet = 1e5;
  if (!ghost) {
    vec3 foot = vec3(mix(0.07, 0.085, body), 0.06 + 0.08 * w * max(cos(a.x) * side, 0.0), -0.22 * ms);
    legs = avTaper(m, vec3(mix(0.065, 0.08, body), 0.74, 0.0), foot, mix(0.052, 0.058, body), mix(0.03, 0.037, body));
    feet = sdEllipsoid(m - foot - vec3(0.0, -0.03, -0.045), vec3(0.032, 0.025, 0.065) * (pants ? 1.25 : 1.0));
  }
  // Con pantalón las piernas son de tela y los pies, botas oscuras
  if (!pants) skin = min(skin, min(legs, feet));
  avU(r, skin, 0.0);
  if (pants) avU(r, feet, 5.0);

  // Ropa: torso, mangas que se abren hacia el puño (como las de Galatea; rectas en el masculino) y
  // el vestido
  vec3 elb = vec3(mix(0.2, 0.25, body) + spread, 1.08, 0.08 * ms);
  float cloth = avTaper(q, vec3(0.0, 1.0, 0.0), vec3(0.0, 1.3, 0.0), mix(0.095, 0.105, body), mix(0.12, 0.155, body));
  cloth = avSmin(cloth, avTaper(m, vec3(mix(0.14, 0.18, body), 1.32, 0.0), elb, mix(0.05, 0.056, body), 0.045), 0.04);
  cloth = min(cloth, avTaper(m, elb, hand + vec3(0.0, 0.05, 0.0), 0.045, mix(0.062, 0.046, body)));
  if (pants) cloth = min(cloth, legs - 0.008);
  // Vestido: corto y acampanado, túnica hasta los pies, o espectro que se afina hacia abajo y se
  // mece como humo
  vec3 dq = q;
  float cy = 0.82;
  float ch = 0.2;
  float r1 = 0.3;
  float r2 = 0.11;
  if (dress > 0.5) {
    cy = 0.55;
    ch = 0.47;
  }
  if (pants) {
    // Chaqueta corta que llega a la cadera
    cy = 0.97;
    ch = 0.1;
    r1 = mix(0.15, 0.135, body);
    r2 = mix(0.12, 0.145, body);
  }
  if (ghost) {
    cy = 0.6;
    ch = 0.42;
    r1 = 0.04;
    r2 = 0.13;
    dq.x += sin(uTime * 2.0 + q.y * 5.0 + a.w) * 0.06 * clamp(1.0 - q.y, 0.0, 1.0);
  }
  dq.y -= cy;
  float gown = avCone(dq, ch, r1, r2);
  // Pliegues que ondulan, más abajo que arriba
  gown += sin(atan(q.z, q.x) * 9.0 + uTime * 1.5 + a.w) * 0.012 * clamp((1.0 - q.y) * 2.0, 0.0, 1.0);
  cloth = avSmin(cloth, gown * 0.9, 0.05);

  // Pelo: casquete con flequillo, y lo que cae atrás según el peinado
  float hd = sdEllipsoid(q - vec3(0.0, 1.6, 0.02), vec3(0.112, 0.122, 0.112));
  float back = 1e5;
  if (hair < 0.5) back = sdBox(q - vec3(0.0, 1.28, 0.075), vec3(0.1, 0.3, 0.03)) - 0.02; // largo y liso, hasta la cintura
  else if (hair < 1.5) back = sdEllipsoid(q - vec3(0.0, 1.48, 0.05), vec3(0.1, 0.08, 0.07)); // corto
  else if (hair < 2.5) back = length(q - vec3(0.0, 1.73, 0.07)) - 0.06; // moño
  else {
    // Velo: tela de la ropa que cae de la cabeza a los hombros, abierta en la cara
    float veil = max(sdEllipsoid(q - vec3(0.0, 1.45, 0.03), vec3(0.2, 0.33, 0.2)), -sdEllipsoid(q - vec3(0.0, 1.5, -0.12), vec3(0.085, 0.14, 0.12)));
    cloth = min(cloth, max(veil, 1.1 - q.y));
  }
  hd = avSmin(hd, back, 0.04);
  if (hair < 0.5) hd = min(hd, sdCapsule(m, vec3(0.095, 1.56, -0.04), vec3(0.1, 1.3, -0.03), 0.022)); // mechones
  avU(r, cloth, 1.0);
  avU(r, hd, 2.0);

  // Alas, en la espalda
  if (wings > 0.5) {
    float flap = sin(uTime * (ghost ? 1.4 : 2.2) + a.w) * 0.12;
    vec3 root = vec3(0.06, 1.28, 0.1);
    float d = 1e5;
    if (wings > 1.5 && wings < 2.5) {
      // Murciélago: dos huesos y la tela entre ellos (tres triángulos)
      vec3 elw = vec3(0.34, 1.52 + flap, 0.22);
      vec3 tip = vec3(0.72, 1.58 + flap * 2.0, 0.28);
      vec3 lo1 = vec3(0.4, 1.0, 0.22);
      vec3 lo2 = vec3(0.7, 1.12 + flap, 0.3);
      d = min(avTaper(m, root, elw, 0.03, 0.02), avTaper(m, elw, tip, 0.02, 0.006));
      for (int j = 0; j < 3; j++) {
        if (j >= uLoops) break;
        vec3 ta = j == 0 ? root : elw;
        vec3 tb = j == 0 ? elw : (j == 1 ? tip : lo2);
        vec3 tc = j == 0 ? lo1 : (j == 1 ? lo2 : lo1);
        d = min(d, avTri(m, ta, tb, tc) - 0.008);
      }
    } else {
      // Plumas en punta abiertas en abanico, como las de Galatea (las de luz, más largas y finas)
      float len0 = wings > 2.5 ? 0.62 : 0.48;
      float th = wings > 2.5 ? 0.02 : 0.04;
      for (int f = 0; f < 5; f++) {
        if (f >= uLoops) break;
        float fa = mix(-0.45, 0.85, float(f) / 4.0) + flap;
        float len = len0 * (1.0 - 0.12 * abs(float(f) - 2.0));
        d = min(d, avTaper(m, root, root + vec3(cos(fa) * len, sin(fa) * len, 0.12 + 0.1 * len), th, 0.004));
      }
    }
    avU(r, d, wings > 2.5 ? 4.0 : 3.0);
  }

  // Cabeza: cuernos (demonio, caído) y aureola (ángel; rota si es caído)
  if (crown > 1.5) {
    vec3 b1 = vec3(0.13, 1.77, 0.04);
    avU(r, min(avTaper(m, vec3(0.06, 1.66, -0.01), b1, 0.026, 0.017), avTaper(m, b1, vec3(0.11, 1.86, 0.14), 0.017, 0.003)), 5.0);
  }
  if (crown > 0.5 && (crown < 1.5 || crown > 2.5)) {
    vec3 hq = q - vec3(0.0, 1.8, 0.05);
    hq = vec3(hq.x, 0.94 * hq.y - 0.34 * hq.z, 0.34 * hq.y + 0.94 * hq.z); // inclinada hacia atrás
    float halo = length(vec2(length(hq.xz) - 0.12, hq.y)) - 0.011;
    if (crown > 2.5) halo = max(halo, -max(0.03 - hq.x, hq.z)); // le falta un pedazo
    avU(r, halo, 4.0);
  }

  // Cola de demonio con punta
  if (tail > 0.5) {
    float sw = sin(uTime * 2.3 + a.w) * 0.08;
    vec3 t1 = vec3(sw, 0.58, 0.3);
    vec3 t2 = vec3(0.12 + sw, 0.42, 0.44);
    float d = min(avTaper(q, vec3(0.0, 0.88, 0.09), t1, 0.022, 0.016), avTaper(q, t1, t2, 0.016, 0.01));
    d = min(d, sdEllipsoid(q - t2 - vec3(0.02, -0.04, 0.03), vec3(0.045, 0.055, 0.012)));
    avU(r, d, 5.0);
  }
  return r;
}

vec2 avatarsMap(vec2 r, vec3 p) {
  for (int i = 0; i < MAX_AV; i++) {
    if (i >= uAvN) break;
    vec4 P = uAvP[i];
    vec3 d = p - P.xyz;
    // Lejos (o detrás de algo más cerca): alcanza con la esfera que lo envuelve (alas y vuelo incluidos)
    float bound = length(d - vec3(0.0, 1.05, 0.0)) - 1.2;
    if (bound > r.x) continue;
    if (bound > 0.3) { r = vec2(bound, AV_MAT + float(i)); continue; }
    float c = cos(P.w);
    float s = sin(P.w);
    vec2 k = avatarSdf(vec3(d.x * c - d.z * s, d.y, d.x * s + d.z * c), uAvA[i]);
    if (k.x < r.x) r = vec2(k.x, AV_MAT + float(i) + k.y * 0.1);
  }
  return r;
}

// El rayo, solo contra los avatares: primero las esferas que los envuelven (casi siempre no toca
// ninguna y no cuesta nada), después unos pasos dentro de ese tramo. Al chocar, el mismo bucle da
// cuatro vueltas más para la normal: así la figura aparece una sola vez en el shader (cada copia
// sumaba unos 2,5 s de compilación). Devuelve la distancia (o -1), el material en am y la normal en an
float avatarsTrace(vec3 rd, float tmax, float pxA, out float am, out vec3 an) {
  am = -1.0;
  an = vec3(0.0, 1.0, 0.0);
  float t0 = 1e9;
  float t1 = -1.0;
  for (int i = 0; i < MAX_AV; i++) {
    if (i >= uAvN) break;
    vec3 oc = uRo - (uAvP[i].xyz + vec3(0.0, 1.05, 0.0));
    float b = dot(oc, rd);
    float h = b * b - dot(oc, oc) + 1.44; // radio 1.2
    if (h < 0.0) continue;
    h = sqrt(h);
    t0 = min(t0, max(-b - h, 0.0));
    t1 = max(t1, -b + h);
  }
  t1 = min(t1, tmax);
  if (t1 <= t0) return -1.0;
  float t = t0;
  float hit = -1.0;
  float eps = 0.001;
  vec3 n = vec3(0.0);
  int k = -1; // -1 buscando; 0..3 la muestra de la normal que va
  for (int i = 0; i < 68; i++) {
    if (i >= uLoops) break;
    vec3 e = k == 0 ? vec3(1.0, -1.0, -1.0) : (k == 1 ? vec3(-1.0, -1.0, 1.0) : (k == 2 ? vec3(-1.0, 1.0, -1.0) : vec3(1.0)));
    vec2 h = avatarsMap(vec2(1e5, 0.0), uRo + rd * t + (k < 0 ? vec3(0.0) : e * eps));
    if (k < 0) {
      if (h.x < max(0.001, t * pxA * 0.35)) {
        hit = t;
        am = h.y;
        eps = max(0.001, t * pxA * 0.25);
        k = 0;
      } else {
        t += h.x * 0.9;
        if (t > t1) break;
      }
    } else {
      n += e * h.x;
      k++;
      if (k > 3) break;
    }
  }
  if (k > 0) an = normalize(n);
  return hit;
}

// Sombra de contacto: el piso se oscurece debajo de cada avatar (menos si flota, que queda más lejos)
float avatarBlob(vec3 p) {
  float k = 1.0;
  for (int i = 0; i < MAX_AV; i++) {
    if (i >= uAvN) break;
    vec3 d = p - uAvP[i].xyz;
    float lift = avHover(avDigit(uAvA[i].z, 4.0, 4.0), uAvA[i].w);
    float shade = (1.0 - smoothstep(0.08, 0.42 + lift * 0.5, length(d.xz))) * (1.0 - smoothstep(0.0, 0.35, abs(d.y)));
    k *= 1.0 - shade * (0.55 - lift * 0.8);
  }
  return k;
}

// Las luces de la escena sobre el avatar, sin sombras (las sombras consultan el mundo entero y se
// copiaría de nuevo en el shader) y envolviendo un poco, para que el costado no quede negro
vec3 avatarLight(vec3 p, vec3 n) {
  vec3 sum = uAmbient;
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uLightN) break;
    vec4 lp = uLPos[i];
    vec4 ld = uLDir[i];
    vec4 lo = uLOpt[i];
    vec3 L;
    float att = 1.0;
    if (lp.w > 1.5) L = -ld.xyz;
    else {
      vec3 d = lp.xyz - p;
      float dist = length(d);
      L = d / dist;
      float x = dist / uLRange[i];
      float win = clamp(1.0 - x * x * x * x, 0.0, 1.0);
      att = win * win / (1.0 + lo.z * dist * dist);
      if (lp.w > 0.5) att *= smoothstep(ld.w, lo.x, dot(-L, ld.xyz));
    }
    sum += uLCol[i].rgb * uLCol[i].w * att * clamp((dot(n, L) + 0.3) / 1.3, 0.0, 1.0);
  }
  return sum;
}

float avatarPart(float m) { return floor(fract(m - AV_MAT + 0.01) * 10.0); }

// Su color: la luz de la escena, el sol o la luna, el cielo, y un borde del color de su brillo
// (lo etéreo) para que nunca se pierda en la penumbra
vec3 avatarShade(vec3 p, vec3 n, vec3 rd, float m) {
  float idx = floor(m - AV_MAT + 0.01);
  float part = avatarPart(m);
  vec4 C = vec4(0.8);
  vec4 H = vec4(0.8);
  vec4 G = vec4(1.0);
  float code = 0.0;
  for (int i = 0; i < MAX_AV; i++) {
    if (i >= uAvN) break;
    if (abs(float(i) - idx) < 0.5) {
      C = uAvC[i];
      H = uAvH[i];
      G = uAvG[i];
      code = uAvA[i].z;
    }
  }
  if (part > 3.5 && part < 4.5) return G.rgb * 1.6;
  vec3 base = vec3(C.w, H.w, G.w); // piel
  if (part > 0.5) base = C.rgb;
  if (part > 1.5) base = H.rgb;
  if (part > 2.5) base = avDigit(code, 16.0, 4.0) > 1.5 ? C.rgb * 0.3 + vec3(0.06, 0.0, 0.02) : mix(C.rgb, vec3(1.0), 0.6);
  if (part > 4.5) base = vec3(0.1, 0.08, 0.09);
  vec3 L = avatarLight(p, n);
  L += uLightCol * max(dot(n, uSunDir), 0.0) * uLight * 0.8;
  L += mix(uSkyHor, uSkyTop, n.y * 0.5 + 0.5) * 0.35;
  float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
  // Lo oscuro (la tela negra del demonio) se dibuja sobre todo por el borde: ahí el brillo pesa más
  float dark = 1.0 - clamp(dot(base, vec3(0.3, 0.55, 0.15)) * 2.5, 0.0, 1.0);
  return base * (L + 0.22) + mix(base, G.rgb, 0.6 + 0.3 * dark) * rim * (0.9 + 0.9 * dark);
}

// Los ojos: dos puntos de luz del color del brillo que se ven de frente, también de lejos y en la
// niebla (como los del demonio). tHit: dónde chocó el rayo (lo de atrás queda tapado)
vec3 avatarAura(vec3 rd, float tHit, float pxA) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < MAX_AV; i++) {
    if (i >= uAvN) break;
    vec4 P = uAvP[i];
    vec4 A = uAvA[i];
    float dress = avDigit(A.z, 4.0, 4.0);
    float c = cos(P.w);
    float s = sin(P.w);
    vec3 fw = vec3(-s, 0.0, -c);
    vec3 rt = vec3(c, 0.0, -s);
    float w = dress > 1.5 ? 0.0 : A.y;
    vec3 head = P.xyz + vec3(0.0, 1.555 + avHover(dress, A.w) + abs(sin(A.x)) * 0.03 * w, 0.0) + fw * 0.098;
    if (dot(fw, uRo - head) <= 0.0) continue; // de espaldas no se ven
    for (int e = 0; e < 2; e++) {
      if (e >= uLoops) break;
      vec3 oe = head + rt * (e == 0 ? -0.038 : 0.038) - uRo;
      float tp = dot(oe, rd);
      if (tp < 0.0 || tp > tHit + 0.06) continue;
      float d2 = dot(oe, oe) - tp * tp;
      float wd = max(0.012, tp * pxA * 0.6);
      sum += 1.3 * uAvG[i].rgb * exp(-d2 / (wd * wd));
    }
  }
  return sum;
}
`

// El GLSL de una escena, con avatares
export const withAvatars = (glsl: string) => glsl + GLSL_AVATARS

const P = new Float32Array(MAX_AVATARS * 4)
const A = new Float32Array(MAX_AVATARS * 4)
const C = new Float32Array(MAX_AVATARS * 4)
const H = new Float32Array(MAX_AVATARS * 4)
const G = new Float32Array(MAX_AVATARS * 4)

export const uploadAvatars = (program: Program, list: readonly Avatar[]) => {
  const n = Math.min(list.length, MAX_AVATARS)
  for (let i = 0; i < n; i++) {
    const a = list[i]
    const l = a.look
    const skin = LOOK_COLORS.skin[l.skin].rgb
    P.set([a.pos[0], a.pos[1], a.pos[2], a.yaw], i * 4)
    A.set([a.phase, a.walk, lookCode(l), a.seed], i * 4)
    C.set([...LOOK_COLORS.cloth[l.cloth].rgb, skin[0]], i * 4)
    H.set([...LOOK_COLORS.hairColor[l.hairColor].rgb, skin[1]], i * 4)
    G.set([...LOOK_COLORS.glow[l.glow].rgb, skin[2]], i * 4)
  }
  program.i1("uAvN", n)
  program.v4("uAvP", P)
  program.v4("uAvA", A)
  program.v4("uAvC", C)
  program.v4("uAvH", H)
  program.v4("uAvG", G)
}
