/* The Front in MOVE THE FRONT: the game's war table, live in the page. The map plate is raised into relief by the game's
   own bake (the same file /front/ draws: ridged crests read from the painting's own light), each house's ground is one tinted region, a glowing line runs where two houses meet, and the week's
   battlegrounds pulse. It handles like a globe viewer: drag the ground to move it, Shift- or right-drag to turn and tilt,
   scroll toward a point to zoom there; on a phone two fingers move it in the page and one finger moves it full screen.
   Past the plate's edges everything lies in shadow. The board is the opening war, every house on its home ground: no live war
   is shown. Without WebGL2 the picture stays. */
(function () {
  "use strict";
  const root = document.querySelector("[data-frontmap]");
  if (!root || !("IntersectionObserver" in window)) return;
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const touch = window.matchMedia("(pointer: coarse)").matches;
  const BASE = "/assets/front/";

  // FrontFactions: KSH, VLD, DRV, GRV, SHV. MapContent is 2200 × 1200 px; the 125 grids span FrontHexLayout.FieldFraction
  // of it; a map pixel is 0.01 world units and the highest ground 0.95 (FrontDioramaHeight).
  const HOUSES = [[200, 50, 60], [212, 162, 60], [74, 144, 194], [99, 217, 122], [142, 91, 194]];
  const MAP_W = 2200, MAP_H = 1200, FIELD = 0.85, WORLD = 0.01, RELIEF = 0.95, SQ3 = 1.7320508;
  const W = MAP_W * WORLD, D = MAP_H * WORLD, GROUND = 0.25 * RELIEF;   // the plate in world units; the plane a hand holds
  // The plate's relief mesh: 22,000 vertices on a phone, the game's phone budget; the light reads the bake at its own
  // resolution, so a crest is as sharp as the bake whatever the mesh.
  const COLS = touch ? 200 : 300, ROWS = touch ? 110 : 164;
  // The painting's sun, up and to the right of the picture (FrontDiorama.SunDirection): 38° north of east, 51° high.
  const SUN = [0.496, 0.777, 0.387];
  // The land past the plate's edge, in world units out from it: a few rings of widening steps, so the mesh stays small.
  const BEYOND = [0.25, 0.6, 1.1, 1.8, 2.8, 4.2, 6.2, 9, 13, 19];
  const TILT = 35, TILT_MIN = 8, TILT_MAX = 72, FOV = 30, ZOOM_MIN = 0.8, ZOOM_MAX = 6, DEG = Math.PI / 180;
  const SHADOW = [0.027, 0.035, 0.051];   // the page's own ground (#07090d): past the plate there is only this
  const REST_ZOOM = 1.2;                 // at rest the plate fills the frame

  // ── the board: q, r, house; laid out exactly as the game lays it (FrontHexLayout) ──────────────────────────────
  function layOut(hexes) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, q0 = 1e9, q1 = -1e9, r0 = 1e9, r1 = -1e9;
    for (const [q, r] of hexes) {
      const ux = SQ3 * (q + r * 0.5), uy = 1.5 * r;
      x0 = Math.min(x0, ux); x1 = Math.max(x1, ux); y0 = Math.min(y0, uy); y1 = Math.max(y1, uy);
      q0 = Math.min(q0, q); q1 = Math.max(q1, q); r0 = Math.min(r0, r); r1 = Math.max(r1, r);
    }
    const R = Math.min(FIELD * MAP_W / (x1 - x0 + SQ3), FIELD * MAP_H / (y1 - y0 + 2));
    return { R, cx: (x0 + x1) * 0.5 * R, cy: (y0 + y1) * 0.5 * R, q0, r0, qs: q1 - q0 + 1, rs: r1 - r0 + 1 };
  }
  const STEPS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

  // Three battlegrounds to pulse: the grids where the most houses meet (illustrative; the game picks them by vote).
  function battlegrounds(hexes) {
    const at = new Map(hexes.map(([q, r, h]) => [q + "," + r, h]));
    const scored = hexes.map(([q, r, h], i) => {
      const others = new Set();
      for (const [dq, dr] of STEPS) { const n = at.get((q + dq) + "," + (r + dr)); if (n !== undefined && n !== h) others.add(n); }
      return { i, score: others.size * 10 + ((i * 37) % 7) };
    }).filter((s) => s.score >= 10).sort((a, b) => b.score - a.score);
    const picked = [];
    for (const s of scored) if (picked.length < 3 && picked.every((p) => Math.abs(p - s.i) > 6)) picked.push(s.i);
    return picked;
  }

  // ── shaders: the game's FrontDiorama.shader, in GLSL, with the plate's rim falling into shadow and a distance haze ─
  const VS = `#version 300 es
    in vec3 aPos; in vec3 aNormal; in vec2 aUv;
    uniform mat4 uViewProj; uniform vec3 uEye;
    out vec2 vUv; out vec3 vNormal; out float vDist;
    void main() { vUv = aUv; vNormal = aNormal; vDist = distance(aPos, uEye); gl_Position = uViewProj * vec4(aPos, 1.0); }`;
  const FS = `#version 300 es
    precision highp float; precision highp int;
    in vec2 vUv; in vec3 vNormal; in float vDist; out vec4 outColor;
    uniform sampler2D uPlate, uHeight, uLava; uniform highp sampler2D uLookup, uState;
    uniform vec4 uLayout;   // radius, centre x, centre y, time
    uniform vec4 uRange;    // q0, r0, q span, r span
    uniform vec2 uFog;      // where the distance haze begins and where it is whole
    const vec3 SHADOW = vec3(${SHADOW.join(", ")});
    const int NQ[6] = int[6](1, 1, 0, -1, -1, 0);
    const int NR[6] = int[6](0, -1, -1, 0, 1, 1);
    const vec2 NN[6] = vec2[6](vec2(1.0, 0.0), vec2(0.5, -0.8660254), vec2(-0.5, -0.8660254),
                               vec2(-1.0, 0.0), vec2(-0.5, 0.8660254), vec2(0.5, 0.8660254));
    int hexAt(int q, int r) {
      int x = q - int(uRange.x), y = r - int(uRange.y);
      if (x < 0 || y < 0 || x >= int(uRange.z) || y >= int(uRange.w)) return -1;
      return int(texelFetch(uLookup, ivec2(x, y), 0).r * 255.0 + 0.5) - 1;
    }
    vec4 state(int id, int row) { return texelFetch(uState, ivec2(id, row), 0); }
    int houseOf(int id) { return id < 0 ? -2 : int(state(id, 0).a * 255.0 + 0.5) - 1; }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float ht(vec2 uv) { return texture(uHeight, vec2(uv.x, 1.0 - uv.y)).r; }   // the bake's row 0 is the plate's top
    float noise(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
    void main() {
      float t = uLayout.w;
      // Nothing is drawn past the plate: its rim darkens into the page's shadow over its outer 3.5%, and past the edge there
      // is only the shadow. The picture is read three texels in from its edges: its outermost columns are near black.
      vec2 inUv = clamp(vUv, 0.0, 1.0), inset = 3.0 / vec2(textureSize(uPlate, 0));
      float rim = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y) * ${MAP_H}.0 / ${MAP_W}.0);   // plate widths to the edge, < 0 past it
      vec3 col = texture(uPlate, mix(inset, 1.0 - inset, inUv)).rgb;
      // The slope over the game's own step (FrontDiorama.BuildMesh, 480 × 262 on a desktop), so the light here is the war
      // table's: a finer step reads every crest steeper and darkens the whole map.
      vec2 e = vec2(1.0 / 479.0, 1.0 / 261.0);
      float sx = (ht(inUv + vec2(e.x, 0.0)) - ht(inUv - vec2(e.x, 0.0))) * ${RELIEF.toFixed(4)} / (2.0 * e.x * ${W.toFixed(4)});
      float sz = (ht(inUv + vec2(0.0, e.y)) - ht(inUv - vec2(0.0, e.y))) * ${RELIEF.toFixed(4)} / (2.0 * e.y * ${D.toFixed(4)});
      col *= 0.62 + 0.55 * clamp(dot(normalize(vec3(-sx, 1.0, -sz)), vec3(${SUN.join(", ")})), 0.0, 1.0);
      vec2 c = vUv * vec2(3.2, 1.75) + t * 0.012 * vec2(1.0, 0.35);
      col *= 1.0 - 0.2 * smoothstep(0.48, 0.82, noise(c) * 0.65 + noise(c * 2.3 + 7.1) * 0.35);
      float R = uLayout.x;
      vec2 p = (vUv - 0.5) * vec2(${MAP_W}.0, ${MAP_H}.0) + uLayout.yz;
      float rf = p.y / (1.5 * R), qf = p.x / (1.7320508 * R) - rf * 0.5;
      float xf = qf, zf = rf, yf = -xf - zf;
      float rx = floor(xf + 0.5), ry = floor(yf + 0.5), rz = floor(zf + 0.5);
      float dx = abs(rx - xf), dy = abs(ry - yf), dz = abs(rz - zf);
      if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
      int q = int(rx), r = int(rz), id = hexAt(q, r);
      float aa = max(max(fwidth(p.x), fwidth(p.y)), 1e-4);
      if (id >= 0) {
        vec2 d = p - vec2(1.7320508 * R * (float(q) + float(r) * 0.5), 1.5 * R * float(r));
        vec4 s0 = state(id, 0), s1 = state(id, 1);
        int h = houseOf(id);
        float half_ = 0.8660254 * R, minEdge = 1e5, minBorder = 1e5, minFront = 1e5, heat = s1.r;
        for (int k = 0; k < 6; k++) {
          float e = half_ - dot(d, NN[k]);
          minEdge = min(minEdge, e);
          int n = hexAt(q + NQ[k], r + NR[k]);
          if (houseOf(n) != h) {
            minBorder = min(minBorder, e);
            if (n >= 0 && e < minFront) { minFront = e; heat = max(s1.r, state(n, 1).r); }
          }
        }
        float rim = 1.0 - smoothstep(0.0, 0.45 * R, minBorder);
        col = mix(col, s0.rgb, 0.14 + 0.30 * rim * rim);
        col = mix(col, s0.rgb * 1.3 + 0.04, (1.0 - smoothstep(aa, 2.2 * aa, minBorder)) * 0.85);
        if (minFront < 1e4) {
          float glow = exp(-minFront / (0.16 * R)), core = 1.0 - smoothstep(0.8 * aa, 2.0 * aa, minFront);
          col += vec3(1.0, 0.55, 0.2) * (glow * (0.45 + 0.9 * heat) * (0.75 + 0.25 * sin(t * 2.2)) + core * 0.55);
        }
        if (s1.r > 0.5) {   // a battleground: a ring pulsing outward from a bright point at its centre
          float dist = length(d), wave = fract(t * 0.45);
          float ring = (1.0 - smoothstep(1.2 * aa, 3.0 * aa, abs(dist - R * (0.22 + 0.55 * wave)))) * (1.0 - wave);
          float pin = 1.0 - smoothstep(0.09 * R, 0.09 * R + 2.0 * aa, dist);
          col = mix(col, vec3(1.0, 0.55, 0.2) * 1.5, clamp(ring * 0.9 + pin * 0.85, 0.0, 1.0));
        }
      } else col *= 0.84;
      float lava = texture(uLava, vec2(inUv.x, 1.0 - inUv.y)).r;
      col += lava * vec3(1.0, 0.32, 0.06) * (0.6 + 0.4 * sin(t * 1.4 + vUv.x * 23.0 + vUv.y * 11.0));
      col = mix(col, SHADOW, smoothstep(uFog.x, uFog.y, vDist));   // the far distance, when tilted toward the horizon
      outColor = vec4(mix(SHADOW, col, smoothstep(0.0, 0.035, rim)), 1.0);
    }`;

  const canvas = document.createElement("canvas");
  canvas.className = "frontmap__canvas";
  canvas.setAttribute("aria-hidden", "true");
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
  if (!gl) { console.info("The Front's war table needs WebGL2; its picture stays."); return; }

  function program() {
    const make = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, make(gl.VERTEX_SHADER, VS)); gl.attachShader(p, make(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(p, 0, "aPos"); gl.bindAttribLocation(p, 1, "aNormal"); gl.bindAttribLocation(p, 2, "aUv");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  // ── the relief mesh, from the bake's heights, on a dark plain that runs out to the horizon ───────────────────────
  function mesh(relief) {
    const w = relief.w, h = relief.h, px = relief.heights;
    const sample = (u, v) => {   // bilinear, u right, v up; the image's row 0 is the plate's top
      // two texels in from the bake's edges, which read low, so the plate's rim has no trench
      const iu = 2 / (w - 1), iv = 2 / (h - 1);
      const x = (iu + (1 - 2 * iu) * Math.min(Math.max(u, 0), 1)) * (w - 1), y = (1 - iv - (1 - 2 * iv) * Math.min(Math.max(v, 0), 1)) * (h - 1);
      const x0 = Math.min(x | 0, w - 2), y0 = Math.min(y | 0, h - 2), fx = x - x0, fy = y - y0, i = y0 * w + x0;
      const a = px[i] + (px[i + 1] - px[i]) * fx, b = px[i + w] + (px[i + w + 1] - px[i + w]) * fx;
      return (a + (b - a) * fy) / 65535 * RELIEF;
    };
    // Off the plate the ground sinks within a unit or so to a flat plain, which the shader leaves in shadow.
    const height = (u, v) => {
      const out = Math.hypot(Math.max(-u, u - 1, 0) * W, Math.max(-v, v - 1, 0) * D);
      return sample(u, v) * Math.exp(-out / 0.5);
    };
    const axis = (n, size) => {
      const inner = Array.from({ length: n }, (_, i) => i / (n - 1));
      return [...BEYOND.slice().reverse().map((m) => -m / size), ...inner, ...BEYOND.map((m) => 1 + m / size)];
    };
    const us = axis(COLS, W), vs = axis(ROWS, D), nu = us.length, nv = vs.length;
    const du = 1 / (COLS - 1), dv = 1 / (ROWS - 1);
    const data = new Float32Array(nu * nv * 8);
    for (let j = 0, k = 0; j < nv; j++) for (let i = 0; i < nu; i++, k += 8) {
      const u = us[i], v = vs[j];
      const nx = (height(u - du, v) - height(u + du, v)) / (2 * du * W), nz = (height(u, v - dv) - height(u, v + dv)) / (2 * dv * D);
      const len = Math.hypot(nx, 1, nz);
      data.set([(u - 0.5) * W, height(u, v), (v - 0.5) * D, nx / len, 1 / len, nz / len, u, v], k);
    }
    const index = new Uint16Array((nu - 1) * (nv - 1) * 6);
    for (let j = 0, t = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) {
      const a = j * nu + i, b = a + 1, c = a + nu, d = c + 1;
      index.set([a, c, b, c, d, b], t); t += 6;
    }
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);
    for (const [loc, size, offset] of [[0, 3, 0], [1, 3, 12], [2, 2, 24]]) {
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 32, offset);
    }
    return { vao, count: index.length };
  }

  function texture(unit, source, w, h, nearest, mips) {
    const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    // An image's top row is the plate's north, and v runs north (up) here, as in the game: flip images on upload. The
    // lookup and state tables are indexed by texel, so they go up as they are.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, !w);
    if (w) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    const f = nearest ? gl.NEAREST : gl.LINEAR;
    if (mips) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const aniso = gl.getExtension("EXT_texture_filter_anisotropic");
    if (mips && aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    return t;
  }

  // One channel of the bake, rows as stored (row 0 the plate's top), filtered: the heights (R16F) and the lava mask (R8).
  function channel(unit, internal, type, data, w, h) {
    const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RED, type, data);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    return t;
  }

  // ── the camera: a point on the ground it looks at, a heading, a tilt from straight down, and a distance ─────────
  const view = { yaw: 0, tilt: TILT, zoom: REST_ZOOM, tx: 0, tz: 0 };
  let engaged = false, full = false;
  function camera(aspect, t) {
    const idle = !engaged && !calm;   // a slow drift until a hand is on it, never under one
    const yaw = (view.yaw + (idle ? Math.sin(t * 0.027) * 1.6 : 0)) * DEG, tilt = view.tilt * DEG;
    const half = Math.tan(FOV * Math.PI / 360);
    const dist = (W * 0.5 * 1.08) / (half * Math.max(aspect, 0.9)) / view.zoom;   // the whole plate across at zoom 1
    const tx = view.tx + (idle ? Math.sin(t * 0.045) * 0.15 : 0), tz = view.tz + (idle ? Math.sin(t * 0.031 + 1.3) * 0.1 : 0);
    const ex = tx - Math.sin(yaw) * Math.sin(tilt) * dist, ey = GROUND + Math.cos(tilt) * dist, ez = tz - Math.cos(yaw) * Math.sin(tilt) * dist;
    // look-at (right-handed GL: the camera looks down −z; the map's north is +z in the game, so flip z)
    const f = norm([tx - ex, GROUND - ey, -(tz - ez)]), s = norm(cross(f, [0, 1, 0])), u = cross(s, f);
    const e = [ex, ey, -ez];
    const v = [s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0, -dot(s, e), -dot(u, e), dot(f, e), 1];
    const n = 0.1, far = 400, k = 1 / half;
    const pr = [k / aspect, 0, 0, 0, 0, k, 0, 0, 0, 0, (far + n) / (n - far), -1, 0, 0, 2 * far * n / (n - far), 0];
    const flip = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1];   // world z → GL −z
    return { m: mul(pr, mul(v, flip)), eye: [ex, ey, ez], dist };
  }
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  function mul(a, b) {   // column-major 4×4
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let sum = 0; for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = sum;
    }
    return o;
  }
  function invert(m) {   // column-major 4×4 inverse (cofactors)
    const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    const det = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
    return [(a11 * b11 - a12 * b10 + a13 * b09) * det, (a02 * b10 - a01 * b11 - a03 * b09) * det, (a31 * b05 - a32 * b04 + a33 * b03) * det,
      (a22 * b04 - a21 * b05 - a23 * b03) * det, (a12 * b08 - a10 * b11 - a13 * b07) * det, (a00 * b11 - a02 * b08 + a03 * b07) * det,
      (a32 * b02 - a30 * b05 - a33 * b01) * det, (a20 * b05 - a22 * b02 + a23 * b01) * det, (a10 * b10 - a11 * b08 + a13 * b06) * det,
      (a01 * b08 - a00 * b10 - a03 * b06) * det, (a30 * b04 - a31 * b02 + a33 * b00) * det, (a21 * b02 - a20 * b04 - a23 * b00) * det,
      (a11 * b07 - a10 * b09 - a12 * b06) * det, (a00 * b09 - a01 * b07 + a02 * b06) * det, (a31 * b01 - a30 * b03 - a32 * b00) * det,
      (a20 * b03 - a21 * b01 + a22 * b00) * det];
  }
  const apply = (m, x, y, z) => { const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w, w]; };

  // The ground under a point of the canvas (CSS pixels), on the plane a hand holds: [x, z], or null above the horizon.
  function pick(px, py) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return null;
    const inv = invert(camera(w / h, 0).m), x = px / w * 2 - 1, y = 1 - py / h * 2;
    const a = apply(inv, x, y, -1), b = apply(inv, x, y, 1), dy = b[1] - a[1];
    if (dy > -1e-6) return null;
    const s = (GROUND - a[1]) / dy;
    return s < 0 ? null : [a[0] + (b[0] - a[0]) * s, a[2] + (b[2] - a[2]) * s];
  }
  // Where a point of the ground lands on the canvas (CSS pixels).
  function place(x, z) {
    const w = canvas.clientWidth, h = canvas.clientHeight, c = apply(camera(w / h, 0).m, x, GROUND, z);
    return c[3] > 0 ? [(c[0] + 1) / 2 * w, (1 - c[1]) / 2 * h] : null;
  }
  function settle() {   // the point looked at stays over the plate
    view.tx = clamp(view.tx, -W / 2, W / 2); view.tz = clamp(view.tz, -D / 2, D / 2);
    view.tilt = clamp(view.tilt, TILT_MIN, TILT_MAX); view.zoom = clamp(view.zoom, ZOOM_MIN, ZOOM_MAX);
  }
  // Each move keeps the ground under the hand where the hand is: shift the look-at point by the slip.
  function hold(px, py, change) {
    const before = pick(px, py);
    change();
    settle();
    const after = before && pick(px, py);
    if (before && after) { view.tx += before[0] - after[0]; view.tz += before[1] - after[1]; settle(); }
  }
  const zoomAt = (px, py, f) => hold(px, py, () => { view.zoom *= f; });
  const turnAt = (px, py, deg) => hold(px, py, () => { view.yaw += deg; });
  function slide(fromX, fromY, toX, toY) {   // the ground under (from) is carried to (to)
    const a = pick(fromX, fromY), b = pick(toX, toY);
    if (!a || !b) return [0, 0];
    const dx = a[0] - b[0], dz = a[1] - b[1];
    view.tx += dx; view.tz += dz; settle();
    return [dx, dz];
  }

  // ── motion: a glide after a fling, and an eased return to north ──────────────────────────────────────────────
  let glide = null, tween = null, trail = [];
  function track(dx, dz) { const now = performance.now(); trail.push({ t: now, dx, dz }); while (trail.length && now - trail[0].t > 90) trail.shift(); }
  function fling() {
    const now = performance.now(), recent = trail.filter((s) => now - s.t < 90);
    trail = [];
    if (calm || recent.length < 2) return;
    const span = Math.max(16, now - recent[0].t);
    const vx = recent.reduce((s, r) => s + r.dx, 0) / span, vz = recent.reduce((s, r) => s + r.dz, 0) / span;
    if (Math.hypot(vx, vz) > 0.0005) { glide = { vx, vz }; kick(); }
  }
  function ease(to, ms) {
    let yaw = ((view.yaw % 360) + 540) % 360 - 180;
    view.yaw = yaw;
    if (calm) { Object.assign(view, to); settle(); kick(); return; }
    tween = { from: { yaw, tilt: view.tilt }, to, t0: performance.now(), ms }; kick();
  }
  function step(dt) {
    if (glide) {
      view.tx += glide.vx * dt; view.tz += glide.vz * dt;   // the look-at point keeps the drift the hand gave it
      const before = [view.tx, view.tz]; settle();
      if (before[0] !== view.tx) glide.vx = 0; if (before[1] !== view.tz) glide.vz = 0;
      const k = Math.exp(-dt / 320); glide.vx *= k; glide.vz *= k;
      if (Math.hypot(glide.vx, glide.vz) < 0.00004) glide = null;
    }
    if (tween) {
      const p = Math.min(1, (performance.now() - tween.t0) / tween.ms), e = 1 - Math.pow(1 - p, 3);
      for (const key of Object.keys(tween.to)) view[key] = tween.from[key] + (tween.to[key] - tween.from[key]) * e;
      if (p >= 1) tween = null;
    }
  }
  const stopMotion = () => { glide = null; tween = null; trail = []; };

  // ── the stage: the canvas, its hint, the compass and the full-screen door ────────────────────────────────────
  const stage = document.createElement("div");
  stage.className = "frontmap__stage";
  const hint = document.createElement("div");
  hint.className = "frontmap__hint";
  const tools = document.createElement("div");
  tools.className = "frontmap__tools";
  const button = (label, svg) => { const b = document.createElement("button"); b.type = "button"; b.className = "frontmap__tool";
    b.setAttribute("aria-label", label); b.title = label; b.innerHTML = svg; return b; };
  const compass = button("Face north", '<svg viewBox="0 0 24 24" aria-hidden="true"><g class="frontmap__needle"><path d="M12 3l3.2 9h-6.4z" fill="currentColor" class="frontmap__north"/><path d="M12 21l-3.2-9h6.4z" fill="currentColor" opacity="0.35"/></g></svg>');
  const opener = button("Explore full screen", '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>');
  const closer = button("Close the war table", '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 6l12 12M18 6L6 18"/></svg>');
  closer.classList.add("frontmap__close");
  tools.append(compass, opener);
  stage.append(canvas, hint, tools, closer);
  const needle = compass.querySelector(".frontmap__needle");

  const WORDS = {
    rest: touch ? "Two fingers to move the map · ⤢ to explore" : "Drag to move · Shift-drag to turn and tilt · Scroll to zoom",
    wheel: "Click the map, then scroll to zoom",
    fingers: "Use two fingers to move the map, or ⤢ to explore",
    full: touch ? "Drag to move · Pinch to zoom · Twist to turn · Two fingers up or down to tilt"
                : "Drag to move · Shift-drag to turn and tilt · Scroll to zoom · Esc to close",
  };
  let hintTimer = 0;
  function say(words, ms) {
    hint.textContent = WORDS[words]; hint.classList.add("is-shown");
    clearTimeout(hintTimer);
    if (ms) hintTimer = setTimeout(() => hint.classList.remove("is-shown"), ms);
  }
  function engage() { if (!engaged) { engaged = true; root.classList.add("is-engaged"); hint.classList.remove("is-shown"); } }

  compass.addEventListener("click", () => { engage(); stopMotion(); ease({ yaw: 0, tilt: TILT }, 650); });
  let overlay = null, ioVisible = false;
  const shown = () => full || ioVisible;
  function openFull() {
    if (full) return;
    overlay = document.createElement("div");
    overlay.className = "frontmap-full";
    overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-modal", "true"); overlay.setAttribute("aria-label", "The Front's war table");
    document.body.appendChild(overlay); overlay.appendChild(stage);
    document.documentElement.classList.add("has-frontmap-full");
    full = true; engaged = true; root.classList.add("is-engaged");
    if (canvas.clientWidth / Math.max(1, canvas.clientHeight) < 0.8) { view.zoom = Math.max(view.zoom, 1.8); settle(); }   // a tall phone: closer in
    say("full", 4200); closer.focus({ preventScroll: true }); kick();
  }
  function closeFull() {
    if (!full) return;
    full = false; stopMotion(); dropTouches();
    root.appendChild(stage); overlay.remove(); overlay = null;
    document.documentElement.classList.remove("has-frontmap-full");
    hint.classList.remove("is-shown"); opener.focus({ preventScroll: true }); kick();
  }
  opener.addEventListener("click", openFull);
  closer.addEventListener("click", closeFull);
  document.addEventListener("keydown", (e) => { if (full && e.key === "Escape") closeFull(); });

  // ── the hand on it: a mouse or pen ───────────────────────────────────────────────────────────────────────────
  const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  let mouse = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") return;
    engage(); stopMotion();
    const [x, y] = local(e);
    mouse = { id: e.pointerId, x, y, turn: e.button !== 0 || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey };
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* a pointer already gone keeps no capture */ }
    stage.classList.add("is-dragging"); kick();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!mouse || e.pointerId !== mouse.id) return;
    const [x, y] = local(e);
    if (mouse.turn) { view.yaw += (x - mouse.x) * 0.3; view.tilt -= (y - mouse.y) * 0.25; settle(); }
    else { const [dx, dz] = slide(mouse.x, mouse.y, x, y); track(dx, dz); }
    mouse.x = x; mouse.y = y; kick();
  });
  const letGo = (e) => {
    if (!mouse || e.pointerId !== mouse.id) return;
    if (!mouse.turn) fling();
    mouse = null; stage.classList.remove("is-dragging"); kick();
  };
  canvas.addEventListener("pointerup", letGo); canvas.addEventListener("pointercancel", letGo);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  // The wheel zooms once the map has been clicked (or with Ctrl or ⌘, as a trackpad pinch sends), so a reader scrolling
  // past is never caught by it.
  canvas.addEventListener("wheel", (e) => {
    if (!engaged && !e.ctrlKey && !e.metaKey) { say("wheel", 1800); return; }
    e.preventDefault(); engage(); stopMotion();
    const [x, y] = local(e);
    zoomAt(x, y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))); kick();
  }, { passive: false });
  canvas.addEventListener("dblclick", (e) => { engage(); stopMotion(); const [x, y] = local(e); zoomAt(x, y, 1.8); kick(); });

  // ── the hand on it: fingers. In the page two fingers move it (one still scrolls); full screen, one finger does. ──
  const fingers = new Map();
  let pair = null, lone = null;
  const at = (t) => { const r = canvas.getBoundingClientRect(); return [t.clientX - r.left, t.clientY - r.top]; };
  function dropTouches() { fingers.clear(); pair = null; lone = null; }
  canvas.addEventListener("touchstart", (e) => {
    for (const t of e.changedTouches) fingers.set(t.identifier, at(t));
    stopMotion(); pair = null; lone = null;
    if (fingers.size >= 2 || full) { e.preventDefault(); engage(); stage.classList.add("is-dragging"); }
    if (fingers.size === 1) lone = [...fingers.values()][0].slice();
    kick();
  }, { passive: false });
  canvas.addEventListener("touchmove", (e) => {
    for (const t of e.changedTouches) if (fingers.has(t.identifier)) fingers.set(t.identifier, at(t));
    if (fingers.size >= 2) {
      e.preventDefault();
      const [a, b] = [...fingers.values()];
      const now = { mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, d: Math.hypot(b[0] - a[0], b[1] - a[1]), ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
      if (pair) {
        let turn = now.ang - pair.ang; if (turn > Math.PI) turn -= 2 * Math.PI; if (turn < -Math.PI) turn += 2 * Math.PI;
        zoomAt(pair.mx, pair.my, now.d / Math.max(1, pair.d));
        turnAt(pair.mx, pair.my, -turn / DEG);
        if (full) { view.tilt -= (now.my - pair.my) * 0.3; settle(); }   // full screen: two fingers up or down tilt
        else slide(pair.mx, pair.my, now.mx, now.my);                     // in the page: two fingers carry the ground
      }
      pair = now; kick();
    } else if (fingers.size === 1 && full && lone) {
      e.preventDefault();
      const p = [...fingers.values()][0];
      const [dx, dz] = slide(lone[0], lone[1], p[0], p[1]); track(dx, dz);
      lone = p.slice(); kick();
    } else if (fingers.size === 1 && !full && lone) {
      const p = [...fingers.values()][0];
      if (Math.hypot(p[0] - lone[0], p[1] - lone[1]) > 14) say("fingers", 1600);
    }
  }, { passive: false });
  const lift = (e) => {
    const wasLone = fingers.size === 1 && full;
    for (const t of e.changedTouches) fingers.delete(t.identifier);
    if (wasLone && fingers.size === 0) fling();
    pair = null;
    lone = fingers.size === 1 ? [...fingers.values()][0].slice() : null;
    if (!fingers.size) stage.classList.remove("is-dragging");
    kick();
  };
  canvas.addEventListener("touchend", lift); canvas.addEventListener("touchcancel", lift);

  // ── start when near, draw while seen ─────────────────────────────────────────────────────────────────────────
  let started = false, frame = 0, draw = null, last = 0;
  async function start() {
    started = true;
    const load = (src) => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = BASE + src; });
    try {
      const [plate, packed, board] = await Promise.all([load("plate.webp"),
        fetch(BASE + "relief.bin").then((r) => { if (!r.ok) throw new Error("relief " + r.status); return r.arrayBuffer(); }),
        fetch(BASE + "board.json").then((r) => r.json())]);
      // The game's bake, gzipped: 'VFH1', width, height, uint16 heights, uint8 lava mask. A server may already have unzipped
      // it on the way, so only gzip's own bytes go through the unzipper.
      let raw = new Uint8Array(packed);
      if (raw[0] === 0x1f && raw[1] === 0x8b) raw = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
      if (String.fromCharCode(raw[0], raw[1], raw[2], raw[3]) !== "VFH1") throw new Error("the relief is not a VFH1 bake");
      const head = new DataView(raw.buffer, raw.byteOffset, 12), bw = head.getInt32(4, true), bh = head.getInt32(8, true);
      const reliefPx = { w: bw, h: bh, heights: new Uint16Array(raw.buffer.slice(raw.byteOffset + 12, raw.byteOffset + 12 + bw * bh * 2)) };
      const lavaMask = raw.slice(12 + bw * bh * 2, 12 + bw * bh * 3);
      const hexes = board.hexes, L = layOut(hexes), fights = battlegrounds(hexes);
      const prog = program(); gl.useProgram(prog);
      const terrain = mesh(reliefPx);
      texture(0, plate, 0, 0, false, true);
      const hf = new Float32Array(bw * bh); for (let i = 0; i < hf.length; i++) hf[i] = reliefPx.heights[i] / 65535;
      channel(1, gl.R16F, gl.FLOAT, hf, bw, bh);
      channel(5, gl.R8, gl.UNSIGNED_BYTE, lavaMask, bw, bh);
      const lookup = new Uint8Array(L.qs * L.rs * 4);
      hexes.forEach(([q, r], i) => { lookup[((r - L.r0) * L.qs + (q - L.q0)) * 4] = i + 1; });
      texture(2, lookup, L.qs, L.rs, true, false);
      const state = new Uint8Array(128 * 2 * 4);
      hexes.forEach(([, , h], i) => { state.set([...HOUSES[h], h + 1], i * 4); });
      fights.forEach((i) => { state[(128 + i) * 4] = 255; });
      texture(3, state, 128, 2, true, false);
      for (const [name, unit] of [["uPlate", 0], ["uHeight", 1], ["uLookup", 2], ["uState", 3], ["uLava", 5]]) gl.uniform1i(gl.getUniformLocation(prog, name), unit);
      gl.uniform4f(gl.getUniformLocation(prog, "uRange"), L.q0, L.r0, L.qs, L.rs);
      const uLayout = gl.getUniformLocation(prog, "uLayout"), uViewProj = gl.getUniformLocation(prog, "uViewProj");
      const uEye = gl.getUniformLocation(prog, "uEye"), uFog = gl.getUniformLocation(prog, "uFog");
      gl.enable(gl.DEPTH_TEST);
      const t0 = performance.now();
      let heading = null;
      draw = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
        if (!w || !h) return;
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        gl.viewport(0, 0, w, h);
        gl.clearColor(SHADOW[0], SHADOW[1], SHADOW[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        const t = calm ? 0 : (performance.now() - t0) / 1000;
        const cam = camera(w / h, t);
        gl.uniform4f(uLayout, L.R, L.cx, L.cy, t);
        gl.uniformMatrix4fv(uViewProj, false, cam.m);
        gl.uniform3f(uEye, cam.eye[0], cam.eye[1], cam.eye[2]);
        gl.uniform2f(uFog, cam.dist * 1.25, cam.dist * 2.4);
        gl.bindVertexArray(terrain.vao);
        gl.drawElements(gl.TRIANGLES, terrain.count, gl.UNSIGNED_SHORT, 0);
        // the compass points where north lies on the screen
        const a = place(view.tx, view.tz), b = place(view.tx, view.tz + 1);
        if (a && b) {
          const deg = Math.round(Math.atan2(b[0] - a[0], a[1] - b[1]) / DEG);
          if (deg !== heading) { heading = deg; needle.style.transform = `rotate(${deg}deg)`; compass.classList.toggle("is-north", Math.abs(deg) < 2); }
        }
      };
      root.appendChild(stage);
      say("rest");
      draw();
      root.classList.add("is-map");
      kick();
    } catch (err) {
      stage.remove();   // the picture stays
      console.warn("The Front's war table did not start; its picture stays.", err);
    }
  }
  const moving = () => glide || tween || mouse || fingers.size;
  function loop(now) {
    frame = 0;
    if (!draw || !shown()) return;
    const dt = last ? Math.min(50, now - last) : 16; last = now;
    step(dt);
    draw();
    if (!calm || moving()) frame = requestAnimationFrame(loop); else last = 0;
  }
  function kick() { if (!frame && draw && shown()) frame = requestAnimationFrame(loop); }
  window.addEventListener("resize", kick);

  new IntersectionObserver((entries) => {
    for (const e of entries) {
      ioVisible = e.isIntersecting;
      if (ioVisible && !started) start();
      kick();
    }
  }, { rootMargin: "200px 0px" }).observe(root);
})();
