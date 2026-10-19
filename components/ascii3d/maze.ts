// El laberinto de los backrooms: el pasillo es el centro y algunas de sus puertas llevan a otros espacios.
//
// Las puertas del pasillo están cada DOOR_GAP metros, alternando de lado (la 0 a la derecha, la 1 a la
// izquierda...), y se repiten cada DOORS puertas (el loop del pasillo). Cada nivel del pasillo reparte
// los destinos en otro orden, con el mismo patrón corrido. El shader del pasillo repite esta misma cuenta
// en doorKind(): si se cambia el patrón acá, hay que cambiarlo allá (scenes.ts).

export const DOOR_GAP = 6
export const DOORS = 100
export const LEVELS = 3

export const KIND = { cerrada: 0, isla: 1, cementerio: 2, escalera: 3, pasillo: 4 } as const

// Backrooms: casi todas las puertas con luz llevan a otro pasillo, y cada tanto una a un entorno.
// En cada tramo de 12 puertas: 3 llevan a otro pasillo (posiciones 2, 5 y 9) y 1 a un entorno (la 11),
// que va rotando entre isla, cementerio y escalera de un tramo al siguiente. El resto, cerradas.
const CYCLE = 12
const HALL_AT = [2, 5, 9]
const PLACE_AT = 11
const PLACES = [KIND.isla, KIND.cementerio, KIND.escalera]

export const kindAt = (level: number, door: number): number => {
  const n = ((door % DOORS) + DOORS) % DOORS
  if (n === 0) return KIND.cerrada // la de la entrada nunca abre
  const k = n + level * 5
  const i = k % CYCLE
  if (HALL_AT.includes(i)) return KIND.pasillo
  if (i === PLACE_AT) return PLACES[(Math.floor(k / CYCLE) + level) % PLACES.length]
  return KIND.cerrada
}

export const sideOf = (door: number) => (((door % 2) + 2) % 2 === 0 ? 1 : -1)

// A qué escena lleva cada tipo de puerta
export const SCENE_OF: Record<number, string> = {
  [KIND.isla]: "isla",
  [KIND.cementerio]: "cementerio",
  [KIND.escalera]: "escalera",
  [KIND.pasillo]: "pasillo",
}

export const LABEL_OF: Record<number, string> = {
  [KIND.isla]: "isla",
  [KIND.cementerio]: "cementerio",
  [KIND.escalera]: "escalera",
  [KIND.pasillo]: "otro pasillo",
}

// La primera puerta de un tipo desde una puerta dada, hacia adelante
export const nextDoorOf = (level: number, kind: number, from = 0) => {
  for (let i = 0; i < DOORS; i++) {
    const n = (from + i) % DOORS
    if (kindAt(level, n) === kind) return n
  }
  return 1
}

// Dónde aparece quien entra al pasillo: nivel y número de puerta
export type Entry = { level: number; door: number }
