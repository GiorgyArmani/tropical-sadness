// Escenas 3D para /3d: espacios liminales dibujados con raymarching y pasados a ASCII.
// Cada escena es un pedazo de GLSL que define:
//   vec2 map(vec3 p)  -> distancia a la superficie más cercana y material
//   vec3 sky(vec3 rd) -> color del fondo y de la niebla en esa dirección
//   vec3 shade(vec3 p, vec3 n, vec3 rd, float m, float ao) -> color de la superficie
// y las constantes FOG (densidad de la niebla) y MAXD (hasta dónde mira).
// Las que tienen luces dinámicas (lights) las arman en JS en cada cuadro y en shade() usan
// lighting() y lightAt() del motor (engine/lighting.ts).

import type { AsciiDetail } from "../engine/ascii"
import type { V3 } from "../engine/camera"
import type { Light, LightSet } from "../engine/lighting"

// Lo que una escena sabe del cuadro para armar sus luces
export type LightCtx = {
  t: number // segundos
  cam: { pos: V3; fw: V3 }
  level: number // nivel del pasillo
  door: { n: number; side: number; kind: number; open: number } | null // la puerta que se abre o se cierra
  scare: V3 | null // dónde está el demonio, si está
  dim: number // cuánta luz se pierde (0.65 = se cortaron las luces, más durante la aparición)
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
      // Sobre riel: el piso del camino a los s metros (s = lo caminado). La cámara va target[1] más
      // arriba y mira hacia donde sigue el camino; se sale al llegar a loop (con exit)
      rail?: (s: number) => V3
      speed?: number // cuánto avanza cada empujón de la rueda, la cruceta o el joystick (1 por defecto)
      // Plano redondo: en vez de un camino recto se camina hacia donde se mira, en cualquier dirección,
      // sin salir del círculo (center x, z y radius). Se arranca en target corrido start metros hacia -z.
      // exitAt: al llegar a menos de exitR metros de ese punto se sale (con flash metros de estática antes)
      // floor: la altura del piso en (x, z), o null donde no hay piso (no se puede pasar). Sin floor, el piso es plano
      roam?: {
        center: [number, number]
        radius: number
        exitAt?: [number, number]
        exitR?: number
        floor?: (x: number, z: number) => number | null
      }
    }
    doors?: boolean // el pasillo del laberinto: sus puertas llevan a otras escenas (maze.ts)
    // La puerta de vuelta al pasillo (el botón se dibuja encima). facing: hacia dónde mira su frente;
    // desde atrás no se muestra (sin facing se ve de los dos lados)
    exitDoor?: { at: [number, number, number]; facing?: [number, number, number] }
    yawRange?: [number, number]
    pitchRange: [number, number]
  }
}

// Un número para pegar en GLSL (siempre con punto decimal)
export const g = (n: number) => n.toFixed(3)
