// Motor · revelado en la GPU: la escena se dibuja a una imagen aparte y una pasada chica la resume
// en un píxel por celda, que es lo que lee la película ASCII (ascii.ts).
//
// Con sub = 2 la escena se dibuja a 2x2 píxeles por celda (idea de AcerolaFX: mirar los bordes a más
// resolución que los caracteres y después decidir por celda). El color de la celda es el promedio de
// sus píxeles (menos parpadeo al moverse) y el borde se vota entre ellos. Con sub = 1 es un píxel por
// celda, como antes. La calidad automática de la película elige cuál (AsciiFilm.adapt).
//
// La pasada sale en una imagen de un píxel por celda, que se lee una sola vez por cuadro (leer de la
// GPU es lo caro, sobre todo en el celular: cada lectura espera a que la GPU termine):
//   RGB -> color de la celda (si hay un brillo marcado por la escena, el color puro del brillo)
//   A   -> el trazo en los bits 0-2 (0 "-", 1 "/", 2 "|", 3 "\", 4 esquina sin dirección, 5 nada)
//          y en el bit 3 (GLOW_BIT) si la celda tiene un brillo marcado (los ojos)

type GL = WebGLRenderingContext

export const EDGE_NONE = 5
export const EDGE_MASK = 7
export const GLOW_BIT = 8

const VERT = "attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }"

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uScene;
uniform vec2 uSrc; // tamaño de la imagen de la escena (celdas * sub)
uniform float uSub;

vec4 px(vec2 q) {
  q = clamp(q, vec2(0.0), uSrc - 1.0);
  return texture2D(uScene, (q + 0.5) / uSrc);
}
float byteA(vec4 c) { return floor(c.a * 255.0 + 0.5); }
// Profundidad sin la marca de esquina (bit más bajo). 254 es brillo y 255 cielo
float dep(vec2 q) {
  float a = byteA(px(q));
  return a >= 252.0 ? a : a - mod(a, 2.0);
}
float lightOf(vec3 c) { return max(dot(c, vec3(0.299, 0.587, 0.114)), 0.6 * max(c.r, max(c.g, c.b))); }

void main() {
  vec2 o = floor(gl_FragCoord.xy) * uSub;
  vec3 sum = vec3(0.0);
  vec3 glow = vec3(0.0);
  float glowAny = 0.0;
  vec4 votes = vec4(0.0);
  float crease = 0.0;
  float n = 0.0;
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      if (float(i) >= uSub || float(j) >= uSub) continue;
      vec2 q = o + vec2(float(i), float(j));
      vec4 c = px(q);
      float a = byteA(c);
      sum += c.rgb;
      n += 1.0;
      if (a == 254.0) {
        glowAny = 1.0;
        if (dot(c.rgb, vec3(1.0)) > dot(glow, vec3(1.0))) glow = c.rgb;
      }
      if (lightOf(c.rgb) <= 0.06) continue;
      float d = a >= 252.0 ? a : a - mod(a, 2.0);
      float e = dep(q + vec2(1.0, 0.0));
      float w = dep(q - vec2(1.0, 0.0));
      float up = dep(q + vec2(0.0, 1.0)); // la imagen de WebGL va de abajo hacia arriba
      float dn = dep(q - vec2(0.0, 1.0));
      // Salto de profundidad, solo del lado cercano (la línea queda sobre el contorno de la cosa)
      if (abs(e - w) + abs(dn - up) > 6.0 + d * 0.12 && d - min(min(e, w), min(up, dn)) <= 2.0) {
        // Sobel 3x3, en coordenadas de pantalla (y hacia abajo)
        float ne = dep(q + vec2(1.0, 1.0));
        float se = dep(q + vec2(1.0, -1.0));
        float nw = dep(q + vec2(-1.0, 1.0));
        float sw = dep(q + vec2(-1.0, -1.0));
        float gx = ne + 2.0 * e + se - nw - 2.0 * w - sw;
        float gy = sw + 2.0 * dn + se - nw - 2.0 * up - ne;
        // El trazo va perpendicular al salto: (dx, dy) = (-gy, gx), como dirChar en math.ts
        float ang = mod(degrees(atan(-gx, -gy)) + 360.0, 180.0);
        float b = ang < 22.5 || ang >= 157.5 ? 0.0 : ang < 67.5 ? 1.0 : ang < 112.5 ? 2.0 : 3.0;
        votes += vec4(equal(vec4(b), vec4(0.0, 1.0, 2.0, 3.0)));
      } else if (a < 252.0 && mod(a, 2.0) == 1.0) crease += 1.0;
    }
  }
  // El trazo que más se repite entre los píxeles de la celda
  float code = ${EDGE_NONE}.0;
  float best = 0.0;
  if (votes.x > best) { best = votes.x; code = 0.0; }
  if (votes.y > best) { best = votes.y; code = 1.0; }
  if (votes.z > best) { best = votes.z; code = 2.0; }
  if (votes.w > best) { best = votes.w; code = 3.0; }
  if (best == 0.0 && crease > 0.0) code = 4.0;
  gl_FragColor = vec4(glowAny > 0.0 ? glow : sum / n, (code + glowAny * ${GLOW_BIT}.0) / 255.0);
}
`

const texture = (gl: GL) => {
  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return tex
}

class EdgePass {
  private prog: WebGLProgram
  private loc: Record<string, WebGLUniformLocation | null>
  private sceneTex: WebGLTexture
  private sceneFb: WebGLFramebuffer
  private sw = 0
  private sh = 0

  constructor(readonly gl: GL) {
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG))
    gl.bindAttribLocation(prog, 0, "a")
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) console.error("[ascii3d] edges:", gl.getProgramInfoLog(prog))
    this.prog = prog
    this.loc = Object.fromEntries(["uScene", "uSrc", "uSub"].map((n) => [n, gl.getUniformLocation(prog, n)]))
    this.sceneTex = texture(gl)
    this.sceneFb = gl.createFramebuffer()!
  }

  // Deja todo listo para que la escena se dibuje a su imagen (cols * sub por rows * sub)
  begin(cols: number, rows: number, sub: number) {
    const gl = this.gl
    const w = cols * sub
    const h = rows * sub
    if (w !== this.sw || h !== this.sh) {
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFb)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneTex, 0)
      this.sw = w
      this.sh = h
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFb)
    gl.viewport(0, 0, w, h)
  }

  // Resume la escena en celdas sobre el lienzo (cols x rows) y lo lee en out
  finish(cols: number, rows: number, sub: number, out: Uint8Array) {
    const { gl, loc } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    if (gl.canvas.width !== cols || gl.canvas.height !== rows) {
      gl.canvas.width = cols
      gl.canvas.height = rows
    }
    gl.viewport(0, 0, cols, rows)
    gl.useProgram(this.prog)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex)
    gl.uniform1i(loc.uScene, 0)
    gl.uniform2f(loc.uSrc, cols * sub, rows * sub)
    gl.uniform1f(loc.uSub, sub)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.readPixels(0, 0, cols, rows, gl.RGBA, gl.UNSIGNED_BYTE, out)
  }
}

const passes = new WeakMap<GL, EdgePass>()
export const edgePass = (gl: GL) => {
  let p = passes.get(gl)
  if (!p) {
    p = new EdgePass(gl)
    passes.set(gl, p)
  }
  return p
}
