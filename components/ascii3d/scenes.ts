// Escenas 3D para /3d: espacios liminales dibujados con raymarching y pasados a ASCII.
// Cada escena es un pedazo de GLSL que define:
//   vec2 map(vec3 p)  -> distancia a la superficie más cercana y material
//   vec3 sky(vec3 rd) -> color del fondo y de la niebla en esa dirección
//   vec3 shade(vec3 p, vec3 n, vec3 rd, float m, float ao) -> color de la superficie
// y las constantes FOG (densidad de la niebla) y MAXD (hasta dónde mira).
// Las que tienen luces dinámicas (lights) las arman en JS en cada cuadro y en shade() usan
// lighting() y lightAt() del motor (engine/lighting.ts).

import type { AsciiDetail } from "./engine/ascii"
import type { V3 } from "./engine/camera"
import type { Light, LightSet } from "./engine/lighting"

// Lo que una escena sabe del cuadro para armar sus luces
export type LightCtx = {
  t: number // segundos
  cam: { pos: V3; fw: V3 }
  level: number // nivel del pasillo
  door: { n: number; side: number; kind: number; open: number } | null // la puerta que se abre o se cierra
  scare: V3 | null // dónde está el demonio, si está
  dim: number // 1 = se cortaron las luces
}

export type Scene3D = {
  id: string
  name: string // corto, para el botón de salida
  label: string // con artículo, para lectores de pantalla
  blurb: string // idea de la escena en una línea; no se muestra, queda como referencia
  glsl: string
  exposure?: number // cuánta luz recibe el ASCII (1 por defecto)
  outdoor?: boolean // al aire libre: le llueve encima
  saturation?: number // cuánto color pasa al ASCII (0 gris, 1 todo; 0.5 por defecto)
  grade?: number // cuánto se tiñe con la paleta de la isla (0.45 por defecto)
  detail?: AsciiDetail // "fine" (por defecto): más escalones de luz y trazos donde la luz cambia; "classic": como antes
  nightBoost?: number // exposición extra de noche (0.8 = 80% más con el cielo apagado)
  lights?: (ctx: LightCtx) => LightSet // luces dinámicas del cuadro (ver engine/lighting.ts)
  camera: {
    target: [number, number, number] // punto que se mira
    yaw: number // giro alrededor del punto (0 = mirando hacia -z)
    pitch: number // inclinación desde arriba
    frame: number // media altura que se ve, en unidades de la escena
    clip: number // lo que está más cerca que esto del punto no tapa (corte tipo maqueta)
    // Primera persona que camina: la rueda avanza. loop = cada cuánto se repite el espacio
    walk?: {
      drift: number // metros por segundo que se avanza solo
      loop: number // al recorrer esto se vuelve al principio
      fov: number
      climb?: { run: number; rise: number; steps: number } // escalones: fondo, alto y cantidad
      flash?: number // metros de estática antes y después de volver al principio
      exit?: boolean // al llegar al final no se vuelve al principio: se sale (la puerta de arriba)
      start?: number // metros desde donde se arranca al llegar
    }
    doors?: boolean // el pasillo del laberinto: sus puertas llevan a otras escenas (maze.ts)
    // La puerta de vuelta al pasillo (el botón se dibuja encima). facing: hacia dónde mira su frente;
    // desde atrás no se muestra (sin facing se ve de los dos lados)
    exitDoor?: { at: [number, number, number]; facing?: [number, number, number] }
    yawRange?: [number, number]
    pitchRange: [number, number]
  }
}

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
// 0 cerrada, 1 isla, 2 cementerio, 3 escalera, 4 otro pasillo (misma cuenta que kindAt en maze.ts)
float doorKind(float n) {
  if (n < 0.5) return 0.0;
  float k = n + uLevel * 5.0;
  float i = mod(k + 0.5, 12.0) - 0.5; // el +0.5 evita que 24/12 dé 1.9999
  if (abs(i - 2.0) < 0.5 || abs(i - 5.0) < 0.5 || abs(i - 9.0) < 0.5) return 4.0;
  if (abs(i - 11.0) < 0.5) {
    float e = mod(floor((k + 0.5) / 12.0) + uLevel, 3.0);
    return e < 0.5 ? 1.0 : (e < 1.5 ? 2.0 : 3.0);
  }
  return 0.0;
}
// La luz que se escapa por debajo de cada puerta dice adónde lleva
vec3 kindColor(float k) {
  if (k < 0.5) return vec3(0.0);
  if (k < 1.5) return vec3(0.25, 1.0, 1.0); // isla: turquesa
  if (k < 2.5) return vec3(1.0, 0.45, 0.08); // cementerio: velas
  if (k < 3.5) return vec3(1.0, 0.97, 0.9); // escalera: nubes
  return vec3(1.0, 0.12, 0.08); // otro pasillo: rojo
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
    return uScare.w > 0.5 ? vec3(1.2, 0.08, 0.05) : levelLight() * 1.3 * (1.0 - uDim * 0.65);
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

// --- Escalera: escalones de mármol que suben entre nubes hasta una puerta encendida ---

const stairs = /* glsl */ `
#define FOG 0.018
#define MAXD 90.0

float step_(vec3 p, float i) {
  i = clamp(i, 0.0, 14.0);
  return sdBox(p - vec3(0.0, i * 0.32 - 0.16, -i * 0.6), vec3(1.0, 0.16, 0.3));
}

vec2 map(vec3 p) {
  float i = floor(-p.z / 0.6 + 0.5);
  float s = min(step_(p, i), step_(p, i + 1.0));
  s = min(s, step_(p, i - 1.0));
  vec2 r = vec2(s, 1.0);
  // Marco de la puerta arriba de todo, con la luz adentro
  vec3 dp = p - vec3(0.0, 4.48 + 1.2, -8.6);
  float frame = min(min(sdBox(dp - vec3(-0.75, 0.0, 0.0), vec3(0.1, 1.2, 0.1)), sdBox(dp - vec3(0.75, 0.0, 0.0), vec3(0.1, 1.2, 0.1))),
                    sdBox(dp - vec3(0.0, 1.2, 0.0), vec3(0.85, 0.1, 0.1)));
  r = opU(r, vec2(frame, 2.0));
  r = opU(r, vec2(sdBox(dp, vec3(0.64, 1.12, 0.02)), 3.0));
  // Mar de nubes abajo
  float cloud = p.y + 2.6 - fbm2(p.xz * 0.12 + vec2(uTime * 0.02, 0.0)) * 1.8;
  r = opU(r, vec2(cloud * 0.6, 4.0));
  // Cubos que flotan y giran despacio
  vec2 id = floor(p.xz / 11.0);
  vec2 q = mod(p.xz, 11.0) - 5.5;
  float h = hash2(id);
  vec3 cp = vec3(q.x, p.y - 1.0 - h * 4.0 - sin(uTime * 0.3 + h * 6.0) * 0.3, q.y);
  float a = uTime * 0.15 + h * 6.0;
  cp.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * cp.xz;
  float cube = h > 0.55 && length(id) > 0.5 ? sdBox(cp, vec3(0.5)) : 1e3;
  r = opU(r, vec2(cube, 5.0));
  return r;
}

// Un cielo pastel que igual sigue la hora y el clima reales
vec3 sky(vec3 rd) {
  float y = clamp(rd.y * 1.6 + 0.2, 0.0, 1.0);
  vec3 pastel = mix(vec3(0.78, 0.6, 0.66), vec3(0.22, 0.28, 0.5), y);
  vec3 c = mix(pastel, mix(uSkyHor, uSkyTop, y), 0.55);
  float s = max(dot(rd, uSunDir), 0.0);
  return c + uLightCol * (pow(s, 40.0) * 0.8 + pow(s, 4.0) * 0.15) + uFlash * 0.4;
}

vec3 shade(vec3 p, vec3 n, vec3 rd, float m, float ao) {
  vec3 L = uSunDir;
  vec3 dif = uLightCol * max(dot(n, L), 0.0) * (0.6 + 0.5 * uLight);
  vec3 amb = mix(vec3(0.5), uSkyTop + 0.2, 0.5) * (0.45 + 0.35 * n.y);
  // Mármol: aunque la luz venga de atrás, el frente de cada escalón brilla un poco, y la huella más
  if (m < 1.5) return vec3(0.96, 0.94, 0.92) * (dif * 0.75 + amb * 0.55 + 0.3 + 0.25 * max(n.y, 0.0)) * (0.5 + 0.5 * ao);
  if (m < 2.5) return vec3(0.92, 0.9, 0.95) * (dif * 0.7 + amb * 0.5);
  if (m < 3.5) return vec3(1.4, 1.32, 1.15);
  if (m < 4.5) return mix(vec3(1.0, 0.82, 0.86) * 0.7, uSkyCloud + 0.35, 0.5) * (0.55 + 0.45 * max(dot(n, L), 0.0)) * (0.6 + 0.4 * ao);
  return vec3(0.75, 0.82, 1.0) * (dif * 0.7 + amb * 0.45);
}
`

// --- La isla en 3D: el mismo atardecer vaporwave, ahora con profundidad ---

const island = /* glsl */ `
#define FOG 0.025
#define MAXD 120.0

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
    vec3 c = mix(deep, sky(reflect(rd, n)) * 0.6, 0.12 + 0.35 * fres);
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
  // Adentro de la puerta: el pasillo, que titila un poco
  return vec3(1.25, 1.1, 0.6) * (0.85 + 0.15 * step(0.3, fract(sin(floor(uTime * 7.0)) * 43758.5)));
}
`

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
  const on = scare ? 1 : 1 - dim * 0.65
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

export const SCENES_3D: Scene3D[] = [
  {
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
      pitchRange: [-0.3, 0.3],
      walk: { drift: 0.35, loop: 600, fov: 72 },
      doors: true,
    },
  },
  {
    id: "escalera",
    name: "escalera",
    label: "la escalera",
    blurb: "espacio 02 · subes y la puerta de arriba te devuelve al pasillo",
    glsl: stairs,
    exposure: 1.5,
    outdoor: true,
    // Se sube caminando; al cruzar la puerta de arriba se vuelve al primer escalón
    camera: {
      target: [0, 1.55, 0.4],
      yaw: 0,
      pitch: -0.12,
      frame: 5.5,
      clip: 1e4,
      pitchRange: [-0.5, 0.35],
      walk: { drift: 0.3, loop: 9.4, fov: 70, climb: { run: 0.6, rise: 0.32, steps: 14 }, flash: 0.5, exit: true, start: 0.6 },
      exitDoor: { at: [0, 5.68, -8.6], facing: [0, 0, 1] },
    },
  },
  {
    id: "isla",
    name: "isla",
    label: "la isla",
    blurb: "espacio 03 · la tele sigue prendida",
    glsl: island,
    exposure: 1.15,
    nightBoost: 0.9,
    saturation: 0.95,
    grade: 0.2,
    outdoor: true,
    camera: { target: [0, 1, 0], yaw: 0.15, pitch: 0.18, frame: 6.5, clip: 40, pitchRange: [0.02, 1.1], exitDoor: { at: [2.1, 1.25, 1.3], facing: [-0.6, 0, 0.8] } },
  },
  {
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
  },
]
