// Motor · shader: arma el programa de cada escena, lo compila sin trabar la página y le pasa uniforms.
//
// Un shader de escena se arma así:
//   GLSL_HEADER (uniforms del motor) + bloques de los otros módulos (cámara, luces, mundo)
//   + GLSL_LIB (ruido y formas) + el GLSL de la escena (map, sky, shade) + GLSL_RAYMARCH (main)
// La escena define:
//   vec2 map(vec3 p)  -> distancia a la superficie más cercana y material
//   vec3 sky(vec3 rd) -> color del fondo y de la niebla en esa dirección
//   vec3 shade(vec3 p, vec3 n, vec3 rd, float m, float ao) -> color de la superficie
// y las constantes FOG (densidad de la niebla) y MAXD (hasta dónde mira).

export const GLSL_HEADER = /* glsl */ `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uAspect;
uniform float uStart; // desde dónde empieza a mirar el rayo (corte tipo maqueta)
uniform float uFogRef; // la niebla cuenta desde acá
uniform float uFogW; // niebla extra del clima (0 nada)
uniform float uCrease; // 1 busca esquinas (la calidad automática la apaga si no alcanza: AsciiFilm.adapt)
// La escena la declara más abajo; los módulos de antes (luces) ya la pueden usar
vec2 map(vec3 p);
`

export const GLSL_LIB = /* glsl */ `
float hash1(float n) { return fract(sin(n) * 43758.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm2(vec2 p) { return noise2(p) * 0.55 + noise2(p * 2.03) * 0.28 + noise2(p * 4.01) * 0.17; }
float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a;
  vec3 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
float sdEllipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / k1;
}
vec2 opU(vec2 a, vec2 b) { return a.x < b.x ? a : b; }
`

// El rayo por píxel. Necesita la cámara (uRo, uFw, uRt, uUp, uTan: ver camera.ts)
export const GLSL_RAYMARCH = /* glsl */ `
// Normal con 4 muestras (tetraedro) en vez de 6
vec3 calcNormal(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  const float h = 0.002;
  return normalize(k.xyy * map(p + k.xyy * h).x + k.yyx * map(p + k.yyx * h).x + k.yxy * map(p + k.yxy * h).x + k.xxx * map(p + k.xxx * h).x);
}
float calcAO(vec3 p, vec3 n) {
  float o = 0.0;
  float s = 1.0;
  for (int i = 1; i <= 3; i++) {
    float h = 0.08 * float(i * i);
    o += (h - map(p + n * h).x) * s;
    s *= 0.6;
  }
  return clamp(1.0 - o * 1.6, 0.0, 1.0);
}
void main() {
  vec2 uv = vec2((gl_FragCoord.x - 0.5 * uRes.x) * uAspect, gl_FragCoord.y - 0.5 * uRes.y) / uRes.y;
  vec3 rd = normalize(uFw + (uv.x * uRt + uv.y * uUp) * 2.0 * uTan);
  float t = uStart;
  float m = -1.0;
  // Si el corte de maqueta cae adentro de algo sólido, primero sale de ahí
  bool outside = map(uRo + rd * t).x > 0.0;
  for (int i = 0; i < 96; i++) {
    vec2 h = map(uRo + rd * t);
    if (outside && h.x < 0.002 * (1.0 + t - uStart)) { m = h.y; break; }
    if (!outside) { if (h.x > 0.0) outside = true; t += max(-h.x, 0.02) + 0.01; }
    else t += h.x * 0.85;
    if (t > uStart + MAXD) break;
  }
  vec3 col;
  float depth = 1.0;
  if (m >= 0.0) {
    vec3 p = uRo + rd * t;
    vec3 n = calcNormal(p);
    col = shade(p, n, rd, m, calcAO(p, n));
    float fd = max(t - uFogRef, 0.0);
    col = mix(col, sky(rd), 1.0 - exp(-FOG * (1.0 + uFogW * 2.5) * fd));
    // Esquina (idea de AcerolaFX: bordes por normales). Donde dos paredes se juntan la profundidad
    // casi no salta, así que el borde de profundidad no la ve. Se da un paso de un píxel de costado,
    // a los cuatro lados, pegado a la superficie: en una pared lisa el paso sigue sobre ella
    // (distancia ~0); si hay una esquina cerca, se mete en la otra pared o sale al aire.
    // Son 4 consultas al mundo (con normales eran 8), y solo donde hay luz: en lo oscuro el trazo no
    // se dibuja igual (edges.ts), y en el laberinto de noche eso es casi toda la pantalla.
    // Solo en la compu (CREASES): cada consulta copia el mundo entero adentro del shader, y en el
    // celular un shader así de grande hacía caer la página.
    float crease = 0.0;
#ifdef CREASES
    if (uCrease > 0.5 && max(dot(col, vec3(0.299, 0.587, 0.114)), 0.6 * max(col.r, max(col.g, col.b))) > 0.06) {
      float cell = t * 2.0 * uTan / uRes.y;
      vec3 ta = normalize(uRt - n * dot(uRt, n) + 1e-4) * cell;
      vec3 tb = normalize(uUp - n * dot(uUp, n) + 1e-4) * cell;
      float off = max(max(abs(map(p + ta).x), abs(map(p - ta).x)), max(abs(map(p + tb).x), abs(map(p - tb).x)));
      if (off > 0.45 * cell) crease = 1.0;
    }
#endif
    // La profundidad va en los bits altos (0..244, par) y la esquina en el bit más bajo.
    // 254 queda para el brillo y 255 para el cielo.
    depth = (floor(clamp(fd / MAXD, 0.0, 0.98) * 125.0) * 2.0 + crease) / 255.0;
  } else col = sky(rd);
#ifdef HAS_GLOW
  // Cosas que brillan a través de la niebla. Donde el brillo es fuerte, la profundidad vale 254
  // como marca: el ASCII pinta ese píxel con su color puro, sin mezclarlo con la paleta.
  vec3 gw = glow(rd, m >= 0.0 ? t : 1e4);
  col += gw;
  if (max(gw.r, max(gw.g, gw.b)) > 0.5) depth = 254.0 / 255.0;
#endif
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), depth);
}
`

const VERT = "attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }"

type GL = WebGLRenderingContext

// Un programa ya listo. Los uniforms se buscan por nombre la primera vez y quedan guardados,
// así cada módulo sube los suyos sin que haya una lista central que mantener.
export class Program {
  private loc = new Map<string, WebGLUniformLocation | null>()
  constructor(
    readonly gl: GL,
    readonly prog: WebGLProgram,
  ) {}
  private at(name: string) {
    let l = this.loc.get(name)
    if (l === undefined) {
      l = this.gl.getUniformLocation(this.prog, name)
      this.loc.set(name, l)
    }
    return l
  }
  use() {
    this.gl.useProgram(this.prog)
  }
  f1(name: string, x: number) {
    this.gl.uniform1f(this.at(name), x)
  }
  f2(name: string, x: number, y: number) {
    this.gl.uniform2f(this.at(name), x, y)
  }
  f3(name: string, v: readonly [number, number, number]) {
    this.gl.uniform3f(this.at(name), v[0], v[1], v[2])
  }
  f4(name: string, x: number, y: number, z: number, w: number) {
    this.gl.uniform4f(this.at(name), x, y, z, w)
  }
  i1(name: string, x: number) {
    this.gl.uniform1i(this.at(name), x)
  }
  v1(name: string, data: Float32Array) {
    this.gl.uniform1fv(this.at(name), data)
  }
  // Arreglos de vec4: el nombre es el del arreglo (ej. "uLPos"), sin [0]
  v4(name: string, data: Float32Array) {
    this.gl.uniform4fv(this.at(name), data)
  }
}

export type ShaderSource = { id: string; glsl: string }

// Compilar un shader de raymarching tarda bastante. Se hace en dos partes: arrancar (no espera)
// y terminar (pide el resultado). Con KHR_parallel_shader_compile el navegador compila en otro
// hilo y se puede preguntar si ya terminó sin trabar la página.
export const createShaderCache = (gl: GL, build: (glsl: string) => string, onCompiled?: () => void) => {
  const programs = new Map<string, Program | null>()
  const pending = new Map<string, WebGLProgram>()
  const parallel = gl.getExtension("KHR_parallel_shader_compile") as { COMPLETION_STATUS_KHR: number } | null

  const start = (s: ShaderSource) => {
    const shader = (type: number, src: string) => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      return sh
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, build(s.glsl)))
    gl.bindAttribLocation(prog, 0, "a")
    gl.linkProgram(prog)
    return prog
  }

  const finish = (s: ShaderSource, prog: WebGLProgram): Program | null => {
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      for (const sh of gl.getAttachedShaders(prog) ?? []) {
        const log = gl.getShaderInfoLog(sh)
        if (log) console.error(`[ascii3d] ${s.id}:`, log)
      }
      console.error(`[ascii3d] ${s.id}:`, gl.getProgramInfoLog(prog))
      return null
    }
    return new Program(gl, prog)
  }

  const request = (s: ShaderSource) => {
    if (!programs.has(s.id) && !pending.has(s.id)) pending.set(s.id, start(s))
  }

  // ¿Está lista? Sin esperar solo responde que sí si el navegador ya terminó en segundo plano
  const ready = (s: ShaderSource, wait: boolean) => {
    if (programs.has(s.id)) return true
    request(s)
    const p = pending.get(s.id)!
    if (!wait && !(parallel && gl.getProgramParameter(p, parallel.COMPLETION_STATUS_KHR))) return false
    pending.delete(s.id)
    const prog = finish(s, p)
    if (prog) {
      // Un dibujo de 1 píxel obliga al driver a terminar ahora, tapado por la estática
      gl.viewport(0, 0, 1, 1)
      prog.use()
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    programs.set(s.id, prog)
    onCompiled?.()
    return true
  }

  return {
    parallel: !!parallel,
    request,
    ready,
    has: (id: string) => programs.has(id),
    get: (id: string) => programs.get(id) ?? null,
  }
}

// El triángulo que tapa toda la pantalla (el shader hace el resto)
export const fullscreenTriangle = (gl: GL) => {
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
}
