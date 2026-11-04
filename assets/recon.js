/* The recon scope in PUSH INTO THE UNKNOWN: the map of The Reach under survey fog, with only the ground around the
   settlement charted. A scope drifts over it by itself; the visitor's pointer (or a drag on a phone) takes it, and the
   ground it passes over is charted and stays charted while the page is open. Nothing is stored and nothing is sent.
   Without scripts or a 2D canvas, the jungle picture stays. */
(function () {
  "use strict";
  const root = document.querySelector("[data-recon]");
  if (!root || !("IntersectionObserver" in window)) return;
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return;

  // The land under each cell of a 16 × 9 survey grid laid over the map picture: the site's reading of the illustration
  // (reach-map-*.webp), using the map legend's names. S snow, J jungle, D desert, V volcanic, C the settlement's country.
  const LANDS = { S: "Snow Highlands", J: "Dense Jungle", D: "Arid Desert / Mesa", V: "Volcanic Badlands", C: "The settlement" };
  const GRID = [
    "SSSSSJJJJJJJJDDD",
    "SSSSSJJJJJJJDDDD",
    "SSSSSSJJJJDDDDDD",
    "SSSSSSSJJDDDDDDD",
    "SSSSSSJJDDDDDDDD",
    "CCCCCCCVVVVVDDDD",
    "CCCCCCCVVVVVVVVV",
    "CCCCCCCCVVVVVVVV",
    "CCCCCCCCVVVVVVVV",
  ];
  const COLS = 16, ROWS = 9;
  const HOME = { x: 0.22, y: 0.66, r: 0.13 };   // the settlement's pin on the map, and the ground already charted round it
  const MASK_SCALE = 0.25;                       // the charted-ground mask is kept at a quarter of the canvas
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const canvasOf = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };

  // ── the layers: the map in colour, the same map dimmed under fog, the charted mask and the fog itself ──────────
  const canvas = el("canvas", "recon__canvas");
  canvas.setAttribute("aria-hidden", "true");
  const ctx = canvas.getContext("2d");
  const hud = el("div", "recon__hud");
  hud.setAttribute("aria-hidden", "true");
  const chartedLabel = el("span", "recon__label", "Charted");
  const chartedValue = el("span", "recon__value", "0%");
  const chartedNote = el("span", "recon__note", coarse ? "Drag the scope to chart it" : "Move the scope to chart it");
  hud.append(chartedLabel, chartedValue, chartedNote);
  const tag = el("div", "recon__tag");
  tag.setAttribute("aria-hidden", "true");
  const tagGrid = el("span", "recon__grid");
  const tagLand = el("span", "recon__land");
  const tagState = el("span", "recon__state");
  tag.append(tagGrid, tagLand, tagState);
  const live = el("div", "recon__live");   // what a screen reader hears, at most every few seconds
  live.setAttribute("aria-live", "polite");

  let map = null, W = 0, H = 0, dpr = 1;
  let colour = null, dim = null, mask = null, maskCtx = null, revealed = null, fog = null;
  let fit = { x: 0, y: 0, w: 0, h: 0 };          // where the map picture lands on the canvas (cover)
  let revealDirty = true;

  /** A cloudy noise tile for the fog: random values, blurred by drawing them small and scaling them up. */
  function makeFog() {
    const small = canvasOf(48, 27), s = small.getContext("2d"), img = s.createImageData(48, 27);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random();
      img.data[i] = 16; img.data[i + 1] = 21; img.data[i + 2] = 30; img.data[i + 3] = Math.round(70 + v * 150);
    }
    s.putImageData(img, 0, 0);
    const big = canvasOf(480, 270), b = big.getContext("2d");
    b.imageSmoothingQuality = "high";
    b.drawImage(small, 0, 0, 480, 270);
    return big;
  }

  function layout() {
    const box = root.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(box.width * dpr)), h = Math.max(1, Math.round(box.height * dpr));
    if (w === W && h === H) return;
    const oldMask = mask, oldW = W, oldH = H;
    W = w; H = h;
    canvas.width = W; canvas.height = H;
    const scale = Math.max(W / map.naturalWidth, H / map.naturalHeight);
    fit = { w: map.naturalWidth * scale, h: map.naturalHeight * scale };
    fit.x = (W - fit.w) / 2; fit.y = (H - fit.h) / 2;

    colour = canvasOf(W, H);
    const c = colour.getContext("2d");
    c.drawImage(map, fit.x, fit.y, fit.w, fit.h);

    // Under the fog the land is a cold, dim survey plate: grey, dark, a little blue, by hand (no canvas filters,
    // which Safari has not always had).
    dim = canvasOf(W, H);
    const d = dim.getContext("2d");
    const pixels = c.getImageData(0, 0, W, H), p = pixels.data;
    for (let i = 0; i < p.length; i += 4) {
      const lum = 0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2];
      const v = Math.pow(lum / 255, 1.2) * 255 * 0.4;
      p[i] = v * 0.86 + 4; p[i + 1] = v * 0.94 + 6; p[i + 2] = v * 1.08 + 10;
    }
    d.putImageData(pixels, 0, 0);
    // the survey grid over the plate
    d.strokeStyle = "rgba(232, 228, 220, 0.07)";
    d.lineWidth = Math.max(1, dpr * 0.75);
    d.beginPath();
    for (let i = 1; i < COLS; i++) { const x = Math.round(fit.x + (fit.w * i) / COLS) + 0.5; d.moveTo(x, 0); d.lineTo(x, H); }
    for (let j = 1; j < ROWS; j++) { const y = Math.round(fit.y + (fit.h * j) / ROWS) + 0.5; d.moveTo(0, y); d.lineTo(W, y); }
    d.stroke();

    mask = canvasOf(Math.max(1, Math.round(W * MASK_SCALE)), Math.max(1, Math.round(H * MASK_SCALE)));
    maskCtx = mask.getContext("2d", { willReadFrequently: true });   // read back every frame for the readout
    if (oldMask) maskCtx.drawImage(oldMask, 0, 0, oldW * MASK_SCALE, oldH * MASK_SCALE, 0, 0, mask.width, mask.height);
    else chart(fit.x + fit.w * HOME.x, fit.y + fit.h * HOME.y, fit.w * HOME.r, 1);
    revealed = canvasOf(W, H);
    revealDirty = true;
    measure();
  }

  /** Charts the ground in a soft circle round (x, y), in canvas pixels. */
  function chart(x, y, r, strength) {
    const s = MASK_SCALE, g = maskCtx.createRadialGradient(x * s, y * s, 0, x * s, y * s, r * s);
    g.addColorStop(0, `rgba(0, 0, 0, ${strength})`);
    g.addColorStop(0.6, `rgba(0, 0, 0, ${strength * 0.7})`);
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    maskCtx.fillStyle = g;
    maskCtx.beginPath();
    maskCtx.arc(x * s, y * s, r * s, 0, Math.PI * 2);
    maskCtx.fill();
    revealDirty = true;
  }

  let charted = 0;
  /** The share of the map's picture that is charted, from the mask (a cell counts once it is half lit). */
  function measure() {
    const s = MASK_SCALE;
    const x0 = Math.max(0, Math.floor(fit.x * s)), y0 = Math.max(0, Math.floor(fit.y * s));
    const x1 = Math.min(mask.width, Math.ceil((fit.x + fit.w) * s)), y1 = Math.min(mask.height, Math.ceil((fit.y + fit.h) * s));
    if (x1 <= x0 || y1 <= y0) return;
    const a = maskCtx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let lit = 0;
    for (let i = 3; i < a.length; i += 4) if (a[i] > 127) lit++;
    charted = lit / (a.length / 4);
    chartedValue.textContent = `${(charted * 100).toFixed(charted < 0.1 ? 1 : 0)}%`;
  }

  // ── the scope ──────────────────────────────────────────────────────────────────────────────────────────────────
  const scope = { x: 0.5, y: 0.4 };       // where it is, as a share of the canvas
  let target = { x: 0.5, y: 0.4 };
  let held = false, lastHand = -Infinity, t0 = performance.now(), running = false, raf = 0, lastMeasure = 0, lastSaid = "";

  /** Where the drifting scope is at time t: a slow loop over most of the map, weighted to the north and east. */
  const drift = (t) => ({ x: 0.58 + 0.3 * Math.sin(t * 0.00011), y: 0.42 + 0.27 * Math.sin(t * 0.00017 + 1.1) });

  function cellAt(sx, sy) {
    const mx = (sx * W - fit.x) / fit.w, my = (sy * H - fit.y) / fit.h;
    const col = Math.min(COLS - 1, Math.max(0, Math.floor(mx * COLS))), row = Math.min(ROWS - 1, Math.max(0, Math.floor(my * ROWS)));
    return { col, row, land: LANDS[GRID[row][col]] };
  }
  const chartedAt = (sx, sy) => {
    const px = Math.min(mask.width - 1, Math.max(0, Math.round(sx * W * MASK_SCALE)));
    const py = Math.min(mask.height - 1, Math.max(0, Math.round(sy * H * MASK_SCALE)));
    return maskCtx.getImageData(px, py, 1, 1).data[3] > 127;
  };

  function frame(now) {
    raf = 0;
    if (!running) return;
    if (!held && now - lastHand > 2600 && !calm) target = drift(now - t0);
    const k = held ? 0.28 : 0.045;
    scope.x += (target.x - scope.x) * k;
    scope.y += (target.y - scope.y) * k;
    const sx = scope.x * W, sy = scope.y * H;
    const radius = Math.min(W, H) * (coarse ? 0.2 : 0.17);
    if (held || now - lastHand < 2600) chart(sx, sy, radius * 0.92, 0.9);

    if (revealDirty) {
      const r = revealed.getContext("2d");
      r.globalCompositeOperation = "copy";
      r.drawImage(colour, 0, 0);
      r.globalCompositeOperation = "destination-in";
      r.drawImage(mask, 0, 0, W, H);
      r.globalCompositeOperation = "source-over";
      revealDirty = false;
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(dim, 0, 0);
    ctx.globalAlpha = 0.82;
    ctx.drawImage(revealed, 0, 0);
    ctx.globalAlpha = 1;
    // the fog, drifting slowly, thinner over charted ground than over the unknown
    const fogT = calm ? 0 : (now - t0) * 0.000012;
    const fw = W * 1.6, fh = H * 1.6;
    const ox = -(fw - W) * (0.5 + 0.5 * Math.sin(fogT * 3)), oy = -(fh - H) * (0.5 + 0.5 * Math.sin(fogT * 5 + 1));
    ctx.globalAlpha = 0.5;
    ctx.drawImage(fog, ox, oy, fw, fh);
    ctx.globalAlpha = 1;

    // the lens: the land in full colour, a little magnified, inside a ring
    const zoom = 1.9;
    ctx.save();
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#05070b";
    ctx.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
    const sw = (radius * 2) / zoom;
    ctx.drawImage(colour, sx - sw / 2, sy - sw / 2, sw, sw, sx - radius, sy - radius, radius * 2, radius * 2);
    const vignette = ctx.createRadialGradient(sx, sy, radius * 0.55, sx, sy, radius);
    vignette.addColorStop(0, "rgba(3, 4, 6, 0)");
    vignette.addColorStop(1, "rgba(3, 4, 6, 0.55)");
    ctx.fillStyle = vignette;
    ctx.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
    if (!calm) {   // the scan bar runs down the glass
      const band = ((now - t0) % 2800) / 2800;
      const by = sy - radius + band * radius * 2;
      const scan = ctx.createLinearGradient(0, by - radius * 0.18, 0, by);
      scan.addColorStop(0, "rgba(224, 137, 62, 0)");
      scan.addColorStop(1, "rgba(224, 137, 62, 0.16)");
      ctx.fillStyle = scan;
      ctx.fillRect(sx - radius, by - radius * 0.18, radius * 2, radius * 0.18);
    }
    ctx.restore();

    const line = Math.max(1, dpr);
    ctx.lineWidth = line;
    ctx.strokeStyle = "rgba(232, 228, 220, 0.55)";
    ctx.beginPath(); ctx.arc(sx, sy, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "rgba(232, 228, 220, 0.18)";
    ctx.beginPath(); ctx.arc(sx, sy, radius + 6 * dpr, 0, Math.PI * 2); ctx.stroke();
    // range ticks round the ring, long every 30°
    ctx.strokeStyle = "rgba(232, 228, 220, 0.4)";
    ctx.beginPath();
    for (let a = 0; a < 360; a += 10) {
      const rad = (a * Math.PI) / 180, long = a % 30 === 0, r0 = radius + 6 * dpr, r1 = r0 + (long ? 7 : 3.5) * dpr;
      ctx.moveTo(sx + Math.cos(rad) * r0, sy + Math.sin(rad) * r0);
      ctx.lineTo(sx + Math.cos(rad) * r1, sy + Math.sin(rad) * r1);
    }
    ctx.stroke();
    // the crosshair, open in the middle
    ctx.strokeStyle = "rgba(224, 137, 62, 0.85)";
    ctx.beginPath();
    const gap = radius * 0.14, arm = radius * 0.34;
    ctx.moveTo(sx - gap - arm, sy); ctx.lineTo(sx - gap, sy);
    ctx.moveTo(sx + gap, sy); ctx.lineTo(sx + gap + arm, sy);
    ctx.moveTo(sx, sy - gap - arm); ctx.lineTo(sx, sy - gap);
    ctx.moveTo(sx, sy + gap); ctx.lineTo(sx, sy + gap + arm);
    ctx.stroke();
    ctx.fillStyle = "rgba(224, 137, 62, 0.95)";
    ctx.beginPath(); ctx.arc(sx, sy, 1.6 * dpr, 0, Math.PI * 2); ctx.fill();

    // the readout beside the lens
    const cell = cellAt(scope.x, scope.y);
    const ref = `Grid ${String.fromCharCode(65 + cell.col)}-${String(cell.row + 1).padStart(2, "0")}`;
    const isCharted = chartedAt(scope.x, scope.y);
    if (tagGrid.textContent !== ref) tagGrid.textContent = ref;
    if (tagLand.textContent !== cell.land) tagLand.textContent = cell.land;
    const state = isCharted ? "Charted" : "Uncharted";
    if (tagState.textContent !== state) { tagState.textContent = state; tag.classList.toggle("is-charted", isCharted); }
    const cssR = radius / dpr, cssX = sx / dpr, cssY = sy / dpr, boxW = W / dpr;
    const right = cssX + cssR + 18 + 150 < boxW;
    tag.style.transform = `translate(${right ? cssX + cssR + 18 : cssX - cssR - 18}px, ${cssY - cssR * 0.6}px) translateX(${right ? 0 : -100}%)`;
    tag.classList.toggle("is-left", !right);

    if (now - lastMeasure > 300) {
      lastMeasure = now;
      measure();
      const said = `${ref}, ${cell.land}, ${state.toLowerCase()}. ${chartedValue.textContent} of the map charted.`;
      if (held && said !== lastSaid && now - lastHand < 400) { lastSaid = said; live.textContent = said; }
    }
    raf = requestAnimationFrame(frame);
  }

  const play = () => { if (!raf && running) raf = requestAnimationFrame(frame); };

  // ── the hand: hover on a desk, a drag or a tap on a phone ───────────────────────────────────────────────────────
  const aim = (e) => {
    const box = canvas.getBoundingClientRect();
    target = { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height };
    lastHand = performance.now();
    if (!root.classList.contains("is-engaged")) { root.classList.add("is-engaged"); chartedNote.textContent = "The rest is still unknown"; }
  };
  canvas.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" || held) { aim(e); held = e.pointerType === "mouse" ? true : held; } });
  canvas.addEventListener("pointerdown", (e) => { held = true; aim(e); });
  canvas.addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") held = false; lastHand = performance.now(); });
  canvas.addEventListener("pointercancel", () => { held = false; });
  canvas.addEventListener("pointerleave", () => { held = false; lastHand = performance.now(); });

  function mount() {
    map = new Image();
    map.decoding = "async";
    map.onload = () => {
      fog = makeFog();
      root.append(canvas, hud, tag, live);
      root.classList.add("is-recon");
      layout();
      running = inView && !document.hidden;
      requestAnimationFrame((now) => { t0 = now; target = drift(0); scope.x = target.x; scope.y = target.y; play(); });
      root.classList.add("is-live");
      new ResizeObserver(() => { if (map) { layout(); play(); } }).observe(root);
    };
    map.src = window.innerWidth * (window.devicePixelRatio || 1) > 1400 ? "/assets/img/reach-map-2560.webp" : "/assets/img/reach-map-1280.webp";
  }

  let inView = false, started = false;
  new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting) && !started) { started = true; mount(); }
  }, { rootMargin: "600px 0px" }).observe(root);
  new IntersectionObserver((entries) => {
    inView = entries[entries.length - 1].isIntersecting;
    running = inView && !document.hidden && Boolean(colour);
    if (running) play();
  }, { threshold: [0, 0.1] }).observe(root);
  document.addEventListener("visibilitychange", () => { running = inView && !document.hidden && Boolean(colour); if (running) play(); });
})();
