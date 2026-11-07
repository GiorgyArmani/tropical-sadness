// Lo que todas las escenas del juego comparten en el shader: los uniforms del mundo (cielo en vivo,
// laberinto, susto) y cómo se arma el programa completo. Lo usan Ascii3D y la vista previa del avatar.

import { GLSL_CAMERA } from "./engine/camera"
import { GLSL_LIGHTING } from "./engine/lighting"
import { GLSL_HEADER, GLSL_LIB, GLSL_RAYMARCH } from "./engine/shader"

// Uniforms del mundo de este juego: el cielo en vivo, el laberinto y el susto
export const GLSL_WORLD = /* glsl */ `
// Cielo y clima en vivo (colores de 0 a 1)
uniform vec3 uSkyTop;
uniform vec3 uSkyHor;
uniform vec3 uSkyCloud;
uniform float uLight;
uniform float uStars;
uniform vec3 uSunDir;
uniform vec3 uLightCol;
uniform float uClouds;
uniform float uRain;
uniform float uFlash;
// Laberinto: nivel del pasillo, número de la puerta que se abre y cuánto (0 cerrada, 1 abierta)
uniform float uLevel;
uniform float uDoor;
uniform float uOpen;
// Susto: dónde está el demonio (xyz) y si está (w), hacia dónde mira, y cuánto se apagan las luces
uniform vec4 uScare;
uniform float uScareA;
uniform float uDim;
// La aparición al fondo del pasillo: x = segundos desde que apareció (-1 = no está), y = qué es
// (0 demonio, 1 un par de ojos, 2 varios)
uniform vec2 uAppear;
`

export const buildShader = (glsl: string) => GLSL_HEADER + GLSL_CAMERA + GLSL_WORLD + GLSL_LIGHTING + GLSL_LIB + glsl + GLSL_RAYMARCH
