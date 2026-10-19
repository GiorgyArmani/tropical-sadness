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

// Cada 8 puertas: posición 1 isla, 4 cementerio, 6 otro pasillo, 7 escalera; el resto cerradas
const PATTERN = [0, 1, 0, 0, 2, 0, 4, 3]

export const kindAt = (level: number, door: number) => {
  const n = ((door % DOORS) + DOORS) % DOORS
  if (n === 0) return KIND.cerrada // la de la entrada nunca abre
  return PATTERN[(n + level * 3) % PATTERN.length]
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
