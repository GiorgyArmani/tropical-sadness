// Motor · letras en la GPU (idea de AcerolaFX): en vez de escribir miles de tiras de texto con
// fillText (lo más caro del cuadro, sobre todo en el celular), la película arma una imagen chiquita
// con un píxel por celda (RGB = color, A = qué letra) y acá una sola pasada de la GPU estampa cada
// letra desde un atlas: una imagen con todos los caracteres ya dibujados con la misma tipografía.
//
// Si el navegador no da este segundo WebGL, o lo pierde (el celular puede cortarlo por memoria),
// ok queda en false y la película vuelve a escribir con fillText mientras tanto.

type GL = WebGLRenderingContext

const VERT = "attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }"

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uCells; // una celda por píxel: RGB color, A número de letra (0 = vacía)
uniform sampler2D uAtlas; // las letras en fila, cada una en su casillero
uniform vec2 uGrid; // columnas y filas
uniform vec2 uCell; // tamaño de una celda en píxeles del lienzo
uniform float uH; // alto del lienzo
uniform vec2 uAtlasSize;
uniform float uSlot; // ancho del casillero de cada letra en el atlas
void main() {
  vec2 p = vec2(gl_FragCoord.x, uH - gl_FragCoord.y); // desde arriba, como el texto
  vec2 cell = floor(p / uCell);
  vec4 c = texture2D(uCells, (cell + 0.5) / uGrid);
  float g = floor(c.a * 255.0 + 0.5);
  vec2 local = p - cell * uCell;
  float cov = texture2D(uAtlas, vec2(g * uSlot + 1.0 + local.x, local.y) / uAtlasSize).a;
  if (g < 0.5) cov = 0.0;
  gl_FragColor = vec4(c.rgb * cov, cov);
}
`

type Size = { cols: number; rows: number; W: number; H: number; cw: number; lh: number; font: string; glyphs: string }

export class GlyphGL {
  ok = false
  private gl: GL | null
  private prog: WebGLProgram | null = null
  private loc: Record<string, WebGLUniformLocation | null> = {}
  private cellsTex: WebGLTexture | null = null
  private atlasTex: WebGLTexture | null = null
  private size: Size | null = null
  private sized = false

  constructor(readonly canvas: HTMLCanvasElement) {
    this.gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false })
    if (!this.gl) return
    canvas.addEventListener("webglcontextlost", this.onLost)
    canvas.addEventListener("webglcontextrestored", this.onRestored)
    this.init()
  }

  private onLost = (e: Event) => {
    e.preventDefault() // así el navegador lo devuelve cuando puede
    this.ok = false
  }

  private onRestored = () => {
    this.init()
    this.sized = false
  }

  private init() {
    const gl = this.gl!
    if (gl.isContextLost()) return // vuelve en onRestored
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
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("[ascii3d] letras:", gl.getProgramInfoLog(prog))
      return
    }
    this.prog = prog
    gl.useProgram(prog)
    this.loc = Object.fromEntries(
      ["uCells", "uAtlas", "uGrid", "uCell", "uH", "uAtlasSize", "uSlot"].map((n) => [n, gl.getUniformLocation(prog, n)]),
    )
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    const tex = (unit: number, filter: number) => {
      const t = gl.createTexture()!
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      return t
    }
    this.cellsTex = tex(0, gl.NEAREST)
    this.atlasTex = tex(1, gl.LINEAR)
    gl.uniform1i(this.loc.uCells, 0)
    gl.uniform1i(this.loc.uAtlas, 1)
    this.ok = true
  }

  // El lienzo a la medida de la pantalla y el atlas con la letra del tamaño actual
  resize(s: Size) {
    this.size = s
    this.sized = false
    if (this.ok) this.apply()
  }

  private apply() {
    const gl = this.gl!
    const s = this.size!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const canvas = this.canvas
    canvas.width = Math.round(s.W * dpr)
    canvas.height = Math.round(s.H * dpr)
    const kx = canvas.width / s.W
    const ky = canvas.height / s.H
    const cwd = s.cw * kx
    const lhd = s.lh * ky
    // El atlas: cada letra en su casillero, con un píxel de aire a cada lado para que el filtro no
    // mezcle letras vecinas
    const slot = Math.ceil(cwd) + 2
    const aw = slot * s.glyphs.length
    const ah = Math.ceil(lhd) + 1
    const atlas = document.createElement("canvas")
    atlas.width = aw
    atlas.height = ah
    const a = atlas.getContext("2d")!
    a.setTransform(kx, 0, 0, ky, 0, 0)
    a.font = s.font
    a.textBaseline = "top"
    a.fillStyle = "#fff"
    for (let i = 1; i < s.glyphs.length; i++) a.fillText(s.glyphs[i], (i * slot + 1) / kx, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas)
    atlas.width = atlas.height = 0 // ya está en la GPU: se suelta (el iPhone tarda en liberar lienzos)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.cellsTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, s.cols, s.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.uniform2f(this.loc.uGrid, s.cols, s.rows)
    gl.uniform2f(this.loc.uCell, cwd, lhd)
    gl.uniform1f(this.loc.uH, canvas.height)
    gl.uniform2f(this.loc.uAtlasSize, aw, ah)
    gl.uniform1f(this.loc.uSlot, slot)
    gl.viewport(0, 0, canvas.width, canvas.height)
    this.sized = true
  }

  // Dibuja las celdas (cols * rows * 4, filas de arriba hacia abajo). Devuelve false si no pudo
  draw(cells: Uint8Array) {
    if (!this.ok || !this.size) return false
    if (!this.sized) this.apply()
    const gl = this.gl!
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.cellsTex)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.size.cols, this.size.rows, gl.RGBA, gl.UNSIGNED_BYTE, cells)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    return true
  }

  clear() {
    if (!this.ok) return
    const gl = this.gl!
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  // Suelta lo propio. El contexto no se corta: es del lienzo de la página, y si React vuelve a montar
  // el motor sobre el mismo lienzo, recibiría el contexto muerto
  dispose() {
    this.canvas.removeEventListener("webglcontextlost", this.onLost)
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored)
    const gl = this.gl
    if (gl && !gl.isContextLost()) {
      gl.deleteTexture(this.cellsTex)
      gl.deleteTexture(this.atlasTex)
      gl.deleteProgram(this.prog)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
    }
    this.ok = false
  }
}
