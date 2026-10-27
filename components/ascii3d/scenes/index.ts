// Escenas 3D para /3d: una por archivo. Cada una es un pedazo de GLSL (map, sky, shade) más su cámara,
// sus luces y cómo se camina (ver types.ts). El motor compila cada una por separado.

import { HALLWAY } from "./hallway"
import { STAIRS } from "./stairs"
import { ISLAND } from "./island"
import { CEMETERY } from "./cemetery"
import { FOG } from "./fog"
import { SHORE } from "./shore"
import { CREST_SCENE } from "./crest"
import { STUDIO } from "./studio"

export type { LightCtx, Scene3D } from "./types"

// El orden importa: la primera es la de entrada si la dirección no pide otra
export const SCENES_3D = [HALLWAY, STAIRS, ISLAND, CEMETERY, FOG, SHORE, CREST_SCENE, STUDIO]
