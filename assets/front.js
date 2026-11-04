/* The Front in MOVE THE LINE: the game's war table, live in the page. The map plate is raised into relief by the game's
   own bake, each house's ground is one tinted region, a glowing line runs where two houses meet, and the week's
   battlegrounds pulse. Drag to turn it, pinch or scroll to zoom, two fingers (or a right-drag) to move across it. The
   board is the opening war, every house on its home ground: no live war is shown. Without WebGL2 the picture stays. */
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
  const COLS = 200, ROWS = 110;                       // the relief mesh: 22,000 vertices, the game's phone budget
  const TILT = 35, TILT_NEAR = 52, FOV = 30, ZOOM_IN = 4;

  const canvas = document.createElement("canvas");
  canvas.className = "frontmap__canvas";
  canvas.setAttribute("aria-hidden", "true");
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
  if (!gl) { console.info("The Front's war table needs WebGL2; its picture stays."); return; }

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
    const at = new Map(hexes.map(([q, r, h], i) => [q + "," + r, h]));
    const scored = hexes.map(([q, r, h], i) => {
      const others = new Set();
      for (const [dq, dr] of STEPS) { const n = at.get((q + dq) + "," + (r + dr)); if (n !== undefined && n !== h) others.add(n); }
      return { i, score: others.size * 10 + ((i * 37) % 7) };
    }).filter((s) => s.score >= 10).sort((a, b) => b.score - a.score);
    const picked = [];
    for (const s of scored) if (picked.length < 3 && picked.every((p) => Math.abs(p - s.i) > 6)) picked.push(s.i);
    return picked;
  }

  // ── shaders: the game's FrontDiorama.shader, in GLSL ──────────────────────────────────────────────────────────
  const VS = `#version 300 es
    in vec3 aPos; in vec3 aNormal; in vec2 aUv;
    uniform mat4 uViewProj;
    out vec2 vUv; out vec3 vNormal;
    void main() { vUv = aUv; vNormal = aNormal; gl_Position = uViewProj * vec4(aPos, 1.0); }`;
  const FS = `#version 300 es
    precision highp float; precision highp int;
    in vec2 vUv; in vec3 vNormal; out vec4 outColor;
    uniform sampler2D uPlate, uRelief; uniform highp sampler2D uLookup, uState;
    uniform vec4 uLayout;   // radius, centre x, centre y, time
    uniform vec4 uRange;    // q0, r0, q span, r span
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
    float noise(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
    void main() {
      float t = uLayout.w;
      vec3 col = texture(uPlate, vUv).rgb;
      col *= 0.62 + 0.55 * clamp(dot(normalize(vNormal), normalize(vec3(-0.45, 0.8, 0.4))), 0.0, 1.0);
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
      vec2 relief = texture(uRelief, vUv).rg;
      col += relief.g * vec3(1.0, 0.32, 0.06) * (0.6 + 0.4 * sin(t * 1.4 + vUv.x * 23.0 + vUv.y * 11.0));
      outColor = vec4(col, 1.0);
    }`;

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

  // ── the relief mesh, from the bake's red channel ─────────────────────────────────────────────────────────────
  function mesh(relief) {
    const w = relief.width, h = relief.height, px = relief.data;
    const sample = (u, v) => {   // bilinear, u right, v up; the image's row 0 is the plate's top
      const x = Math.min(Math.max(u, 0), 1) * (w - 1), y = (1 - Math.min(Math.max(v, 0), 1)) * (h - 1);
      const x0 = Math.min(x | 0, w - 2), y0 = Math.min(y | 0, h - 2), fx = x - x0, fy = y - y0, i = (y0 * w + x0) * 4;
      const a = px[i] + (px[i + 4] - px[i]) * fx, b = px[i + w * 4] + (px[i + w * 4 + 4] - px[i + w * 4]) * fx;
      return (a + (b - a) * fy) / 255 * RELIEF;
    };
    const W = MAP_W * WORLD, D = MAP_H * WORLD, du = 1 / (COLS - 1), dv = 1 / (ROWS - 1);
    const data = new Float32Array(COLS * ROWS * 8);
    for (let j = 0, k = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++, k += 8) {
      const u = i * du, v = j * dv;
      const nx = (sample(u - du, v) - sample(u + du, v)) / (2 * du * W), nz = (sample(u, v - dv) - sample(u, v + dv)) / (2 * dv * D);
      const len = Math.hypot(nx, 1, nz);
      data.set([(u - 0.5) * W, sample(u, v), (v - 0.5) * D, nx / len, 1 / len, nz / len, u, v], k);
    }
    const index = new Uint16Array((COLS - 1) * (ROWS - 1) * 6);
    for (let j = 0, t = 0; j < ROWS - 1; j++) for (let i = 0; i < COLS - 1; i++) {
      const a = j * COLS + i, b = a + 1, c = a + COLS, d = c + 1;
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

  // ── the camera ───────────────────────────────────────────────────────────────────────────────────────────────
  const view = { yaw: 0, zoom: 1, tx: 0, tz: 0 };
  function viewProj(aspect, t) {
    const near = Math.min(1, (view.zoom - 1) / (ZOOM_IN - 1));
    const tilt = (TILT + (TILT_NEAR - TILT) * near) * Math.PI / 180;
    const sway = calm ? 0 : Math.sin(t * 0.027) * 1.6 / view.zoom;
    const yaw = (view.yaw + sway) * Math.PI / 180;
    const half = Math.tan(FOV * Math.PI / 360);
    const dist = (MAP_W * WORLD * 0.5 * 1.08) / (half * aspect) / view.zoom;   // the whole map across at zoom 1
    const tx = view.tx + (calm ? 0 : Math.sin(t * 0.045) * 0.15 / view.zoom), tz = view.tz + (calm ? 0 : Math.sin(t * 0.031 + 1.3) * 0.1 / view.zoom);
    const ty = 0.25 * RELIEF;
    const ex = tx - Math.sin(yaw) * Math.sin(tilt) * dist, ey = ty + Math.cos(tilt) * dist, ez = tz - Math.cos(yaw) * Math.sin(tilt) * dist;
    // look-at (right-handed GL: the camera looks down −z; the map's north is +z in the game, so flip z)
    const f = norm([tx - ex, ty - ey, -(tz - ez)]), s = norm(cross(f, [0, 1, 0])), u = cross(s, f);
    const e = [ex, ey, -ez];
    const v = [s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0,
      -dot(s, e), -dot(u, e), dot(f, e), 1];
    const n = 0.1, far = 200, k = 1 / half;
    const pr = [k / aspect, 0, 0, 0, 0, k, 0, 0, 0, 0, (far + n) / (n - far), -1, 0, 0, 2 * far * n / (n - far), 0];
    const flip = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1];   // world z → GL −z
    return mul(pr, mul(v, flip));
  }
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
  function mul(a, b) {   // column-major 4×4
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let sum = 0; for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = sum;
    }
    return o;
  }

  // ── the hand on it ───────────────────────────────────────────────────────────────────────────────────────────
  const pointers = new Map();
  let lastPair = null, engaged = false;
  function pan(dxPx, dyPx) {   // a drag carries the ground under the finger along the camera's own axes
    const scale = (MAP_W * WORLD * 1.08 / canvas.clientWidth) / view.zoom, y = view.yaw * Math.PI / 180;
    const c = Math.cos(y), s = Math.sin(y);
    view.tx -= (dxPx * c - dyPx * s) * scale;
    view.tz += (dxPx * s + dyPx * c) * scale;
    view.tx = Math.max(-11, Math.min(11, view.tx)); view.tz = Math.max(-6, Math.min(6, view.tz));
  }
  function zoomBy(f) { view.zoom = Math.max(1, Math.min(ZOOM_IN, view.zoom * f)); if (view.zoom === 1) { view.tx *= 0.5; view.tz *= 0.5; } }
  function engage() { if (!engaged) { engaged = true; root.classList.add("is-engaged"); } }
  canvas.addEventListener("pointerdown", (e) => { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button }); canvas.setPointerCapture(e.pointerId); engage(); });
  canvas.addEventListener("pointermove", (e) => {
    const p = pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const pair = { d: Math.hypot(b.x - a.x, b.y - a.y), ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      if (lastPair) {
        zoomBy(pair.d / Math.max(1, lastPair.d));
        let turn = pair.ang - lastPair.ang; if (turn > Math.PI) turn -= 2 * Math.PI; if (turn < -Math.PI) turn += 2 * Math.PI;
        view.yaw -= turn * 180 / Math.PI;
        pan(pair.mx - lastPair.mx, pair.my - lastPair.my);
      }
      lastPair = pair;
    } else if (p.b === 2 || e.shiftKey) pan(dx, dy);
    else view.yaw += dx * 0.3;
  });
  const lift = (e) => { pointers.delete(e.pointerId); lastPair = null; };
  canvas.addEventListener("pointerup", lift); canvas.addEventListener("pointercancel", lift);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  // The wheel zooms once the map has been touched, so a reader scrolling past the page is never caught by it.
  canvas.addEventListener("wheel", (e) => { if (!engaged && !e.ctrlKey) return; e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  canvas.addEventListener("dblclick", () => { view.yaw = 0; view.zoom = 1; view.tx = 0; view.tz = 0; });

  // ── start when near, draw while seen ─────────────────────────────────────────────────────────────────────────
  let started = false, visible = false, frame = 0, draw = null;
  let hint = null;
  async function start() {
    started = true;
    const load = (src) => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = BASE + src; });
    try {
      const [plate, relief, board] = await Promise.all([load("plate.webp"), load("relief.png"),
        fetch(BASE + "board.json").then((r) => r.json())]);
      const c2 = document.createElement("canvas"); c2.width = relief.width; c2.height = relief.height;
      const g2 = c2.getContext("2d", { willReadFrequently: true }); g2.drawImage(relief, 0, 0);
      const reliefPx = g2.getImageData(0, 0, c2.width, c2.height);
      const hexes = board.hexes, L = layOut(hexes), fights = battlegrounds(hexes);
      const prog = program(); gl.useProgram(prog);
      const terrain = mesh(reliefPx);
      texture(0, plate, 0, 0, false, true);
      texture(1, relief, 0, 0, false, false);
      const lookup = new Uint8Array(L.qs * L.rs * 4);
      hexes.forEach(([q, r], i) => { lookup[((r - L.r0) * L.qs + (q - L.q0)) * 4] = i + 1; });
      texture(2, lookup, L.qs, L.rs, true, false);
      const state = new Uint8Array(128 * 2 * 4);
      hexes.forEach(([, , h], i) => { state.set([...HOUSES[h], h + 1], i * 4); });
      fights.forEach((i) => { state[(128 + i) * 4] = 255; });
      texture(3, state, 128, 2, true, false);
      for (const [name, unit] of [["uPlate", 0], ["uRelief", 1], ["uLookup", 2], ["uState", 3]]) gl.uniform1i(gl.getUniformLocation(prog, name), unit);
      gl.uniform4f(gl.getUniformLocation(prog, "uRange"), L.q0, L.r0, L.qs, L.rs);
      const uLayout = gl.getUniformLocation(prog, "uLayout"), uViewProj = gl.getUniformLocation(prog, "uViewProj");
      gl.enable(gl.DEPTH_TEST);
      const t0 = performance.now();
      draw = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        gl.viewport(0, 0, w, h);
        gl.clearColor(0.03, 0.04, 0.06, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        const t = calm ? 0 : (performance.now() - t0) / 1000;
        gl.uniform4f(uLayout, L.R, L.cx, L.cy, t);
        gl.uniformMatrix4fv(uViewProj, false, viewProj(w / Math.max(1, h), t));
        gl.bindVertexArray(terrain.vao);
        gl.drawElements(gl.TRIANGLES, terrain.count, gl.UNSIGNED_SHORT, 0);
      };
      root.appendChild(canvas);
      hint = document.createElement("p");
      hint.className = "frontmap__hint";
      hint.textContent = touch ? "Drag to turn · pinch to zoom" : "Drag to turn · scroll to zoom";
      root.appendChild(hint);
      draw();
      root.classList.add("is-map");
      loop();
    } catch (err) {
      canvas.remove();   // the picture stays
      if (hint) hint.remove();
      console.warn("The Front's war table did not start; its picture stays.", err);
    }
  }
  function loop() {
    cancelAnimationFrame(frame);
    if (!visible || !draw) return;
    draw();
    if (!calm || pointers.size) frame = requestAnimationFrame(loop);
  }
  if (calm) canvas.addEventListener("pointermove", () => { if (draw) draw(); });

  new IntersectionObserver((entries) => {
    for (const e of entries) {
      visible = e.isIntersecting;
      if (visible && !started) start();
      if (visible) loop();
    }
  }, { rootMargin: "200px 0px" }).observe(root);
})();
