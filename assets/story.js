/* How we got here, as story cards: nine full-screen cards from Earth's failure to the Archive today, each a picture, a
   date and a line or two. They play on their own while the stage is on screen. A tap on the right goes on and on the
   left goes back, a hold pauses, and a swipe or an arrow key moves through them. The last card is the ship's clock now
   (site.js fills its readouts), and a message can be sent from it. Four cards are drawn here: Earth under dust, the
   answer from Alpha Centauri, the twenty thousand, and the signal stopping. The rest are the site's own pictures. The
   Archive's numbers are ship.js's (Voyage). Without scripts the cards read as a list. Nothing is stored. */
(function () {
  "use strict";
  const root = document.querySelector("[data-story]");
  const stage = root && root.querySelector("[data-story-stage]");
  if (!stage || !("IntersectionObserver" in window)) return;
  const cards = [...stage.querySelectorAll("[data-card]")];
  const N = cards.length;
  if (!N) return;
  const cv = stage.querySelector(".story__canvas"), g = cv.getContext("2d");
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const touch = window.matchMedia("(hover: none)").matches;

  // ── helpers ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
  function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0; s ^= s >>> 13; return (s >>> 0) / 4294967296; }; }
  const rgba = (c, a) => `rgba(${c},${a})`;
  const ACC = "224,137,62", COOL = "170,205,255", SUN = "255,214,150", WHITE = "255,250,240", EMBER = "255,180,110", CREAM = "255,236,205";
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }

  // ── the words: each headline word lands on its own ──────────────────────────────────────────────────────────────
  function splitWords(h) {
    h.setAttribute("aria-label", h.textContent.replace(/\s+/g, " ").trim());
    let i = 0;
    const walk = (node) => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          for (const part of child.textContent.split(/(\s+)/)) {
            if (!part) continue;
            if (/^\s+$/.test(part)) { frag.append(document.createTextNode(" ")); continue; }
            const w = el("span", "story__w", part); w.setAttribute("aria-hidden", "true"); w.style.setProperty("--i", String(i++)); frag.append(w);
          }
          child.replaceWith(frag);
        } else if (child.nodeType === 1) {
          if (child.hasAttribute("data-story-count")) { child.classList.add("story__w"); child.setAttribute("aria-hidden", "true"); child.style.setProperty("--i", String(i++)); }
          else walk(child);
        }
      }
    };
    walk(h);
    return i;
  }
  // a card stays up for as long as its words take to read; the last one stays until it is left
  const durations = cards.map((card, k) => {
    const h = card.querySelector("h3");
    card.style.setProperty("--n", String(h ? splitWords(h) : 0));
    if (k === N - 1) return Infinity;
    const chars = card.querySelector(".story__words").textContent.replace(/\s+/g, " ").trim().length;
    return clamp(2.6 + chars / 20, 7, 11.5) * 1000;
  });
  cards.forEach((card, k) => { card.setAttribute("aria-label", `${k + 1} of ${N}`); card.style.setProperty("--dur", `${(Number.isFinite(durations[k]) ? durations[k] / 1000 : 30) + 1.4}s`); });

  // ── the frame: progress bars, the count, pause, back and on ─────────────────────────────────────────────────────
  const bars = el("div", "story__bars"); bars.setAttribute("aria-hidden", "true");
  const fills = cards.map(() => { const b = el("span"), f = el("i"); b.append(f); bars.append(b); return f; });
  const counter = el("p", "story__index"); counter.setAttribute("aria-hidden", "true");
  const pauseButton = el("button", "story__pause"); pauseButton.type = "button";
  const prev = el("button", "story__prev"), next = el("button", "story__next");
  prev.type = next.type = "button"; prev.setAttribute("aria-label", "Previous card"); next.setAttribute("aria-label", "Next card");
  const tap = el("p", "story__tap", touch ? "Tap to go on · hold to pause" : "Click or → to go on · space pauses"); tap.setAttribute("aria-hidden", "true");
  const status = el("p", "story__status"); status.setAttribute("aria-live", "polite");
  const buttons = el("div", "story__buttons"); buttons.append(prev, next, pauseButton);
  const top = el("div", "story__top"); top.append(counter, buttons);
  stage.append(bars, top, tap, status);

  // ── state ───────────────────────────────────────────────────────────────────────────────────────────────────────
  let index = 0, t = 0, prevIndex = -1, leftAt = 0, changedAt = 0, started = false;
  let userPaused = calm, held = false, onScreen = false, touched = false;
  const leaving = new Map();
  const countEl = stage.querySelector("[data-story-count]"), COUNT = 20000;
  const sceneOf = (k) => (k >= 0 ? cards[k].dataset.scene || null : null);

  function setPaused(p) {
    userPaused = p;
    stage.classList.toggle("is-paused", p);
    pauseButton.setAttribute("aria-label", p ? "Play" : "Pause");
    pauseButton.classList.toggle("is-play", p);
    kick();
  }
  pauseButton.addEventListener("click", () => setPaused(!userPaused));

  function enter(k) {
    const card = cards[k];
    card.classList.remove("is-leaving");
    card.classList.add("is-on");
    counter.textContent = `${String(k + 1).padStart(2, "0")} / ${String(N).padStart(2, "0")}`;
    prev.disabled = k === 0; next.disabled = k === N - 1;
    stage.classList.toggle("is-last", k === N - 1);
    if (countEl && card.contains(countEl)) countEl.textContent = calm ? COUNT.toLocaleString("en-US") : "0";
  }
  function go(k, byHand) {
    k = clamp(k, 0, N - 1);
    if (k === index || !started) return;
    const from = cards[index];
    from.classList.remove("is-on"); from.classList.add("is-leaving");
    clearTimeout(leaving.get(from)); leaving.set(from, setTimeout(() => from.classList.remove("is-leaving"), 1200));
    if (countEl && from.contains(countEl)) countEl.textContent = COUNT.toLocaleString("en-US");
    prevIndex = index; leftAt = t; index = k; t = 0; changedAt = performance.now();
    enter(k);
    if (byHand) {
      if (!touched) { touched = true; stage.classList.add("is-touched"); }
      status.textContent = `${k + 1} of ${N}: ${cards[k].querySelector("h3").getAttribute("aria-label")}`;
    }
    kick();
  }
  prev.addEventListener("click", () => go(index - 1, true));
  next.addEventListener("click", () => go(index + 1, true));
  const again = stage.querySelector("[data-story-again]");
  if (again) { again.hidden = false; again.addEventListener("click", () => go(0, true)); }

  // ── the clock: one frame loop, only while the stage is on screen ────────────────────────────────────────────────
  let running = false, last = 0;
  function frame(now) {
    const dt = last ? Math.min(100, now - last) : 0; last = now;
    const advancing = onScreen && !document.hidden && !userPaused && !held && started;
    if (advancing) { t += dt; if (t >= durations[index]) go(index + 1); }
    for (let k = 0; k < N; k++) {
      const share = k < index ? 1 : k > index ? 0 : Number.isFinite(durations[k]) ? clamp(t / durations[k], 0, 1) : 1;
      fills[k].style.transform = `scaleX(${share})`;
    }
    const counting = countEl && cards[index].contains(countEl) && !calm && now - changedAt < 2600;
    if (counting) countEl.textContent = (Math.round(COUNT * smooth((now - changedAt - 350) / 1900) / 10) * 10).toLocaleString("en-US");
    const fading = now - changedAt < 1000;
    const drawing = paint(now);
    if (onScreen && !document.hidden && (advancing || counting || fading || (drawing && !calm))) requestAnimationFrame(frame);
    else { running = false; last = 0; }
  }
  function kick() { if (running || !onScreen) return; running = true; last = 0; requestAnimationFrame(frame); }

  new IntersectionObserver((entries) => {
    onScreen = entries[entries.length - 1].intersectionRatio >= 0.45;
    if (onScreen && !started) { started = true; changedAt = performance.now(); enter(0); }
    kick();
  }, { threshold: [0, 0.45, 0.7] }).observe(stage);
  document.addEventListener("visibilitychange", kick);

  // ── touch and keys: right side on, left side back, a hold pauses, a sideways swipe turns ────────────────────────
  let down = null, holdTimer = 0;
  const release = () => { clearTimeout(holdTimer); if (held) { held = false; stage.classList.remove("is-held"); kick(); } };
  stage.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("button, a, input")) return;
    down = { x: e.clientX, y: e.clientY };
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => { if (down) { held = true; stage.classList.add("is-held"); } }, 240);
  });
  stage.addEventListener("pointerup", (e) => {
    if (!down) return;
    const d = down; down = null;
    if (held) return release();
    clearTimeout(holdTimer);
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) return go(index + (dx < 0 ? 1 : -1), true);
    if (Math.hypot(dx, dy) > 12) return;
    const r = stage.getBoundingClientRect();
    go(index + (e.clientX - r.left < r.width * 0.3 ? -1 : 1), true);
  });
  stage.addEventListener("pointercancel", () => { down = null; release(); });
  stage.addEventListener("contextmenu", (e) => { if (held || down) e.preventDefault(); });
  stage.addEventListener("keydown", (e) => {
    if (e.target.closest("button") && (e.key === " " || e.key === "Enter")) return;
    if (e.key === "ArrowRight") go(index + 1, true);
    else if (e.key === "ArrowLeft") go(index - 1, true);
    else if (e.key === " ") setPaused(!userPaused);
    else return;
    e.preventDefault();
  });

  // ── the last card: a message from where the Archive is now ──────────────────────────────────────────────────────
  const sendButton = stage.querySelector("[data-story-send]"), sent = stage.querySelector("[data-story-sent]");
  if (sendButton && sent && typeof Voyage !== "undefined") {
    const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const fracYear = (date) => { const y = date.getUTCFullYear(), s = Date.UTC(y, 0, 1), e = Date.UTC(y + 1, 0, 1); return y + (date - s) / (e - s); };
    const label = (y) => { const c = fracYear(Voyage.dateAt(y)), yr = Math.floor(c); return MONTHS[Math.min(11, Math.floor((c - yr) * 12))] + " " + yr; };
    const months = (yrs) => { const m = yrs * 12; return m < 1.5 ? `about ${Math.max(1, Math.round(m * 4.35))} weeks` : `about ${Math.round(m)} months`; };
    sendButton.hidden = false;
    sendButton.addEventListener("click", () => {
      const y = Voyage.voyageTime(Voyage.shipNow()), d = Voyage.archive.lightYears * (1 - Voyage.progressAt(y)), v = Voyage.speedAt(y);
      sent.textContent = `Sent from the Archive at ${label(y)}. At the speed of light it reaches The Reach in ${months(d)}. An answer would reach us in ${months(2 * d / (1 + v))}.`;
      stage.classList.remove("is-sending"); void stage.offsetWidth; stage.classList.add("is-sending");
    });
  }

  // ── the drawn cards: one canvas under the pictures, sized to the stage ──────────────────────────────────────────
  let W = 0, H = 0, dpr = 1, portrait = false, u = 1, sky = null, painted = false;
  const sprites = {};
  function glowSprite(color) {
    const c = el("canvas"); c.width = c.height = 128; const x = c.getContext("2d");
    const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, rgba(color, 1)); gr.addColorStop(0.18, rgba(color, 0.45)); gr.addColorStop(0.5, rgba(color, 0.1)); gr.addColorStop(1, rgba(color, 0));
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128); return c;
  }
  function discSprite(color) {   // an out-of-focus light: flat, with a brighter rim
    const c = el("canvas"); c.width = c.height = 128; const x = c.getContext("2d");
    const gr = x.createRadialGradient(64, 64, 0, 64, 64, 62);
    gr.addColorStop(0, rgba(color, 0.42)); gr.addColorStop(0.78, rgba(color, 0.5)); gr.addColorStop(0.92, rgba(color, 0.78)); gr.addColorStop(1, rgba(color, 0));
    x.fillStyle = gr; x.beginPath(); x.arc(64, 64, 62, 0, Math.PI * 2); x.fill(); return c;
  }
  for (const [k, c] of [["acc", ACC], ["cool", COOL], ["sun", SUN], ["white", WHITE], ["ember", EMBER]]) sprites[k] = glowSprite(c);
  for (const [k, c] of [["amber", EMBER], ["cream", CREAM], ["blue", COOL]]) sprites["disc-" + k] = discSprite(c);
  // the five decks, top to bottom in the story's list order, each in its house's colour (the Factions section's inks)
  const DECKS = ["212,162,60", "160,117,204", "213,99,107", "74,144,194", "143,168,60"];
  DECKS.forEach((c, i) => { sprites["deck" + i] = glowSprite(c); });
  function glow(x, y, r, sprite, a) { if (a <= 0.003 || r <= 0) return; g.globalAlpha = Math.min(1, a); g.drawImage(sprites[sprite], x - r, y - r, 2 * r, 2 * r); }

  function makeSky() {
    const c = el("canvas"); c.width = Math.round(W * 1.12); c.height = Math.round(H * 1.12);
    const x = c.getContext("2d"), w = c.width, h = c.height;
    const base = x.createLinearGradient(0, 0, w, h); base.addColorStop(0, "#0d1830"); base.addColorStop(0.55, "#0a0f1e"); base.addColorStop(1, "#171019");
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    const blob = (bx, by, r, col, a) => { const gr = x.createRadialGradient(bx, by, 0, bx, by, r); gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0)); x.fillStyle = gr; x.fillRect(bx - r, by - r, 2 * r, 2 * r); };
    x.globalCompositeOperation = "lighter";
    blob(w * 0.18, h * 0.22, Math.max(w, h) * 0.6, "50,92,170", 0.30);
    blob(w * 0.84, h * 0.62, Math.max(w, h) * 0.55, "170,96,46", 0.24);
    blob(w * 0.46, h * 1.02, Math.max(w, h) * 0.5, "96,60,130", 0.20);
    // a band of the galaxy, corner to corner
    const r = rng(11);
    for (let i = 0; i < 26; i++) { const k = r(); blob(w * (0.05 + 0.9 * k) + (r() - 0.5) * w * 0.08, h * (0.92 - 0.84 * k) + (r() - 0.5) * h * 0.1, Math.max(w, h) * (0.06 + 0.1 * r()), r() > 0.5 ? "150,170,220" : "210,170,140", 0.05 + 0.05 * r()); }
    const count = Math.round(w * h / 900);
    for (let i = 0; i < count; i++) {
      const band = r() < 0.35, k = r(), sx = band ? w * (0.05 + 0.9 * k) + (r() - 0.5) * w * 0.16 : r() * w, sy = band ? h * (0.92 - 0.84 * k) + (r() - 0.5) * h * 0.2 : r() * h;
      const z = r() * r(), b = r(), s = (0.5 + 1.9 * z) * dpr;
      x.fillStyle = rgba(b > 0.86 ? "255,214,170" : b < 0.12 ? "170,200,255" : "235,236,240", 0.22 + 0.75 * z);
      x.fillRect(sx, sy, s, s);
      if (z > 0.78 && b > 0.4) blob(sx, sy, 16 * dpr, "220,230,255", 0.2);
    }
    return c;
  }
  function drawSky(a, drift) {
    if (!sky) sky = makeSky();
    g.globalCompositeOperation = "source-over"; g.globalAlpha = a;
    g.drawImage(sky, -(sky.width - W) / 2 - drift * W * 0.04, -(sky.height - H) / 2 - drift * H * 0.015);
  }

  // Earth under dust, drawn once small and then large in slices, so the page never stalls
  function earthPixels(S) {
    const img = new ImageData(S, S), d = img.data;
    const hash = (a, b, cc) => { let h = Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(cc, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const noise = (px, py, pz) => { const xi = Math.floor(px), yi = Math.floor(py), zi = Math.floor(pz), xf = px - xi, yf = py - yi, zf = pz - zi; const a = xf * xf * (3 - 2 * xf), b = yf * yf * (3 - 2 * yf), c = zf * zf * (3 - 2 * zf); const cc = (p, q, e) => hash(xi + p, yi + q, zi + e); return lerp(lerp(lerp(cc(0, 0, 0), cc(1, 0, 0), a), lerp(cc(0, 1, 0), cc(1, 1, 0), a), b), lerp(lerp(cc(0, 0, 1), cc(1, 0, 1), a), lerp(cc(0, 1, 1), cc(1, 1, 1), a), b), c); };
    const fbm = (px, py, pz) => 0.55 * noise(px, py, pz) + 0.3 * noise(2.1 * px, 2.1 * py, 2.1 * pz) + 0.15 * noise(4.3 * px, 4.3 * py, 4.3 * pz);
    const L = [-0.8, 0.46, 0.38], R = S / 2 - S * 0.03;
    let j = 0;
    return {
      img,
      rows(n) {   // fills the next n rows; true once the planet is done
        for (const end = Math.min(S, j + n); j < end; j++) for (let i = 0; i < S; i++) {
          const dx = (i - S / 2) / R, dy = (S / 2 - j) / R, r2 = dx * dx + dy * dy, k = (j * S + i) * 4;
          if (r2 > 1.12) continue;
          if (r2 > 1) {   // the thin lit air at the edge
            const al = Math.pow(clamp(1 - (Math.sqrt(r2) - 1) / 0.06, 0, 1), 2) * Math.max(0, -0.8 * dx + 0.46 * dy + 0.25);
            d[k] = 170; d[k + 1] = 196; d[k + 2] = 240; d[k + 3] = 255 * clamp(al * 1.3, 0, 1); continue;
          }
          const nz = Math.sqrt(1 - r2), dust = 0.85 * smooth((fbm(dx * 1.6 + 3, dy * 1.6, nz * 1.6) - 0.5) / 0.1), fine = fbm(dx * 5 + 9, dy * 5 + 2, nz * 5);
          const cloud = smooth((fine - 0.56) / 0.08) * (1 - dust) * 0.55;
          const lit = 0.025 + 0.975 * Math.pow(Math.max(0, dx * L[0] + dy * L[1] + nz * L[2]), 0.85), fres = Math.pow(1 - nz, 3);
          let rr = lerp(18, 132, dust) + 36 * (fine - 0.5) * dust, gg = lerp(52, 98, dust) + 26 * (fine - 0.5) * dust, bb = lerp(98, 60, dust);
          rr = lerp(rr, 150, cloud); gg = lerp(gg, 156, cloud); bb = lerp(bb, 160, cloud);
          d[k] = rr * lit + 110 * fres * lit; d[k + 1] = gg * lit + 130 * fres * lit; d[k + 2] = bb * lit + 180 * fres * lit; d[k + 3] = 255;
        }
        return j >= S;
      },
    };
  }
  function earthCanvas(S, job) { const c = el("canvas"); c.width = c.height = S; c.getContext("2d").putImageData(job.img, 0, 0); return c; }
  let earth = (() => { const S = 320, job = earthPixels(S); job.rows(S); return earthCanvas(S, job); })();
  let earthWanted = 0, earthBuilding = false;
  function buildEarth(S) {
    if (earthBuilding || S <= earth.width * 1.15) return;
    earthBuilding = true;
    const job = earthPixels(S), slice = () => { if (job.rows(40)) { earth = earthCanvas(S, job); earthBuilding = false; if (earthWanted > S * 1.15) buildEarth(earthWanted); kick(); } else setTimeout(slice, 0); };
    setTimeout(slice, 0);
  }

  function drawEarth(a, s) {
    drawSky(a, s / 12);
    const zoom = 1 + 0.045 * Math.min(s, 12) / 12;
    const R = (portrait ? W * 0.6 : H * 0.5) * zoom, cx = portrait ? W * 0.74 : W * 0.7, cy = portrait ? H * 0.36 : H * 0.54;
    earthWanted = Math.min(1400, Math.round(R * 2.1)); buildEarth(earthWanted);
    const sx = cx - 0.87 * R * 1.02, sy = cy - 0.5 * R * 1.02;   // the sun, just over the lit limb
    g.globalCompositeOperation = "lighter";
    glow(sx, sy, R * 2.2, "sun", 0.28 * a); glow(sx, sy, R * 0.9, "sun", 0.42 * a); glow(cx - R * 0.5, cy - R * 0.3, R * 1.5, "cool", 0.16 * a);
    g.globalCompositeOperation = "source-over"; g.globalAlpha = a;
    const half = R / (1 - 0.06);   // the sprite's planet fills 94% of it
    g.drawImage(earth, cx - half, cy - half, 2 * half, 2 * half);
    g.globalCompositeOperation = "lighter";
    glow(sx, sy, R * 0.22, "white", 0.85 * a); glow(sx, sy, R * 0.07, "white", a);
    g.save(); g.translate(sx, sy); g.scale(7, 0.22); glow(0, 0, R * 0.16, "white", 0.5 * a); g.restore();
    g.save(); g.translate(sx, sy); g.rotate(-0.52); g.scale(0.18, 4); glow(0, 0, R * 0.12, "sun", 0.35 * a); g.restore();
  }

  function spike(x, y, len, width, angle, color, a) {
    g.save(); g.translate(x, y); g.rotate(angle);
    const gr = g.createLinearGradient(-len, 0, len, 0);
    gr.addColorStop(0, rgba(color, 0)); gr.addColorStop(0.5, rgba(color, a)); gr.addColorStop(1, rgba(color, 0));
    g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(-len, -width / 2, 2 * len, width); g.restore();
  }
  function drawAnswer(a, s) {
    drawSky(a, 0.6 + s / 14);
    const zoom = 1 + 0.06 * Math.min(s, 12) / 12, sx = portrait ? W * 0.56 : W * 0.66, sy = portrait ? H * 0.3 : H * 0.36, k = u * zoom;
    g.globalCompositeOperation = "lighter";
    glow(sx, sy, k * 1.3, "sun", 0.26 * a); glow(sx, sy, k * 0.5, "sun", 0.4 * a); glow(sx, sy, k * 0.9, "cool", 0.1 * a);
    // the report coming home: rings out of the star, toward us
    for (let i = 0; i < 4; i++) {
      const p = ((s + i * 0.85) % 3.4) / 3.4, r = k * (0.06 + 1.05 * p), al = Math.pow(1 - p, 1.6) * 0.5 * a;
      g.globalAlpha = 1;
      for (const [lw, m] of [[16, 0.12], [5, 0.3], [1.6, 1]]) { g.strokeStyle = rgba(i % 2 ? COOL : SUN, al * m); g.lineWidth = lw * dpr; g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.stroke(); }
    }
    // Alpha Centauri A and B
    glow(sx, sy, k * 0.16, "white", 0.95 * a); glow(sx + k * 0.035, sy + k * 0.014, k * 0.09, "ember", 0.85 * a);
    glow(sx, sy, k * 0.045, "white", a); glow(sx + k * 0.035, sy + k * 0.014, k * 0.02, "white", 0.8 * a);
    spike(sx, sy, k * 0.6, 2.2 * dpr, 0, WHITE, 0.55 * a); spike(sx, sy, k * 0.42, 2.2 * dpr, Math.PI / 2, WHITE, 0.45 * a);
    spike(sx, sy, k * 0.22, 1.4 * dpr, Math.PI / 4, SUN, 0.3 * a); spike(sx, sy, k * 0.22, 1.4 * dpr, -Math.PI / 4, SUN, 0.3 * a);
    g.globalCompositeOperation = "source-over"; g.globalAlpha = 0.8 * a; g.fillStyle = "rgb(232,228,220)";
    g.font = `${Math.round(11 * dpr)}px "B612 Mono", monospace`;
    if (g.letterSpacing !== undefined) g.letterSpacing = `${3 * dpr}px`;
    if (portrait) { g.textAlign = "center"; g.fillText("ALPHA CENTAURI", sx, sy + k * 0.3); }
    else { g.textAlign = "left"; g.fillText("ALPHA CENTAURI", sx + k * 0.12, sy - k * 0.1); }
    if (g.letterSpacing !== undefined) g.letterSpacing = "0px";
  }

  const BOKEH = (() => { const r = rng(20000); return Array.from({ length: 110 }, () => ({ x: r(), y: r(), z: r(), c: r(), ph: r() * 6.283 })); })();
  function drawChosen(a, s) {
    g.globalCompositeOperation = "source-over"; g.globalAlpha = a;
    const base = g.createLinearGradient(0, 0, 0, H); base.addColorStop(0, "#1c120c"); base.addColorStop(0.6, "#0e0b0d"); base.addColorStop(1, "#08090d");
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "lighter";
    glow(W * 0.5, H * 0.42, Math.max(W, H) * 0.75, "sun", 0.2 * a); glow(W * 0.5, H * 0.95, Math.max(W, H) * 0.5, "ember", 0.18 * a);
    for (const b of BOKEH) {
      const size = u * (0.015 + 0.11 * b.z * b.z), y = ((b.y - s * 0.006 * (0.3 + b.z)) % 1 + 1) % 1;
      const x = b.x * W + Math.sin(s * 0.3 + b.ph) * u * 0.01, tw = 0.75 + 0.25 * Math.sin(s * 0.9 + b.ph * 3);
      const sprite = b.c > 0.78 ? "disc-cream" : b.c < 0.1 ? "disc-blue" : "disc-amber";
      g.globalAlpha = (0.10 + 0.26 * (1 - b.z)) * tw * a;
      g.drawImage(sprites[sprite], x - size, y * H * 1.1 - H * 0.05 - size, 2 * size, 2 * size);
    }
  }

  // the signal: data coming in bursts, weaker, then nothing
  function signalY(x, y0, amp) {
    const f = x / W, end = 0.6;
    if (f >= end) return y0;
    const strength = 1 - 0.65 * (f / end), cell = (f * 9) % 1, burst = Math.pow(Math.sin(cell * Math.PI), 2) * (cell < 0.82 ? 1 : 0);
    return y0 - amp * strength * burst * Math.sin(x / (4.2 * dpr)) * (0.65 + 0.35 * Math.sin(x / (23 * dpr)));
  }
  function drawSilence(a, s) {
    drawSky(a, 1.2 + s / 16);
    const y0 = portrait ? H * 0.32 : H * 0.38, amp = u * 0.085, pen = calm ? 1 : clamp(s / 5.5, 0, 1), px = W * pen;
    g.globalCompositeOperation = "lighter";
    glow(W * 0.32, y0, Math.max(W, H) * 0.55, "ember", 0.2 * a); glow(W * 0.32, y0, u * 0.35, "sun", 0.16 * a);
    g.globalAlpha = 1; g.strokeStyle = rgba("232,228,220", 0.07 * a); g.lineWidth = dpr;
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(0, y0 + i * amp * 0.9); g.lineTo(W, y0 + i * amp * 0.9); g.stroke(); }
    const path = new Path2D(); path.moveTo(0, signalY(0, y0, amp));
    for (let x = 2 * dpr; x <= px; x += 1.5 * dpr) path.lineTo(x, signalY(x, y0, amp));
    g.lineJoin = "round";
    for (const [lw, al, col] of [[18, 0.07, ACC], [6, 0.22, ACC], [1.8, 0.95, "255,226,190"]]) { g.strokeStyle = rgba(col, al * a); g.lineWidth = lw * dpr; g.stroke(path); }
    if (pen < 1) { const py = signalY(px, y0, amp); glow(px, py, u * 0.06, "acc", 0.7 * a); glow(px, py, u * 0.012, "white", a); }
    g.globalCompositeOperation = "source-over"; g.font = `${Math.round(11 * dpr)}px "B612 Mono", monospace`;
    if (g.letterSpacing !== undefined) g.letterSpacing = `${3 * dpr}px`;
    const gutter = Math.min(72 * dpr, Math.max(16 * dpr, W * 0.05)), rail = window.innerWidth > 1180 ? 150 * dpr : 0;   // clear of the page's section rail
    g.textAlign = "left"; g.globalAlpha = 0.75 * a; g.fillStyle = "rgb(232,228,220)"; g.fillText("SIGNAL · THE REACH", gutter, y0 - amp * 1.9);
    if (pen > 0.62) {
      const on = calm || Math.floor(s * 1.4) % 2 === 0;
      g.textAlign = "right"; g.globalAlpha = (on ? 0.95 : 0.35) * a; g.fillStyle = "rgb(224,137,62)"; g.fillText("NO SIGNAL", W - gutter - rail, portrait ? y0 + amp * 1.9 + 11 * dpr : y0 - amp * 1.9);
    }
    if (g.letterSpacing !== undefined) g.letterSpacing = "0px";
  }

  // the five decks: a cutaway of the drum, each deck a lit band in its house's colour, its windows drifting slowly
  const WINDOWS = (() => { const r = rng(5150); return DECKS.map(() => Array.from({ length: 64 }, () => ({ x: r(), on: r() > 0.2, w: 0.5 + r(), ph: r() * 6.283 }))); })();
  function drawDecks(a, s) {
    drawSky(a, 0.6 + s / 20);
    const top = portrait ? H * 0.12 : H * 0.11, bottom = portrait ? H * 0.34 : H * 0.44, gap = (bottom - top) / 5, deck = gap * 0.64;
    g.globalCompositeOperation = "source-over";
    for (let i = 0; i < 5; i++) {
      const y = top + i * gap, shade = g.createLinearGradient(0, y, 0, y + deck);
      shade.addColorStop(0, "rgba(24,26,33,0.96)"); shade.addColorStop(0.5, "rgba(14,15,20,0.96)"); shade.addColorStop(1, "rgba(8,9,13,0.96)");
      g.globalAlpha = a; g.fillStyle = shade; g.fillRect(0, y, W, deck);
      g.fillStyle = rgba(DECKS[i], 0.9 * a); g.fillRect(0, y + deck - 2 * dpr, W, 2 * dpr);
      g.fillStyle = rgba("232,228,220", 0.08 * a); g.fillRect(0, y, W, dpr);
    }
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 5; i++) {
      const y = top + i * gap, wy = y + deck * 0.48, dir = i % 2 ? 1 : -1, ww = u * 0.011, wh = deck * 0.2;
      for (let k = 0; k < 4; k++) glow(W * (0.12 + 0.26 * k), wy, Math.max(W, H) * 0.16, "deck" + i, 0.16 * a);
      for (const win of WINDOWS[i]) {
        if (!win.on) continue;
        const x = (((win.x + dir * s * 0.0035) % 1) + 1) % 1 * W, tw = 0.72 + 0.28 * Math.sin(s * 0.7 + win.ph * 5);
        g.globalAlpha = 0.62 * tw * a; g.fillStyle = "rgb(255,226,190)"; g.fillRect(x, wy - wh / 2, ww * win.w, wh);
        glow(x + ww * win.w / 2, wy, u * 0.018, "deck" + i, 0.5 * tw * a);
      }
    }
  }

  const SCENES = { earth: drawEarth, answer: drawAnswer, chosen: drawChosen, decks: drawDecks, silence: drawSilence };
  const sceneTime = (ms) => (calm ? 6 : ms / 1000);
  // returns true while a drawn card is showing, so the loop keeps it moving
  function paint(now) {
    const cur = sceneOf(index), k = calm ? 1 : smooth((now - changedAt) / 900);
    const old = k < 1 ? sceneOf(prevIndex) : null;
    if (!cur && !old) { if (painted) { g.clearRect(0, 0, W, H); painted = false; } return false; }
    if (!W) resize();
    g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.fillStyle = "#06080d"; g.fillRect(0, 0, W, H);
    if (old && old !== cur) SCENES[old](1, sceneTime(leftAt + (now - changedAt)));
    if (cur) SCENES[cur](old && old !== cur ? k : 1, sceneTime(t));
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    painted = true;
    return true;
  }
  function resize() {
    const r = stage.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, r.width < 700 ? 1.5 : 2);
    W = Math.max(1, Math.round(r.width * dpr)); H = Math.max(1, Math.round(r.height * dpr));
    cv.width = W; cv.height = H; portrait = r.height > r.width * 1.05; u = Math.min(W, H); sky = null; painted = false;
    paint(performance.now());
  }
  if ("ResizeObserver" in window) new ResizeObserver(() => resize()).observe(stage); else window.addEventListener("resize", resize);

  root.classList.add("is-live");
  setPaused(userPaused);
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => { painted = false; paint(performance.now()); });
  // a test can turn to a card and set its clock: window.__story(cardIndex, seconds)
  window.__story = (k, seconds) => { if (!started) { started = true; enter(0); } if (k === index) { changedAt = performance.now(); enter(k); } else go(k, false); t = (seconds || 0) * 1000; kick(); };
  window.__storyState = () => ({ index, t: Math.round(t), started, onScreen, paused: userPaused, card: cards[index].dataset.card, earth: earth.width, durations: durations.map((d) => (Number.isFinite(d) ? Math.round(d) : null)) });
})();
