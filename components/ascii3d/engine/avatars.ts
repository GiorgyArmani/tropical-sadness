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
// ojos (avatarAura) y la sombra y el aura en el piso (avatarGround). Las figuras llegan cada cuadro
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
  hair: ["largo", "corto", "moño", "velo", "coletas", "melena"],
  dress: ["vestido", "túnica", "espectro", "pantalón", "falda"],
  wings: ["sin alas", "plumas", "dragón", "de luz", "hada", "espinas", "capa"],
  crown: ["nada", "aureola", "cuernos", "caído", "cuernos finos", "orejas de elfo"],
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
    { name: "castaño", rgb: [0.45, 0.29, 0.17] },
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
    look: {
      body: 0,
      hair: 4,
      dress: 4,
      wings: 2,
      crown: 4,
      tail: 1,
      skin: 0,
      cloth: 1,
      hairColor: 1,
      glow: 2,
    }, // coletas, falda y cuernos finos
    male: { hair: 1, dress: 3 }, // pelo corto, chaqueta y pantalón negros
  },
  { name: "espectro", look: { body: 0, hair: 3, dress: 2, wings: 0, crown: 0, tail: 0, skin: 4, cloth: 4, hairColor: 0, glow: 3 } },
  {
    name: "urbano", // como Giorgy Armani: melena castaña, franela negra, pantalón oscuro y brillo verde
    look: { body: 0, hair: 5, dress: 3, wings: 0, crown: 0, tail: 0, skin: 0, cloth: 1, hairColor: 6, glow: 5 },
    male: { hair: 1 },
  },
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
const lookCode = (l: Look) => l.hair + 8 * l.dress + 64 * l.wings + 512 * l.crown + 4096 * l.tail + 8192 * l.body

export type Avatar = {
  pos: V3 // los pies (en el piso, aunque flote)
  yaw: number // hacia dónde mira (0 = hacia -z, como la cámara)
  look: Look
  walk: number // 0 quieto, 1 caminando
  phase: number // el paso (radianes)
  seed: number // desfasa el vuelo, el aleteo y los pliegues entre avatares
  crouch?: number // 0 de pie, 1 agachado (suavizado)
  sit?: number // 0 de pie, 1 sentado en el piso (suavizado)
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
uniform vec4 uAvB[MAX_AV]; // x agachado, y sentado (0..1)
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

// 1 si la opción v es k (las opciones son enteros). Las partes se eligen con números y no con ramas:
// cada pieza se escribe una sola vez y la que no va se manda lejos (+10). Con ramas el shader
// compilaba cada variante por separado y la niebla tardaba 11 s en compilar.
float avIs(float v, float k) { return 1.0 - step(0.5, abs(v - k)); }

// La figura en su lugar: pies en el origen, el frente hacia -z. Devuelve distancia y parte.
// Mezcla los modelos (public/models: cara anime, cintura fina, piernas largas, pelo en dos tonos, ropa
// de calle o vestido) con lo épico de MU: alas grandes en dos capas con el borde encendido, hombreras
// de armadura y detalles que brillan en color puro a través de la niebla
vec2 avatarSdf(vec3 q, vec4 a, vec4 b) {
  float code = a.z;
  float hair = avDigit(code, 1.0, 8.0);
  float dress = avDigit(code, 8.0, 8.0);
  float wings = avDigit(code, 64.0, 8.0);
  float crown = avDigit(code, 512.0, 8.0);
  float tail = avDigit(code, 4096.0, 2.0);
  float body = avDigit(code, 8192.0, 2.0); // 0 femenino, 1 masculino: las medidas se mezclan con él
  float ghost = avIs(dress, 2.0); // el espectro no camina: flota y se deshace en bruma
  float pants = avIs(dress, 3.0);
  float skirt = avIs(dress, 4.0);
  float street = pants + skirt; // franela arriba
  float gown = 1.0 - street; // vestido, túnica o espectro
  float armor = avIs(dress, 1.0); // hombreras: solo la túnica (la ropa de calle va sin armadura)
  // a.y: 0 quieto, 1 caminando, 2 corriendo; b: agachado, sentado
  float still = 1.0 - ghost;
  float w = still * min(a.y, 1.0);
  float run = still * clamp(a.y - 1.0, 0.0, 1.0);
  float crouch = still * b.x;
  float sit = still * b.y;
  // Agachado o sentado, todo lo de la cadera para arriba baja (las piernas se doblan abajo)
  float drop = 0.3 * crouch + 0.72 * sit;
  q.y -= avHover(dress, a.w) + abs(sin(a.x)) * (0.025 + 0.03 * run) * w - drop;
  // Caminando: el cuerpo se inclina, la cadera se mece hacia la pierna que pisa y el torso gira al revés
  q.z += max(q.y - 0.8, 0.0) * (0.07 * w + 0.12 * run + 0.25 * crouch);
  q.x += sin(a.x) * 0.012 * w;
  float twist = sin(a.x) * 0.12 * w * smoothstep(0.85, 1.3, q.y);
  q.xz = vec2(q.x + q.z * twist, q.z - q.x * twist);
  // Espejo: brazos, piernas, alas y cuernos se calculan de un solo lado (x > 0). Del lado izquierdo
  // el paso va al revés: la pierna que avanza de un lado es la que vuelve del otro
  float side = q.x < 0.0 ? 1.0 : -1.0;
  vec3 m = vec3(abs(q.x), q.y, q.z);
  float ms = sin(a.x) * w * side * (1.0 + 0.5 * run); // corriendo, la zancada es más larga
  float lift = max(cos(a.x) * side, 0.0) * w * (1.0 + 0.7 * run); // la pierna que avanza se levanta
  vec2 r = vec2(1e5, 0.0);

  // La envoltura: una cápsula alrededor del cuerpo, otra a lo largo de los pies y la cola.
  // Lejos de ella alcanza con esa distancia: la figura entera, que es lo caro, se calcula solo cerca.
  // Las alas tienen su propia envoltura y se calculan aparte
  float hull = sdCapsule(q, vec3(0.0, 0.25, -0.05), vec3(0.0, 1.62, 0.0), 0.36);
  hull = min(hull, sdCapsule(q, vec3(0.0, 0.14, -0.62), vec3(0.0, 0.14, 0.45), 0.25)); // los pies: corriendo van lejos, sentado van adelante
  hull = min(hull, length(q - vec3(0.06, 0.6, 0.36)) - 0.24 + (1.0 - tail) * 10.0);
  if (hull > 0.1) r = vec2(hull, 0.0);
  else {
    // Cabeza grande con la barbilla en punta, y cuello fino
    float skin = sdEllipsoid(q - vec3(0.0, 1.565, 0.0), vec3(0.094, 0.104, 0.1) * mix(1.0, 0.95, body));
    skin = avSmin(skin, sdEllipsoid(q - vec3(0.0, 1.49, -0.025), vec3(0.05, 0.045, 0.055)), 0.04);
    skin = avSmin(skin, sdCapsule(q, vec3(0.0, 1.36, 0.005), vec3(0.0, 1.48, 0.01), mix(0.026, 0.034, body)), 0.02);

    // Torso: pecho, cintura y cadera
    float torso = sdEllipsoid(q - vec3(0.0, 1.25, 0.0), vec3(mix(0.105, 0.135, body), 0.11, mix(0.075, 0.08, body)));
    torso = avSmin(torso, sdEllipsoid(q - vec3(0.0, 1.07, 0.005), vec3(mix(0.078, 0.105, body), 0.1, 0.062)), 0.06);
    torso = avSmin(torso, sdEllipsoid(q - vec3(0.0, 0.91, 0.01), vec3(mix(0.122, 0.11, body), 0.09, mix(0.085, 0.075, body))), 0.06);
    torso = avSmin(torso, length(m - vec3(0.048, 1.235, -0.045)) - 0.052 + body * 10.0, 0.03);

    // Brazos finos: hombro, codo, muñeca y mano; se mecen al caminar, corriendo el codo se dobla más
    vec3 sh = vec3(mix(0.13, 0.16, body), 1.33, 0.0);
    vec3 elb = vec3(mix(0.175, 0.205, body) + 0.04 * ghost, 1.08, 0.07 * ms);
    vec3 wr = vec3(mix(0.195, 0.225, body) + 0.07 * ghost, 0.85 + 0.07 * ghost + 0.04 * w + 0.13 * run, 0.16 * ms - 0.05 * w - 0.07 * run);
    // Agachado, las manos van a las rodillas; sentado, descansan sobre ellas
    elb = mix(mix(elb, vec3(0.18, 1.05, -0.08), crouch), vec3(0.18, 1.17, -0.12), sit);
    wr = mix(mix(wr, vec3(0.13, 0.84, -0.2), crouch), vec3(0.12, 1.1, -0.28), sit);
    float arms = min(avTaper(m, sh, elb, mix(0.034, 0.04, body), mix(0.026, 0.031, body)), avTaper(m, elb, wr, mix(0.025, 0.03, body), mix(0.018, 0.022, body)));
    skin = min(skin, sdEllipsoid(m - wr - vec3(0.004, -0.045, 0.0), vec3(0.018, 0.045, 0.03)));

    // Piernas largas: muslo, rodilla, pantorrilla y tobillo (el espectro no tiene)
    vec3 knee = vec3(mix(0.07, 0.08, body), 0.48 + 0.05 * lift, -0.11 * ms - 0.06 * lift);
    vec3 ank = vec3(mix(0.068, 0.08, body), 0.08 + 0.08 * lift, -0.2 * ms);
    // Agachado: rodillas adelante y talones bajo la cadera. Sentado en el piso: rodillas arriba y pies
    // adelante (las alturas son del piso; drop las lleva al cuerpo que bajó)
    knee = mix(mix(knee, vec3(0.09, 0.45 + drop, -0.22), crouch), vec3(0.11, 0.36 + drop, -0.3), sit);
    ank = mix(mix(ank, vec3(0.08, 0.08 + drop, -0.05), crouch), vec3(0.09, 0.07 + drop, -0.5), sit);
    float calf = avTaper(m, knee, ank, mix(0.041, 0.045, body), mix(0.024, 0.028, body));
    calf = avSmin(calf, sdEllipsoid(m - mix(knee, ank, 0.3) - vec3(0.0, 0.0, 0.012), vec3(0.04, 0.09, 0.043)), 0.03);
    float legs = avSmin(avTaper(m, vec3(mix(0.068, 0.072, body), 0.88, 0.0), knee, mix(0.068, 0.07, body), mix(0.04, 0.044, body)), calf, 0.02) + ghost * 10.0;

    // Ropa arriba: el torso un poco más grande. Mangas: cortas (franela) o largas que se abren en el puño
    float cloth = max(torso - 0.012, 0.9 + 0.03 * street - q.y);
    cloth = avSmin(cloth, avTaper(m, sh - vec3(0.02 * street, 0.0, 0.0), mix(elb, mix(sh, elb, 0.55), street), mix(mix(0.05, 0.042, body), 0.05, street), mix(0.036, 0.043, street)), 0.03);
    cloth = min(cloth, avTaper(m, elb, wr + vec3(0.0, 0.035, 0.0), 0.034, mix(0.056, 0.036, body)) + street * 10.0);
    cloth = avSmin(cloth, length(m - sh - vec3(0.01, -0.03, 0.0)) - 0.042 + (1.0 - gown * (1.0 - body)) * 10.0, 0.025); // hombros abullonados
    skin = min(skin, arms + gown * 10.0); // con franela los brazos van al aire

    // Abajo, un solo cono con el largo y el vuelo de cada ropa: vestido corto acampanado, túnica hasta
    // los pies, espectro que se afina y se mece como humo, falda plisada corta (el pantalón no lleva)
    float isDress = avIs(dress, 0.0);
    float isRobe = avIs(dress, 1.0);
    float cy = 0.8 * isDress + 0.55 * isRobe + 0.6 * ghost + 0.84 * skirt + 0.8 * pants;
    float ch = 0.21 * isDress + 0.46 * isRobe + 0.42 * ghost + 0.16 * skirt + 0.1 * pants;
    float r1 = 0.27 * isDress + 0.22 * isRobe + 0.04 * ghost + 0.2 * skirt + 0.1 * pants;
    float r2 = 0.1 + 0.03 * ghost + 0.005 * skirt;
    vec3 dq = q - vec3(sin(uTime * 2.0 + q.y * 5.0 + a.w) * 0.06 * clamp(1.0 - q.y, 0.0, 1.0) * ghost, cy, 0.0);
    float fold = sin(atan(q.z, q.x) * mix(9.0, 16.0, skirt) + uTime * mix(1.5, 0.4, skirt) + a.w) * mix(0.01, 0.008, skirt) * clamp((1.0 - q.y) * mix(2.0, 4.0, skirt), 0.0, 1.0);
    float cone = avCone(dq, ch, r1, r2) + fold + pants * 10.0;
    cloth = avSmin(cloth, cone * 0.9 + skirt * 10.0, 0.04);
    float dark = cone + (1.0 - skirt) * 10.0;

    // Piernas: al aire con vestido o falda; pantalón ancho oscuro; con falda, medias largas oscuras
    skin = min(skin, legs + pants * 10.0);
    dark = min(dark, max(legs - 0.02 - 0.012 * clamp(0.5 - q.y, 0.0, 0.5), ank.y + 0.02 - q.y) + (1.0 - pants) * 10.0);
    dark = min(dark, max(torso - 0.01, q.y - 0.97) + (1.0 - pants) * 10.0);
    dark = min(dark, max(calf - 0.005, length(m - ank) - 0.36) + (1.0 - skirt) * 10.0);
    // Zapatos: deportivos blancos con pantalón, oscuros con falda, descalza con vestido
    float shoe = sdEllipsoid(m - ank - vec3(0.0, -0.045, -0.045), mix(vec3(0.028, 0.024, 0.065), vec3(0.042, 0.04, 0.095), pants) + skirt * vec3(0.006, 0.008, 0.015)) + ghost * 10.0;

    // Armadura (MU): hombreras oscuras con el borde encendido, y un cinturón de luz en la cintura
    vec3 pc = m - sh - vec3(0.02, 0.03, 0.0);
    float pauld = sdEllipsoid(pc, vec3(0.078, 0.048, 0.072) * mix(1.0, 1.15, body)) + (1.0 - armor) * 10.0;
    float glow = length(vec2(length(pc.xz * vec2(0.93, 1.0)) - 0.07 * mix(1.0, 1.15, body), pc.y + 0.012)) - 0.007 + (1.0 - armor) * 10.0;
    glow = min(glow, length(vec2(length(q.xz * vec2(1.0, 1.22)) - mix(0.092, 0.118, body), q.y - 0.985)) - 0.008 + ghost * 10.0);

    // Pelo: casquete corrido hacia atrás (la cara queda al aire) con flequillo en puntas, como los
    // cuatro modelos; atrás, según el peinado
    float isLong = avIs(hair, 0.0);
    float isBun = avIs(hair, 2.0);
    float isVeil = avIs(hair, 3.0);
    float isTails = avIs(hair, 4.0);
    float isMane = avIs(hair, 5.0);
    float hd = sdEllipsoid(q - vec3(0.0, 1.6, 0.025), vec3(0.104, 0.108, 0.104));
    float fringe = sdEllipsoid(q - vec3(0.0, 1.635, -0.055), vec3(0.088, 0.045, 0.05));
    fringe += (0.5 + 0.5 * sin(q.x * 75.0)) * 0.012 * smoothstep(1.66, 1.6, q.y);
    hd = avSmin(hd, fringe * 0.8, 0.02);
    // Largo y lacio hasta la cintura (una lámina que se angosta, aplastada de adelante hacia atrás)
    vec3 bq = vec3(q.x, q.y, 0.075 + (q.z - 0.075) * 2.2);
    float back = avTaper(bq, vec3(0.0, 1.5, 0.075), vec3(0.0, 1.03, 0.075), 0.095, 0.035) * 0.45 + sin(q.x * 70.0) * 0.003 + (1.0 - isLong) * 10.0;
    // Corto (y la nuca de las coletas), moño
    back = min(back, sdEllipsoid(q - vec3(0.0, 1.51, 0.05), vec3(0.098, 0.083, 0.068)) + (1.0 - avIs(hair, 1.0) - isTails) * 10.0);
    back = min(back, length(q - vec3(0.0, 1.73, 0.07)) - 0.06 + (1.0 - isBun) * 10.0);
    // Melena hasta los hombros, ondulada y en capas, que enmarca la cara (como Giorgy Armani)
    float mane = sdEllipsoid(q - vec3(0.0, 1.45, 0.035), vec3(0.128, 0.2, 0.105));
    mane += sin(q.y * 45.0 + atan(q.z, q.x) * 6.0) * 0.006;
    back = min(back, max(mane, 1.27 - q.y) + (1.0 - isMane) * 10.0);
    hd = avSmin(hd, back, 0.04);
    // Mechones adelante de los hombros (largo) y coletas onduladas a los costados (como Kardashian 666)
    hd = min(hd, avTaper(m, vec3(0.088, 1.58, -0.03), vec3(0.1, 1.22, -0.03), 0.026, 0.01) + (1.0 - isLong) * 10.0);
    hd = min(hd, avTaper(m - vec3(sin(m.y * 40.0) * 0.008, 0.0, 0.0), vec3(0.1, 1.56, 0.04), vec3(0.15 + sin(uTime * 2.0 + a.w) * 0.01, 1.3, 0.06), 0.04, 0.012) + (1.0 - isTails) * 10.0);
    // Velo: tela de la ropa que cae de la cabeza a los hombros, abierta en la cara
    float veil = max(sdEllipsoid(q - vec3(0.0, 1.45, 0.03), vec3(0.2, 0.33, 0.2)), -sdEllipsoid(q - vec3(0.0, 1.5, -0.12), vec3(0.085, 0.14, 0.12)));
    cloth = min(cloth, max(veil, 1.1 - q.y) + (1.0 - isVeil) * 10.0);

    avU(r, skin, 0.0);
    avU(r, cloth, 1.0);
    avU(r, hd, 2.0);
    avU(r, dark, 5.0);
    avU(r, pauld, 5.0);
    avU(r, shoe, 6.0 * pants + 5.0 * skirt);
    avU(r, glow, 4.0);

    // Cabeza: cuernos (demonio, caído), cuernos finos en media luna (como Kardashian 666), orejas de
    // elfo (como Softwave) y aureola (ángel; rota si es caído)
    float isHorn = avIs(crown, 2.0) + avIs(crown, 3.0);
    float broken = avIs(crown, 3.0);
    vec3 b1 = vec3(0.13, 1.77, 0.04);
    avU(r, min(avTaper(m, vec3(0.06, 1.66, -0.01), b1, 0.026, 0.017), avTaper(m, b1, vec3(0.11, 1.86, 0.14), 0.017, 0.003)) + (1.0 - isHorn) * 10.0, 5.0);
    vec3 h1 = vec3(0.12, 1.69, 0.0);
    vec3 h2 = vec3(0.165, 1.75, 0.015);
    float fine = min(min(avTaper(m, vec3(0.055, 1.665, 0.0), h1, 0.013, 0.011), avTaper(m, h1, h2, 0.011, 0.008)), avTaper(m, h2, vec3(0.135, 1.79, 0.04), 0.008, 0.002));
    avU(r, fine + (1.0 - avIs(crown, 4.0)) * 10.0, 6.0);
    avU(r, avTaper(m, vec3(0.086, 1.55, 0.01), vec3(0.17, 1.625, 0.035), 0.022, 0.003) + (1.0 - avIs(crown, 5.0)) * 10.0, 0.0);
    vec3 hq = q - vec3(0.0, 1.8, 0.05);
    hq = vec3(hq.x, 0.94 * hq.y - 0.34 * hq.z, 0.34 * hq.y + 0.94 * hq.z); // inclinada hacia atrás
    float halo = length(vec2(length(hq.xz) - 0.12, hq.y)) - 0.011;
    halo = max(halo, mix(-1.0, -max(0.03 - hq.x, hq.z), broken)); // a la del caído le falta un pedazo
    avU(r, halo + (1.0 - avIs(crown, 1.0) - broken) * 10.0, 4.0);

    // Cola de demonio con punta
    float sw = sin(uTime * 2.3 + a.w) * 0.08;
    vec3 t1 = vec3(sw, 0.58, 0.3);
    vec3 t2 = vec3(0.12 + sw, 0.42, 0.44);
    float tl = min(avTaper(q, vec3(0.0, 0.88, 0.09), t1, 0.022, 0.016), avTaper(q, t1, t2, 0.016, 0.01));
    tl = min(tl, sdEllipsoid(q - t2 - vec3(0.02, -0.04, 0.03), vec3(0.045, 0.055, 0.012)));
    avU(r, tl + (1.0 - tail) * 10.0, 5.0);
  }

  // Alas (al estilo de MU, más grandes que el cuerpo): dos hojas en un plano que sale de la espalda,
  // abierto en V y aleteando, con el borde y unas vetas encendidas. Cada tipo cambia la forma con
  // números (sin ramas): plumas largas y separadas, dragón (tela entre huesos), de luz (como las de
  // plumas, más grandes), hada (cuatro hojas finas y verticales) y espinas (púas largas hacia afuera).
  // La capa cae de los hombros
  if (wings > 0.5) {
    // Las alas y la capa: una cápsula grande en la espalda
    float wingHull = sdCapsule(q, vec3(0.0, 0.3, 0.25), vec3(0.0, 1.5, 0.25), 1.05);
    if (wingHull > 0.1) r.x = min(r.x, wingHull);
    else {
      float isFeather = avIs(wings, 1.0);
      float isDragon = avIs(wings, 2.0);
      float isLight = avIs(wings, 3.0);
      float isFairy = avIs(wings, 4.0);
      float isSpike = avIs(wings, 5.0);
      float isCape = avIs(wings, 6.0);
      float flap = sin(uTime * mix(2.2, 1.4, ghost) + a.w) * mix(0.12, 0.2, isFairy);
      vec3 o = m - vec3(0.05, 1.3, 0.11);
      float ca = cos(0.4 + flap);
      float sa = sin(0.4 + flap);
      vec3 wl = vec3(o.x * ca + o.z * sa, o.y, o.z * ca - o.x * sa); // x a lo largo, y arriba, z el grosor
      float size = 1.12 + 0.12 * isLight - 0.08 * isFairy;
      vec2 uv = wl.xy / size;
      // Hoja de arriba barrida hacia arriba y afuera; la de abajo más corta y caída
      float t1 = 0.44 + 0.08 * isDragon + 0.5 * isFairy - 0.1 * isSpike;
      float t2 = 0.2 + 0.45 * isDragon + 0.7 * isFairy;
      vec2 u1 = uv - vec2(0.34 - 0.08 * isFairy, 0.22 + 0.06 * isFairy);
      u1 = vec2(u1.x * cos(t1) + u1.y * sin(t1), u1.y * cos(t1) - u1.x * sin(t1));
      vec2 u2 = uv - vec2(0.26 - 0.06 * isFairy, -0.12 - 0.06 * isFairy);
      u2 = vec2(u2.x * cos(t2) - u2.y * sin(t2), u2.y * cos(t2) + u2.x * sin(t2));
      vec2 k1 = vec2(0.46 - 0.08 * isFairy, 0.17 - 0.04 * isFairy + 0.03 * isDragon);
      vec2 k2 = vec2(0.3 - 0.04 * isFairy, 0.14 - 0.04 * isFairy + 0.02 * isDragon);
      float e1 = (length(u1 / k1) - 1.0) * k1.y;
      float e2 = (length(u2 / k2) - 1.0) * k2.y;
      // El borde: muescas hondas entre plumas, tela cóncava entre los dedos del dragón, púas afuera
      float ang = atan(uv.y + 0.1, uv.x);
      float teeth = abs(sin(ang * (11.0 - 6.0 * isDragon + 2.0 * isLight - 4.0 * isSpike)));
      float outer = smoothstep(0.15, 0.45, length(uv));
      float notch = (0.07 * (isFeather + isLight) + 0.06 * isDragon) * teeth;
      float spikes = 0.12 * isSpike * pow(1.0 - teeth, 6.0);
      float d2 = (min(e1, e2) + (notch - spikes) * outer) * size + isCape * 10.0;
      float th = mix(0.012, 0.007, isLight + isFairy);
      avU(r, max(d2, abs(wl.z) - th) * 0.8, 3.0);
      // Lo que brilla: el borde y unas vetas que salen de la raíz (los huesos del dragón)
      float rim = abs(d2 + 0.012) - 0.006;
      float vein = abs(sin(ang * (5.0 + 3.0 * isFeather))) * length(uv + vec2(0.0, 0.1)) - 0.005 - 0.004 * isDragon;
      rim = min(rim, max(vein, d2 + 0.02));
      avU(r, max(rim, abs(wl.z) - th - 0.002) * 0.8, 4.0);

      // Capa: tela que cae de los hombros hasta las pantorrillas, se abre abajo y flamea al caminar
      float drape = clamp(1.36 - q.y, 0.0, 1.0);
      float zc = 0.13 + 0.06 * drape + sin(uTime * 2.0 + q.y * 4.0 + a.w) * 0.02 * drape * (1.0 + 2.0 * w);
      float hw = 0.15 + 0.13 * drape;
      float edge = max(abs(q.x) - hw, max(q.y - 1.38, 0.32 + drop - q.y));
      float cape = max(edge, abs(q.z - zc) - 0.012) * 0.8 + (1.0 - isCape) * 10.0;
      avU(r, cape, 1.0);
      avU(r, max(max(abs(edge) - 0.012, q.y - 1.37), abs(q.z - zc) - 0.016) * 0.8 + (1.0 - isCape) * 10.0, 4.0); // borde dorado
    }
  }
  return r;
}

vec2 avatarsMap(vec2 r, vec3 p) {
  for (int i = 0; i < MAX_AV; i++) {
    if (i >= uAvN) break;
    vec4 P = uAvP[i];
    vec3 d = p - P.xyz;
    // Lejos (o detrás de algo más cerca): alcanza con la esfera que lo envuelve (alas y vuelo incluidos)
    float bound = length(d - vec3(0.0, 1.05, 0.0)) - 1.3;
    if (bound > r.x) continue;
    if (bound > 0.3) { r = vec2(bound, AV_MAT + float(i)); continue; }
    float c = cos(P.w);
    float s = sin(P.w);
    vec2 k = avatarSdf(vec3(d.x * c - d.z * s, d.y, d.x * s + d.z * c), uAvA[i], uAvB[i]);
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
    float h = b * b - dot(oc, oc) + 1.69; // radio 1.3
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

// El piso debajo de cada avatar, en un solo recorrido: la sombra de contacto (menos si flota, que
// queda más lejos) y el aura de color (como en MU), un anillo del brillo que late suave. rgb: lo que
// suma el aura; w: cuánto oscurece la sombra. Los que quedan lejos de este punto se saltan enseguida
vec4 avatarGround(vec3 p) {
  vec4 g = vec4(0.0, 0.0, 0.0, 1.0);
  for (int i = 0; i < MAX_AV; i++) {
    if (i >= uAvN) break;
    vec3 d = p - uAvP[i].xyz;
    float r2 = dot(d.xz, d.xz);
    if (r2 > 0.81 || abs(d.y) > 0.4) continue;
    float rr = sqrt(r2);
    float lift = avHover(avDigit(uAvA[i].z, 8.0, 8.0), uAvA[i].w);
    float shade = (1.0 - smoothstep(0.08, 0.42 + lift * 0.5, rr)) * (1.0 - smoothstep(0.0, 0.35, abs(d.y)));
    g.w *= 1.0 - shade * (0.55 - lift * 0.8);
    float x = (rr - 0.42) / 0.045;
    float k = exp(-x * x) * (0.75 + 0.25 * sin(uTime * 2.5 + uAvA[i].w)) + 0.25 * exp(-r2 / 0.06);
    g.rgb += uAvG[i].rgb * k * 0.45 * (1.0 - smoothstep(0.05, 0.3, abs(d.y)));
  }
  return g;
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
  float footY = 0.0;
  for (int i = 0; i < MAX_AV; i++) {
    if (i >= uAvN) break;
    if (abs(float(i) - idx) < 0.5) {
      footY = uAvP[i].y;
      C = uAvC[i];
      H = uAvH[i];
      G = uAvG[i];
      code = uAvA[i].z;
    }
  }
  if (part > 3.5 && part < 4.5) return G.rgb * 1.6;
  vec3 base = vec3(C.w, H.w, G.w); // piel
  if (part > 0.5) base = C.rgb;
  // El pelo en dos tonos, como los modelos: las puntas toman el color del brillo
  if (part > 1.5) base = mix(H.rgb, G.rgb, 0.75 * smoothstep(1.5, 1.08, p.y - footY));
  // Alas: las de plumas claras y teñidas del brillo (como las de MU); las de murciélago, oscuras
  if (part > 2.5) {
    float wt = avDigit(code, 64.0, 8.0);
    base = mix(mix(C.rgb, vec3(1.0), 0.45), G.rgb, 0.35); // plumas: claras, teñidas del brillo
    if (abs(wt - 2.0) < 0.5 || abs(wt - 5.0) < 0.5) base = C.rgb * 0.3 + vec3(0.06, 0.0, 0.02); // dragón, espinas: oscuras
    if (abs(wt - 3.0) < 0.5) base = mix(G.rgb, vec3(1.0), 0.3) * 0.8; // de luz
    if (abs(wt - 4.0) < 0.5) base = mix(G.rgb, G.gbr, smoothstep(1.1, 1.8, p.y - footY)) * 0.9; // hada: iridiscentes
  }
  if (part > 4.5) base = vec3(0.1, 0.08, 0.09);
  if (part > 5.5) base = vec3(0.9, 0.9, 0.93);
  vec3 L = avatarLight(p, n);
  L += uLightCol * max(dot(n, uSunDir), 0.0) * uLight * 0.8;
  L += mix(uSkyHor, uSkyTop, n.y * 0.5 + 0.5) * 0.35;
  float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
  // Lo oscuro (la tela negra del demonio) se dibuja sobre todo por el borde: ahí el brillo pesa más
  float dark = 1.0 - clamp(dot(base, vec3(0.3, 0.55, 0.15)) * 2.5, 0.0, 1.0);
  // Un piso de luz: en la penumbra no se pierde; con luz fuerte manda la luz y se ve el volumen
  vec3 col = base * max(L + 0.1, vec3(0.4 + 0.25 * dark)) + mix(base, G.rgb, 0.7 + 0.3 * dark) * rim * (1.4 + 1.0 * dark);
  // Más color del que hace falta: las escenas grises (la niebla deja pasar 40%) lo apagan después
  float lum = dot(col, vec3(0.3, 0.55, 0.15));
  return max(mix(vec3(lum), col, 1.7), 0.0);
}

// Los ojos: dos puntos de luz del color del brillo que se ven de frente, también de lejos y en la
// niebla (como los del demonio). tHit: dónde chocó el rayo (lo de atrás queda tapado)
vec3 avatarAura(vec3 rd, float tHit, float pxA) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < MAX_AV; i++) {
    if (i >= uAvN) break;
    vec4 P = uAvP[i];
    vec4 A = uAvA[i];
    float dress = avDigit(A.z, 8.0, 8.0);
    float c = cos(P.w);
    float s = sin(P.w);
    vec3 fw = vec3(-s, 0.0, -c);
    vec3 rt = vec3(c, 0.0, -s);
    bool still = dress > 1.5 && dress < 2.5; // el espectro no camina ni se agacha
    float w = still ? 0.0 : min(A.y, 1.0);
    float run = still ? 0.0 : clamp(A.y - 1.0, 0.0, 1.0);
    vec4 B = still ? vec4(0.0) : uAvB[i];
    float drop = 0.3 * B.x + 0.72 * B.y;
    vec3 head = P.xyz + vec3(0.0, 1.555 + avHover(dress, A.w) + abs(sin(A.x)) * 0.03 * w - drop, 0.0);
    head += fw * (0.098 + 0.755 * (0.07 * w + 0.12 * run + 0.25 * B.x));
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
const B = new Float32Array(MAX_AVATARS * 4)

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
    B.set([a.crouch ?? 0, a.sit ?? 0, 0, 0], i * 4)
  }
  program.i1("uAvN", n)
  program.v4("uAvP", P)
  program.v4("uAvA", A)
  program.v4("uAvC", C)
  program.v4("uAvH", H)
  program.v4("uAvG", G)
  program.v4("uAvB", B)
}
