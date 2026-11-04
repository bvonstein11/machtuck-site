/* machtuck.com — the clan patch, drawn the way the game draws it.
   A line-for-line port of the game's PatchRaster (the stitched patch and the metal inlay) and of the parts of
   ClanPatchDesign that lay a design out and refuse one. Tools/website/patch_port/verify_patch_port.mjs renders the same
   designs here and in the game's own C# and fails on any real difference, so a change to either side is caught.
   Arithmetic that decides a pixel's position is done in 32-bit floats (Math.fround), as the C# does it.
   Runs in a browser (window.ReachPatch) and in Node (module.exports), with no dependencies. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ReachPatch = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const F = Math.fround;
  const trunc = Math.trunc;

  // ── colours ───────────────────────────────────────────────────────────────────────────────────────────────────
  function rgb(r, g, b) { return { R: F(r), G: F(g), B: F(b) }; }
  function hex(h) {
    h = String(h || "").replace(/^#/, "");
    if (h.length !== 6) return rgb(1, 0, 1);
    const v = parseInt(h, 16);
    return rgb(((v >> 16) & 0xff) / 255, ((v >> 8) & 0xff) / 255, (v & 0xff) / 255);
  }
  const luma = (c) => F(F(F(F(0.299) * c.R) + F(F(0.587) * c.G)) + F(F(0.114) * c.B));

  // ── masks ─────────────────────────────────────────────────────────────────────────────────────────────────────
  /** A library shape: W × H alpha bytes, row 0 at the top. */
  function mask(w, h, bytes) { return { W: w, H: h, A: bytes, aspect: -1 }; }
  /** From the game's library file: width and height as little-endian uint16, then the alpha bytes. */
  function maskFromBytes(b) {
    if (!b || b.length < 4) return null;
    const w = b[0] | (b[1] << 8), h = b[2] | (b[3] << 8);
    if (w <= 0 || h <= 0 || b.length < 4 + w * h) return null;
    return mask(w, h, b.subarray(4, 4 + w * h));
  }
  function maskAt(m, x, y) { return x < 0 || y < 0 || x >= m.W || y >= m.H ? 0 : m.A[y * m.W + x] / 255; }
  function sample(m, u, v) {
    const x = F(F(u * m.W) - 0.5), y = F(F(v * m.H) - 0.5);
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const a = maskAt(m, x0, y0), b = maskAt(m, x0 + 1, y0), c = maskAt(m, x0, y0 + 1), d = maskAt(m, x0 + 1, y0 + 1);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }
  /** Width over height of the drawn shape (its ink, not its square canvas); 1 for an empty mask. */
  function inkAspect(m) {
    if (m.aspect > 0) return m.aspect;
    let x0 = m.W, y0 = m.H, x1 = -1, y1 = -1;
    for (let y = 0; y < m.H; y++)
      for (let x = 0; x < m.W; x++)
        if (m.A[y * m.W + x] > 32) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    m.aspect = x1 < x0 ? 1 : F((x1 - x0 + 1) / (y1 - y0 + 1));
    return m.aspect;
  }

  // ── the field ─────────────────────────────────────────────────────────────────────────────────────────────────
  function fieldIndex(f, u, v) {
    switch (f.Pattern) {
      case "fess": return v < f.SplitV ? 0 : 1;
      case "pale": return u < 0.5 ? 0 : 1;
      case "fess3": return v < F(1 / 3) ? 0 : v < F(2 / 3) ? 1 : 2;
      case "pale3": return u < F(1 / 3) ? 0 : u < F(2 / 3) ? 1 : 2;
      case "chief_pale": return v < f.SplitV ? (u < 0.5 ? 0 : 1) : 2;
      case "base_pale": return v < f.SplitV ? 0 : (u < 0.5 ? 1 : 2);
      default: return 0;
    }
  }
  const fieldColour = (f, i) => (i === 0 ? f.A : i === 1 ? f.B : f.C);
  function onSeam(f, u, v, du, dv) {
    const i = fieldIndex(f, u, v);
    return fieldIndex(f, F(u - du), v) !== i || fieldIndex(f, F(u + du), v) !== i || fieldIndex(f, u, F(v - dv)) !== i || fieldIndex(f, u, F(v + dv)) !== i;
  }

  // ── raster helpers ────────────────────────────────────────────────────────────────────────────────────────────
  function place(m, W, H, x, y, w, h) {
    const o = new Float32Array(W * H);
    if (!m || w <= 0 || h <= 0) return o;
    const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(W, x + w), y1 = Math.min(H, y + h);
    for (let py = y0; py < y1; py++)
      for (let px = x0; px < x1; px++)
        o[py * W + px] = sample(m, F(F(px - x + 0.5) / w), F(F(py - y + 0.5) / h));
    return o;
  }
  function boxH(s, d, W, H, r) {
    const inv = F(1 / (2 * r + 1));
    for (let y = 0; y < H; y++) {
      const row = y * W; let sum = 0;
      for (let x = -r; x <= r; x++) sum += x >= 0 && x < W ? s[row + x] : 0;
      for (let x = 0; x < W; x++) {
        d[row + x] = sum * inv;
        const add = x + r + 1, rem = x - r;
        if (add < W) sum += s[row + add];
        if (rem >= 0) sum -= s[row + rem];
      }
    }
  }
  function boxV(s, d, W, H, r) {
    const inv = F(1 / (2 * r + 1));
    for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += y >= 0 && y < H ? s[y * W + x] : 0;
      for (let y = 0; y < H; y++) {
        d[y * W + x] = sum * inv;
        const add = y + r + 1, rem = y - r;
        if (add < H) sum += s[add * W + x];
        if (rem >= 0) sum -= s[rem * W + x];
      }
    }
  }
  function blur(src, W, H, r, passes) {
    const a = Float32Array.from(src), t = new Float32Array(a.length);
    for (let p = 0; p < passes; p++) { boxH(a, t, W, H, r); boxV(t, a, W, H, r); }
    return a;
  }
  function erode(a, W, H, r) {
    const b = blur(a, W, H, r, 1);
    for (let i = 0; i < b.length; i++) b[i] = clamp01((b[i] - 0.84) / 0.14) * a[i];
    return b;
  }
  function dilate(a, W, H, r) {
    const b = blur(a, W, H, r, 1);
    for (let i = 0; i < b.length; i++) b[i] = Math.max(a[i], clamp01(b[i] / 0.16));
    return b;
  }
  function shift(a, W, H, dx, dy) {
    const o = new Float32Array(a.length);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) o[y * W + x] = at(a, W, H, x - dx, y - dy);
    return o;
  }
  function sub(a, b) { const o = new Float32Array(a.length); for (let i = 0; i < o.length; i++) o[i] = clamp01(a[i] - b[i]); return o; }
  function mul(a, b) { for (let i = 0; i < a.length; i++) a[i] *= b[i]; }
  const at = (a, W, H, x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : a[y * W + x]);
  const TWO_PI = F(6.2831853);
  const wave = (t) => F(0.5 + 0.5 * Math.sin(F(F(t) * TWO_PI)));
  /** A stable 0..1 hash of a pixel, so a design renders identically every time (C#'s unchecked uint arithmetic). */
  function hash(x, y) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0;
    h = Math.imul((h ^ (h >>> 13)) >>> 0, 1274126177) >>> 0;
    return F(((h ^ (h >>> 16)) & 0xffff) / 65535);
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const sheen = (c, tone) => c * tone + 0.16 * (tone - 0.82);
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const pow = (a, b) => F(Math.pow(a, b));

  /** A W × H RGBA picture; r, g, b, a as 0..1 floats. */
  function img(W, H) { return { W, H, R: new Float32Array(W * H), G: new Float32Array(W * H), B: new Float32Array(W * H), A: new Float32Array(W * H) }; }
  /** RGBA bytes, row 0 at the top, rounded as the game rounds them. */
  function toRgba(im) {
    const o = new Uint8ClampedArray(im.W * im.H * 4);
    const b8 = (v) => (v <= 0 ? 0 : v >= 1 ? 255 : trunc(F(F(v * 255) + 0.5)));
    for (let i = 0; i < im.W * im.H; i++) { o[i * 4] = b8(im.R[i]); o[i * 4 + 1] = b8(im.G[i]); o[i * 4 + 2] = b8(im.B[i]); o[i * 4 + 3] = b8(im.A[i]); }
    return o;
  }

  // ── the embroidered patch ─────────────────────────────────────────────────────────────────────────────────────
  function embroidered(shield, field, border, charges, width) {
    const pad = F(0.06);
    const sw = Math.max(16, trunc(F(width * F(1 - F(2 * pad)))));
    const ratio = F(shield.H / shield.W);
    const sh = trunc(F(sw * ratio));
    const W = width, H = sh + trunc(F(F(width * 2) * pad));
    const ox = trunc((W - sw) / 2), oy = trunc(F(F(width * pad) * F(0.6)));
    const out = img(W, H);

    const s = place(shield, W, H, ox, oy, sw, sh);
    const bw = Math.max(2, trunc(F(sw * F(0.055))));
    const inner = erode(s, W, H, bw);
    const band = sub(s, inner);

    const layers = [];
    for (const c of charges) {
      if (!c.Shape) continue;
      const box = trunc(F(sw * c.Size));
      const cx = ox + trunc(F(sw * c.U)) - trunc(box / 2), cy = oy + trunc(F(F(sw * ratio) * c.V)) - trunc(box / 2);
      const a = place(c.Shape, W, H, cx, cy, box, box);
      mul(a, inner);
      layers.push({ a, c: c.Color });
    }

    const shadow = shift(blur(s, W, H, Math.max(2, trunc(sw / 60)), 3), W, H, trunc(sw / 90) + 1, trunc(sw / 60) + 1);
    const relief = blur(band, W, H, Math.max(1, trunc(sw / 140)), 2);
    const puffs = layers.map((l) => blur(l.a, W, H, Math.max(1, trunc(sw / 70)), 2));
    const rings = layers.map((l, k) => (k === 0 ? null : sub(dilate(l.a, W, H, Math.max(2, trunc(sw / 70))), l.a)));
    const ravg = F((sw + sh) * 0.25);
    const edges = [], edgeCols = [];
    const edgeW = Math.max(2, trunc(sw / 80));
    for (const l of layers) {
      let n = 0, low = 0;
      const lc = luma(l.c);
      for (let y = 0; y < H; y += 2)
        for (let x = 0; x < W; x += 2) {
          if (l.a[y * W + x] < 0.5) continue;
          n++;
          const under = fieldColour(field, fieldIndex(field, F(F(x - ox + 0.5) / sw), F(F(y - oy + 0.5) / sh)));
          if (Math.abs(luma(under) - lc) < F(0.25)) low++;
        }
      const edge = n > 0 && low > trunc(n / 5);
      edges.push(edge ? sub(dilate(l.a, W, H, edgeW), l.a) : null);
      edgeCols.push(lc > F(0.45) ? rgb(0.07, 0.07, 0.08) : rgb(0.9, 0.88, 0.82));
    }
    const seamU = F(F(Math.max(1.5, F(sw / 150))) / sw), seamV = F(F(Math.max(1.5, F(sw / 150))) / sh);
    const castDx = trunc(sw / 140) + 1, castDy = trunc(sw / 110) + 1;
    const midX = F(ox + F(sw * 0.5)), midY = F(oy + F(sh * 0.5));

    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const sa = shadow[i] * 0.55;
        let r = 0, g = 0, b = 0, a = sa;
        if (s[i] > 0) {
          const weave = 0.8 + 0.2 * wave(F((x + y) / F(4.4))) * wave(F((x - y) / F(4.4))) + 0.06 * (hash(x, y) - 0.5);
          const fu = F(F(x - ox + 0.5) / sw), fv = F(F(y - oy + 0.5) / sh);
          const fc = fieldColour(field, fieldIndex(field, fu, fv));
          let fr = sheen(fc.R, weave), fg = sheen(fc.G, weave), fb = sheen(fc.B, weave);
          if (onSeam(field, fu, fv, seamU, seamV)) {
            const st = 0.42 + 0.18 * wave(F((x + y) / F(3.2)));
            fr *= st; fg *= st; fb *= st;
          }
          let cast = 0;
          for (const l of layers) cast = Math.max(cast, at(l.a, W, H, x - castDx, y - castDy));
          const dark = 1 - 0.45 * cast;
          fr *= dark; fg *= dark; fb *= dark;
          const baseR = fr, baseG = fg, baseB = fb;

          for (let k = 0; k < layers.length; k++) {
            const la = layers[k].a, lc = layers[k].c;
            if (rings[k] && rings[k][i] > 0) { const rr = rings[k][i]; fr = lerp(fr, baseR * 0.8, rr); fg = lerp(fg, baseG * 0.8, rr); fb = lerp(fb, baseB * 0.8, rr); }
            if (edges[k] && edges[k][i] > 0) {
              const ev = edges[k][i], et = 0.72 + 0.28 * pow(wave(F((x + y) / F(3.2))), F(0.6));
              const ec = edgeCols[k];
              fr = lerp(fr, sheen(ec.R, et), ev); fg = lerp(fg, sheen(ec.G, et), ev); fb = lerp(fb, sheen(ec.B, et), ev);
            }
            const ca = la[i];
            if (ca <= 0) continue;
            const t = k % 2 === 0 ? x + y : x - y, along = k % 2 === 0 ? x - y : x + y;
            const thread = pow(wave(F(t / F(4.2))), F(0.55));
            const split = wave(F(F(along / 23) + F(Math.floor(F(t / F(4.2))) * F(0.37)))) > F(0.93) ? 0.82 : 1;
            const stitch = (0.62 + 0.38 * thread) * split + 0.05 * (hash(x + 7, y) - 0.5);
            const pf = puffs[k];
            const puff = 0.7 + 0.42 * Math.sin(Math.PI * clamp01(pf[i]) * 0.5);
            const lift = 1 + 2.2 * (at(pf, W, H, x - 2, y - 2) - at(pf, W, H, x + 2, y + 2));
            const edge = Math.min(1, Math.abs(at(la, W, H, x - 1, y) - at(la, W, H, x + 1, y)) + Math.abs(at(la, W, H, x, y - 1) - at(la, W, H, x, y + 1)));
            const tone = stitch * puff * lift * (1 - 0.5 * edge);
            fr = lerp(fr, sheen(lc.R, tone), ca); fg = lerp(fg, sheen(lc.G, tone), ca); fb = lerp(fb, sheen(lc.B, tone), ca);
          }

          const ba = band[i];
          if (ba > 0) {
            const ang = F(Math.atan2(F(y - midY), F(x - midX)));
            const wrap = 0.6 + 0.4 * pow(wave(F(F(ang * ravg) / F(4.6))), F(0.6)) + 0.04 * (hash(x, y + 3) - 0.5);
            const round = 0.62 + 0.6 * Math.sin(Math.PI * clamp01(relief[i] * 1.6));
            const lit = 1 + 1.4 * (at(relief, W, H, x - 2, y - 2) - at(relief, W, H, x + 2, y + 2));
            const tone = wrap * round * lit;
            fr = lerp(fr, sheen(border.R, tone), ba); fg = lerp(fg, sheen(border.G, tone), ba); fb = lerp(fb, sheen(border.B, tone), ba);
          }

          const pa = s[i];
          r = fr; g = fg; b = fb;
          a = pa + sa * (1 - pa);
          if (a > 0) { const k2 = pa / a; r = fr * k2; g = fg * k2; b = fb * k2; }
        }
        out.R[i] = clamp01(r); out.G[i] = clamp01(g); out.B[i] = clamp01(b); out.A[i] = clamp01(a);
      }
    return out;
  }

  // ── the metal or stone inlay ──────────────────────────────────────────────────────────────────────────────────
  function inlay(recess, field, charges, metal, stone, width) {
    const W = width, H = trunc(F(width * F(recess.H / recess.W)));
    const out = img(W, H);
    const r = place(recess, W, H, 0, 0, W, H);
    const inner = erode(r, W, H, Math.max(2, trunc(W / 34)));

    const layers = [];
    for (const c of charges) {
      if (!c.Shape) continue;
      const box = trunc(F(W * c.Size));
      const cx = trunc(F(W * c.U)) - trunc(box / 2), cy = trunc(F(H * c.V)) - trunc(box / 2);
      const a = place(c.Shape, W, H, cx, cy, box, box);
      mul(a, inner);
      layers.push(a);
    }
    const all = new Float32Array(W * H);
    for (const la of layers) for (let i = 0; i < all.length; i++) all[i] = Math.max(all[i], la[i]);
    const heights = layers.map((la) => blur(la, W, H, Math.max(1, trunc(W / 110)), 2));
    const grooves = layers.map((la) => sub(dilate(la, W, H, Math.max(1, trunc(W / 110))), la));
    const cast = shift(blur(all, W, H, Math.max(1, trunc(W / 90)), 2), W, H, trunc(W / 140) + 1, trunc(W / 100) + 1);
    const enamel = (c) => rgb(0.06 + c.R * 0.42, 0.06 + c.G * 0.42, 0.06 + c.B * 0.42);
    const wireU = F(F(Math.max(1.2, F(W / 170))) / W), wireV = F(F(Math.max(1.2, F(W / 170))) / H);

    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const ra = r[i];
        if (ra <= 0) continue;
        const grain = 0.92 + 0.1 * (hash(x, y) - 0.5) + 0.06 * wave(F(F(F(x * F(0.7)) + y) / 9));
        const sh = 1 + 0.12 * (1 - F(y / H));
        const fu = F(F(x + 0.5) / W), fv = F(F(y + 0.5) / H);
        const e = enamel(fieldColour(field, fieldIndex(field, fu, fv)));
        let er = e.R * grain * sh, eg = e.G * grain * sh, eb = e.B * grain * sh;
        if (onSeam(field, fu, fv, wireU, wireV)) {
          const wf = stone ? 0.62 : 0.8;
          er = metal.R * wf * sh; eg = metal.G * wf * sh; eb = metal.B * wf * sh;
        }
        const dk = 1 - 0.55 * cast[i];
        er *= dk; eg *= dk; eb *= dk;
        let alpha = ra * 0.86;

        for (let k = 0; k < layers.length; k++) {
          const gv = grooves[k][i];
          if (gv > 0) { const g2 = 1 - 0.7 * gv; er *= g2; eg *= g2; eb *= g2; alpha = lerp(alpha, ra, gv); }
          const ca = layers[k][i];
          if (ca <= 0) continue;
          const height = heights[k];
          const nx = at(height, W, H, x + 1, y) - at(height, W, H, x - 1, y);
          const ny = at(height, W, H, x, y + 1) - at(height, W, H, x, y - 1);
          const light = clamp01(0.62 + 2.4 * (-nx - ny));
          let face;
          if (stone)
            face = (0.8 + 0.2 * (hash(trunc(x / 2), trunc(y / 2)) - 0.5) + 0.1 * wave(F((x - y) / 13))) * (0.55 + 0.75 * light);
          else {
            const brushed = 0.86 + 0.1 * (hash(0, y) - 0.5) + 0.06 * (hash(x, y) - 0.5);
            const spec = Math.pow(light, 6) * 0.55;
            face = brushed * (0.45 + 0.85 * light) + spec;
          }
          er = lerp(er, metal.R * face, ca); eg = lerp(eg, metal.G * face, ca); eb = lerp(eb, metal.B * face, ca);
          alpha = lerp(alpha, ra, ca);
        }
        out.R[i] = clamp01(er); out.G[i] = clamp01(eg); out.B[i] = clamp01(eb); out.A[i] = clamp01(alpha);
      }
    return out;
  }

  // ── the design (ClanPatchDesign) ──────────────────────────────────────────────────────────────────────────────
  // `rules` is library.json's rules block, exported from the game's code by build_patch_library.py.
  const fieldColours = (rules, pattern) => rules.fieldColours[pattern] || 1;
  function fill(rules, d) {
    return { Pattern: d.pattern, A: hex(d.field), B: hex(d.field2), C: hex(d.field3), SplitV: F(rules.centreV) };
  }
  const hasWingRoom = (d) => !!d && !(d.layout === "side" && d.emblem2);
  function singleSize(m) {
    if (!m) return F(0.62);
    const a = inkAspect(m);
    if (a >= 1) return F(Math.min(0.84, Math.max(0.62, F(F(0.62) * F(Math.sqrt(a))))));
    return a < 0.7 ? F(Math.min(0.72, F(F(0.62) + F(F(F(0.7) - a) * F(0.3))))) : F(0.62);
  }

  /** Where the emblems sit, as { Shape, Color, U, V, Size } in the shield: centre and width as fractions of its width.
      `emblem(id)` returns a mask or null; `wing(style, left)` the same for a wing. */
  function layout(rules, d, emblem, wing) {
    const cv = F(rules.centreV);
    const a = emblem(d.emblem1), b = emblem(d.emblem2);
    const ca = hex(d.color1), cb = hex(d.color2);
    const list = [];
    const two = !!b;
    const shape = two ? d.layout : "single";
    let wl = null, wr = null;
    if (d.wings && hasWingRoom(d) && wing) { wl = wing(d.wings, true); wr = wing(d.wings, false); }
    const winged = !!(wl && wr);
    const k = winged ? F(0.65) : 1;
    const emblems = [];
    const E = (m, c, u, v, size) => { if (m) emblems.push({ Shape: m, Color: c, U: F(u), V: F(v), Size: F(F(size) * k) }); };
    switch (shape) {
      case "stacked": E(a, ca, 0.5, F(cv + F(0.1)), 0.56); E(b, cb, 0.5, F(cv - F(0.21)), 0.34); break;
      case "side": E(a, ca, 0.3, cv, 0.44); E(b, cb, 0.7, cv, 0.44); break;
      case "monogram": E(a, ca, 0.5, F(cv + F(0.02)), 0.64); E(b, cb, 0.5, F(cv - F(0.02)), 0.5); break;
      default: E(a, ca, 0.5, cv, singleSize(a)); break;
    }
    if (winged && emblems.length > 0) {
      let half = 0, v = 0;
      for (const c of emblems) {
        half = Math.max(half, F(F(F(F(c.Size * F(0.906)) * Math.min(1, inkAspect(c.Shape))) * 0.5)));
        v = F(v + c.V);
      }
      v = F(F(v / emblems.length) - F(0.04));
      const shieldMask = emblem("Shield_" + rules.shape);
      let wingSize = F(0.39), u = 0.5;
      for (let step = 0; step < 6; step++) {
        const wingW = F(wingSize * F(0.906)), overlap = F(wingSize * F(0.205));
        u = Math.max(F(F(0.06) + F(wingW * 0.5)), F(F(F(F(0.5) - half) - F(wingW * 0.5)) + overlap));
        if (!shieldMask) break;
        const aspect = Math.max(1, inkAspect(wl));
        const halfH = F(F(F(wingW / aspect) * 0.5) * F(shieldMask.W / shieldMask.H));
        const tipU = F(F(u - F(wingW * F(0.4))) - F(0.06));
        if (sample(shieldMask, tipU, F(v - F(halfH * F(0.8)))) > 0.5 && sample(shieldMask, tipU, F(v + F(halfH * 0.5))) > 0.5) break;
        wingSize = F(wingSize * F(0.92));
      }
      list.push({ Shape: wl, Color: ca, U: u, V: v, Size: wingSize });
      list.push({ Shape: wr, Color: ca, U: F(1 - u), V: v, Size: wingSize });
    }
    return list.concat(emblems);
  }

  /** The character a letter or number emblem stands for, or "" for a symbol. */
  function glyph(id) {
    if (!id || !(id.startsWith("Block_") || id.startsWith("Letter_"))) return "";
    const tail = id.slice(id.indexOf("_") + 1);
    return tail.length === 1 ? tail.toUpperCase() : "";
  }
  const isRed = (c) => c.R > F(0.55) && c.G < F(0.35) && c.B < F(0.35);
  const isBlue = (c) => c.B > F(c.R + F(0.12)) && c.B >= c.G && c.B > F(0.25);
  function isBlockedFlag(d) {
    if (!d || d.pattern !== "fess3") return false;
    const a = hex(d.field), b = hex(d.field2), c = hex(d.field3);
    const nearBlack = luma(a) < F(0.3) && Math.abs(F(a.R - a.G)) < F(0.06) && Math.abs(F(a.G - a.B)) < F(0.06);
    return nearBlack && luma(b) > F(0.75) && c.R > F(0.55) && c.G < F(0.35) && c.B < F(0.35);
  }
  /** The game's refusal, rule for rule (ClanPatchDesign.IsBlocked). The two-character readings it refuses come from the
      game's code: its own list and every pair its chat filter masks. */
  function isBlocked(rules, d) {
    if (!d) return false;
    if (isBlockedFlag(d)) return true;
    const loneX = glyph(d.emblem1) === "X" && (!d.emblem2 || d.layout === "single");
    if (loneX && d.pattern === "solid" && isRed(hex(d.field)) && isBlue(hex(d.color1))) return true;
    if (!d.emblem2 || d.layout === "single") return false;
    if (d.emblem1 === "Charge_bolt" && d.emblem2 === "Charge_bolt") return true;
    if ((d.emblem1 === "Charge_bolt" && glyph(d.emblem2) === "S") || (d.emblem2 === "Charge_bolt" && glyph(d.emblem1) === "S")) return true;
    if ((d.emblem1 === "Charge_dice" && glyph(d.emblem2) === "6") || (d.emblem2 === "Charge_dice" && glyph(d.emblem1) === "6")) return true;
    for (const p of rules.blockedSymbolPairs)
      if ((d.emblem1 === p[0] && d.emblem2 === p[1]) || (d.emblem1 === p[1] && d.emblem2 === p[0])) return true;
    if (d.layout === "monogram" && ((glyph(d.emblem1) === "X" && glyph(d.emblem2) === "") || (glyph(d.emblem2) === "X" && glyph(d.emblem1) === ""))) return true;
    const a = glyph(d.emblem1), b = glyph(d.emblem2);
    if (!a || !b) return false;
    const readings = d.layout === "side" ? [a + b] : d.layout === "stacked" ? [b + a] : [a + b, b + a];
    return readings.some((r) => rules.blockedReadings.includes(r));
  }
  /** Block M and block T stacked, either way up: the studio's mark, which nobody else may wear. */
  const isStudioMark = (d) => !!d && d.layout === "stacked"
    && ((d.emblem1 === "Block_M" && d.emblem2 === "Block_T") || (d.emblem1 === "Block_T" && d.emblem2 === "Block_M"));

  // ── the patch code ────────────────────────────────────────────────────────────────────────────────────────────
  // Version 1: "1." then the design's twelve values in CODE_FIELDS order, joined by dots. A value the picture does not
  // use is left empty, as the game's ClanPatchDesign.Key blanks it. Colours are the game's hex; an emblem is its library
  // id with "Charge_" dropped. The code is the whole design, so the page stores nothing: the pilot keeps the code.
  // ⚠ The game reads this format too: change it only by adding a version, and keep reading version 1.
  const CODE_FIELDS = ["pattern", "field", "field2", "field3", "border", "emblem1", "color1", "emblem2", "color2", "layout", "inlay", "wings"];
  function canonical(rules, d) {
    const v = Object.assign({}, d);
    const n = fieldColours(rules, v.pattern);
    if (n < 2) v.field2 = "";
    if (n < 3) v.field3 = "";
    if (!v.emblem2) { v.emblem2 = ""; v.color2 = ""; v.layout = ""; }
    if (!hasWingRoom(v)) v.wings = "";
    return v;
  }
  function encode(rules, d) {
    const v = canonical(rules, d);
    return "1." + CODE_FIELDS.map((k) => {
      const s = String(v[k] || "");
      return k.startsWith("emblem") ? s.replace(/^Charge_/, "") : s;
    }).join(".");
  }
  /** The design a code stands for, or null when it is not a version-1 code made only of the game's pieces. The caller
      still refuses it with isBlocked and isStudioMark, as the game does. */
  function decode(rules, code) {
    const parts = String(code || "").trim().split(".");
    if (parts.length !== CODE_FIELDS.length + 1 || parts[0] !== "1") return null;
    const d = Object.assign({}, rules.start, { squadron: "" });
    const hexes = new Set(rules.palette.map((p) => p[1]));
    const emblems = new Set(rules.charges.concat(rules.blockLetters, rules.serifLetters).map((e) => e.id));
    for (let i = 0; i < CODE_FIELDS.length; i++) {
      const k = CODE_FIELDS[i];
      let s = parts[i + 1];
      if (k.startsWith("emblem") && s && !/^(Block|Letter)_/.test(s)) s = "Charge_" + s;
      if (/^(field|border|color)/.test(k)) s = s.toUpperCase();
      d[k] = s;
    }
    const n = fieldColours(rules, d.pattern);
    if (!rules.patterns.includes(d.pattern)) return null;
    for (const k of ["field", "border", "color1"]) if (!hexes.has(d[k])) return null;
    if (n >= 2 && !hexes.has(d.field2)) return null;
    if (n >= 3 && !hexes.has(d.field3)) return null;
    if (d.emblem1 && !emblems.has(d.emblem1)) return null;
    if (d.emblem2) {
      if (!emblems.has(d.emblem2) || !hexes.has(d.color2) || !rules.layouts.includes(d.layout)) return null;
    }
    if (!rules.inlays.includes(d.inlay)) return null;
    if (d.wings && !rules.wingStyles.includes(d.wings)) return null;
    // the values the picture does not use go back to the game's defaults
    if (n < 2) d.field2 = rules.start.field2;
    if (n < 3) d.field3 = rules.start.field3;
    if (!d.emblem2) { d.color2 = rules.start.color2; d.layout = rules.start.layout; }
    return d;
  }

  /** Both pictures of a design: the stitched patch and the inlay, as RGBA byte arrays with their sizes. */
  function render(rules, d, lib, patchWidth, inlayWidth) {
    const charges = layout(rules, d, lib.emblem, lib.wing);
    const f = fill(rules, d);
    const out = {};
    if (patchWidth) {
      const p = embroidered(lib.emblem("Shield_" + rules.shape), f, hex(d.border), charges, patchWidth);
      out.patch = { W: p.W, H: p.H, data: toRgba(p) };
    }
    if (inlayWidth) {
      const metal = hex(rules.inlayColours[d.inlay] || rules.inlayColours.steel);
      const q = inlay(lib.emblem("Recess"), f, charges, metal, !!rules.inlayStone[d.inlay], inlayWidth);
      out.inlay = { W: q.W, H: q.H, data: toRgba(q) };
    }
    return out;
  }

  return { hex, luma, mask, maskFromBytes, inkAspect, layout, fieldColours, hasWingRoom, glyph, isBlocked, isStudioMark, encode, decode, render };
});
