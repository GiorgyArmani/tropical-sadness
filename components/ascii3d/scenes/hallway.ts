import type { Light, LightSet } from "../engine/lighting"
import type { V3 } from "../engine/camera"
import type { Scene3D, LightCtx } from "./types"

// --- Pasillo: una oficina vacía que se repite para siempre. La rueda camina hacia adentro ---

const hallway = /* glsl */ `
#define FOG 0.04
#define MAXD 70.0
#define APP_Z 10.0

// Aparición al fondo del pasillo: de vez en cuando está el demonio, o solo unos ojos mirando.
// Aparece y se va titilando. Cuándo y qué lo decide el juego (Ascii3D) y llega en uAppear:
// x = segundos desde que apareció (-1 = no está; dura 4.5 s), y = kind
// kind: 0 = demonio, 1 = un par de ojos, 2 = varios pares
float appear(out float kind) {
  kind = uAppear.y;
  float x = uAppear.x;
  if (x < 0.0) return 0.0;
  // titileo al llegar y al irse, como una lámpara que falla
  float edge = min(x, 4.5 - x);
  float flick = step(0.35, hash1(floor(uTime * 14.0)));
  return mix(flick, 1.0, step(0.5, edge));
}

// Dónde están los ojos ahora: n pares, cada uno con su centro y la mitad de su separación.
// Lo usan la forma (map) y el brillo (glow), así los dos coinciden.
float eyeCount(out float kind) {
  if (appear(kind) < 0.5) return 0.0;
  return kind < 1.5 ? 1.0 : 5.0;
}
vec3 appBase() { return vec3(sin(uTime * 0.11) * 0.3, 0.0, uRo.z - APP_Z); }
vec4 eyePair(float i, float kind) {
  if (kind < 0.5) return vec4(0.0, 2.08, 0.3, 0.115); // en la cara del demonio
  if (kind < 1.5) return vec4(0.0, 1.6, 0.0, 0.14);
  float k = i + floor(uTime - uAppear.x) * 9.0; // fijo mientras dura la aparición
  return vec4((hash1(k * 5.3) - 0.5) * 2.4, 0.9 + hash1(k * 2.9) * 1.3, -hash1(k * 7.7) * 3.0, 0.12);
}

// --- El laberinto (misma cuenta que maze.ts) ---
// Número de puerta en esta parte del pasillo: la 0 está en z = 0 y se avanza hacia -z
float doorIdx(float z) { return mod(floor((-z + 3.0) / 6.0), 100.0); }
// 0 cerrada, 1 isla, 2 cementerio, 3 escalera, 4 otro pasillo, 5 niebla, 6 orilla, 7 cresta, 8 estudio
// (misma cuenta que kindAt en maze.ts)
float doorKind(float n) {
  if (n < 0.5) return 0.0;
  float k = n + uLevel * 5.0;
  float i = mod(k + 0.5, 8.0) - 0.5; // el +0.5 evita que 16/8 dé 1.9999
  if (abs(i - 2.0) < 0.5 || abs(i - 5.0) < 0.5) return 4.0;
  float s = abs(i - 4.0) < 0.5 ? 0.0 : (abs(i - 7.0) < 0.5 ? 1.0 : -1.0);
  if (s > -0.5) {
    float e = mod(floor((k + 0.5) / 8.0) * 2.0 + s + uLevel + 0.5, 7.0) - 0.5;
    if (e < 2.5) return e + 1.0; // isla, cementerio, escalera
    return e + 2.0; // niebla, orilla, cresta, estudio (el 4 es el otro pasillo)
  }
  return 0.0;
}
// La luz que se escapa por debajo de cada puerta dice adónde lleva
vec3 kindColor(float k) {
  if (k < 0.5) return vec3(0.0);
  if (k < 1.5) return vec3(0.25, 1.0, 1.0); // isla: turquesa
  if (k < 2.5) return vec3(1.0, 0.45, 0.08); // cementerio: velas
  if (k < 3.5) return vec3(1.0, 0.97, 0.9); // escalera: nubes
  if (k < 4.5) return vec3(1.0, 0.12, 0.08); // otro pasillo: rojo
  if (k < 5.5) return vec3(0.45, 0.62, 1.0); // niebla: azul frío
  if (k < 6.5) return vec3(0.72, 0.42, 1.0); // orilla: violeta
  if (k < 7.5) return vec3(0.55, 1.0, 0.35); // cresta: verde de montaña
  return vec3(1.0, 0.3, 0.7); // estudio: rosa de neón
}
// La luz de los tubos cambia con el nivel: amarillo, rojo de emergencia, verde enfermizo
vec3 levelLight() {
  if (uLevel < 0.5) return vec3(1.0, 0.96, 0.86);
  if (uLevel < 1.5) return vec3(1.35, 0.6, 0.5);
  return vec3(0.75, 1.15, 0.85);
}
// Y el pasillo entero se tiñe: empapelado, alfombra y penumbra
vec3 levelTint() {
  if (uLevel < 0.5) return vec3(1.0);
  if (uLevel < 1.5) return vec3(1.1, 0.62, 0.55);
  return vec3(0.75, 1.05, 0.78);
}
// La puerta que se está abriendo (o cerrando detrás de quien llega)
bool isOpen(float n) { return uOpen > 0.001 && abs(n - uDoor) < 0.5; }

// Demonio: alto, encorvado, cuernos y brazos largos hasta las rodillas. Mira hacia +z
float demon(vec3 fp) {
  vec3 q = vec3(abs(fp.x), fp.yz);
  float body = sdCapsule(fp, vec3(0.0, 0.3, 0.0), vec3(0.0, 1.75, 0.08), 0.24);
  body = min(body, sdEllipsoid(fp - vec3(0.0, 2.05, 0.12), vec3(0.2, 0.24, 0.2)));
  body = min(body, sdCapsule(q, vec3(0.1, 2.2, 0.1), vec3(0.32, 2.62, -0.05), 0.045)); // cuernos
  body = min(body, sdCapsule(q, vec3(0.28, 1.65, 0.05), vec3(0.42, 0.55, 0.2), 0.07)); // brazos
  body = min(body, sdCapsule(q, vec3(0.12, 0.3, 0.0), vec3(0.16, 0.0, 0.0), 0.08)); // patas
  return body;
}
// El susto: el demonio parado justo delante, girado para mirar a la cámara (uScareA)
vec3 scareLocal(vec3 p) {
  vec3 d = p - uScare.xyz;
  float c = cos(uScareA);
  float s = sin(uScareA);
  return vec3(d.x * c - d.z * s, d.y, d.x * s + d.z * c);
}
vec3 scareWorld(vec3 l) {
  float c = cos(uScareA);
  float s = sin(uScareA);
  return uScare.xyz + vec3(l.x * c + l.z * s, l.y, -l.x * s + l.z * c);
}

vec2 map(vec3 p) {
  float zc = mod(p.z + 3.0, 6.0) - 3.0;
  float side = mod(floor((p.z + 3.0) / 6.0), 2.0) < 0.5 ? 1.0 : -1.0;
  bool open = isOpen(doorIdx(p.z));
  // Hueco del marco de cada puerta, alternando de lado
  float hole = sdBox(vec3(p.x - side * 1.75, p.y - 1.05, zc), vec3(0.14, 1.07, 0.52));
  // Detrás de la puerta abierta hay un hueco hondo lleno de luz
  if (open) hole = min(hole, sdBox(vec3(p.x - side * 2.9, p.y - 1.05, zc), vec3(1.2, 1.07, 0.5)));
  vec2 r = vec2(p.y, 1.0);
  float wall = max(1.7 - abs(p.x), -hole);
  // Zócalo
  wall = min(wall, max(1.62 - abs(p.x), p.y - 0.12));
  r = opU(r, vec2(wall, 2.0));
  r = opU(r, vec2(2.9 - p.y, 3.0));
  // Puerta, con manija; la abierta gira sobre la bisagra hacia afuera
  vec3 dp = vec3(p.x - side * 1.84, p.y - 1.03, zc);
  if (open) {
    float a = side * uOpen * 1.45;
    vec2 h = mat2(cos(a), -sin(a), sin(a), cos(a)) * vec2(dp.x, dp.z - 0.46);
    dp = vec3(h.x, dp.y, h.y + 0.46);
  }
  r = opU(r, vec2(sdBox(dp, vec3(0.03, 1.0, 0.46)), 4.0));
  r = opU(r, vec2(length(dp - vec3(-side * 0.05, 0.0, 0.32)) - 0.045, 6.0));
  // Cartelito encendido sobre cada puerta
  r = opU(r, vec2(sdBox(vec3(p.x - side * 1.66, p.y - 2.35, zc), vec3(0.03, 0.09, 0.22)), 7.0));
  // Tubos de luz del techo
  float lz = mod(p.z + 2.0, 4.0) - 2.0;
  r = opU(r, vec2(sdBox(vec3(p.x, p.y - 2.86, lz), vec3(0.2, 0.04, 0.65)), 5.0));
  // La aparición, siempre a la misma distancia por más que se camine
  float kind;
  float n = eyeCount(kind);
  if (n > 0.5) {
    vec3 fp = p - appBase();
    if (kind < 0.5) r = opU(r, vec2(demon(fp), 8.0));
    // Ojos (del demonio, o solos en la oscuridad)
    for (int i = 0; i < 5; i++) {
      if (float(i) >= n) break;
      vec4 c = eyePair(float(i), kind);
      vec3 e = fp - c.xyz;
      e.x = abs(e.x) - c.w;
      r = opU(r, vec2(length(e * vec3(1.0, 1.7, 1.0)) - 0.07, 9.0));
    }
  }
  if (uScare.w > 0.5) {
    vec3 sp = scareLocal(p);
    r = opU(r, vec2(demon(sp), 8.0));
    vec3 e = sp - vec3(0.0, 2.08, 0.3);
    e.x = abs(e.x) - 0.115;
    r = opU(r, vec2(length(e * vec3(1.0, 1.7, 1.0)) - 0.07, 9.0));
  }
  return r;
}

// Brillo rojo alrededor de cada ojo (se suma después de la niebla, así se ve desde lejos)
#define HAS_GLOW
vec3 glow(vec3 rd, float t) {
  float kind;
  float n = eyeCount(kind);
  vec3 g = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    if (float(i) >= n) break;
    vec4 c = eyePair(float(i), kind);
    for (int s = 0; s < 2; s++) {
      vec3 e = appBase() + c.xyz + vec3((float(s) * 2.0 - 1.0) * c.w, 0.0, 0.0) - uRo;
      float along = dot(e, rd);
      if (along < 0.0 || t < along - 0.3) continue; // detrás de la cámara o tapado
      float d = length(e - rd * along) / along; // distancia angular al ojo
      g += vec3(1.0, 0.1, 0.05) * exp(-d * d * 16000.0) * 1.8;
    }
  }
  if (uScare.w > 0.5) {
    for (int s = 0; s < 2; s++) {
      vec3 e = scareWorld(vec3((float(s) * 2.0 - 1.0) * 0.115, 2.08, 0.3)) - uRo;
      float along = dot(e, rd);
      if (along < 0.0 || t < along - 0.3) continue;
      float d = length(e - rd * along) / along;
      g += vec3(1.0, 0.08, 0.04) * exp(-d * d * 1500.0) * 2.2;
    }
  }
  return g;
}

// El fondo se pierde en una penumbra marrón: el pasillo se traga la luz
vec3 sky(vec3 rd) {
  return vec3(0.14, 0.105, 0.06) * levelTint();
}

vec3 shade(vec3 p, vec3 n, vec3 rd, float m, float ao) {
  // La luz la arma el motor (hallwayLights): los tubos cercanos, con sombras, la puerta que se abre
  // y, en el susto, todo rojo
  vec3 light = lighting(p, n, rd, 0.0);
  // La puerta de al lado: de qué color es su luz
  float dn = doorIdx(p.z);
  float dside = mod(dn, 2.0) < 0.5 ? 1.0 : -1.0;
  float zc = mod(p.z + 3.0, 6.0) - 3.0;
  vec3 kc = kindColor(doorKind(dn));
  if (m < 2.5 && abs(p.x) > 1.92) return kc * 1.8 + 0.3; // el fondo del hueco: pura luz
  if (m < 1.5) {
    // Alfombra mostaza gastada, más oscura junto a las paredes
    float worn = 0.85 + 0.3 * noise2(p.xz * 7.0) - smoothstep(1.0, 1.7, abs(p.x)) * 0.25;
    // Raya de luz que sale por debajo de las puertas que llevan a algún lado
    float under = exp(-max(0.0, 1.7 - p.x * dside) * 3.5) * smoothstep(0.62, 0.4, abs(zc));
    return vec3(0.7, 0.6, 0.34) * levelTint() * worn * light * ao + kc * under * 0.9;
  }
  if (m < 2.5) {
    // Empapelado amarillo con rayas finas y una mancha de humedad cada tanto
    if (p.y < 0.13) return vec3(0.35, 0.28, 0.16) * light;
    float stripe = 0.88 + 0.12 * step(0.5, fract(p.z * 4.0));
    float damp = smoothstep(0.65, 0.85, noise2(p.zy * vec2(0.6, 1.1) + 13.0)) * 0.3;
    return vec3(0.76, 0.71, 0.52) * levelTint() * stripe * (1.0 - damp) * light * (0.4 + 0.6 * ao);
  }
  if (m < 3.5) {
    vec2 f = fract(p.xz * vec2(1.6, 1.0));
    float grid = max(step(0.93, f.x), step(0.94, f.y));
    return vec3(0.85, 0.82, 0.68) * (1.0 - grid * 0.35) * light * ao;
  }
  if (m < 4.5) {
    // Puerta de madera con dos paneles
    float zc = mod(p.z + 3.0, 6.0) - 3.0;
    vec2 q = vec2(abs(zc) - 0.2, abs(p.y - 1.03 + 0.1) - 0.45);
    float panel = step(max(abs(q.x) - 0.13, abs(q.y) - 0.35), 0.0);
    return vec3(0.5, 0.3, 0.16) * (1.0 - panel * 0.3) * light * (0.5 + 0.5 * ao) + kc * 0.12;
  }
  if (m < 5.5) {
    // El tubo brilla con el color de su luz (titila con ella); los lejanos, que no tienen luz propia, parejo
    vec4 lp = lightAt(p, 0.8);
    if (lp.w > 0.5) return lp.rgb * 1.3;
    return uScare.w > 0.5 ? vec3(1.2, 0.08, 0.05) : levelLight() * 1.3 * (1.0 - uDim);
  }
  if (m < 6.5) return vec3(0.9, 0.75, 0.35) * light + 0.15;
  // Cartelito sobre la puerta: apagado si está cerrada, del color de su destino si abre
  if (m < 7.5) return doorKind(dn) < 0.5 ? vec3(0.12, 0.14, 0.12) : kc * 1.3;
  // El demonio: negro, con un borde rojizo apenas
  if (m < 8.5) return vec3(0.02, 0.01, 0.015) + vec3(0.9, 0.2, 0.15) * pow(1.0 - max(dot(-rd, n), 0.0), 3.0) * 0.5;
  // Ojos: rojo puro, para que el ASCII los pinte rojos
  return vec3(6.0, 0.25, 0.1);
}
`

// --- Luces del pasillo ---
// Misma cuenta que levelLight() y kindColor() del shader
const LEVEL_LIGHT: V3[] = [
  [1.0, 0.96, 0.86], // blanco de tubo, apenas cálido
  [1.35, 0.6, 0.5], // rojo de emergencia
  [0.75, 1.15, 0.85], // verde enfermizo
]
const KIND_COLOR: V3[] = [
  [0, 0, 0],
  [0.25, 1.0, 1.0], // isla
  [1.0, 0.45, 0.08], // cementerio
  [1.0, 0.97, 0.9], // escalera
  [1.0, 0.12, 0.08], // otro pasillo
  [0.45, 0.62, 1.0], // niebla
  [0.72, 0.42, 1.0], // orilla
  [0.55, 1.0, 0.35], // cresta
  [1.0, 0.3, 0.7], // estudio
]
const SCARE_RED: V3 = [1.4, 0.1, 0.06] // pasada de 1: el rojo puro se ve oscuro, así la habitación se sigue leyendo
const TUBE_GAP = 4 // un tubo cada 4 m (z = 4k), igual que el shader
const TUBES = 7 // el resto de las luces queda para la puerta que se abre
const fract = (x: number) => x - Math.floor(x)
const hash1 = (n: number) => fract(Math.sin(n) * 43758.5453)
const scale = (c: V3, k: number): V3 => [c[0] * k, c[1] * k, c[2] * k]

// Algunos tubos parpadean (el patrón se repite cada 150 tubos, así el loop de 600 m no se nota)
const tubeLamp = (k: number, t: number) => {
  const i = ((k % 150) + 150) % 150
  if (hash1(i * 7.3) < 0.55) return 1
  return fract(Math.sin(Math.floor(t * 9) * 12.9 + i) * 43758.5) > 0.25 ? 0.7 : 0
}

// El pasillo es infinito pero las luces no: se encienden los tubos más cercanos, corridos hacia
// donde se mira, y los de las puntas se desvanecen para que no aparezcan de golpe
const hallwayLights = ({ t, cam, level, door, scare, dim }: LightCtx): LightSet => {
  const tint = scare ? SCARE_RED : LEVEL_LIGHT[Math.min(level, LEVEL_LIGHT.length - 1)]
  // Con el corte de luz queda algo de penumbra: la habitación se tiene que seguir leyendo
  const on = scare ? 1 : 1 - dim
  const center = cam.pos[2] + cam.fw[2] * 6
  const k0 = Math.round(center / TUBE_GAP)
  const half = (TUBES - 1) / 2
  const tubes: (Light & { d: number })[] = []
  for (let j = -half; j <= half; j++) {
    const z = (k0 + j) * TUBE_GAP
    const fade = Math.min(Math.max((half * TUBE_GAP + 1 - Math.abs(z - center)) / 3, 0), 1)
    const lamp = scare ? 1 : tubeLamp(k0 + j, t)
    // Cada tubo es un cono hacia abajo: deja un charco de luz en la alfombra, como un farol
    tubes.push({
      type: "spot",
      pos: [0, 2.78, z],
      dir: [0, -1, 0],
      angle: 0.85,
      softness: 0.75,
      color: scale(tint, lamp * on),
      intensity: 2.8 * fade,
      range: 8,
      falloff: 0.12,
      wrap: 0.25,
      d: Math.abs(z - cam.pos[2]),
    })
  }
  // Los dos tubos más cercanos hacen sombra (el demonio, los marcos de las puertas)
  ;[...tubes].sort((a, b) => a.d - b.d).slice(0, 2).forEach((l) => (l.shadow = true))
  const lights: Light[] = tubes
  // Al abrirse una puerta, la luz del otro lado inunda el pasillo
  if (door && door.open > 0.001) {
    lights.push({
      type: "point",
      pos: [door.side * 1.8, 1.0, -door.n * 6],
      color: KIND_COLOR[door.kind] ?? KIND_COLOR[0],
      intensity: door.open * 3,
      range: 12,
      falloff: 0.5,
      wrap: 1,
    })
  }
  return { ambient: scale(tint, 0.45 * on), lights }
}

export const HALLWAY: Scene3D = {
  id: "pasillo",
  name: "pasillo",
  label: "el pasillo",
  blurb: "espacio 01 · casi todas las puertas están cerradas",
  glsl: hallway,
  lights: hallwayLights,
  exposure: 1.4,
  saturation: 0.5,
  grade: 0.2,
  camera: {
    target: [0, 1.45, 0],
    yaw: 0,
    pitch: 0.03,
    frame: 1.4,
    clip: 1e4,
    pitchRange: [-1.2, 1.2],
    walk: { drift: 0.35, loop: 600, fov: 72 },
    doors: true,
  },
}
