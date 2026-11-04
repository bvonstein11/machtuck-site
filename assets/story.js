/* How we got here, as a voyage you scroll through: Earth failing, the probes, the answer from Alpha Centauri, the ships,
   the crossing, the signal, the silence, and the Archive today. Scrolling moves time; the timeline drags to any year; a
   ship tapped shows its readout; the last chapter is the ship's clock now, and a message can be sent from it.
   The Archive's numbers are ship.js's (Voyage); the other ships' and the signal's dates are the approved Script v3's
   (Art/Film/History_2026-11-03/SCRIPT.md). Without scripts the chapters read as text. Nothing is stored. */
(function () {
  "use strict";
  const root = document.querySelector("[data-story]");
  if (!root || typeof Voyage === "undefined" || !("IntersectionObserver" in window)) return;
  const track = root.querySelector("[data-story-track]"), stage = root.querySelector("[data-story-stage]");
  const cv = root.querySelector(".story__canvas"), g = cv.getContext("2d");
  const items = [...root.querySelectorAll("[data-chapter]")];
  const timeline = root.querySelector("[data-story-timeline]"), fillBar = root.querySelector("[data-story-fill]"), thumb = root.querySelector("[data-story-thumb]");
  const readout = root.querySelector("[data-story-readout]"), sendButton = root.querySelector("[data-story-send]"), sent = root.querySelector("[data-story-sent]");
  const countEl = root.querySelector("[data-story-count]");
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── time: the voyage's own scale (years after the probe's launch), as ship.js counts it ──────────────────────────
  function fracYear(date) { const y = date.getUTCFullYear(), s = Date.UTC(y, 0, 1), e = Date.UTC(y + 1, 0, 1); return y + (date - s) / (e - s); }
  function dateOfYear(c) { const y = Math.floor(c), s = Date.UTC(y, 0, 1), e = Date.UTC(y + 1, 0, 1); return new Date(s + (c - y) * (e - s)); }
  const on = (calendarYear) => Voyage.voyageTime(dateOfYear(calendarYear));
  const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const label = (y) => { const c = fracYear(Voyage.dateAt(y)), yr = Math.floor(c); return MONTHS[Math.min(11, Math.floor((c - yr) * 12))] + " " + yr; };
  const nowY = () => Voyage.voyageTime(Voyage.shipNow());

  const LY = Voyage.archive.lightYears, P = Voyage.probe;
  // Script v3's dates: the advance ship, the signal, the supply ship, the silence
  const EV = {
    advanceDepart: on(3308 + 2 / 12), advanceLand: on(3325 + 6 / 12), signalOn: on(3328 + 6 / 12),
    supplyDepart: on(3330 + 9 / 12), supplyOrbit: on(3337 + 2 / 12), stopped: on(3340 + 5 / 12),
  };
  const archiveX = (y) => LY * Voyage.progressAt(y);
  const advanceX = (y) => LY * clamp((y - EV.advanceDepart) / (EV.advanceLand - EV.advanceDepart), 0, 1);
  const supplyX = (y) => { const x0 = archiveX(EV.supplyDepart); return x0 + (LY - x0) * clamp((y - EV.supplyDepart) / (EV.supplyOrbit - EV.supplyDepart), 0, 1); };
  const signalFront = (y) => LY - (y - EV.signalOn);          // a light-year a year, from The Reach toward us
  EV.meet = (() => { let lo = EV.signalOn, hi = EV.signalOn + LY; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (signalFront(m) > archiveX(m)) lo = m; else hi = m; } return lo; })();

  // ── the chapters: the story time each one spans, and the view it holds ──────────────────────────────────────────
  const SPANS = {
    earth: [0, 0, "earth"], probes: [0, P.arrive, "stars"], answer: [P.transmit, P.received, "near"], world: [P.received, P.received + 0.2, "near"],
    chosen: [P.received + 0.2, EV.advanceDepart - 0.02, "route"], advance: [EV.advanceDepart, EV.advanceDepart + 1.5, "route"],
    archive: [Voyage.archive.depart - 0.05, Voyage.archive.depart + 0.6, "route"], crossing: [Voyage.archive.depart + 0.6, EV.advanceLand - 0.04, "route"],
    landed: [EV.advanceLand - 0.04, EV.advanceLand + 0.4, "route"], signal: [EV.advanceLand + 0.4, EV.meet + 0.06, "route"],
    supply: [EV.supplyDepart, EV.supplyOrbit + 0.05, "route"], news: [EV.supplyOrbit + 0.05, EV.stopped - 0.04, "route"],
    silence: [EV.stopped - 0.04, EV.stopped + 0.15, "route"], now: [null, null, "now"],   // null: the ship's clock now
  };
  const chapters = items.map((li) => ({ li, id: li.dataset.chapter, span: SPANS[li.dataset.chapter] }));
  const N = chapters.length;
  const spanOf = (i) => { const [a, b, cam] = chapters[i].span; return [a === null ? nowY() : a, b === null ? nowY() : b, cam]; };

  // ── helpers ─────────────────────────────────────────────────────────────────────────────────────────────────────
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
  const ease = (k) => { k = clamp(k, 0, 1); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
  function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0; s ^= s >>> 13; return (s >>> 0) / 4294967296; }; }
  const INK = "232,228,220", DIM = "170,165,156", ACC = "224,137,62", COOL = "190,215,255", SUN = "255,214,150";
  const rgba = (c, a) => `rgba(${c},${a})`;

  // ── the nearest stars (today's catalogue: light-years, RA in hours, Dec in degrees), laid flat with Alpha Centauri on
  //    the line of the crossing ───────────────────────────────────────────────────────────────────────────────────
  const CATALOGUE = [["Alpha Centauri", 4.37, 14.66, -60.8], ["Barnard's Star", 5.96, 17.96, 4.7], ["Wolf 359", 7.86, 10.94, 7.0], ["Lalande 21185", 8.31, 11.05, 35.9],
    ["Sirius", 8.60, 6.75, -16.7], ["Luyten 726-8", 8.73, 1.65, -17.9], ["Ross 154", 9.69, 18.83, -23.8], ["Ross 248", 10.3, 23.70, 44.2],
    ["Epsilon Eridani", 10.5, 3.55, -9.5], ["Lacaille 9352", 10.7, 23.10, -35.9], ["Ross 128", 11.0, 11.80, 0.8]];
  const STARS = (() => {
    const v = CATALOGUE.map(([name, d, ra, dec]) => { const A = ra / 24 * 2 * Math.PI, D = dec * Math.PI / 180; return { name, d, p: [Math.cos(D) * Math.cos(A), Math.cos(D) * Math.sin(A), Math.sin(D)] }; });
    const a = v[0].p, n = [0, 0, 1], dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
    let up = [n[0] - dot(n, a) * a[0], n[1] - dot(n, a) * a[1], n[2] - dot(n, a) * a[2]]; const l = Math.hypot(...up); up = up.map((c) => c / l);
    // the crossing runs to the stars' scale in their own century: Alpha Centauri at LY, the rest in proportion
    return v.map((s) => ({ name: s.name, d: s.d, x: dot(s.p, a) * s.d * LY / 4.37, y: dot(s.p, up) * s.d * LY / 4.37 }));
  })();
  const PROBED = [0, 1, 2, 3, 4];

  // ── the canvas: sized to the stage, its sky and glows drawn once per size ───────────────────────────────────────
  let Wd = 0, Hd = 0, dpr = 1, portrait = false, sky = null;
  const sprites = {};
  function glowSprite(color) {
    const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d");
    const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, rgba(color, 1)); gr.addColorStop(0.18, rgba(color, 0.45)); gr.addColorStop(0.5, rgba(color, 0.1)); gr.addColorStop(1, rgba(color, 0));
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128); return c;
  }
  for (const [k, c] of [["acc", ACC], ["cool", COOL], ["sun", SUN], ["white", "255,250,240"], ["ink", INK]]) sprites[k] = glowSprite(c);
  function glow(x, y, r, sprite, a) { if (a <= 0.003) return; g.globalAlpha = a; g.drawImage(sprites[sprite], x - r, y - r, 2 * r, 2 * r); g.globalAlpha = 1; }
  function makeSky() {
    const c = document.createElement("canvas"); c.width = Math.round(Wd * 1.3); c.height = Math.round(Hd * 1.3);
    const x = c.getContext("2d"), w = c.width, h = c.height;
    const base = x.createLinearGradient(0, 0, w, h); base.addColorStop(0, "#081020"); base.addColorStop(0.55, "#060a14"); base.addColorStop(1, "#0a0910");
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    const blob = (bx, by, r, col, a) => { const gr = x.createRadialGradient(bx, by, 0, bx, by, r); gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0)); x.fillStyle = gr; x.fillRect(bx - r, by - r, 2 * r, 2 * r); };
    x.globalCompositeOperation = "lighter";
    blob(w * 0.22, h * 0.30, w * 0.5, "40,80,140", 0.20); blob(w * 0.78, h * 0.55, w * 0.55, "150,90,40", 0.18); blob(w * 0.5, h * 0.95, w * 0.45, "60,40,90", 0.12);
    const r = rng(7), count = Math.round(w * h / 1400);
    for (let i = 0; i < count; i++) {
      const sx = r() * w, sy = r() * h, z = r() * r(), b = r(), s = (0.5 + 1.8 * z) * dpr;
      x.fillStyle = rgba(b > 0.86 ? "255,214,170" : b < 0.12 ? "170,200,255" : "235,236,240", 0.18 + 0.75 * z);
      x.fillRect(sx, sy, s, s);
      if (z > 0.8 && b > 0.5) { const gr = x.createRadialGradient(sx, sy, 0, sx, sy, 14 * dpr); gr.addColorStop(0, "rgba(220,230,255,0.18)"); gr.addColorStop(1, "rgba(220,230,255,0)"); x.fillStyle = gr; x.fillRect(sx - 14 * dpr, sy - 14 * dpr, 28 * dpr, 28 * dpr); }
    }
    return c;
  }
  // a dust-covered Earth, drawn once
  const EARTH = (() => {
    const S = 420, c = document.createElement("canvas"); c.width = c.height = S; const x = c.getContext("2d"), img = x.createImageData(S, S), d = img.data;
    const hash = (a, b, cc) => { let h = Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(cc, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const noise = (px, py, pz) => { const xi = Math.floor(px), yi = Math.floor(py), zi = Math.floor(pz), xf = px - xi, yf = py - yi, zf = pz - zi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf); const cc = (a, b, e) => hash(xi + a, yi + b, zi + e); return lerp(lerp(lerp(cc(0, 0, 0), cc(1, 0, 0), u), lerp(cc(0, 1, 0), cc(1, 1, 0), u), v), lerp(lerp(cc(0, 0, 1), cc(1, 0, 1), u), lerp(cc(0, 1, 1), cc(1, 1, 1), u), v), w); };
    const fbm = (px, py, pz) => 0.55 * noise(px, py, pz) + 0.3 * noise(2.1 * px, 2.1 * py, 2.1 * pz) + 0.15 * noise(4.3 * px, 4.3 * py, 4.3 * pz);
    const L = [-0.8, 0.46, 0.38], R = S / 2 - 6;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const dx = (i - S / 2) / R, dy = (S / 2 - j) / R, r2 = dx * dx + dy * dy, k = (j * S + i) * 4;
      if (r2 > 1.06) continue;
      if (r2 > 1) { const al = Math.pow(1 - (Math.sqrt(r2) - 1) / 0.03, 2) * Math.max(0, -0.8 * dx + 0.46 * dy + 0.3); d[k] = 150; d[k + 1] = 180; d[k + 2] = 235; d[k + 3] = 255 * clamp(al, 0, 1); continue; }
      const nz = Math.sqrt(1 - r2), dust = 0.85 * smooth((fbm(dx * 1.6 + 3, dy * 1.6, nz * 1.6) - 0.5) / 0.1), fine = fbm(dx * 5 + 9, dy * 5 + 2, nz * 5);
      const cloud = smooth((fine - 0.56) / 0.08) * (1 - dust) * 0.55;
      const lit = 0.03 + 0.97 * Math.pow(Math.max(0, dx * L[0] + dy * L[1] + nz * L[2]), 0.9), fres = Math.pow(1 - nz, 3);
      let rr = lerp(18, 128, dust) + 36 * (fine - 0.5) * dust, gg = lerp(52, 96, dust) + 26 * (fine - 0.5) * dust, bb = lerp(98, 60, dust);
      rr = lerp(rr, 150, cloud); gg = lerp(gg, 156, cloud); bb = lerp(bb, 160, cloud);
      d[k] = rr * lit + 90 * fres * lit; d[k + 1] = gg * lit + 120 * fres * lit; d[k + 2] = bb * lit + 170 * fres * lit; d[k + 3] = 255;
    }
    x.putImageData(img, 0, 0); return c;
  })();

  function resize() {
    const r = stage.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, r.width < 700 ? 1.5 : 2);
    Wd = Math.max(1, Math.round(r.width * dpr)); Hd = Math.max(1, Math.round(r.height * dpr));
    cv.width = Wd; cv.height = Hd; portrait = r.height > r.width * 1.1;
    sky = makeSky(); draw();
  }

  // ── the camera: what each view looks at, and how the world maps to the screen ──────────────────────────────────
  // ax, ay: where the view's centre sits on the screen, as shares of it. On a phone the route stands upright near the
  // left, so the names have the right-hand side; the words sit at the foot.
  function view(name) {
    const w = Wd, h = Hd, route = (portrait ? h * 0.40 : w * 0.64) / LY, A = portrait ? { ax: 0.30, ay: 0.40 } : { ax: 0.46, ay: 0.62 };
    if (name === "earth") return { x: 0, y: 0, s: route * 2.4, ...A };
    if (name === "stars") return { x: 0.8, y: 0, s: (portrait ? w * 0.92 / 20 : Math.min(w, h) * 0.36 / 11), ...(portrait ? { ax: 0.5, ay: 0.36 } : A) };
    if (name === "near") return { x: LY * 0.42, y: 0, s: route * 0.92, ...A };
    if (name === "now") {   // the last stretch, so a message can be watched crossing it
      const gap = Math.max(0.02, LY - archiveX(nowY()));
      return portrait ? { x: LY - gap / 2, y: 0, s: h * 0.19 / gap, ax: 0.30, ay: 0.27 } : { x: LY - gap / 2, y: 0, s: w * 0.40 / gap, ax: 0.60, ay: 0.80 };
    }
    return { x: LY / 2, y: 0, s: route, ...A };
  }
  let cam = view("route");
  const toScreen = (wx, wy) => { const ax = Wd * cam.ax, ay = Hd * cam.ay; return portrait ? [ax + (wy - cam.y) * cam.s, ay - (wx - cam.x) * cam.s] : [ax + (wx - cam.x) * cam.s, ay - (wy - cam.y) * cam.s]; };

  // ── where the scroll stands ─────────────────────────────────────────────────────────────────────────────────────
  let position = 0, hits = [], message = null;
  function measure() {
    const r = track.getBoundingClientRect(), room = Math.max(1, r.height - stage.getBoundingClientRect().height);
    position = clamp(-r.top / room, 0, 1) * (N - 1);
  }
  function storyTime(c) {
    const i = Math.min(N - 1, Math.floor(c)), u = c - i, [a, b] = spanOf(i);
    if (i === N - 1 || u < 0.72) return lerp(a, b, ease(u / 0.72));
    return lerp(b, spanOf(i + 1)[0], ease((u - 0.72) / 0.28));
  }
  function cameraAt(c) {
    const i = Math.min(N - 1, Math.floor(c)), u = c - i, A = view(spanOf(i)[2]);
    if (i === N - 1 || u < 0.62) return A;
    const B = view(spanOf(i + 1)[2]), k = ease((u - 0.62) / 0.38);
    // zoom in log space, so a deep zoom out does not lurch
    return { x: lerp(A.x, B.x, k), y: lerp(A.y, B.y, k), s: Math.exp(lerp(Math.log(A.s), Math.log(B.s), k)), ax: lerp(A.ax, B.ax, k), ay: lerp(A.ay, B.ay, k) };
  }

  // ── drawing ─────────────────────────────────────────────────────────────────────────────────────────────────────
  function txt(s, x, y, { size = 13, color = INK, a = 1, align = "center", font = "B612 Mono", weight = "", spacing = 3 } = {}) {
    if (a <= 0.01) return;
    g.font = `${weight} ${size * dpr}px "${font}"`.trim(); g.letterSpacing = spacing * dpr + "px"; g.textAlign = align; g.textBaseline = "middle";
    g.fillStyle = rgba(color, a); g.fillText(s, x, y); g.letterSpacing = "0px";
  }
  function sun(x, y, size, a, color = "sun") {
    g.globalCompositeOperation = "lighter";
    glow(x, y, size * 14, color, 0.25 * a); glow(x, y, size * 5, color, 0.6 * a); glow(x, y, size * 1.7, "white", 0.95 * a);
    const st = g.createLinearGradient(x - size * 20, y, x + size * 20, y); st.addColorStop(0, rgba(SUN, 0)); st.addColorStop(0.5, rgba("255,236,210", 0.5 * a)); st.addColorStop(1, rgba(SUN, 0));
    g.fillStyle = st; g.fillRect(x - size * 20, y - size * 0.08, size * 40, size * 0.16);
    g.globalCompositeOperation = "source-over";
  }
  function wake(x0, y0, x1, y1, color, a, w) {
    g.globalCompositeOperation = "lighter";
    const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, rgba(color, 0)); gr.addColorStop(1, rgba(color, 0.9 * a));
    g.strokeStyle = gr; g.lineWidth = w * dpr; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.globalCompositeOperation = "source-over";
  }
  function ship(id, x, y, color, sprite, name, sub, a, below) {
    if (a <= 0.01) return;
    g.globalCompositeOperation = "lighter"; glow(x, y, 40 * dpr, sprite, 0.9 * a); glow(x, y, 9 * dpr, "white", a); g.globalCompositeOperation = "source-over";
    const off = (below ? 1 : -1) * 34 * dpr;
    if (portrait) {
      const [rx, ry] = toScreen(LY, 0), drop = Math.hypot(x - rx, y - ry) < 40 * dpr ? 40 * dpr : 0;
      txt(name, x + 18 * dpr, y - 7 * dpr + drop, { size: 11, color: INK, a, align: "left" });
      if (sub) txt(sub, x + 18 * dpr, y + 9 * dpr + drop, { size: 9.5, color: DIM, a, align: "left", spacing: 2 });
    }
    else { txt(name, x, y + off, { size: 12, color: INK, a }); if (sub) txt(sub, x, y + off + (below ? 18 : -18) * dpr, { size: 10.5, color: DIM, a, spacing: 2 }); }
    hits.push({ id, x, y });
  }
  function draw() {
    if (!Wd) return;
    const c = position, y = storyTime(c);
    cam = cameraAt(c); hits = [];
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    // the sky, drifting a little with the camera
    const px = (cam.x / LY) * Wd * 0.12;
    g.drawImage(sky, -Wd * 0.15 - (portrait ? 0 : px), -Hd * 0.15 - (portrait ? -px : 0));
    const earthness = 1 - smooth((c - 0.25) / 0.6), starsView = smooth((c - 0.4) / 0.6) * (1 - smooth((c - 3.6) / 0.8)), routeA = smooth((c - 2.2) / 1.4);
    const [sx, sy] = toScreen(0, 0), [rx, ry] = toScreen(LY, 0);
    // the nearest stars and the probes
    if (starsView > 0.01) {
      for (const r of [5, 10]) { g.beginPath(); g.arc(sx, sy, r * LY / 4.37 * cam.s, 0, 2 * Math.PI); g.strokeStyle = rgba(INK, 0.08 * starsView); g.lineWidth = dpr; g.stroke(); txt(r + " LY", sx + r * LY / 4.37 * cam.s * 0.72, sy - r * LY / 4.37 * cam.s * 0.7, { size: 10, color: DIM, a: 0.6 * starsView }); }
      STARS.forEach((s, i) => {
        if (i === 0) return;
        const [qx, qy] = toScreen(s.x, s.y);
        g.globalCompositeOperation = "lighter"; glow(qx, qy, 22 * dpr, "ink", 0.35 * starsView); g.globalCompositeOperation = "source-over";
        if (!portrait || PROBED.includes(i)) txt(s.name.toUpperCase(), qx, qy - 16 * dpr, { size: 10, color: DIM, a: 0.85 * starsView });
      });
      for (const i of PROBED) {
        const s = STARS[i], k = clamp(y * 0.5 / s.d, 0, 1); if (k <= 0) continue;
        const [qx, qy] = toScreen(s.x * k, s.y * k);
        wake(sx, sy, qx, qy, i === 0 ? ACC : COOL, (i === 0 ? 1 : 0.7) * starsView, 1.6);
        if (k < 1) { g.globalCompositeOperation = "lighter"; glow(qx, qy, 22 * dpr, i === 0 ? "acc" : "cool", starsView); g.globalCompositeOperation = "source-over"; }
        else if (i > 0) txt("NO ANSWER YET", ...toScreen(s.x, s.y).map((v, n) => v + (n ? 18 * dpr : 0)), { size: 9.5, color: DIM, a: 0.7 * starsView * smooth((c - 2.6) / 0.5) });
      }
    }
    // the line of the crossing
    if (routeA > 0.01) {
      g.globalCompositeOperation = "lighter";
      const rl = g.createLinearGradient(sx, sy, rx, ry); rl.addColorStop(0, rgba(COOL, 0.16 * routeA)); rl.addColorStop(1, rgba(SUN, 0.42 * routeA));
      g.strokeStyle = rl; g.lineWidth = 1.5 * dpr; g.beginPath(); g.moveTo(sx, sy); g.lineTo(rx, ry); g.stroke();
      g.globalCompositeOperation = "source-over";
    }
    // the suns
    sun(rx, ry, (6 + 18 * Math.min(1, cam.s / view("route").s) - 8 * smooth((c - (N - 2)) / 0.8)) * dpr, 1);   // smaller in the last close view, so a message can be seen arriving
    if (portrait) {
      txt("ALPHA CENTAURI A", rx + 22 * dpr, ry - 9 * dpr, { size: 11, color: INK, align: "left" });
      txt("THE REACH", rx + 22 * dpr, ry + 8 * dpr, { size: 11, color: ACC, a: smooth((c - 3.4) / 0.6), align: "left" });
    } else {
      txt("ALPHA CENTAURI A", rx + 30 * dpr, ry - 9 * dpr, { size: 12, color: INK, align: "left" });
      txt("THE REACH", rx + 30 * dpr, ry + 11 * dpr, { size: 12, color: ACC, a: smooth((c - 3.4) / 0.6), align: "left" });
    }
    hits.push({ id: "reach", x: rx, y: ry });
    sun(sx, sy, 6 * dpr, 0.8 * (1 - earthness), "white");
    txt(portrait ? "SOL · EARTH" : "SOL", sx + (portrait ? 0 : -34 * dpr), sy + (portrait ? 34 * dpr : 0), { size: 12, color: INK, a: 1 - earthness, align: portrait ? "center" : "right" });
    hits.push({ id: "sol", x: sx, y: sy });
    // the probe's report, coming home at the speed of light
    if (y > P.transmit && y < P.received + 0.05) {
      const k = clamp((y - P.transmit) / (P.received - P.transmit), 0, 1), [ax, ay] = toScreen(STARS[0].x, STARS[0].y);
      const qx = lerp(ax, sx, k), qy = lerp(ay, sy, k);
      wake(ax, ay, qx, qy, ACC, 1, 3); g.globalCompositeOperation = "lighter"; glow(qx, qy, 46 * dpr, "acc", 1); g.globalCompositeOperation = "source-over";
    }
    // the advance ship
    if (y >= EV.advanceDepart && y < EV.supplyDepart) {
      const [ax, ay] = toScreen(advanceX(y), 0), landed = y >= EV.advanceLand - 0.02;
      wake(sx, sy, ax, ay, COOL, 0.8, 2.5);
      ship("advance", ax, ay, COOL, "cool", "ADVANCE SHIP", landed ? "LANDED" : "A FEW HUNDRED CREW", 1 - smooth((y - EV.advanceLand - 1.5) / 1.5), false);
    }
    // the signal: a shell of light from The Reach, to meet the Archive
    if (y >= EV.signalOn && y < EV.meet + 0.6) {
      const r = (LY - Math.max(archiveX(y), signalFront(y))) * cam.s, fade = 1 - smooth((y - EV.meet) / 0.6);
      g.globalCompositeOperation = "lighter";
      for (const [w, al] of [[40, 0.06], [14, 0.14], [4, 0.5], [1.5, 0.95]]) {
        g.beginPath(); const mid = portrait ? Math.PI / 2 : Math.PI; g.arc(rx, ry, r, mid - 0.42, mid + 0.42);
        g.strokeStyle = rgba("255,190,120", al * fade); g.lineWidth = w * dpr; g.stroke();
      }
      g.globalCompositeOperation = "source-over";
    }
    // the Archive
    if (y >= Voyage.archive.depart - 0.02) {
      const [ax, ay] = toScreen(archiveX(y), 0);
      wake(sx, sy, ax, ay, ACC, 1, 3.5);
      const met = smooth(1 - Math.abs(y - EV.meet) / 0.25);
      if (met > 0) { g.globalCompositeOperation = "lighter"; glow(ax, ay, 360 * dpr * met, "white", 0.5 * met); g.globalCompositeOperation = "source-over"; }
      ship("archive", ax, ay, ACC, "acc", "THE ARCHIVE", "TWENTY THOUSAND ABOARD", 1, true);
    }
    // the supply ship
    if (y >= EV.supplyDepart) {
      const [ax0, ay0] = toScreen(archiveX(EV.supplyDepart), 0), [qx, qy] = toScreen(supplyX(y), 0), orbit = y >= EV.supplyOrbit - 0.02;
      wake(ax0, ay0, qx, qy, COOL, 0.8, 2.5);
      ship("supply", qx, qy, COOL, "cool", "SUPPLY SHIP", orbit ? "IN ORBIT" : "SUPPLIES AND OUR YOUNG PEOPLE", 1 - smooth((y - EV.supplyOrbit) / 0.45), false);
    }
    // the news, on its way to us: shorter every year
    const newsA = smooth((c - 10.6) / 0.4) * (1 - smooth((c - 11.8) / 0.4));
    if (newsA > 0.01) {
      const [ax, ay] = toScreen(archiveX(y), 0), off = (portrait ? 26 : 84) * dpr;
      g.globalCompositeOperation = "lighter";
      const nb = g.createLinearGradient(rx, ry, ax, ay); nb.addColorStop(0, rgba(ACC, 0.95 * newsA)); nb.addColorStop(1, rgba(ACC, 0.3 * newsA));
      g.strokeStyle = nb; g.lineWidth = 3 * dpr; g.beginPath();
      if (portrait) { g.moveTo(rx - off, ry); g.lineTo(ax - off, ay); } else { g.moveTo(rx, ry - off); g.lineTo(ax, ay - off); }
      g.stroke(); g.globalCompositeOperation = "source-over";
      if (!portrait) txt("THEIR NEWS, ON ITS WAY TO US", (rx + ax) / 2, ry - off - 16 * dpr, { size: 10.5, color: ACC, a: newsA });
    }
    // a message from the Archive now, and the answer it would wait for
    if (message) {
      const t = (performance.now() - message.start) / 1000, [ax, ay] = toScreen(archiveX(message.y), 0);
      const out = calm ? 1 : clamp(t / 2.2, 0, 1), back = calm ? 1 : clamp((t - 2.4) / 2.2, 0, 1);
      const qx = lerp(ax, rx, out), qy = lerp(ay, ry, out);   // light keeps one speed
      wake(ax, ay, qx, qy, "255,240,220", 1, 2.5);
      g.globalCompositeOperation = "lighter"; glow(qx, qy, 64 * dpr, "white", out < 1 ? 1 : 0.35); glow(qx, qy, 120 * dpr, "acc", out < 1 ? 0.5 : 0);
      if (out < 1) { g.beginPath(); g.arc(qx, qy, (10 + 14 * ((t * 3) % 1)) * dpr, 0, 2 * Math.PI); g.strokeStyle = rgba("255,240,220", 0.8 * (1 - (t * 3) % 1)); g.lineWidth = 1.5 * dpr; g.stroke(); }
      const landed = clamp((t - 2.2) / 0.9, 0, 1);
      if (landed > 0 && landed < 1) glow(rx, ry, (80 + 420 * landed) * dpr, "white", 0.7 * (1 - landed));
      if (back > 0) { const bx = lerp(rx, ax, back), by = lerp(ry, ay, back); g.setLineDash([6 * dpr, 8 * dpr]); g.strokeStyle = rgba(ACC, 0.7); g.lineWidth = 1.5 * dpr; g.beginPath(); g.moveTo(rx, ry); g.lineTo(bx, by); g.stroke(); g.setLineDash([]); glow(bx, by, 22 * dpr, "acc", 0.8); }
      g.globalCompositeOperation = "source-over";
      if (back < 1) requestDraw();
    }
    // Earth, at the start, close enough to fill the view; it falls away into the Sun's light as the view pulls back
    if (earthness > 0.01) {
      const size = Math.min(Wd, Hd) * lerp(0.05, portrait ? 0.62 : 0.78, earthness), ex = sx + (portrait ? 0 : Wd * 0.12 * earthness), ey = sy + (portrait ? Hd * 0.08 : 0) * earthness;
      g.globalAlpha = smooth(earthness * 1.4); g.drawImage(EARTH, ex - size / 2, ey - size / 2, size, size); g.globalAlpha = 1;
    }
    // the chosen, counted in
    if (countEl) { const k = smooth((c - 3.7) / 0.7); countEl.textContent = Math.round(20000 * k).toLocaleString("en-US"); }
    place(c, y);
  }

  // ── words, the timeline and the readout follow the scroll ───────────────────────────────────────────────────────
  let active = -1;
  function place(c, y) {
    const now = Math.min(N - 1, Math.max(0, Math.floor(c + 0.28)));
    if (now !== active) {
      chapters.forEach((ch, i) => ch.li.classList.toggle("is-on", i === now));
      active = now; hideReadout();
    }
    const share = c / (N - 1);
    fillBar.style.transform = `scaleX(${share})`;
    thumb.style.left = share * 100 + "%";
    thumb.setAttribute("aria-valuenow", String(Math.floor(fracYear(Voyage.dateAt(y)))));
    thumb.setAttribute("aria-valuetext", label(y));
    thumb.dataset.date = label(y);
  }
  function scrollToShare(share) {
    const r = track.getBoundingClientRect(), top = r.top + window.scrollY, room = r.height - stage.getBoundingClientRect().height;
    window.scrollTo({ top: top + clamp(share, 0, 1) * room, behavior: "auto" });
  }
  function dragFrom(e) {
    const rail = thumb.parentElement.getBoundingClientRect();
    scrollToShare((e.clientX - rail.left) / rail.width);
  }
  thumb.parentElement.addEventListener("pointerdown", (e) => {
    e.preventDefault(); thumb.parentElement.setPointerCapture(e.pointerId); dragFrom(e);
    const move = (m) => dragFrom(m), up = () => { thumb.parentElement.removeEventListener("pointermove", move); thumb.parentElement.removeEventListener("pointerup", up); };
    thumb.parentElement.addEventListener("pointermove", move); thumb.parentElement.addEventListener("pointerup", up);
  });
  thumb.addEventListener("keydown", (e) => {
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (step) { e.preventDefault(); scrollToShare((Math.round(position) + step) / (N - 1)); }
  });

  // tap a ship, the Sun or The Reach for its readout at this moment
  function hideReadout() { readout.hidden = true; }
  function describe(id, y) {
    const pct = (Math.floor(Voyage.progressAt(y) * 1000) / 10).toFixed(1);
    if (id === "archive") return ["The Archive", ["Twenty thousand aboard", `${Voyage.speedAt(y).toFixed(3)} c`, `${pct}% of the crossing`, label(y)]];
    if (id === "advance") return ["Advance ship", ["A few hundred crew", "Left Earth Mar 3308", "Landed on The Reach Jul 3325"]];
    if (id === "supply") return ["Supply ship", ["Supplies and our young people", "Left the Archive Oct 3330", "In orbit Mar 3337"]];
    if (id === "reach") {
      const lines = ["Alpha Centauri A"];
      if (y >= EV.signalOn) lines.push("Signal on Jul 3328", "Reached the Archive Mar 3330");
      if (y >= EV.stopped) lines.push("Silent since Jun 3340");
      return ["The Reach", lines];
    }
    if (id === "sol") return ["Sol", ["Earth", "Left behind 19 Jan 3310"]];
    return null;
  }
  cv.addEventListener("click", (e) => {
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * dpr, y = (e.clientY - r.top) * dpr;
    let best = null, bestD = 44 * dpr;
    for (const h of hits) { const d = Math.hypot(h.x - x, h.y - y); if (d < bestD) { best = h; bestD = d; } }
    if (!best) return hideReadout();
    const info = describe(best.id, storyTime(position)); if (!info) return hideReadout();
    readout.innerHTML = "";
    const h = document.createElement("p"); h.className = "story__readout-name"; h.textContent = info[0]; readout.append(h);
    for (const l of info[1]) { const p = document.createElement("p"); p.textContent = l; readout.append(p); }
    readout.hidden = false;
    const sr = stage.getBoundingClientRect(), left = clamp(best.x / dpr + 18, 12, sr.width - 240), top = clamp(best.y / dpr - 30, 90, sr.height - 160);
    readout.style.left = left + "px"; readout.style.top = top + "px";
  });

  // the last chapter: a message from where the Archive is now
  if (sendButton) {
    sendButton.hidden = false;
    sendButton.addEventListener("click", () => {
      const y = nowY(), d = LY - archiveX(y), v = Voyage.speedAt(y);
      const months = (yrs) => { const m = yrs * 12; return m < 1.5 ? `about ${Math.max(1, Math.round(m * 4.35))} weeks` : `about ${Math.round(m)} months`; };
      message = { start: performance.now(), y };
      sent.textContent = `Sent from the Archive at ${label(y)}. At the speed of light it reaches The Reach in ${months(d)}. An answer would reach us in ${months(2 * d / (1 + v))}.`;
      requestDraw();
    });
  }

  // ── running: only while the story is near the screen ────────────────────────────────────────────────────────────
  let queued = false;
  function requestDraw() { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; measure(); draw(); }); }
  let near = false;
  new IntersectionObserver((entries) => { near = entries[entries.length - 1].isIntersecting; if (near) requestDraw(); }, { rootMargin: "200px 0px" }).observe(track);
  window.addEventListener("scroll", () => { if (near) requestDraw(); }, { passive: true });
  window.addEventListener("resize", () => { resize(); requestDraw(); });
  root.classList.add("is-live");
  track.style.setProperty("--chapters", String(N));
  timeline.hidden = false;
  const hint = root.querySelector("[data-story-hint]"); if (hint) hint.hidden = false;
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => { resize(); measure(); draw(); });
  // a test can set the scroll position directly: window.__story(chapterFloat)
  window.__story = (c) => { position = clamp(c, 0, N - 1); draw(); };
  window.__storyState = () => ({ position, y: storyTime(position), label: label(storyTime(position)), hits: hits.map((h) => [h.id, Math.round(h.x / dpr), Math.round(h.y / dpr)]), meet: label(EV.meet), signalOn: label(EV.signalOn) });
})();
