/* The Valor wings in RANK AND VALOR: the seven wings of the game's Ranked ladder, Cadet to Ace, one at a time on a lit
   stage. The stage climbs the ladder by itself, the Valor count rising series by series under the game's own rules
   (ValorProgression and the Ranked design: paid once per best of three, every wing a floor, a Cadet's loss halved,
   a new season back to Rookie). A tap on a rung stops the climb and shows that wing. Nothing is stored. */
(function () {
  "use strict";
  const root = document.querySelector("[data-valor]");
  if (!root || !("IntersectionObserver" in window)) return;

  // ValorLadder.TierNames and Thresholds; the metals are the wing badges' own. tone tints the stage's
  // floor light; glints is how many of the wing's brightest points twinkle (the diamond wings only).
  const TIERS = [
    { name: "Cadet", metal: "Aged pewter", mark: "Half wing", gate: 0, tone: "150, 146, 138", glints: 0 },
    { name: "Rookie", metal: "Bronze", mark: "", gate: 1000, tone: "205, 140, 100", glints: 0 },
    { name: "Regular", metal: "Silver", mark: "", gate: 2000, tone: "190, 196, 206", glints: 0 },
    { name: "Veteran", metal: "Silver", mark: "Diamonds", gate: 3000, tone: "214, 222, 232", glints: 3 },
    { name: "Pro", metal: "Gold", mark: "Diamonds", gate: 4000, tone: "232, 186, 96", glints: 4 },
    { name: "Elite", metal: "Gold", mark: "Full pavé", gate: 5000, tone: "240, 198, 110", glints: 7 },
    { name: "Ace", metal: "Platinum", mark: "Full pavé", gate: 6000, tone: "228, 236, 248", glints: 9 },
  ];
  // ValorProgression.SavePoints: the floor is the highest one at or below the season's peak.
  const SAVE_POINTS = [250, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000, 6000];
  const SEASON_START = 1000;   // ValorProgression.RookieFloor: a new season starts at Rookie, never at Cadet
  // Paid once when a best of three ends, between pilots on the same wing (the Ranked design).
  const PAYS = { "2–0": 200, "2–1": 100, "1–2": -100, "0–2": -200 };
  // The run of results the climb plays, round and round. The first series after each new wing is a 0–2 loss: a new
  // wing is at most 199 over its gate, so the loss always meets the wing's floor, and the floor shows.
  const RUN = ["2–0", "2–1", "2–0", "0–2", "2–0", "2–1", "1–2", "2–0", "2–1"];
  const WING_FILE_WIDTH = 1200;   // build_site_assets.VALOR_WIDTH: the files share one scale, the widest is this
  const STEP_MS = 430, PROMOTED_MS = 1500, AT_ACE_MS = 4200, NEW_SEASON_MS = 2400;
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fmt = (n) => Math.round(n).toLocaleString("en-US");

  // ── the stage ────────────────────────────────────────────────────────────────────────────────────────────────
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const stage = el("div", "valor");
  const hud = el("div", "valor__hud");
  const count = el("div", "valor__count");
  const countLabel = el("span", "valor__label", "Valor");
  const countValue = el("span", "valor__value", "0");
  count.append(countLabel, countValue);
  const result = el("div", "valor__result");
  result.setAttribute("aria-hidden", "true");

  const pedestal = el("div", "valor__pedestal");
  const tilt = el("div", "valor__tilt");
  const flare = el("span", "valor__flare");
  pedestal.append(tilt, flare);

  const title = el("div", "valor__title");
  const titleNum = el("span", "valor__num");
  const titleName = el("div", "valor__name");
  const titleMetal = el("div", "valor__metal");
  title.append(titleNum, titleName, titleMetal);
  const meter = el("div", "valor__meter");
  meter.append(count, result);
  hud.append(title, meter);

  const rail = el("div", "valor__rail");
  rail.setAttribute("role", "group");
  rail.setAttribute("aria-label", "The seven Valor wings, Cadet to Ace");
  const track = el("span", "valor__track");
  const fill = el("span", "valor__fill");
  track.append(fill);
  rail.append(track);

  const replay = el("button", "valor__replay", "Play the climb");
  replay.type = "button";
  replay.hidden = true;

  const wings = [], rungs = [];
  TIERS.forEach((t, i) => {
    const wing = el("div", "valor__wing");
    const img = el("img");
    img.alt = "";
    img.decoding = "async";
    const sheen = el("span", "valor__sheen");
    wing.append(img, sheen);
    tilt.append(wing);
    wings.push({ wing, img, sheen });

    const rung = el("button", "valor__rung");
    rung.type = "button";
    rung.setAttribute("aria-label", `${t.name}: ${t.metal}${t.mark ? ", " + t.mark.toLowerCase() : ""}, from ${fmt(t.gate)} Valor`);
    rung.style.setProperty("--at", String(i / (TIERS.length - 1)));
    const thumb = el("img");
    thumb.alt = "";
    const gate = el("span", "valor__gate");
    gate.innerHTML = `<span class="valor__gate-long">${fmt(t.gate)}</span><span class="valor__gate-short">${t.gate ? t.gate / 1000 + "k" : "0"}</span>`;
    const best = el("span", "valor__best", "Best");
    rung.append(thumb, gate, best);
    rung.addEventListener("click", () => choose(i));
    rung.addEventListener("keydown", (e) => {
      const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : -1;
      if (next >= 0 && next < TIERS.length) { e.preventDefault(); rungs[next].focus(); choose(next); }
    });
    rail.append(rung);
    rungs.push(rung);
  });
  replay.addEventListener("click", () => { replay.hidden = true; startClimb(); });

  stage.append(hud, pedestal, rail, replay);

  // ── what the stage shows ─────────────────────────────────────────────────────────────────────────────────────
  let tier = -1, shown = 0, best = 0;

  function showTier(i, promoted) {
    const t = TIERS[i];
    if (i !== tier) {
      wings.forEach((w, k) => w.wing.classList.toggle("is-current", k === i));
      stage.style.setProperty("--tone", t.tone);
      titleNum.textContent = `${String(i + 1).padStart(2, "0")} / 07`;
      titleName.textContent = t.name;
      titleMetal.textContent = t.mark ? `${t.metal} · ${t.mark}` : t.metal;
      tier = i;
    }
    best = Math.max(best, i);
    rungs.forEach((r, k) => {
      r.classList.toggle("is-current", k === i);
      r.classList.toggle("is-earned", k <= i);
      r.classList.toggle("is-best", k === best && best > i);
      r.setAttribute("aria-pressed", String(k === i));
    });
    if (promoted && !calm) {
      flare.classList.remove("is-on");
      void flare.offsetWidth;   // restart the flare's animation
      flare.classList.add("is-on");
    }
  }

  /** The count runs from where it is to a new value over a third of a second. */
  let countTimer = 0;
  function countTo(value) {
    clearTimeout(countTimer);
    const from = shown, start = Date.now(), span = calm ? 0 : 320;
    const step = () => {
      const k = span ? Math.min(1, (Date.now() - start) / span) : 1;
      shown = from + (value - from) * (1 - Math.pow(1 - k, 3));
      countValue.textContent = fmt(shown);
      if (k < 1) countTimer = setTimeout(step, 16);
    };
    step();
  }

  /** The fill along the rail: each rung is a gate, and between two the fill moves with the Valor earned. */
  function fillTo(value) {
    const span = TIERS.length - 1;
    let at = span;
    for (let i = 0; i < span; i++) {
      if (value < TIERS[i + 1].gate) { at = i + (value - TIERS[i].gate) / (TIERS[i + 1].gate - TIERS[i].gate); break; }
    }
    fill.style.transform = `scaleX(${Math.max(0, at / span)})`;
  }

  function say(top, bottom, tone) {
    result.className = "valor__result" + (tone ? " is-" + tone : "");
    result.innerHTML = "";
    if (top) result.append(el("span", "valor__series", top));
    if (bottom) result.append(el("span", "valor__pay", bottom));
    result.classList.remove("is-in");
    void result.offsetWidth;
    if (top || bottom) result.classList.add("is-in");
  }

  // ── the climb ────────────────────────────────────────────────────────────────────────────────────────────────
  let valor = 0, peak = 0, next = 0, promotedLast = false, playing = false, inView = false, timer = 0, atAce = 0;
  const floorFor = (high) => SAVE_POINTS.reduce((f, s) => (s <= high ? s : f), 0);
  const tierFor = (v) => TIERS.reduce((t, x, i) => (v >= x.gate ? i : t), 0);

  function startClimb() {
    valor = 0; peak = 0; next = 0; atAce = 0; best = 0; promotedLast = false;
    showTier(0, false);
    countTo(0); fillTo(0); say("", "");
    playing = true;
    schedule(900);
  }

  function schedule(ms) {
    clearTimeout(timer);
    if (playing && inView && !document.hidden) timer = setTimeout(stepClimb, ms);
  }

  function stepClimb() {
    if (atAce >= 3) {   // a season at Ace ends: Valor starts again at Rookie, and the best wing stays on the record
      valor = SEASON_START; peak = SEASON_START; atAce = 0; promotedLast = true;
      showTier(tierFor(valor), false);
      countTo(valor); fillTo(valor);
      say("New season", "Back to Rookie · your best wings stay", "season");
      return schedule(NEW_SEASON_MS);
    }
    const series = promotedLast ? "0–2" : RUN[next++ % RUN.length];
    let pay = PAYS[series];
    if (pay < 0 && tierFor(valor) === 0) pay /= 2;   // a Cadet's loss is halved (CJ-8)
    const before = valor, from = tierFor(valor);
    valor = Math.max(floorFor(peak), valor + pay);
    peak = Math.max(peak, valor);
    promotedLast = false;
    const to = tierFor(valor);
    countTo(valor); fillTo(valor);
    const signed = (pay > 0 ? "+" : "−") + Math.abs(pay);
    if (pay < 0 && valor > before + pay) {
      const gateHeld = TIERS.some((x) => x.gate === valor);
      say(`Series ${series}`, `${signed} · ${gateHeld ? "the wing holds" : "a save point holds"} at ${fmt(valor)}`, "held");
    } else if (pay < 0 && from === 0) say(`Series ${series}`, `${signed} · halved for a Cadet`, "lost");
    else say(`Series ${series}`, signed, pay > 0 ? "won" : "lost");
    if (to > from) {
      showTier(to, true);
      promotedLast = true;
      return schedule(to === TIERS.length - 1 ? AT_ACE_MS : PROMOTED_MS);
    }
    if (to === TIERS.length - 1) atAce++;
    schedule(STEP_MS);
  }

  /** A visitor picked a wing: the climb stops there. */
  function choose(i) {
    playing = false;
    clearTimeout(timer);
    showTier(i, false);
    countTo(TIERS[i].gate); fillTo(TIERS[i].gate);
    const above = TIERS[i + 1];
    say("", !i ? "Every pilot starts here" : above ? `${above.name} at ${fmt(above.gate)}` : "The top of the ladder", "chosen");
    replay.hidden = false;
  }

  // ── light: the wing tilts toward the pointer and its sheen follows ──────────────────────────────────────────
  if (!calm && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    pedestal.addEventListener("pointermove", (e) => {
      const r = pedestal.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      stage.style.setProperty("--rx", (-y * 9).toFixed(2) + "deg");
      stage.style.setProperty("--ry", (x * 12).toFixed(2) + "deg");
      stage.style.setProperty("--sheen", (50 - x * 120).toFixed(1) + "%");
      stage.classList.add("is-lit");
    });
    pedestal.addEventListener("pointerleave", () => {
      stage.style.setProperty("--rx", "0deg");
      stage.style.setProperty("--ry", "0deg");
      stage.classList.remove("is-lit");
    });
  }

  /** The diamond wings twinkle at their own brightest points, found in the picture itself. */
  function placeGlints(w, many) {
    if (!many || calm) return;
    try {
      const W = 240, H = Math.round(W * w.img.naturalHeight / w.img.naturalWidth);
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(w.img, 0, 0, W, H);
      const px = g.getImageData(0, 0, W, H).data;
      const lum = (x, y) => { const k = (y * W + x) * 4; return px[k + 3] < 200 ? 0 : 0.3 * px[k] + 0.59 * px[k + 1] + 0.11 * px[k + 2]; };
      const peaks = [];
      for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
        const v = lum(x, y);
        if (v > 200 && v >= lum(x - 1, y) && v >= lum(x + 1, y) && v >= lum(x, y - 1) && v >= lum(x, y + 1)) peaks.push([v, x, y]);
      }
      peaks.sort((a, b) => b[0] - a[0]);
      const chosen = [];
      for (const p of peaks) {
        if (chosen.every((q) => Math.hypot(q[1] - p[1], q[2] - p[2]) > W / 9)) chosen.push(p);
        if (chosen.length === many) break;
      }
      chosen.forEach((p, k) => {
        const s = el("span", "valor__glint");
        s.style.left = (100 * p[1] / W).toFixed(2) + "%";
        s.style.top = (100 * p[2] / H).toFixed(2) + "%";
        s.style.animationDelay = (k * 0.53 + (k % 3) * 0.21).toFixed(2) + "s";
        w.wing.append(s);
      });
    } catch (e) { /* a picture the canvas cannot read keeps its sheen and goes without glints */ }
  }

  // ── start when it comes near ─────────────────────────────────────────────────────────────────────────────────
  let started = false;
  function load() {
    started = true;
    const loads = TIERS.map((t, i) => new Promise((done) => {
      const w = wings[i], src = `/assets/img/valor/wing-${i}.webp`;
      w.img.onload = () => {
        // The files share one scale: --f keeps each wing's share of the widest; --ar lets the stage's height cap it.
        w.wing.style.setProperty("--f", (w.img.naturalWidth / WING_FILE_WIDTH).toFixed(4));
        w.wing.style.setProperty("--ar", (w.img.naturalWidth / w.img.naturalHeight).toFixed(4));
        w.sheen.style.webkitMaskImage = w.sheen.style.maskImage = `url("${src}")`;
        placeGlints(w, t.glints);
        done();
      };
      w.img.onerror = done;
      w.img.src = src;
      rungs[i].querySelector("img").src = src;
    }));
    Promise.all(loads).then(() => {
      root.replaceChildren(stage);
      root.classList.add("is-valor");
      if (calm) { showTier(0, false); choose(0); replay.hidden = true; }
      else startClimb();
    });
  }

  // One watch loads the pictures well before the stage arrives; the other runs the climb only while it is on screen.
  const near = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting) && !started) { near.disconnect(); load(); }
  }, { rootMargin: "700px 0px" });
  near.observe(root);
  const seen = new IntersectionObserver((entries) => {
    inView = entries[entries.length - 1].intersectionRatio >= 0.35;
    if (inView && playing) schedule(STEP_MS); else clearTimeout(timer);
  }, { threshold: [0, 0.35, 0.7] });
  seen.observe(root);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && playing) schedule(STEP_MS); else clearTimeout(timer); });
})();
