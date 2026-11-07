// The Armory: what the VIGIL carries, to handle.
// GAME holds every number the demos use, each the one the game runs with. Tools/website/armory_check.py reads them back from
// the game's code and fails on any that has drifted, so change one only when the game changes, then run it. A fit's weight,
// speed and cooling are looked up in /hangar/hangar-data.json, which the game writes; this page computes none of those.
// The page's typed readouts are what these give at each demo's starting position, so the page reads right without scripts.
// Nothing is stored and nothing is sent anywhere.

/* GAME-BEGIN */
const GAME = {
  "guns": {
    "PULSE-50": { "model": "charges", "mount": "arm", "rangeYd": 275, "damage": 15, "heat": 6, "weightLb": 5000, "rounds": 4, "between": 0.2, "recharge": 2 },
    "CHAIN-30": { "model": "stream", "mount": "arm", "rangeYd": 150, "damage": 0.8, "heat": 0.3, "weightLb": 7600, "rate": 65, "belt": 1174 },
    "SLUG-250": { "model": "single", "mount": "arm", "rangeYd": 200, "damage": 60, "heat": 10, "weightLb": 8400, "rounds": 12, "between": 4 },
    "DART-20": { "model": "single", "mount": "arm", "rangeYd": 1000, "damage": 45, "heat": 12, "weightLb": 5600, "rounds": 10, "between": 3.5 },
    "THUMP-82": { "model": "magazine", "mount": "arm", "rangeYd": 175, "damage": 45, "heat": 8, "weightLb": 5200, "rounds": 10, "between": 1.2, "reload": 3, "flight": 1.3 },
    "SPIKE-90": { "model": "single", "mount": "arm", "rangeYd": 650, "damage": 70, "heat": 18, "weightLb": 9000, "rounds": 3, "between": 10.5 },
    "VOLLEY-6": { "model": "salvo", "mount": "shoulder", "rangeYd": 425, "damage": 12, "heat": 12, "weightLb": 4200, "salvo": 6, "tubes": 18, "life": 36, "between": 6, "reload": 12, "ripple": 0.09 },
    "BREACH-275": { "model": "magazine", "mount": "shoulder", "rangeYd": 600, "damage": 80, "heat": 16, "weightLb": 7800, "rounds": 4, "between": 3, "reload": 8, "flight": 3 }
  },
  "heat": { "rapid": 13.5, "normal": 6, "rapidBand": 0.1, "neutralBand": 0.8, "topSpeedMph": 44.7, "runFromMph": 25, "runA": 0.005, "runB": 0.05, "shutdown": 100, "recover": 60, "target": 50, "lerp": 5, "stop": 5 },
  "starter": { "operatingLb": 101200, "loadPct": 83.3, "topSpeedMph": 40, "coolingPct": 70 },
  "salvage": {
    "damagePerPart": 500, "keyed": 0.7, "biomeOfWildcard": 0.333333, "moduleShare": 0.5, "cellsPerPart": 2,
    "partOfGun": { "PULSE-50": "autoloader-parts", "CHAIN-30": "autoloader-parts", "DART-20": "focusing-optics", "SLUG-250": "warhead-casings", "THUMP-82": "warhead-casings", "SPIKE-90": "warhead-casings", "VOLLEY-6": "warhead-casings", "BREACH-275": "warhead-casings" },
    "partOfModule": { "JumpJets": "airframe-members", "SpeedBoost": "servo-actuators", "HeatSinks": "coolant-cells", "ArmorModule": "armor-plating" },
    "biome": { "snow": ["armor-plating", "warhead-casings"], "desert": ["focusing-optics"], "jungle": ["servo-actuators"], "volcanic": ["coolant-cells"] },
    "crateOdds": [0.6, 0.25, 0.1, 0.04, 0.01], "crateCells": [1, 2, 3, 5, 10], "weakParts": 0.5, "strongParts": 3, "strongBoost": 1.5
  },
  "upgrades": { "factor": [1, 1.0444, 1.0909, 1.1394], "heatFactor": [1, 0.96, 0.92, 0.88], "fees": [750, 1750, 3500], "parts": [4, 8, 12], "hours": [1, 5, 15], "dealt": [5000, 20000, 50000], "unlock": 25000 }
};
/* GAME-END */

/** The game's rules with no page attached: heat, each gun's cadence, salvage, the crate, the ladder. */
const Armory = (() => {
  const H = GAME.heat, S = GAME.salvage, U = GAME.upgrades;

  /** HeatManager.RunHeatPerSecond: the parabola through 25 mph → 0, 35 → 1, 45 → 3. */
  const runHeat = mph => { const d = mph - H.runFromMph; return d <= 0 ? 0 : H.runA * d * d + H.runB * d; };

  /** What a stance does to heat, per second, for a fit: HeatManager's three bands, times the fit's cooling. A positive is heat going in. */
  function flow(stance, load) {
    const cooling = load.coolingPct / 100;
    if (stance === "stand") return -H.rapid * cooling;
    if (stance === "walk") return -H.normal * cooling;
    // flat out is the fit's top speed. An overloaded VIGIL can't reach the sprint band, so it still cools as a walker does.
    if (load.topSpeedMph / H.topSpeedMph >= H.neutralBand) return runHeat(load.topSpeedMph);
    return -H.normal * cooling;
  }

  const newReactor = () => ({ value: 0, pending: 0, phase: "none", clock: 0, from: 0, latched: false });

  /** One step of HeatManager's Update and its overheat state machine, with HeatTape's lerp. A stopped VIGIL needs no braking. */
  function stepReactor(r, dt, stance, load) {
    if (r.phase === "none") {
      r.value += r.pending + flow(stance, load) * dt;
      r.pending = 0;
    } else if (r.phase === "braking") {
      r.clock += dt;
      if (r.clock >= r.brake) { r.phase = "cooling"; r.clock = 0; r.from = r.value; }
    } else {
      r.clock += dt;
      const t = Math.min(1, r.clock / H.lerp);
      r.value = r.from + (H.target - r.from) * t;
      if (t >= 1) r.phase = "none";
    }
    r.value = Math.max(0, Math.min(H.shutdown, r.value));
    if (r.phase === "none" && r.value >= H.shutdown) {
      r.phase = "braking"; r.clock = 0; r.latched = true;
      r.brake = stance === "stand" ? 0 : H.stop;
    }
    if (r.latched && r.phase !== "braking" && r.value < H.recover) r.latched = false;
  }

  const newGun = id => {
    const g = GAME.guns[id];
    return { id, g, left: g.model === "stream" ? g.belt : g.model === "salvo" ? g.life : g.rounds, tubes: g.tubes || 0, wait: 0, reloading: false, recharge: [], carry: 0 };
  };

  /** The clocks a gun runs whether or not the trigger is down. */
  function tickGun(s, dt) {
    s.wait = Math.max(0, s.wait - dt);
    if (s.g.model === "charges") {
      s.recharge = s.recharge.map(t => t - dt);
      while (s.recharge.length && s.recharge[0] <= 0) { s.recharge.shift(); s.left++; }
    }
    if (s.reloading && s.wait <= 0) {
      s.reloading = false;
      if (s.g.model === "magazine") s.left = s.g.rounds;
      if (s.g.model === "salvo") s.tubes = Math.min(s.g.tubes, s.left);
    }
  }

  /** A held trigger for one step: how many rounds leave, with their damage and heat, or null if none do. */
  function pull(s, dt, reactor) {
    if (reactor.latched) return null;
    const g = s.g;
    if (g.model === "stream") {
      if (s.left <= 0) return null;
      s.carry += g.rate * dt;
      const shots = Math.min(s.left, Math.floor(s.carry));
      if (!shots) return null;
      s.carry -= shots; s.left -= shots;
      return { shots, damage: shots * g.damage, heat: shots * g.heat };
    }
    if (s.wait > 0) return null;
    if (g.model === "salvo") {
      if (s.tubes < g.salvo || s.left < g.salvo) return null;
      s.left -= g.salvo; s.tubes -= g.salvo;
      if (s.tubes <= 0 && s.left > 0) { s.reloading = true; s.wait = g.reload; } else s.wait = g.between;
      return { shots: g.salvo, damage: g.salvo * g.damage, heat: g.heat };
    }
    if (s.left <= 0) return null;
    s.left--;
    if (g.model === "charges") { s.recharge.push(g.recharge); s.wait = g.between; }
    else if (g.model === "magazine" && s.left === 0) { s.reloading = true; s.wait = g.reload; }
    else s.wait = g.between;
    return { shots: 1, damage: g.damage, heat: g.heat };
  }

  /** Ten seconds of held trigger from cold, standing, every round landing: the same steps the Fire it demo runs. */
  function tenSeconds(id, load) {
    const s = newGun(id), r = newReactor(), dt = 1 / 120;
    let damage = 0;
    for (let t = 0; t < 10; t += dt) {
      tickGun(s, dt);
      const shot = pull(s, dt, r);
      if (shot) { damage += shot.damage; r.pending += shot.heat; }
      stepReactor(r, dt, "stand", load);
    }
    return damage;
  }

  /** SalvageRules.SplitFor: what a hit into a zone pays, as [part, share] pairs. An empty list pays nothing. */
  function splitFor(zone, face, fit) {
    const arm = list => {
      const parts = list.map(id => S.partOfGun[id]);
      return parts.length === 2 ? [[parts[0], 0.5], [parts[1], 0.5]] : [[parts[0], 1]];
    };
    if (zone === "RA") return arm([fit.RA_Upper, fit.Shoulder]);   // the right arm carries arm slot 1 and the shoulder pod
    if (zone === "LA") return arm([fit.LA_Upper, fit.LA_Lower]);
    if (zone === "LT" || zone === "RT") return [["coolant-cells", 1]];
    if (zone === "CT") {
      const own = face === "rear" ? "focusing-optics" : "armor-plating", module = S.partOfModule[fit.CT];
      return module ? [[own, 1 - S.moduleShare], [module, S.moduleShare]] : [[own, 1]];
    }
    return [];
  }

  /** SalvageRules.Award for one hit: parts per damage, 70 to what was hit, 30 to the wildcard, a third of that to the battlefield. */
  function award(split, dealt, biome) {
    const out = {}, add = (part, value) => { out[part] = (out[part] || 0) + value; };
    let wildcard = 0;
    for (const [part, share] of split) {
      const parts = dealt * share / S.damagePerPart;
      add(part, parts * S.keyed);
      wildcard += parts * (1 - S.keyed);
    }
    const tilt = S.biome[biome] || [], toBiome = tilt.length ? wildcard * S.biomeOfWildcard : 0;
    for (const part of tilt) add(part, toBiome / tilt.length);
    if (wildcard) add("power-cells", wildcard - toBiome);
    return out;
  }

  /** SalvageRules.NudgeFor and CrateOddsFor: a weak match closes the top two grades, a strong one lifts them. */
  const nudgeFor = parts => parts < S.weakParts ? -1 : parts >= S.strongParts ? 1 : 0;
  function crateOdds(nudge) {
    const o = [...S.crateOdds];
    if (nudge < 0) {
      o[3] = 0; o[4] = 0;
      const sum = o[0] + o[1] + o[2];
      for (let i = 0; i < 3; i++) o[i] /= sum;
    } else if (nudge > 0) {
      const extra = (o[3] + o[4]) * (S.strongBoost - 1);
      o[3] *= S.strongBoost; o[4] *= S.strongBoost; o[0] -= extra;
    }
    return o;
  }
  function crateGrade(roll, nudge) {
    const o = crateOdds(nudge);
    let edge = 0;
    for (let g = 0; g < o.length; g++) { edge += o[g]; if (roll < edge) return g + 1; }
    for (let g = o.length - 1; g >= 0; g--) if (o[g] > 0) return g + 1;
    return 1;
  }

  /** What a Mark does to a gun, by its upgrade axis (each weapon's ApplyUpgradeLevel). */
  function atMark(id, mk) {
    const g = GAME.guns[id], part = S.partOfGun[id], i = mk - 1;
    if (part === "autoloader-parts") return { axis: "heat", base: g.heat, value: g.heat * U.heatFactor[i], percent: (U.heatFactor[i] - 1) * 100 };
    if (part === "focusing-optics") return { axis: "reach", base: g.rangeYd, value: g.rangeYd * U.factor[i], percent: (U.factor[i] - 1) * 100 };
    return { axis: "damage", base: g.damage, value: g.damage * U.factor[i], percent: (U.factor[i] - 1) * 100 };
  }

  /** The bill for a gun up to a Mark: what the top step costs, and everything to get there. */
  function billTo(id, mk) {
    const step = mk - 2, sum = list => list.slice(0, mk - 1).reduce((a, b) => a + b, 0);
    const owned = id === "PULSE-50" || id === "CHAIN-30" || id === "SLUG-250" || id === "VOLLEY-6";
    return { unlock: owned ? 0 : U.unlock, marks: sum(U.fees), parts: sum(U.parts), hours: step >= 0 ? U.hours[step] : 0, dealt: step >= 0 ? U.dealt[step] : 0 };
  }

  return { runHeat, flow, newReactor, stepReactor, newGun, tickGun, pull, tenSeconds, splitFor, award, nudgeFor, crateOdds, crateGrade, atMark, billTo };
})();

(() => {
  "use strict";

  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const thrifty = Boolean(navigator.connection && navigator.connection.saveData);
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const n = (value, digits = 0) => value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  /** A figure as the game would read it: no trailing zeros. */
  const figure = (value, digits = 2) => { const f = Number(value.toFixed(digits)); return f.toLocaleString("en-US", { maximumFractionDigits: digits }); };
  const put = (root, key, text) => { const el = $(`[data-out="${key}"]`, root); if (el && el.textContent !== text) el.textContent = text; };
  const big = id => `/assets/img/armory/${id.toLowerCase()}.webp`;
  const small = id => `/assets/img/physics/${id.toLowerCase()}.webp`;
  const MODULE_ART = { JumpJets: "jump-jets", HeatSinks: "reactor-cooling", ArmorModule: "ct-armor", SpeedBoost: "overboost" };
  const MODULE_NAME = { JumpJets: "Jump jets", HeatSinks: "Reactor cooling", ArmorModule: "CT armor", SpeedBoost: "Overboost" };
  const PART_NAME = { "autoloader-parts": "Autoloader Parts", "focusing-optics": "Focusing Optics", "warhead-casings": "Warhead Casings", "armor-plating": "Armor Plating", "servo-actuators": "Servo Actuators", "coolant-cells": "Coolant Cells", "airframe-members": "Airframe Members", "power-cells": "Power Cells" };
  const partArt = part => `/assets/img/armory/salvage/${part}.webp`;
  const GUN_IDS = Object.keys(GAME.guns);

  // The fold reads whole without scripts; with them it starts shut, unless the address points into it.
  const sheet = $("#every");
  if (sheet) {
    let inside = false;
    try { inside = Boolean(location.hash && sheet.querySelector(location.hash)) || location.hash === "#every"; } catch (e) { inside = false; }
    sheet.open = inside;
  }

  /** The fit chosen in the bay. Fire it cools by it, Break it shoots at it, the Hangar links carry it. */
  const Fit = {
    now: { RA_Upper: "PULSE-50", LA_Upper: "CHAIN-30", LA_Lower: "SLUG-250", Shoulder: "VOLLEY-6", CT: "" },
    load: { ...GAME.starter },
    listeners: [],
    changed() { for (const f of this.listeners) f(); },
  };

  /** Salvage brought home on this page. Break it fills it; the crate and the ladder read it. */
  const Bank = { parts: {}, fromHits: 0, listeners: [], add(part, value, fromHit) { this.parts[part] = (this.parts[part] || 0) + value; if (fromHit) this.fromHits += value; }, changed() { for (const f of this.listeners) f(); } };

  /** Keeps a demo running only while it is on screen, and its canvas the size of its box. build returns a frame(dt, now). */
  function stage(root, build, maxWidth = 1800) {
    if (!root) return;
    const canvas = $("canvas[data-main]", root);
    const surface = { root, canvas, ctx: canvas && canvas.getContext("2d"), w: 0, h: 0, visible: false, fit() {
      if (!canvas) return;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2, maxWidth / w);
      const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
      if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
      surface.w = w; surface.h = h;
      surface.ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
    } };
    let frame = null, last = 0, running = false;
    const tick = now => {
      if (!surface.visible) { running = false; return; }
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000 || 0));
      last = now;
      surface.fit();
      if (frame) frame(dt, now / 1000);
      requestAnimationFrame(tick);
    };
    const go = () => { if (running) return; running = true; last = performance.now(); requestAnimationFrame(tick); };
    frame = build(root, surface);
    new IntersectionObserver(entries => {
      surface.visible = entries[entries.length - 1].isIntersecting;
      if (surface.visible) go();
    }, { threshold: 0.05 }).observe(root);
  }

  /** A row of the eight guns as picker buttons. */
  function gunPicker(holder, chosen, onPick) {
    if (!holder) return () => {};
    const buttons = GUN_IDS.map(id => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "part"; b.dataset.part = id;
      b.setAttribute("aria-pressed", String(id === chosen));
      const img = new Image(360, 270); img.src = small(id); img.alt = ""; img.loading = "lazy";
      const name = document.createElement("b"); name.textContent = id;
      b.append(img, name);
      b.addEventListener("click", () => onPick(id));
      holder.append(b);
      return b;
    });
    return id => buttons.forEach(b => b.setAttribute("aria-pressed", String(b.dataset.part === id)));
  }

  // ---------- the fitting bay ----------
  (() => {
    const root = $("[data-kit]");
    if (!root) return;
    const scene = $("[data-kit-scene]", root), picture = $("[data-frame]", root), dial = $('input[name="turn"]', root);
    const marks = new Map($$(".mark", root).map(m => [m.dataset.mark, m]));
    const slots = new Map($$(".slot", root).map(s => [s.dataset.slot, s]));
    const parts = $$("[data-tray] .part", root);
    const SLOT = { shoulder: { id: "Shoulder", accepts: "shoulder" }, ra: { id: "RA_Upper", accepts: "arm" }, lau: { id: "LA_Upper", accepts: "arm" }, lal: { id: "LA_Lower", accepts: "arm" }, ct: { id: "CT", accepts: "torso" } };
    const ARMS = ["ra", "lau", "lal"];
    // Each hardpoint on the turning VIGIL: x in the frame's percent = 49.5 + X cos θ + Z sin θ. Measured from the frames at 0, 90,
    // 180 and 270 degrees and checked against those between. Z also says how far round the back it has gone.
    const TRACK = { shoulder: [-23, -4, 15.5], ra: [-23, -6.5, 41], lau: [23.5, 5.5, 31], lal: [24.5, 9, 45], ct: [-1, 12, 33] };
    const SHOW = { shoulder: 35, ra: 65, lau: 300, lal: 285, ct: 350 };   // the frame that shows a hardpoint best
    const HIRES = new Set([0, 20, 180]);
    const wrap = v => ((Math.round(v) % 360) + 360) % 360;
    const url = k => HIRES.has(k) ? `/assets/img/armory/vigil-${String(k).padStart(3, "0")}.webp` : `/hangar/spin/base/vigil-${String(k).padStart(3, "0")}.webp`;

    let frame = 20, shown = 20, tween = 0, held = null, selected = null, armNext = 0, data = null;
    const ready = new Set([20]), asked = new Set([20]);

    const place = k => {
      const t = k * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
      for (const [key, mark] of marks) {
        const [X, Z, y] = TRACK[key];
        mark.style.setProperty("--x", `${(49.5 + X * c + Z * s).toFixed(2)}%`);
        mark.style.setProperty("--y", `${y}%`);
        mark.classList.toggle("is-far", -X * s + Z * c < -10);   // round the far side
      }
    };
    /** The nearest frame to the wanted angle that has arrived: the picture only ever changes to a frame in hand. */
    const paint = () => {
      const want = wrap(frame);
      for (let d = 0; d <= 180; d++) {
        for (const k of [wrap(want + d), wrap(want - d)]) {
          if (!ready.has(k)) continue;
          if (k !== shown) { picture.src = url(k); shown = k; place(k); }
          return;
        }
      }
    };
    const ask = k => {
      k = wrap(k);
      if (asked.has(k)) return;
      asked.add(k);
      const img = new Image();
      img.decoding = "async";
      img.onload = () => { ready.add(k); if (!tween) paint(); };
      img.src = url(k);
    };
    const stride = thrifty ? 15 : 5;
    /** Frames are asked for only once the VIGIL is handled: the end of a turn first, then the way there. */
    const askAlong = (from, to) => {
      ask(to);
      const delta = ((to - from + 540) % 360) - 180, steps = Math.floor(Math.abs(delta) / stride);
      for (let i = 1; i <= steps; i++) ask(Math.round((from + Math.sign(delta) * i * stride) / stride) * stride);
    };
    /** A hand on the VIGIL may turn it anywhere: every stride's frame, the nearest first. */
    const askAll = () => {
      const base = Math.round(frame / stride) * stride;
      for (let d = 0; d <= 180; d += stride) { ask(base + d); ask(base - d); }
    };

    const turnTo = goal => {
      cancelAnimationFrame(tween); tween = 0;
      askAlong(frame, goal);
      if (calm) { frame = goal; dial.value = String(wrap(goal)); paint(); return; }
      const start = frame, delta = ((goal - wrap(frame) + 540) % 360) - 180, ms = 280 + Math.abs(delta) * 3.2;
      let first = 0;
      const step = now => {
        first = first || now;
        const t = Math.min(1, (now - first) / ms), eased = t < 0.5 ? 2 * t * t : 1 - (2 - 2 * t) ** 2 / 2;
        frame = start + delta * eased;
        paint();
        if (t < 1) tween = requestAnimationFrame(step);
        else { tween = 0; frame = goal; dial.value = String(wrap(goal)); paint(); }
      };
      tween = requestAnimationFrame(step);
    };

    scene.addEventListener("pointerdown", event => {
      if (event.target.closest("button, a, input")) return;
      cancelAnimationFrame(tween); tween = 0;
      held = { x: event.clientX, frame, id: event.pointerId };
      scene.setPointerCapture?.(event.pointerId);
      scene.classList.add("is-held");
      askAll();
    });
    scene.addEventListener("pointermove", event => {
      if (!held || event.pointerId !== held.id) return;
      // a whole turn is two and a half widths of the picture; drag right and the near side goes with the finger
      frame = held.frame + (event.clientX - held.x) * 360 / (scene.clientWidth * 2.5);
      dial.value = String(wrap(frame));
      paint();
    });
    const letGo = () => { held = null; scene.classList.remove("is-held"); };
    scene.addEventListener("pointerup", letGo);
    scene.addEventListener("pointercancel", letGo);
    dial.addEventListener("input", () => { askAll(); frame = Number(dial.value); paint(); });

    // The hub's moving light, the game's own layers. They wait for the page, and a thrifty connection goes without.
    if (!thrifty) addEventListener("load", () => {
      const bay = $("[data-kit-bay]", root), before = $(".kit__shadow", bay);
      for (const [file, x, y, w, h, low, period] of [["ring", 2.194, 57.732, 92.083, 29.815, 0.7, 8.1], ["core", 10.944, 56.991, 75.208, 26.204, 0.6, 5.2], ["coolBloom", 0, 0, 100, 98.935, 0.88, 13], ["warmBloom", 0, 0, 100, 100, 0.88, 9.7]]) {
        const light = document.createElement("i");
        light.className = "kit__l";
        light.setAttribute("aria-hidden", "true");
        Object.assign(light.style, { left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`, backgroundImage: `url("/hangar/bay/${file}.webp")` });
        light.style.setProperty("--low", String(low));
        light.style.setProperty("--period", `${period / 2}s`);
        bay.insertBefore(light, before);
      }
    });

    const select = key => {
      selected = key;
      for (const [k, s] of slots) s.setAttribute("aria-pressed", String(k === key));
      for (const [k, m] of marks) m.classList.toggle("is-on", k === key);
      const accepts = key && SLOT[key].accepts;
      for (const p of parts) p.hidden = Boolean(accepts) && p.dataset.mount !== accepts;
    };
    const tapSlot = key => {
      if (selected === key) { select(null); return; }
      select(key);
      turnTo(SHOW[key]);
    };
    for (const [key, s] of slots) s.addEventListener("click", () => tapSlot(key));
    for (const [key, m] of marks) m.addEventListener("click", () => tapSlot(key));

    let table = null;
    const keyOf = f => {
      const order = data.weapons.filter(w => w.slot === "arm").map(w => w.id);
      const arms = [f.RA_Upper, f.LA_Upper, f.LA_Lower].sort((a, b) => order.indexOf(a) - order.indexOf(b));
      return `${arms.join("+")}|${f.Shoulder}|${f.CT}`;
    };
    const fitLink = f => `/hangar/#fit=${f.RA_Upper},${f.LA_Upper},${f.LA_Lower},${f.Shoulder},${f.CT}`;
    const STARTER_KEY = "PULSE-50+CHAIN-30+SLUG-250|VOLLEY-6|";

    const gauge = (key, text) => { const el = $(`[data-g="${key}"]`, root); if (el.textContent !== text) el.textContent = text; };
    function draw() {
      const f = Fit.now;
      for (const [key, s] of slots) {
        const id = f[SLOT[key].id], img = $("img", s);
        if (key === "ct") {
          s.classList.toggle("slot--empty", !id);
          if (id) img.src = `/assets/img/physics/${MODULE_ART[id]}.webp`;
          $(".slot__name", s).textContent = id ? MODULE_NAME[id] : "Empty";
        } else {
          img.src = small(id);
          $(".slot__name", s).textContent = id;
        }
      }
      const fitted = new Set(Object.values(f));
      for (const p of parts) p.setAttribute("aria-pressed", String(fitted.has(p.dataset.part)));
      for (const a of $$("[data-hangar]")) a.href = fitLink(f);
      if (!table) return;
      const load = table.get(keyOf(f));
      if (!load) return;
      Fit.load = load;
      gauge("weight", `${n(load.operatingLb)} lb`);
      gauge("speed", `${figure(load.topSpeedMph, 1)} mph`);
      gauge("cooling", `${Math.round(load.coolingPct)}%`);
      $("[data-g-load]", root).style.setProperty("--v", String(Math.min(1, load.loadPct / 140)));
      const over = load.operatingLb > data.mech.maxOperatingLb;
      root.classList.toggle("is-over", over);
      const key = keyOf(f);
      const jets = load.flightSeconds ? ` ${figure(load.flightSeconds, 1)} s of lift, a ${n(load.climbCeilingFt)} ft ceiling.` : "";
      gauge("say", over ? `Overloaded: ${figure(load.loadPct, 1)}% of its carrying capacity. It still flies, slower and hotter.${jets}`
        : key === STARTER_KEY ? `A new pilot's kit: ${figure(load.loadPct, 1)}% of its carrying capacity.`
        : `${figure(load.loadPct, 1)}% of its carrying capacity.${jets}`);
    }
    const choose = part => {
      const mount = part.dataset.mount, id = part.dataset.part, next = { ...Fit.now };
      let key = selected && SLOT[selected].accepts === mount ? selected : null;
      if (mount === "shoulder") key = "shoulder";
      if (mount === "torso") key = "ct";
      if (mount === "arm" && !key) {
        const holding = ARMS.find(k => next[SLOT[k].id] === id);
        if (holding) { tapSlot(holding); return; }   // it is on already: show where
        key = ARMS[armNext];
        armNext = (armNext + 1) % ARMS.length;
      }
      if (mount === "arm") {   // arms carry three different weapons: picking one another arm holds swaps the two
        const other = ARMS.find(k => k !== key && next[SLOT[k].id] === id);
        if (other) next[SLOT[other].id] = next[SLOT[key].id];
      }
      next[SLOT[key].id] = mount === "torso" && next.CT === id ? "" : id;
      Fit.now = next;
      draw();
      Fit.changed();
      turnTo(SHOW[key]);
      for (const [k, m] of marks) m.classList.toggle("is-on", k === key);
    };
    for (const p of parts) p.addEventListener("click", () => choose(p));

    fetch("/hangar/hangar-data.json").then(r => r.ok ? r.json() : Promise.reject(new Error("no fits"))).then(json => {
      data = json;
      table = new Map(data.loadouts.map(l => [l.key, l]));
      draw();
      Fit.changed();
    }).catch(() => {});   // the gauges keep the typed starter kit
    place(20);
  })();

  // ---------- fire it ----------
  const LINES = {
    "PULSE-50": "The arsenal's one beam. It lands the instant you fire and the wind never touches it. Four charges, each back two seconds after it is spent.",
    "CHAIN-30": "Sixty-five rounds a second. One barely marks the paint; the stream takes a mech apart. Fire it in bursts.",
    "SLUG-250": "One shell, one blow, four seconds to load the next. Twelve to a life, so every shot has to count.",
    "DART-20": "The longest reach in the game. Hold over for the drop, hold off for the wind. Three and a half seconds between rounds, ten to a life.",
    "THUMP-82": "Pick a spot and lob it. Full damage at the centre, a fifth at the edge of the blast, and it lands 1.3 seconds later.",
    "SPIKE-90": "A tungsten dart with no warhead, only speed. Ten and a half seconds between shots, the most heat of any weapon, three to a life.",
    "VOLLEY-6": "Six rockets in under half a second, spreading as they fly. Three salvos empty the pod, and its one reload takes twelve seconds.",
    "BREACH-275": "Mark a spot and the shell comes down three seconds later. The target gets no warning on its screen, only the whistle.",
  };
  // Where each render's muzzle sits in its own picture.
  const MUZZLE = { "PULSE-50": [0.075, 0.71], "CHAIN-30": [0.2, 0.6], "SLUG-250": [0.135, 0.73], "DART-20": [0.135, 0.59], "THUMP-82": [0.185, 0.68], "SPIKE-90": [0.125, 0.8], "VOLLEY-6": [0.31, 0.44], "BREACH-275": [0.32, 0.13] };
  const HIT_LABEL = { "CHAIN-30": "A round", "VOLLEY-6": "A rocket", "THUMP-82": "At the centre", "BREACH-275": "At the centre" };
  const BURN_LABEL = { "CHAIN-30": "Heat a round", "VOLLEY-6": "Heat a salvo" };

  stage($("[data-fire]"), (root, s) => {
    const { ctx } = s;
    const art = $("[data-gun-art]", root), target = $(".fire__target", root), trigger = $("[data-trigger]", root);
    let chosen = "CHAIN-30", stance = "stand", held = false, dealt = 0, clock = 0, textAt = 0, wasLatched = false, kick = 0, lastTracer = 0;
    let guns = new Map(GUN_IDS.map(id => [id, Armory.newGun(id)])), reactor = Armory.newReactor();
    const later = [], fx = [];

    const setGun = id => {
      chosen = id;
      const g = GAME.guns[id];
      art.src = big(id);
      art.alt = `The ${id}, the gun in your hands.`;
      pick(id);
      put(root, "reach", `${n(g.rangeYd)} yd`);
      put(root, "hit-label", HIT_LABEL[id] || "A shot");
      put(root, "hit", figure(g.damage));
      put(root, "burn-label", BURN_LABEL[id] || "Heat a shot");
      put(root, "burn", `+${figure(g.heat)}`);
      put(root, "lb", `${n(g.weightLb)} lb`);
      say();
      paintText(true);
    };
    const pick = gunPicker($("[data-guns]", root), chosen, setGun);

    const say = () => {
      const state = guns.get(chosen);
      const dry = state.left <= 0 && state.g.model !== "magazine" && state.g.model !== "charges";
      root.dataset.state = reactor.latched ? "locked" : dry ? "dry" : "ready";
      put(root, "verdict", reactor.latched ? `Overheated. Guns locked until the needle falls under ${GAME.heat.recover}.`
        : dry ? "Dry. It carries no more this life. Pick another gun, or start a new fight." : LINES[chosen]);
    };

    function roundsText(state) {
      const g = state.g;
      if (g.model === "salvo") return `${state.left} · ${state.tubes} in the pod`;
      if (g.model === "stream") return n(state.left);
      return `${state.left} of ${g.rounds}`;
    }
    function nextText(state) {
      if (reactor.latched) return "Locked";
      if (state.left <= 0 && !state.reloading && state.g.model !== "charges") return "Dry";
      if (state.reloading) return `Loads in ${state.wait.toFixed(1)} s`;
      if (state.g.model === "charges" && state.left <= 0) return `${state.recharge[0].toFixed(1)} s`;
      if (state.wait > 0.01 && state.g.model !== "stream") return `${state.wait.toFixed(1)} s`;
      return "Ready";
    }
    function paintText(force) {
      if (!force && clock - textAt < 0.08) return;
      textAt = clock;
      const state = guns.get(chosen);
      put(root, "dealt", n(dealt));
      put(root, "rounds", roundsText(state));
      put(root, "next", nextText(state));
      put(root, "heat", n(reactor.value));
      const rate = reactor.phase === "none" ? Armory.flow(stance, Fit.load) : null;
      put(root, "flow", rate === null ? "Shut down" : `${rate > 0 ? "+" : "−"}${figure(Math.abs(rate))} a second`);
      const gauge = $("[data-gauge]", root);
      gauge.style.setProperty("--v", (reactor.value / 100).toFixed(3));
      root.classList.toggle("is-hot", reactor.value >= 80);
      root.style.setProperty("--hot", Math.max(0, (reactor.value - 70) / 30).toFixed(2));
    }

    // what the eye sees: every round drawn from the render's muzzle to the far VIGIL, and none of it when motion is asked down
    const muzzle = () => {
      const box = art.getBoundingClientRect(), c = s.canvas.getBoundingClientRect(), [mx, my] = MUZZLE[chosen];
      return { x: box.left - c.left + box.width * mx, y: box.top - c.top + box.height * my };
    };
    const torso = () => {
      const box = target.getBoundingClientRect(), c = s.canvas.getBoundingClientRect();
      return { x: box.left - c.left + box.width * (0.5 + (Math.random() - 0.5) * 0.28), y: box.top - c.top + box.height * (0.3 + (Math.random() - 0.5) * 0.28), r: box.height };
    };
    const ground = () => {
      const box = target.getBoundingClientRect(), c = s.canvas.getBoundingClientRect();
      return { x: box.left - c.left + box.width * 0.5, y: box.top - c.top + box.height * 0.96, r: box.height };
    };
    const lerp = (a, b, t) => a + (b - a) * t;
    function sparks(p, count, speed) {
      if (calm) return;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random());
        fx.push({ k: "spark", x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, t: 0, life: 0.25 + Math.random() * 0.35 });
      }
    }
    const number = (p, value) => { if (!calm) fx.push({ k: "float", x: p.x, y: p.y - 14, text: `+${figure(value, 1)}`, t: 0, life: 0.9 }); };
    const land = (value, delay) => later.push({ at: clock + delay, value });

    function shoot(id, shot) {
      const g = GAME.guns[id];
      kick = calm ? 0 : id === "CHAIN-30" ? 3 : Math.min(26, 8 + g.damage * 0.22);
      if (calm) {
        if (g.model === "salvo") land(shot.damage, 0.8);
        else if (g.flight) land(shot.damage, g.flight);
        else dealt += shot.damage;
        return;
      }
      const a = muzzle();
      if (id === "CHAIN-30") {
        fx.push({ k: "flash", x: a.x, y: a.y, r: 26, c: "255,190,110", t: 0, life: 0.05 });
        dealt += shot.damage;
        if (clock - lastTracer > 0.05) {
          lastTracer = clock;
          const b = torso();
          fx.push({ k: "streak", a, b, c: "255,170,70", w: 2.2, t: 0, life: 0.14, then: () => sparks(b, 2, 90) });
        }
        return;
      }
      const b = torso();
      if (id === "PULSE-50") {
        fx.push({ k: "beam", a, b, t: 0, life: 0.16 }, { k: "flash", x: a.x, y: a.y, r: 40, c: "255,90,60", t: 0, life: 0.12 });
        sparks(b, 8, 120); number(b, shot.damage); dealt += shot.damage;
      } else if (id === "SLUG-250" || id === "DART-20") {
        const heavy = id === "SLUG-250";
        fx.push({ k: "flash", x: a.x, y: a.y, r: heavy ? 90 : 44, c: "255,180,90", t: 0, life: heavy ? 0.14 : 0.09 });
        fx.push({ k: "streak", a, b, c: heavy ? "255,160,70" : "255,190,110", w: heavy ? 5 : 2, t: 0, life: heavy ? 0.2 : 0.16, then: () => { sparks(b, heavy ? 22 : 10, heavy ? 190 : 120); number(b, shot.damage); } });
        dealt += shot.damage;
      } else if (id === "SPIKE-90") {
        fx.push({ k: "flash", x: a.x, y: a.y, r: 70, c: "190,220,255", t: 0, life: 0.1 });
        fx.push({ k: "dart", a, b, t: 0, life: 1.7, seed: Math.random() * 9 });
        sparks(b, 26, 220); number(b, shot.damage); dealt += shot.damage;
      } else if (id === "VOLLEY-6") {
        for (let i = 0; i < g.salvo; i++) {
          const delay = i * g.ripple, end = torso();
          fx.push({ k: "rocket", a: { x: a.x + (Math.random() - 0.5) * 18, y: a.y + (Math.random() - 0.5) * 18 }, b: end, bow: (Math.random() - 0.5) * 60, t: -delay, life: 0.8, then: () => { fx.push({ k: "blast", x: end.x, y: end.y, r: end.r * 0.13, t: 0, life: 0.3 }); sparks(end, 7, 110); number(end, g.damage); } });
          land(g.damage, delay + 0.8);
        }
        fx.push({ k: "flash", x: a.x, y: a.y, r: 60, c: "255,190,120", t: 0, life: 0.45 });
      } else {   // the two that lob: an arc to a spot on the ground, and a blast
        const end = ground(), arc = id === "BREACH-275" ? 1.1 : 0.32;
        fx.push({ k: "flash", x: a.x, y: a.y, r: id === "BREACH-275" ? 70 : 40, c: "255,190,120", t: 0, life: 0.12 });
        fx.push({ k: "lob", a, b: end, arc: s.h * arc, t: 0, life: g.flight, big: id === "BREACH-275", then: () => {
          fx.push({ k: "blast", x: end.x, y: end.y - end.r * 0.1, r: end.r * (id === "BREACH-275" ? 1 : 0.42), t: 0, life: id === "BREACH-275" ? 0.75 : 0.45, ring: true });
          sparks(end, id === "BREACH-275" ? 40 : 24, id === "BREACH-275" ? 280 : 190);
          number({ x: end.x, y: end.y - end.r * 0.6 }, shot.damage);
        } });
        land(shot.damage, g.flight);
      }
    }

    function drawFx(dt) {
      ctx.clearRect(0, 0, s.w, s.h);
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i];
        f.t += dt;
        if (f.t < 0) continue;
        const p = Math.min(1, f.t / f.life);
        ctx.save();
        if (f.k === "flash") {
          ctx.globalCompositeOperation = "lighter";
          const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
          g.addColorStop(0, `rgba(255,245,220,${0.95 * (1 - p)})`); g.addColorStop(0.35, `rgba(${f.c},${0.7 * (1 - p)})`); g.addColorStop(1, `rgba(${f.c},0)`);
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill();
        } else if (f.k === "beam") {
          ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
          for (const [w, c] of [[14, `rgba(255,60,40,${0.34 * (1 - p)})`], [6, `rgba(255,110,70,${0.8 * (1 - p)})`], [2, `rgba(255,235,220,${1 - p})`]]) {
            ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(f.a.x, f.a.y); ctx.lineTo(f.b.x, f.b.y); ctx.stroke();
          }
        } else if (f.k === "streak") {
          const head = p, tail = Math.max(0, p - 0.22);
          ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round"; ctx.strokeStyle = `rgba(${f.c},0.95)`; ctx.lineWidth = lerp(f.w, f.w * 0.5, p);
          ctx.beginPath(); ctx.moveTo(lerp(f.a.x, f.b.x, tail), lerp(f.a.y, f.b.y, tail)); ctx.lineTo(lerp(f.a.x, f.b.x, head), lerp(f.a.y, f.b.y, head)); ctx.stroke();
        } else if (f.k === "dart") {   // the railgun: a fast dart and the swirling smoke it leaves
          const reach = Math.min(1, f.t / 0.1), fade = Math.max(0, 1 - f.t / f.life);
          ctx.strokeStyle = `rgba(232,232,236,${0.6 * fade})`; ctx.lineWidth = 2 + 5 * (1 - fade);
          ctx.beginPath();
          for (let q = 0; q <= 1; q += 0.02) {
            if (q > reach) break;
            const wobble = Math.sin(q * 26 + f.seed + f.t * 5) * (2 + 12 * (1 - fade));
            const x = lerp(f.a.x, f.b.x, q), y = lerp(f.a.y, f.b.y, q) + wobble;
            if (q === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        } else if (f.k === "rocket") {
          const at = q => { const m = { x: (f.a.x + f.b.x) / 2, y: (f.a.y + f.b.y) / 2 - 40 + f.bow }; return { x: (1 - q) ** 2 * f.a.x + 2 * q * (1 - q) * m.x + q * q * f.b.x, y: (1 - q) ** 2 * f.a.y + 2 * q * (1 - q) * m.y + q * q * f.b.y }; };
          ctx.lineCap = "round";
          for (let q = Math.max(0, p - 0.34); q < p; q += 0.03) { const a = at(q); ctx.fillStyle = `rgba(226,220,210,${0.34 * (q - p + 0.34) / 0.34})`; ctx.beginPath(); ctx.arc(a.x, a.y, 3 + (p - q) * 18, 0, 7); ctx.fill(); }
          const h = at(p); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = "rgba(255,200,120,0.95)"; ctx.beginPath(); ctx.arc(h.x, h.y, 3.4, 0, 7); ctx.fill();
        } else if (f.k === "lob") {
          const x = lerp(f.a.x, f.b.x, p), y = lerp(f.a.y, f.b.y, p) - f.arc * 4 * p * (1 - p);
          ctx.fillStyle = "#1b1410"; ctx.beginPath(); ctx.arc(x, y, f.big ? 5.5 : 3.6, 0, 7); ctx.fill();
          ctx.strokeStyle = "rgba(255,240,220,0.5)"; ctx.lineWidth = 1; ctx.stroke();
        } else if (f.k === "blast") {
          ctx.globalCompositeOperation = "lighter";
          const r = f.r * (0.35 + 0.65 * Math.sqrt(p)), g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
          g.addColorStop(0, `rgba(255,240,200,${0.95 * (1 - p)})`); g.addColorStop(0.45, `rgba(255,140,50,${0.72 * (1 - p)})`); g.addColorStop(1, "rgba(120,40,10,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, 7); ctx.fill();
          if (f.ring) { ctx.strokeStyle = `rgba(255,220,170,${0.7 * (1 - p)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(f.x, f.y + f.r * 0.1, f.r * (0.3 + p), f.r * (0.3 + p) * 0.26, 0, 0, 7); ctx.stroke(); }
        } else if (f.k === "spark") {
          f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 420 * dt;
          ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = `rgba(255,190,110,${1 - p})`; ctx.fillRect(f.x, f.y, 2, 2);
        } else if (f.k === "float") {
          ctx.font = `600 ${Math.max(18, s.w * 0.016)}px "Barlow Condensed", sans-serif`; ctx.textAlign = "center";
          ctx.fillStyle = `rgba(255,255,255,${1 - p})`; ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 6; ctx.fillText(f.text, f.x, f.y - p * 34);
        }
        ctx.restore();
        if (f.t >= f.life) { fx.splice(i, 1); if (f.then) f.then(); }
      }
    }

    // the trigger: a hold, by pointer or key
    const down = () => { held = true; trigger.classList.add("is-held"); };
    const up = () => { held = false; trigger.classList.remove("is-held"); };
    trigger.addEventListener("pointerdown", event => { event.preventDefault(); trigger.setPointerCapture?.(event.pointerId); down(); });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture", "blur"]) trigger.addEventListener(type, up);
    trigger.addEventListener("contextmenu", event => event.preventDefault());
    trigger.addEventListener("keydown", event => { if ((event.key === " " || event.key === "Enter") && !event.repeat) { event.preventDefault(); down(); } });
    trigger.addEventListener("keyup", event => { if (event.key === " " || event.key === "Enter") up(); });

    for (const chip of $$("[data-stance]", root)) chip.addEventListener("click", () => {
      stance = chip.dataset.stance;
      for (const c of $$("[data-stance]", root)) c.setAttribute("aria-pressed", String(c === chip));
      paintText(true);
    });
    $("[data-new-fight]", root).addEventListener("click", () => {
      guns = new Map(GUN_IDS.map(id => [id, Armory.newGun(id)]));
      reactor = Armory.newReactor();
      dealt = 0; later.length = 0; fx.length = 0;
      say(); paintText(true);
    });
    Fit.listeners.push(() => paintText(true));

    say();
    return dt => {
      clock += dt;
      for (const gun of guns.values()) Armory.tickGun(gun, dt);
      if (held) {
        const shot = Armory.pull(guns.get(chosen), dt, reactor);
        if (shot) { reactor.pending += shot.heat; shoot(chosen, shot); }
      }
      Armory.stepReactor(reactor, dt, stance, Fit.load);
      for (let i = later.length - 1; i >= 0; i--) if (later[i].at <= clock) { dealt += later[i].value; later.splice(i, 1); }
      if (reactor.latched !== wasLatched) { wasLatched = reactor.latched; say(); }
      const state = guns.get(chosen);
      const dry = state.left <= 0 && state.g.model !== "magazine" && state.g.model !== "charges";
      if (dry !== (root.dataset.state === "dry") && !reactor.latched) say();
      paintText(false);
      if (!calm) {
        kick = Math.max(0, kick - kick * Math.min(1, dt * 14) - 0.2);
        art.style.setProperty("--kick", `${kick.toFixed(1)}px`);
        drawFx(dt);
      }
    };
  });

  // ---------- reach it, and the line-up ----------
  (() => {
    const root = $("[data-reach]");
    if (!root) return;
    const view = $("[data-reach-view]", root), input = $('input[name="yards"]', root), target = $("[data-reach-target]", root), tag = $("[data-reach-tag]", root);
    const section = root, ladder = $("[data-ladder]", section), rows = new Map($$(".gun", ladder).map(r => [r.dataset.gun, r]));
    const HORIZON = 0.45, NEAR = 60;   // for the eye: where the ground meets the sky in this picture, and how fast it falls away
    let rank = "reach";
    const at = yards => HORIZON + (1 - HORIZON) * NEAR / (yards + NEAR);

    const METRIC = {
      reach: { value: id => GAME.guns[id].rangeYd, label: v => `${n(v)} yd` },
      hit: { value: id => { const g = GAME.guns[id]; return g.model === "salvo" ? g.damage * g.salvo : g.damage; }, label: (v, id) => id === "VOLLEY-6" ? `${figure(v)} a salvo` : figure(v) },
      ten: { value: id => Armory.tenSeconds(id, Fit.load), label: v => n(v) },
      heat: { value: id => { const g = GAME.guns[id]; return g.model === "stream" ? g.rate * g.heat : g.heat; }, label: (v, id) => id === "CHAIN-30" ? `+${figure(v)} a sec` : `+${figure(v)}` },
      lb: { value: id => GAME.guns[id].weightLb, label: v => `${n(v)} lb` },
    };
    function update() {
      const yards = Number(input.value), feet = `${(at(yards) * 100).toFixed(2)}%`, tall = `${(82 * NEAR / (yards + NEAR)).toFixed(2)}%`;
      for (const el of [target, tag]) { el.style.setProperty("--feet", feet); el.style.setProperty("--tall", tall); }
      put(root, "yd", `${n(yards)} yd`);
      put(root, "yd-tag", `${n(yards)} yd`);
      let live = 0;
      for (const id of GUN_IDS) {
        const inside = GAME.guns[id].rangeYd >= yards;
        if (inside) live++;
        rows.get(id).classList.toggle("is-out", rank === "reach" && !inside);
      }
      put(section, "reach-say", live === 0 ? `At ${n(yards)} yd nothing can touch it. Past its range a round does nothing.`
        : live === GUN_IDS.length ? `At ${n(yards)} yd, all eight still hurt it. Past its range a round does nothing.`
        : `At ${n(yards)} yd, ${live} of ${GUN_IDS.length} still hurt it. Past its range a round does nothing.`);
    }
    function setRank(metric) {
      rank = metric;
      ladder.dataset.rank = metric;
      const { value, label } = METRIC[metric], list = GUN_IDS.map(id => [id, value(id)]).sort((a, b) => b[1] - a[1]), top = list[0][1] || 1;
      const before = new Map(GUN_IDS.map(id => [id, rows.get(id).getBoundingClientRect().top]));
      for (const [id, v] of list) {
        const row = rows.get(id);
        row.style.setProperty("--at", (v / top).toFixed(3));
        $(".gun__off", row).textContent = label(v, id);
        ladder.append(row);
      }
      if (!calm && rows.get(GUN_IDS[0]).animate) for (const [id] of list) {
        const row = rows.get(id), moved = before.get(id) - row.getBoundingClientRect().top;
        if (moved) row.animate([{ transform: `translateY(${moved}px)` }, { transform: "none" }], { duration: 320, easing: "ease-out" });
      }
      for (const c of $$("[data-rank]", section)) c.setAttribute("aria-pressed", String(c.dataset.rank === metric));
      update();
    }
    for (const c of $$("[data-rank]", section)) c.addEventListener("click", () => setRank(c.dataset.rank));
    Fit.listeners.push(() => { if (rank === "ten") setRank("ten"); });
    input.addEventListener("input", update);
    // the picture itself is a drag too: right takes the target back, up and down still scroll the page
    let drag = null;
    view.addEventListener("pointerdown", event => {
      if (event.target.closest("input, label")) return;
      drag = { x: event.clientX, yards: Number(input.value), id: event.pointerId };
      view.setPointerCapture?.(event.pointerId);
    });
    view.addEventListener("pointermove", event => {
      if (!drag || drag.id !== event.pointerId) return;
      const span = Number(input.max) - Number(input.min);
      input.value = String(Math.max(Number(input.min), Math.min(Number(input.max), drag.yards + (event.clientX - drag.x) / view.clientWidth * span)));
      update();
    });
    for (const type of ["pointerup", "pointercancel"]) view.addEventListener(type, () => { drag = null; });
    update();
  })();

  // ---------- break it ----------
  stage($("[data-salvage]"), (root, s) => {
    const { ctx } = s;
    const frame = $("[data-salv]", root), art = $("[data-salv-art]", root), biomeArt = $("[data-biome-art]", root);
    const tiles = new Map($$("[data-bank] li", root).map(li => [li.dataset.part, li]));
    // On the front frame, in its own percent: the rear frame is read as these mirrored, because the VIGIL has turned round,
    // and the arm that was on the left is on the right. The art is never flipped.
    const FRONT = { RA: [18, 5, 13.5, 47, 74], LA: [67, 8, 14, 45, 68], RT: [31.5, 11, 9.5, 20, 58], LT: [57, 11, 10, 20, 58], CT: [41, 10, 16, 26, 72], PV: [39, 36, 21, 14, 50], RL: [26, 50, 18, 47, 34], LL: [55, 50, 18, 47, 34] };
    const NAME = { RA: "The right arm", LA: "The left arm", RT: "The right side torso", LT: "The left side torso", CT: "The centre torso", PV: "The pelvis", RL: "The right leg", LL: "The left leg" };
    const LANDS = { snow: "snow-4", desert: "desert-4", jungle: "jungle-3", volcanic: "badlands-4" };
    const LAND_ALT = { snow: "Snowfields and dark pines below a high range, from the game.", desert: "Red dunes and mesas under an evening sky, from the game.", jungle: "Green jungle under a low grey sky, from the game.", volcanic: "A volcano smoking over black ground, from the game." };
    let face = "front", biome = "jungle", into = 0, unpaid = 0, home = 0;
    const sparks = [];
    const zones = new Map();

    for (const key of Object.keys(FRONT)) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "zone"; b.dataset.zone = key;
      b.setAttribute("aria-label", NAME[key]);
      const chip = document.createElement("span");
      chip.className = "zone__chip";
      b.append(chip);
      frame.append(b);
      zones.set(key, b);
    }
    function layout() {
      for (const [key, b] of zones) {
        const [x, y, w, h, cy] = FRONT[key];
        const left = face === "front" ? x : 99 - x - w;
        b.style.setProperty("--x", `${left}%`); b.style.setProperty("--y", `${y}%`); b.style.setProperty("--w", `${w}%`); b.style.setProperty("--h", `${h}%`);
        b.style.setProperty("--cy", `${cy}%`);
        const split = Armory.splitFor(key, face, Fit.now), chip = $(".zone__chip", b);
        const seen = [...new Set(split.map(([part]) => part))];
        chip.replaceChildren(...(seen.length ? seen.map(part => { const img = new Image(64, 64); img.src = partArt(part); img.alt = ""; return img; }) : [Object.assign(document.createElement("i"), { textContent: "×" })]));
      }
    }
    function drawBank() {
      for (const [part, li] of tiles) {
        const value = Bank.parts[part] || 0, whole = Math.floor(value + 1e-9);
        $("[data-n]", li).textContent = n(whole);
        $("i", li).style.setProperty("--f", (value - whole).toFixed(3));
      }
      put(root, "into", n(into));
      put(root, "home", figure(home, 2));
      put(root, "unpaid", n(unpaid));
    }
    function hit(key, clientX, clientY) {
      const split = Armory.splitFor(key, face, Fit.now), dealt = 100;
      const b = zones.get(key);
      b.classList.add("is-hit");
      setTimeout(() => b.classList.remove("is-hit"), 120);
      if (!split.length) {
        unpaid += dealt;
        put(root, "salvage-say", key === "PV" ? "The pelvis pays nothing." : "Legs pay nothing. A leg shot only slows it.");
      } else {
        const paid = Armory.award(split, dealt, biome);
        for (const [part, value] of Object.entries(paid)) {
          Bank.add(part, value, true);
          home += value;
          const li = tiles.get(part);
          if (!calm) { li.classList.add("is-new"); setTimeout(() => li.classList.remove("is-new"), 160); }
        }
        into += dealt;
        const named = [...new Set(split.map(([part]) => PART_NAME[part]))].join(" and ");
        put(root, "salvage-say", `${NAME[key]} pays ${named}. Keep hitting it: 100 damage is a fifth of a part.`);
      }
      if (!calm && s.canvas) {
        const c = s.canvas.getBoundingClientRect(), x = clientX - c.left, y = clientY - c.top;
        for (let i = 0; i < 12; i++) {
          const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 170;
          sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, t: 0, life: 0.25 + Math.random() * 0.3 });
        }
      }
      drawBank();
      Bank.changed();
    }
    for (const [key, b] of zones) {
      let repeat = 0, first = 0, at = null;
      const stop = () => { clearTimeout(first); clearInterval(repeat); first = 0; repeat = 0; };
      b.addEventListener("pointerdown", event => {
        at = [event.clientX, event.clientY];
        hit(key, ...at);
        first = setTimeout(() => { repeat = setInterval(() => hit(key, ...at), 120); }, 260);
      });
      for (const type of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(type, stop);
      b.addEventListener("contextmenu", event => event.preventDefault());
      b.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        const box = b.getBoundingClientRect();
        hit(key, box.left + box.width / 2, box.top + box.height / 2);
      });
    }
    for (const chip of $$("[data-face]", root)) chip.addEventListener("click", () => {
      face = chip.dataset.face;
      for (const c of $$("[data-face]", root)) c.setAttribute("aria-pressed", String(c === chip));
      const next = `/assets/img/armory/vigil-${face === "front" ? "000" : "180"}.webp`, img = new Image();
      img.onload = () => { art.src = next; art.alt = face === "front" ? "An enemy VIGIL from the front, each part of it marked with the salvage it pays." : "An enemy VIGIL from behind, each part of it marked with the salvage it pays."; layout(); };
      img.src = next;
    });
    for (const chip of $$("[data-land]", root)) chip.addEventListener("click", () => {
      biome = chip.dataset.land;
      root.dataset.biome = biome;
      for (const c of $$("[data-land]", root)) c.setAttribute("aria-pressed", String(c === chip));
      const file = LANDS[biome];
      biomeArt.srcset = `/assets/img/lands/${file}-1280.webp 1280w, /assets/img/lands/${file}-2560.webp 2560w`;
      biomeArt.src = `/assets/img/lands/${file}-1280.webp`;
      biomeArt.alt = LAND_ALT[biome];
      const tilt = GAME.salvage.biome[biome].map(part => PART_NAME[part]).join(" and ");
      put(root, "salvage-say", `Here a third of the wildcard turns into ${tilt}. The total never changes.`);
    });
    Fit.listeners.push(layout);
    Bank.listeners.push(drawBank);
    layout();
    drawBank();
    return dt => {
      ctx.clearRect(0, 0, s.w, s.h);
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt;
        ctx.fillStyle = `rgba(255,190,110,${Math.max(0, 1 - p.t / p.life)})`;
        ctx.fillRect(p.x, p.y, 2.4, 2.4);
        if (p.t >= p.life) sparks.splice(i, 1);
      }
    };
  });

  // ---------- open it ----------
  (() => {
    const root = $("[data-crate]");
    if (!root) return;
    const rows = $$("[data-grade]", root), open = $("[data-crate-open]", root), art = $(".crate__art", root);
    const pct = v => `${figure(v * 100, 1)}%`;
    let nudge = null;
    function draw(force) {
      const next = Armory.nudgeFor(Bank.fromHits);
      if (next === nudge && !force) return;
      const changed = nudge !== null;
      nudge = next;
      const odds = Armory.crateOdds(nudge);
      rows.forEach((row, i) => {
        row.style.setProperty("--p", odds[i].toFixed(4));
        $("[data-p]", row).textContent = pct(odds[i]);
      });
      if (changed || force) put(root, "crate-say", nudge < 0 ? `Under half a part home: a weak match, and the top two grades stay shut. Go and break something.`
        : nudge > 0 ? `${figure(Bank.fromHits, 1)} parts home: a strong match, and the top two grades are half as likely again.`
        : `${figure(Bank.fromHits, 1)} parts home: an ordinary match, and the base odds. Three parts makes it strong.`);
    }
    Bank.listeners.push(() => draw(false));
    open.addEventListener("click", () => {
      const grade = Armory.crateGrade(Math.random(), nudge), cells = GAME.salvage.crateCells[grade - 1];
      rows.forEach(row => row.classList.toggle("is-rolled", Number(row.dataset.grade) === grade));
      art.classList.remove("is-open");
      void art.offsetWidth;   // so the pop can run again
      art.classList.add("is-open");
      Bank.add("power-cells", cells, false);
      Bank.changed();
      put(root, "crate-say", `Grade ${grade}: ${cells} Power ${cells === 1 ? "Cell" : "Cells"}, in the bank above. In the game it is one crate a day.`);
      open.textContent = "Open another";
    });
    draw(false);
  })();

  // ---------- climb it ----------
  (() => {
    const root = $("[data-climb]");
    if (!root) return;
    const art = $("[data-climb-art]", root), partImage = $('[data-out-art="bill-part"]', root), section = root.closest("section");
    let chosen = "SLUG-250", mk = 1;
    const MK = ["I", "II", "III", "IV"];
    const pick = gunPicker($("[data-climb-guns]", root), chosen, id => { chosen = id; pick(id); art.src = big(id); art.alt = `The ${id}, the gun on the bench.`; draw(); });
    function draw() {
      const at = Armory.atMark(chosen, mk), top = Armory.atMark(chosen, 4), bill = Armory.billTo(chosen, mk), part = GAME.salvage.partOfGun[chosen], g = GAME.guns[chosen];
      const label = at.axis === "reach" ? "Reach" : at.axis === "heat" ? (g.model === "stream" ? "Heat a round" : "Heat a shot") : (HIT_LABEL[chosen] === "A rocket" ? "Damage a rocket" : HIT_LABEL[chosen] === "At the centre" ? "Damage at the centre" : "Damage a shot");
      put(root, "gain-label", label);
      put(root, "gain", at.axis === "reach" ? `${n(at.value)} yd` : figure(at.value, at.axis === "heat" ? 3 : 1));
      put(root, "gain-delta", mk === 1 ? "Where every gun starts" : `${at.percent < 0 ? "−" : "+"}${figure(Math.abs(at.percent), 1)}% on Mk I`);
      // the bar is the gun's whole ladder: Mk I at its share of Mk IV, or the reverse for heat, where less is the gain
      const v = at.axis === "heat" ? top.value / at.value : at.value / top.value;
      $(".gain", root).style.setProperty("--v", v.toFixed(3));
      put(root, "mk-big", `Mk ${MK[mk - 1]}`);
      section.style.setProperty("--mk", String(mk - 1));
      put(root, "bill-marks", n(bill.marks + bill.unlock));
      put(root, "bill-parts", n(bill.parts));
      put(root, "bill-part-name", PART_NAME[part]);
      partImage.src = partArt(part);
      put(root, "bill-hours", n(bill.hours));
      put(root, "bill-dealt", n(bill.dealt));
      const have = Math.floor((Bank.parts[part] || 0) + 1e-9), owned = bill.unlock === 0;
      const step = mk - 2;
      const cost = step >= 0 ? `This step: ${n(GAME.upgrades.fees[step])} Marks and ${GAME.upgrades.parts[step]} ${PART_NAME[part]}.` : owned ? "Every pilot starts with it." : `Earned once, for ${n(bill.unlock)} Marks. Then it climbs.`;
      const banked = have > 0 && step >= 0 ? ` You brought ${have} home above.` : "";
      const unlock = !owned && step >= 0 ? ` The Marks count includes its ${n(bill.unlock)} to earn it.` : "";
      put(root, "climb-say", `${cost}${unlock}${banked}`);
      for (const r of $$("[data-mk]", root)) r.setAttribute("aria-pressed", String(Number(r.dataset.mk) === mk));
    }
    for (const r of $$("[data-mk]", root)) r.addEventListener("click", () => { mk = Number(r.dataset.mk); draw(); });
    Bank.listeners.push(draw);
    draw();
  })();
})();
