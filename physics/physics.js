// The Physics: the game's own rules, run live in the page's instruments.
// GAME holds every number the instruments use, each the one the game runs with. Tools/website/physics_check.py reads them
// back from the game's code and fails on any that has drifted, so change one only when the game changes, then run it.
// The page's typed readouts are what these give at each instrument's starting position, so the page reads right without
// scripts; the check recomputes those too.

/* GAME-BEGIN */
const GAME = {
  "gravity": 9.81,
  "legHp": 150,
  "safeLandSpeed": 6,
  "legDamagePerSpeed": 14,
  "thrustSpeed": 14,
  "serviceCeilingM": 45.72,
  "jetHeatPerSecond": 7,
  "jetTankSeconds": 30,
  "flareStartM": 5,
  "flareTouchdown": 4,
  "emptyT": 38,
  "mowT": 53.12,
  "kitT": 12.6,
  "jetsT": 3,
  "bandMinMph": 39,
  "bandMaxMph": 45,
  "heatDegradeAtMow": 0.432,
  "overloadMphPer100": 28,
  "overloadMinMph": 8,
  "overloadCoolingSlopePer100": 0.2,
  "overloadCoolingFloor": 0.35,
  "jetOverloadDrainPer100": 1.5,
  "tractionLimitDeg": 45,
  "stallLimitDeg": 65,
  "slowBaseK": 3.5,
  "slowLoadK": 2.3,
  "gradeExponent": 2.5,
  "slideBack": 2.5,
  "dartMuzzle": 330,
  "dartZeroM": 300,
  "tickMrad": 14.2,
  "wind": { "DART-20": 0.0009, "CHAIN-30": 0.0006, "SLUG-250": 0.0003, "VOLLEY-6": 0.0005, "THUMP-82": 0.2, "BREACH-275": 0.2, "SPIKE-90": 0, "PULSE-50": 0 },
  "lobSeconds": { "THUMP-82": 1.3, "BREACH-275": 3 },
  "rangeM": { "DART-20": 914, "CHAIN-30": 137, "SLUG-250": 183, "VOLLEY-6": 389 },
  "sound0C": 331.3,
  "soundLossDb": 6
};
/* GAME-END */

const Physics = (() => {
  const FT = 0.3048, YD = 0.9144, MPH = 0.44704, LB_PER_T = 2000;
  const loadOf = payloadT => Math.max(0, payloadT) / (GAME.mowT - GAME.emptyT);

  /** An unpowered fall from a height: arrival speed and what each leg takes (JumpJetController's landing). */
  function fall(heightM) {
    const v = Math.sqrt(2 * GAME.gravity * Math.max(0, heightM));
    return { v, leg: Math.max(0, v - GAME.safeLandSpeed) * GAME.legDamagePerSpeed };
  }

  /** What a VIGIL at an operating weight gets: GrossWeight's speed band, cooling taper and jet drain. */
  function weight(operatingT) {
    const lf = loadOf(operatingT - GAME.emptyT), over = Math.max(0, lf - 1);
    const speed = Math.max(GAME.overloadMinMph,
      GAME.bandMaxMph - (GAME.bandMaxMph - GAME.bandMinMph) * Math.min(lf, 1) - GAME.overloadMphPer100 * over);
    const cooling = lf <= 1 ? 1 - GAME.heatDegradeAtMow * lf * lf
      : Math.max(GAME.overloadCoolingFloor, 1 - GAME.heatDegradeAtMow - GAME.overloadCoolingSlopePer100 * over);
    const drain = Math.max(1, operatingT / GAME.emptyT) * (1 + GAME.jetOverloadDrainPer100 * over);
    return { lf, speed, cooling, drain, ceilingM: GAME.serviceCeilingM / drain, climbS: 100 / (GAME.jetHeatPerSecond * drain) };
  }

  /** SlopeBands: SLOW below the traction limit, SLIP to the stall limit, STALL above it. */
  function slope(deg, lf) {
    if (deg >= GAME.stallLimitDeg) return { band: "stall", mult: 0 };
    if (deg >= GAME.tractionLimitDeg) return { band: "slip", mult: 0 };
    const s = Math.sin(deg * Math.PI / 180), k = GAME.slowBaseK + GAME.slowLoadK * Math.max(0, lf);
    return { band: "slow", mult: 1 / (1 + Math.pow(s, GAME.gradeExponent) * k) };
  }

  /** Ballistics.DropMeters and the drop angle, for DART-20 at a range in metres. */
  function drop(rangeM) {
    const v2 = GAME.dartMuzzle * GAME.dartMuzzle;
    return { m: 0.5 * GAME.gravity * rangeM * (rangeM - GAME.dartZeroM) / v2,
             mrad: 1000 * 0.5 * GAME.gravity * (rangeM - GAME.dartZeroM) / v2 };
  }

  /** WindBallistics: a direct-fire round turns by factor × crosswind (rad); a lobbed one lands wind × time × factor off. */
  function drift(gun, rangeM, windMph) {
    const w = windMph * MPH, f = GAME.wind[gun] || 0;
    return gun in GAME.lobSeconds ? w * GAME.lobSeconds[gun] * f : f * w * rangeM;
  }

  /** AirAcoustics: the speed of sound in dry air, and ISO 9613-1 absorption at one atmosphere (dB per metre). */
  const speedOfSound = c => GAME.sound0C * Math.sqrt(Math.max(0.05, 1 + c / 273.15));
  function absorption(hz, c, rh) {
    const T0 = 293.15, T01 = 273.16, T = c + 273.15;
    const psat = Math.pow(10, -6.8346 * Math.pow(T01 / T, 1.261) + 4.6151);
    const h = Math.max(0.0001, rh * 100 * psat);
    const frO = 24 + 4.04e4 * h * (0.02 + h) / (0.391 + h);
    const frN = Math.pow(T / T0, -0.5) * (9 + 280 * h * Math.exp(-4.17 * (Math.pow(T / T0, -1 / 3) - 1)));
    const f2 = hz * hz;
    return 8.686 * f2 * (1.84e-11 * Math.sqrt(T / T0) + Math.pow(T / T0, -2.5) *
      (0.01275 * Math.exp(-2239.1 / T) / (frO + f2 / frO) + 0.1068 * Math.exp(-3352 / T) / (frN + f2 / frN)));
  }
  /** The frequency above which the air has taken soundLossDb off a sound by the time it has come this far. */
  function cutoff(m, c, rh) {
    let lo = 500, hi = 22000;
    if (m <= 1 || absorption(hi, c, rh) * m <= GAME.soundLossDb) return hi;
    if (absorption(lo, c, rh) * m >= GAME.soundLossDb) return lo;
    for (let i = 0; i < 24; i++) {
      const mid = Math.sqrt(lo * hi);
      if (absorption(mid, c, rh) * m > GAME.soundLossDb) hi = mid; else lo = mid;
    }
    return lo;
  }

  return { FT, YD, MPH, LB_PER_T, loadOf, fall, weight, slope, drop, drift, speedOfSound, cutoff };
})();

// ---------- the instruments ----------

(() => {
  if (typeof document === "undefined") return;   // the check runs this file under Node for the arithmetic alone
  const n = (value, digits = 0) => value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const $ = (root, key) => root.querySelector(`[data-out="${key}"]`);
  const put = (root, key, text) => { const el = $(root, key); if (el) el.textContent = text; };

  function wire(id, draw) {
    const root = document.getElementById(id);
    if (!root) return;
    const inputs = [...root.querySelectorAll("input")];
    const run = () => draw(root, Object.fromEntries(inputs.filter(i => i.type !== "radio" || i.checked).map(i => [i.name, Number(i.value)])));
    inputs.forEach(i => i.addEventListener("input", run));
    run();
  }

  // the fall
  wire("fall", (root, { height }) => {
    const { v, leg } = Physics.fall(height * Physics.FT);
    const lost = leg >= GAME.legHp;
    put(root, "height", `${n(height)} ft`);
    put(root, "speed", `${n(v / Physics.MPH)} mph`);
    put(root, "speed-ms", `${n(v, 1)} m/s`);
    put(root, "leg", lost ? "Gone" : `${n(leg)} of ${GAME.legHp}`);
    put(root, "verdict", leg === 0 ? "A soft landing. Nothing breaks."
      : lost ? "Both legs are gone. It can still turn and shoot, but it will not walk again this life."
      : "A hard landing. Both legs take it.");
    root.style.setProperty("--h", Math.min(1, height / 160));
    root.style.setProperty("--leg", Math.min(1, leg / GAME.legHp));
    root.dataset.state = leg === 0 ? "soft" : lost ? "lost" : "hard";
  });

  // the weight
  wire("weight-inst", (root, { lb }) => {
    const w = Physics.weight(lb / Physics.LB_PER_T);
    const over = w.lf > 1 + 1e-9;
    put(root, "lb", `${n(lb)} lb`);
    put(root, "load", over ? `Overloaded, ${n(w.lf * 100)}%` : `${n(w.lf * 100)}% of its payload`);
    put(root, "speed", `${n(w.speed, 1)} mph`);
    put(root, "cooling", `${n(w.cooling * 100)}%`);
    put(root, "ceiling", `${n(w.ceilingM / Physics.FT)} ft`);
    put(root, "climb", `${n(w.climbS, 1)} s`);
    root.style.setProperty("--speed", w.speed / GAME.bandMaxMph);
    root.style.setProperty("--cooling", w.cooling);
    root.style.setProperty("--ceiling", w.ceilingM / GAME.serviceCeilingM);
    root.style.setProperty("--climb", w.climbS / (100 / GAME.jetHeatPerSecond));
    root.dataset.state = over ? "over" : "legal";
  });

  // the slope
  wire("slope", (root, { grade, load }) => {
    const top = Physics.weight(GAME.emptyT + load).speed, lf = Physics.loadOf(load);
    const s = Physics.slope(grade, lf);
    put(root, "grade", `${n(grade)}°`);
    put(root, "band", s.band === "slow" ? "Slow" : s.band === "slip" ? "Slip" : "Stall");
    put(root, "speed", s.band === "slow" ? `${n(top * s.mult, 1)} mph` : s.band === "slip" ? `${n(GAME.slideBack / Physics.MPH, 1)} mph back` : "0 mph");
    put(root, "note", s.band === "slow" ? `${n(s.mult * 100)}% of its ${n(top)} mph on the flat.`
      : s.band === "slip" ? "The feet lose their grip. Push on and it slides back down."
      : "Too steep for the legs to reach. It stops dead.");
    // the drawing: the ground turns about its foot, and the arc measures it (the SVG's own coordinates: foot at 24,190)
    const a = grade * Math.PI / 180;
    root.querySelector(".hill__ground")?.setAttribute("transform", `rotate(${-grade} 24 190)`);
    root.querySelector(".hill__arc")?.setAttribute("d", `M70,190 A46,46 0 0 0 ${(24 + 46 * Math.cos(a)).toFixed(1)},${(190 - 46 * Math.sin(a)).toFixed(1)}`);
    root.dataset.state = s.band;
  });

  // the scope
  wire("scope", (root, { range, wind }) => {
    const m = range * Physics.YD, d = Physics.drop(m);
    const driftM = Physics.drift("DART-20", m, wind), driftMrad = 1000 * GAME.wind["DART-20"] * wind * Physics.MPH;
    put(root, "range", `${n(range)} yd`);
    put(root, "wind", `${n(wind)} mph`);
    const zeroed = Math.abs(d.mrad / GAME.tickMrad) < 0.02;   // within a fiftieth of a tick of the zero, nothing to hold
    const ft = Math.abs(d.m / Physics.FT), shown = n(ft, ft < 10 ? 1 : 0);
    put(root, "drop", zeroed ? "On the line" : `${shown} ft ${d.m >= 0 ? "low" : "high"}`);
    put(root, "hold", zeroed ? "None: zeroed here" : `${n(Math.abs(d.mrad) / GAME.tickMrad, 2)} ticks ${d.mrad > 0 ? "over" : "under"}`);
    put(root, "drift", `${n(driftM / Physics.FT)} ft downwind`);
    // the drawing: 34 of the SVG's units to a tick, the hit kept inside the glass
    const clamp = v => Math.max(-3.9, Math.min(3.9, v));
    root.querySelector(".scope__hit")?.setAttribute("transform",
      `translate(${(34 * clamp(driftMrad / GAME.tickMrad)).toFixed(1)} ${(34 * clamp(d.mrad / GAME.tickMrad)).toFixed(1)})`);
  });

  // the wind table
  const table = document.getElementById("drift-table");
  if (table) {
    const draw = () => {
      const mph = Number(table.querySelector("input").value);
      put(table, "wind", `${n(mph)} mph`);
      table.querySelectorAll("[data-gun]").forEach(cell => {
        const gun = cell.dataset.gun, ft = Physics.drift(gun, GAME.rangeM[gun] || 0, mph) / Physics.FT;
        cell.textContent = (GAME.wind[gun] || 0) === 0 ? "None" : `${n(ft, ft < 10 ? 1 : 0)} ft`;
      });
    };
    table.querySelector("input").addEventListener("input", draw);
    draw();
  }

  // the sound
  wire("sound-inst", (root, { dist, temp, hum }) => {
    const c = Physics.speedOfSound(temp), hz = Physics.cutoff(dist, temp, hum / 100);
    put(root, "dist", `${n(dist)} m · ${n(dist / Physics.YD)} yd`);
    put(root, "temp", `${n(temp)} °C · ${n(temp * 9 / 5 + 32)} °F`);
    put(root, "hum", `${n(hum)}%`);
    put(root, "c", `${n(c)} m/s`);
    put(root, "delay", `${n(dist / c, 2)} s`);
    put(root, "cut", hz >= 22000 ? "Nothing lost" : hz >= 1000 ? `Above ${n(hz / 1000, 1)} kHz` : `Above ${n(hz)} Hz`);
    root.style.setProperty("--cut", Math.log(hz / 500) / Math.log(22000 / 500));
  });
})();

if (typeof module !== "undefined") module.exports = { GAME, Physics };
