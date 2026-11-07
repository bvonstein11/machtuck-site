// The Physics: the game's own rules, played in the page.
// GAME holds every number the demos use, each the one the game runs with. Tools/website/physics_check.py reads them back
// from the game's code and fails on any that has drifted, so change one only when the game changes, then run it.
// The page's typed readouts are what these give at each demo's starting position, so the page reads right without
// scripts; the check recomputes those too. WORLD holds the setting's figures, which live in no script.
// Nothing is stored and nothing is sent anywhere. Sound is made in the browser, and only after a click.

/* GAME-BEGIN */
const GAME = {
  "gravity": 9.81,
  "legHp": 150,
  "safeLandSpeed": 6,
  "legDamagePerSpeed": 14,
  "thrustSpeed": 14,
  "serviceCeilingM": 45.72,
  "fadeFraction": 0.2668,
  "jetHeatPerSecond": 7,
  "jetTankSeconds": 30,
  "jetGroundRefill": 0.4,
  "flareStartM": 5,
  "flareTouchdown": 4,
  "flareDecel": 210,
  "safeSink": 5,
  "jumpLights": 6,
  "cautionLights": 2,
  "hotPop": 4,
  "heatShutdown": 100,
  "heatRecover": 60,
  "rapidCool": 13.5,
  "shutdownS": 5,
  "cooldownTarget": 50,
  "emptyT": 38,
  "mowT": 53.12,
  "kitT": 12.6,
  "jetsT": 3,
  "weaponT": { "PULSE-50": 2.5, "CHAIN-30": 3.8, "SLUG-250": 4.2, "DART-20": 2.8, "THUMP-82": 2.6, "SPIKE-90": 4.5, "VOLLEY-6": 2.1, "BREACH-275": 3.9 },
  "moduleT": { "JumpJets": 3, "HeatSinks": 2, "ArmorModule": 4, "SpeedBoost": 1.5 },
  "bandMinMph": 39,
  "bandMaxMph": 45,
  "heatDegradeAtMow": 0.432,
  "overloadMphPer100": 28,
  "overloadMinMph": 8,
  "overloadCoolingSlopePer100": 0.2,
  "overloadCoolingFloor": 0.35,
  "jetOverloadDrainPer100": 1.5,
  "accelS": 2.5,
  "decelS": 1.5,
  "tractionLimitDeg": 45,
  "stallLimitDeg": 65,
  "slowBaseK": 3.5,
  "slowLoadK": 2.3,
  "gradeExponent": 2.5,
  "slideBack": 2.5,
  "standingM": 19.05,
  "wadeK": 400,
  "drownS": 10,
  "ramScale": 0.015,
  "ramMinClosing": 3,
  "knockRatio": 1.5,
  "recoveryS": 2,
  "fallBeatS": 0.4,
  "immuneS": 2,
  "ctFront": 200,
  "ctRear": 150,
  "dartMuzzle": 330,
  "dartZeroM": 300,
  "tickMrad": 14.2,
  "wind": { "DART-20": 0.0009, "CHAIN-30": 0.0006, "SLUG-250": 0.0003, "VOLLEY-6": 0.0005, "THUMP-82": 0.2, "BREACH-275": 0.2, "SPIKE-90": 0, "PULSE-50": 0 },
  "lobSeconds": { "THUMP-82": 1.3, "BREACH-275": 3 },
  "rangeM": { "DART-20": 914, "CHAIN-30": 137, "SLUG-250": 183, "VOLLEY-6": 389 },
  "systems": 4,
  "lifetimeH": 120,
  "edgeMargin": 0.2,
  "radiusKm": 122,
  "lowShare": 0.6,
  "lowMin": 0.3,
  "lowMax": 0.9,
  "highMin": 0.15,
  "highMax": 0.45,
  "prevailing": 6,
  "gradient": 26,
  "stormCool": 14,
  "mapW": 650,
  "mapH": 500,
  "standardInHg": 29.92,
  "paPerInHg": 1000,
  "daPerDeg": 120,
  "lapse": 1.98,
  "sound0C": 331.3,
  "soundLossDb": 6
};
/* GAME-END */

const WORLD = { dayHours: 25.4, warDayHours: 24, burnDays: 46, coastYears: 32.5, cruise: 0.13, lightKmS: 299792.458, earthMoonKm: 384400 };

const Physics = (() => {
  const FT = 0.3048, YD = 0.9144, MPH = 0.44704, LB_PER_T = 2000;
  const clamp01 = v => Math.max(0, Math.min(1, v));
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

  /**
   * The six landing lights (JumpJetController.FuelRequiredToLand, Margin01, MarginLights): what is left in the tank once the trip
   * down is paid for, flown at the safe sink rate with the flare that finishes it. Climbing raises what you owe; burning lowers what
   * you have. A verdict, not a fuel gauge: they can go out with gas still in the tank.
   */
  function landingLights(f) {
    const owed = (Math.max(0, f.h - GAME.flareStartM) / GAME.safeSink + GAME.flareStartM / GAME.flareTouchdown) * Math.max(1, f.w.drain);
    const margin = Math.max(0, Math.min(1, (f.fuel - owed) / GAME.jetTankSeconds));
    return Math.max(0, Math.min(GAME.jumpLights, Math.ceil(margin * GAME.jumpLights)));
  }

  /** A VIGIL on the ground with a full tank and a cold reactor, ready for flightStep. */
  function newFlight(operatingT) {
    return { w: weight(operatingT), h: 0, v: 0, heat: 0, fuel: GAME.jetTankSeconds, latched: false, spent: false, air: false,
             thrust: false, flaring: false, legs: GAME.legHp, peak: 0, airTime: 0, cut: "", landed: null, shutdown: -1, shutdownFrom: 0 };
  }

  /**
   * One step of JumpJetController's Update and HeatManager's cooling, for a standing liftoff. Thrust climbs at thrustSpeed and
   * fades to nothing over the top of the ceiling; thrust burns heat and fuel and stops all cooling; an overheat shuts the reactor
   * down (HeatTape: heat runs down to its target over the shutdown, and the jets stay dead until it is under the recovery line);
   * a hard cut spends the held input until it is let go; the flare needs fuel and a reactor that is up, costs fuel and no heat,
   * and brakes to touchdown.
   */
  function flightStep(f, dt, input) {
    const drain = f.w.drain, canThrust = () => f.fuel > 0 && !f.latched, wasAir = f.air;
    if (f.legs <= 0) input = false;   // both legs gone: it can turn and shoot, and it will not fly again this life
    if (f.legs > 0 && !f.air && !input) f.fuel = Math.min(GAME.jetTankSeconds, f.fuel + GAME.jetGroundRefill * dt);   // GroundRefill: on the ground and not thrusting, at any weight; a legless mech does not refill
    f.spent = input && (f.spent || (!canThrust() && wasAir));
    const commanded = input && !f.spent;
    f.thrust = false; f.flaring = false; f.landed = null;
    if (commanded) {
      f.air = true;
      if (canThrust()) {
        const fade = Math.max(0.01, GAME.serviceCeilingM * GAME.fadeFraction / Math.max(1, drain));
        f.v = GAME.thrustSpeed * clamp01((f.w.ceilingM - f.h) / fade);
        f.heat += GAME.jetHeatPerSecond * drain * dt;
        f.fuel = Math.max(0, f.fuel - drain * dt);
        f.thrust = true;
      } else if (!wasAir) f.v = Math.max(f.v, GAME.hotPop);
      else f.v -= GAME.gravity * dt;
    } else if (f.air) f.v -= GAME.gravity * dt;

    if (f.heat >= GAME.heatShutdown && !f.latched) { f.latched = true; f.cut = "heat"; f.shutdown = 0; f.shutdownFrom = GAME.heatShutdown; }
    if (f.shutdown >= 0) {
      f.shutdown += dt;
      const t = Math.min(1, f.shutdown / GAME.shutdownS);
      f.heat = f.shutdownFrom + (GAME.cooldownTarget - f.shutdownFrom) * t;
      if (t >= 1) f.shutdown = -1;
    } else if (!f.thrust) f.heat = Math.max(0, f.heat - GAME.rapidCool * f.w.cooling * dt);
    if (f.latched && f.heat < GAME.heatRecover) f.latched = false;
    if (f.fuel <= 0 && !f.cut) f.cut = "fuel";

    if (f.air) {
      if (f.v < 0 && canThrust() && f.h <= GAME.flareStartM) {
        f.flaring = true;
        f.v = Math.min(-GAME.flareTouchdown, f.v + GAME.flareDecel * dt);
        f.fuel = Math.max(0, f.fuel - drain * dt);
      }
      f.h += f.v * dt;
      f.airTime += dt;
      f.peak = Math.max(f.peak, f.h);
      if (f.v <= 0 && f.h <= 0) {
        const impact = -f.v, leg = impact > GAME.safeLandSpeed && !canThrust() ? (impact - GAME.safeLandSpeed) * GAME.legDamagePerSpeed : 0;
        f.legs = Math.max(0, f.legs - leg);
        f.landed = { impact, leg, airTime: f.airTime, peak: f.peak, cut: f.cut };
        f.h = 0; f.v = 0; f.air = false; f.airTime = 0; f.peak = 0; f.cut = "";
      }
    }
    return f;
  }

  /** SlopeBands: SLOW below the traction limit, SLIP to the stall limit, STALL above it. */
  function slope(deg, lf) {
    if (deg >= GAME.stallLimitDeg) return { band: "stall", mult: 0 };
    if (deg >= GAME.tractionLimitDeg) return { band: "slip", mult: 0 };
    const s = Math.sin(deg * Math.PI / 180), k = GAME.slowBaseK + GAME.slowLoadK * Math.max(0, lf);
    return { band: "slow", mult: 1 / (1 + Math.pow(s, GAME.gradeExponent) * k) };
  }

  /** ArenaWater's wading limit for a VIGIL, in m/s; no limit on dry ground. */
  const wade = depthM => depthM <= 0.01 ? Infinity : Math.cbrt(GAME.wadeK / depthM);

  /** RamDamage.Resolve: energy from the closing speed squared and the reduced mass; each side's share is the other's weight. */
  function ram(closing, massA, massB) {
    if (Math.abs(closing) < GAME.ramMinClosing) return { a: 0, b: 0 };
    const sum = massA + massB, total = GAME.ramScale * closing * closing * (massA * massB / sum);
    return { a: total * (massB / sum), b: total * (massA / sum) };
  }

  /** KnockdownState.TryKnockdown: the other side's momentum along the contact against yours. */
  const knocked = (aggressorMomentum, targetMomentum) =>
    aggressorMomentum / (targetMomentum <= 0 ? 0.0001 : targetMomentum) >= GAME.knockRatio;

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

  /** FrontTerrain.Hash01, with C#'s wrapping 32-bit arithmetic. */
  function hash01(input) {
    const n = (input << 13) ^ input;
    const inner = (Math.imul(Math.imul(n, n), 15731) + 789221) | 0;
    return (((Math.imul(n, inner) + 1376312589) | 0) & 0x7fffffff) / 2147483647;
  }

  /** FrontPressure.At: where one of the map's pressure systems is at an hour, and how strong. */
  function system(slot, hours, seed) {
    const shifted = hours + slot * (GAME.lifetimeH / GAME.systems), cycle = Math.floor(shifted / GAME.lifetimeH);
    const p = shifted / GAME.lifetimeH - cycle;
    const key = (Math.imul(seed, 15485863) + Math.imul(slot, 104729) + Math.imul(cycle, 7919)) | 0;
    const a = hash01(key), b = hash01(key + 1), c = hash01(key + 2), d = hash01(key + 3);
    const y0 = 0.1 + 0.8 * a, y1 = y0 + (b - 0.5) * 0.8, low = c < GAME.lowShare;
    const depth = low ? GAME.lowMin + (GAME.lowMax - GAME.lowMin) * d : GAME.highMin + (GAME.highMax - GAME.highMin) * d;
    const envelope = p < 0.15 ? p / 0.15 : p > 0.85 ? (1 - p) / 0.15 : 1;
    return { xKm: (-GAME.edgeMargin + (1 + 2 * GAME.edgeMargin) * p) * GAME.mapW, yKm: (y0 + (y1 - y0) * p) * GAME.mapH, amp: depth * envelope, low };
  }

  /** FrontPressure.Sample's pressure and wind at a point on the map (x east, y north, in km). */
  function air(xKm, yKm, systems) {
    let altimeter = GAME.standardInHg, lows = 0, wx = GAME.prevailing, wy = 0;
    for (const s of systems) {
      if (s.amp <= 0) continue;
      const dx = xKm - s.xKm, dy = yKm - s.yKm, r = Math.hypot(dx, dy), q = r / GAME.radiusKm;
      if (q >= 1) continue;
      const u = 1 - q * q, f = u * u;
      altimeter += (s.low ? -1 : 1) * s.amp * f;
      if (s.low) lows += s.amp * f;
      if (r > 1e-3) {
        const mag = GAME.gradient * (s.amp / GAME.lowMax) * 4 * q * u, turn = s.low ? 1 : -1;
        wx += turn * (-dy / r) * mag; wy += turn * (dx / r) * mag;
      }
    }
    return { altimeter, wx, wy, mph: Math.hypot(wx, wy), severity: clamp01(lows / GAME.lowMax) };
  }

  /** FrontPressure's pressure altitude and density altitude, in feet. */
  function density(elevationFt, altimeter, oatC) {
    const pa = elevationFt + (GAME.standardInHg - altimeter) * GAME.paPerInHg;
    return { pa, da: pa + GAME.daPerDeg * (oatC - (15 - GAME.lapse * pa / 1000)) };
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

  return { FT, YD, MPH, LB_PER_T, loadOf, fall, weight, newFlight, flightStep, landingLights, slope, wade, ram, knocked, drop, drift, hash01, system, air, density, speedOfSound, cutoff };
})();

// ---------- the page ----------

(() => {
  if (typeof document === "undefined") return;   // the check runs this file under Node for the arithmetic alone
  const { FT, YD, MPH } = Physics;
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const n = (value, digits = 0) => value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const put = (root, key, text) => root.querySelectorAll(`[data-out="${key}"]`).forEach(el => { if (el.textContent !== text) el.textContent = text; });

  const images = new Map();
  function picture(src) {
    if (!images.has(src)) { const image = new Image(); image.decoding = "async"; image.src = src; images.set(src, image); }
    return images.get(src);
  }
  const ready = image => image.complete && image.naturalWidth > 0;
  /** A turntable frame of the VIGIL. Never mirror one: the hex pod and the sensor block would change shoulders. */
  const vigilFrame = degrees => picture(`/hangar/spin/base/vigil-${String(degrees).padStart(3, "0")}.webp`);
  const land = name => (window.innerWidth * (window.devicePixelRatio || 1) > 1400 ? `/assets/img/lands/${name}-2560.webp` : `/assets/img/lands/${name}-1280.webp`);

  /**
   * The hangar lit the turntable frames, and a land does not. Multiplied by the land's light, with the ground's shade climbing the legs,
   * the figure stops reading as pasted on. Its feet are found in the frame, because a turned frame stands a little above the bottom edge.
   */
  const LIGHT = { snow: "#a8bbdc", desert: "#efd2b4", jungle: "#c6ccc0", badlands: "#9fa0ad" };
  const inLand = (image, place) => ({ image, light: LIGHT[place], figure: null, shape: null, alpha: null, feetGap: 0 });
  const blank = size => { const c = document.createElement("canvas"); c.width = c.height = size; return c; };
  function figureOf(source) {
    if (!source.image) return ready(source) ? source : null;
    if (source.figure) return source.figure;
    if (!ready(source.image)) return null;
    const c = blank(640), g = c.getContext("2d");
    g.drawImage(source.image, 0, 0, 640, 640);
    g.globalCompositeOperation = "multiply";
    g.fillStyle = source.light; g.fillRect(0, 0, 640, 640);
    const shade = g.createLinearGradient(0, 640, 0, 400);
    shade.addColorStop(0, "#6a6a74"); shade.addColorStop(1, "#ffffff");
    g.fillStyle = shade; g.fillRect(0, 0, 640, 640);
    g.globalCompositeOperation = "destination-in";
    g.drawImage(source.image, 0, 0, 640, 640);
    const small = blank(160), read = small.getContext("2d", { willReadFrequently: true });
    read.drawImage(source.image, 0, 0, 160, 160);
    source.alpha = read.getImageData(0, 0, 160, 160).data;
    const hasMetal = y => { for (let x = 0; x < 160; x++) if (source.alpha[(y * 160 + x) * 4 + 3] > 80) return true; return false; };
    let lowest = 159;
    while (lowest > 80 && !hasMetal(lowest)) lowest--;
    source.feetGap = (159 - lowest) * 4;
    return source.figure = c;
  }
  /** Is there metal at this share across and down the frame? A hit is a hit on the VIGIL, not on a box around it. */
  function solidAt(source, across, down) {
    if (!figureOf(source) || !source.alpha) return null;
    const x = Math.floor(across * 160), y = Math.floor(down * 160);
    if (x < 0 || y < 0 || x >= 160 || y >= 160) return false;
    return source.alpha[(y * 160 + x) * 4 + 3] > 60;
  }
  /** The figure's outline thrown on the ground. Small on purpose: drawn large it comes out soft, as a shadow does, in every browser. */
  function castShadow(ctx, source, x, groundY, tall, alpha, lean = 0.7) {
    const figure = figureOf(source);
    if (!figure || alpha <= 0) return;
    if (!source.shape) {
      const c = blank(48), g = c.getContext("2d");
      g.drawImage(figure, 0, 0, 48, 48);
      g.globalCompositeOperation = "source-in";
      g.fillStyle = "#07080c"; g.fillRect(0, 0, 48, 48);
      source.shape = c;
    }
    const k = tall / 610;
    ctx.save();
    ctx.translate(x, groundY);
    ctx.transform(1, 0, lean, -0.17, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.drawImage(source.shape, -320 * k, -640 * k, 640 * k, 640 * k);
    ctx.restore();
  }

  /** The turntable frame's figure stands 610 of its 640 px tall. */
  function drawVigil(ctx, image, x, feetY, tall, tilt = 0, alpha = 1) {
    const figure = figureOf(image);
    if (!figure) return;
    const k = tall / 610;
    ctx.save();
    ctx.translate(x, feetY + (image.feetGap || 0) * k);
    if (tilt) ctx.rotate(tilt);
    ctx.globalAlpha = alpha;
    ctx.drawImage(figure, -320 * k, -640 * k, 640 * k, 640 * k);
    ctx.restore();
  }

  function shadow(ctx, x, y, rx, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.18);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `rgba(10,8,6,${alpha})`);
    g.addColorStop(1, "rgba(10,8,6,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, rx, 0, 6.2832); ctx.fill();
    ctx.restore();
  }

  function cover(ctx, image, w, h, focusX = 0.5, focusY = 0.5) {
    const k = Math.max(w / image.naturalWidth, h / image.naturalHeight), dw = image.naturalWidth * k, dh = image.naturalHeight * k;
    const x = (w - dw) * focusX, y = (h - dh) * focusY;
    ctx.drawImage(image, x, y, dw, dh);
    return { k, x, y, dw, dh };
  }

  /** Puffs of dust, snow or smoke. */
  function dust() {
    const puffs = [];
    return {
      add(x, y, count, spread, colour = "235,225,210", size = 1) {
        if (calm) return;
        for (let i = 0; i < count; i++) {
          const a = Math.random() * 6.2832, sp = spread * (0.3 + Math.random());
          puffs.push({ x, y, vx: Math.cos(a) * sp, vy: -Math.abs(Math.sin(a)) * sp * 0.5, r: (18 + Math.random() * 26) * size, life: 0, max: 0.8 + Math.random() * 0.9, colour });
        }
        if (puffs.length > 220) puffs.splice(0, puffs.length - 220);
      },
      draw(ctx, dt) {
        for (let i = puffs.length - 1; i >= 0; i--) {
          const p = puffs[i];
          p.life += dt;
          if (p.life >= p.max) { puffs.splice(i, 1); continue; }
          p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 1.4 * dt; p.vy *= 1 - 1.4 * dt;
          const t = p.life / p.max, r = p.r * (0.6 + 1.5 * t);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.scale(1, 0.42);
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
          g.addColorStop(0, `rgba(${p.colour},${0.36 * (1 - t)})`);
          g.addColorStop(1, `rgba(${p.colour},0)`);
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.2832); ctx.fill();
          ctx.restore();
        }
      },
    };
  }

  /** Pointer drag on an element. The element's CSS decides what a touch may still scroll (touch-action). */
  function drag(el, handlers) {
    let id = null, lastX = 0, lastY = 0;
    el.addEventListener("pointerdown", e => {
      if (e.button) return;
      id = e.pointerId; lastX = e.clientX; lastY = e.clientY;
      try { el.setPointerCapture(id); } catch (_) { /* a synthetic pointer has nothing to capture */ }
      handlers.start && handlers.start(e);
    });
    el.addEventListener("pointermove", e => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      if (handlers.move) handlers.move(e, dx, dy);
    });
    const stop = cancelled => e => { if (e.pointerId === id) { id = null; handlers.end && handlers.end(e, cancelled); } };
    el.addEventListener("pointerup", stop(false));
    el.addEventListener("pointercancel", stop(true));
  }

  /** A press-and-hold button: down while a finger or the mouse is on it. */
  function hold(button, change) {
    const set = on => { button.classList.toggle("is-held", on); change(on); };
    button.addEventListener("pointerdown", e => { e.preventDefault(); try { button.setPointerCapture(e.pointerId); } catch (_) { /* synthetic */ } set(true); });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(type => button.addEventListener(type, () => set(false)));
    button.addEventListener("contextmenu", e => e.preventDefault());
    button.addEventListener("keydown", e => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); set(true); } });
    button.addEventListener("keyup", e => { if (e.key === " " || e.key === "Enter") set(false); });
    button.addEventListener("blur", () => set(false));
  }

  /** Mark one chip of a group as chosen and hand back its value. */
  function chips(root, group, change) {
    const all = [...root.querySelectorAll(`[data-chip="${group}"]`)];
    all.forEach(chip => chip.addEventListener("click", () => {
      all.forEach(other => other.setAttribute("aria-pressed", String(other === chip)));
      change(chip.dataset.value, chip);
    }));
  }

  /**
   * Starts a demo when it comes near the screen, runs it only while it is on screen, and keeps its canvas the size of its box.
   * build(root, surface) returns a frame(dt, now) function. surface.maxWidth caps the backing store of full-picture canvases.
   */
  function stage(id, build, maxWidth = 1800) {
    const root = document.getElementById(id);
    if (!root) return null;
    const canvas = root.querySelector("canvas[data-main]");
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
      if (surface.w && frame) frame(dt, now / 1000);
      requestAnimationFrame(tick);
    };
    const go = () => { if (running) return; running = true; last = performance.now(); requestAnimationFrame(tick); };
    if (!("IntersectionObserver" in window)) { surface.fit(); frame = build(root, surface); surface.visible = true; go(); return surface; }
    const near = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting) && !frame) {
        near.disconnect();
        surface.fit();
        frame = build(root, surface);
        if (surface.visible) go();
      }
    }, { rootMargin: "700px 0px" });
    near.observe(root);
    new IntersectionObserver(entries => {
      surface.visible = entries[entries.length - 1].isIntersecting;
      if (surface.visible && frame) go();
    }, { threshold: 0.08 }).observe(root);
    return surface;
  }

  // ---------- the opening: the game's own film of a VIGIL coming down on its jets ----------
  (() => {
    const root = document.getElementById("top"), canvas = root && root.querySelector("canvas");
    if (!canvas || calm) return;
    const saveData = navigator.connection && navigator.connection.saveData;
    if (saveData) return;
    const first = 46, last = 60, stride = window.innerWidth < 900 ? 2 : 1, replay = root.querySelector("[data-replay]");   // a phone gets half the frames
    const ctx = canvas.getContext("2d");
    const frames = [];
    let loaded = 0, playing = false;
    const play = () => {
      if (playing || loaded < frames.length) return;
      playing = true;
      canvas.width = 1280; canvas.height = Math.round(1280 * canvas.clientHeight / Math.max(1, canvas.clientWidth));
      canvas.classList.add("is-on");
      const started = performance.now(), seconds = 2.7;
      const step = now => {
        const share = Math.max(0, Math.min(1, (now - started) / 1000 / seconds));
        const at = (1 - Math.pow(1 - share, 1.5)) * (frames.length - 1), index = Math.floor(at), blend = at - index;
        cover(ctx, frames[index], canvas.width, canvas.height, 0.5, 0.5);
        if (blend > 0 && index < frames.length - 1) { ctx.globalAlpha = blend; cover(ctx, frames[index + 1], canvas.width, canvas.height, 0.5, 0.5); ctx.globalAlpha = 1; }
        if (share < 1) requestAnimationFrame(step);
        else { playing = false; if (replay) replay.hidden = false; }
      };
      requestAnimationFrame(step);
    };
    const count = Math.floor((last - first) / stride) + 1;
    for (let i = first; i <= last; i += stride) {
      const image = new Image();
      image.onload = () => { if (++loaded === count) play(); };
      image.src = `/drop/frames/drop-${String(i).padStart(3, "0")}.webp`;
      frames.push(image);
    }
    if (replay) replay.addEventListener("click", () => { replay.hidden = true; play(); });
  })();

  // ---------- 01 a day passing over The Reach ----------
  stage("world", (root, s) => {
    const { ctx } = s, image = root.querySelector(".stage__bg img");
    const stars = Array.from({ length: 140 }, () => [Math.random(), Math.random(), 0.4 + Math.random()]);
    const stripLocal = root.querySelector("[data-local-at]"), stripWar = root.querySelector("[data-war-at]");
    let elapsed = 9.5, touchedUntil = 0, grabbed = false, fastLeft = 0, shownDay = -1;
    const warStart = 6;   // where the war clock stands when the page's first day begins; any value tells the same story
    const clockText = hours => `${String(Math.floor(hours) % 24).padStart(2, "0")}:${String(Math.floor((hours % 1) * 60)).padStart(2, "0")}`;

    drag(s.canvas, {
      start: () => { grabbed = true; fastLeft = 0; },
      move: (_, dx) => { elapsed = Math.max(0, elapsed + dx / s.w * (WORLD.dayHours / 2)); touchedUntil = performance.now() + 5000; },
      end: () => { grabbed = false; touchedUntil = performance.now() + 5000; },
    });
    const fast = root.querySelector("[data-fast]");
    if (fast) fast.addEventListener("click", () => {
      const span = WORLD.dayHours * WORLD.warDayHours / (WORLD.dayHours - WORLD.warDayHours);   // until the two clocks fall back in step
      if (calm) { elapsed += span; return; }
      fastLeft = span;
    });

    return (dt, now) => {
      const { w, h } = s;
      if (fastLeft > 0) { const step = Math.min(fastLeft, dt * WORLD.dayHours * 1.1); elapsed += step; fastLeft -= step; }
      else if (!calm && !grabbed && performance.now() > touchedUntil) elapsed += dt * WORLD.dayHours / 22;
      const local = elapsed % WORLD.dayHours, day = Math.floor(elapsed / WORLD.dayHours) + 1;
      const elevation = Math.sin(2 * Math.PI * (local / WORLD.dayHours - 0.25));
      const lit = clamp((elevation + 0.1) / 0.32, 0, 1), warm = clamp(1 - Math.abs(elevation) / 0.3, 0, 1);

      ctx.clearRect(0, 0, w, h);
      if (!ready(image)) return;
      const box = cover(ctx, image, w, h, 0.5, 0.62);
      const horizon = box.y + box.dh * 0.52;

      // the light on everything: moonless blue at night, warm at the ends of the day, nothing added at noon
      const tint = [lerp(lerp(34, 255, lit), 255, warm * 0.6), lerp(lerp(46, 255, lit), 168, warm * 0.75), lerp(lerp(92, 255, lit), 112, warm * 0.85)];
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = `rgb(${tint.map(Math.round).join(",")})`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";

      if (lit < 1) {
        ctx.fillStyle = "#fff";
        for (const [x, y, r] of stars) {
          const sy = y * horizon * 0.92;
          ctx.globalAlpha = (1 - lit) * (0.35 + 0.55 * (r - 0.4)) * clamp((horizon - sy) / (horizon * 0.2), 0, 1);
          ctx.beginPath(); ctx.arc(x * w, sy, r, 0, 6.2832); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // the star crosses the sky: up at the left edge, down at the right
      if (elevation > -0.12) {
        const sx = ((local / WORLD.dayHours - 0.25) * 2) * w, sy = horizon - elevation * horizon * 0.86;
        const size = Math.max(w, h) * lerp(0.42, 0.26, clamp(elevation, 0, 1));
        ctx.globalCompositeOperation = "screen";
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, size);
        const rgb = warm > 0.2 ? "255,170,105" : "255,240,214";
        g.addColorStop(0, `rgba(${rgb},${0.95 * clamp((elevation + 0.12) / 0.14, 0, 1)})`);
        g.addColorStop(0.1, `rgba(${rgb},0.42)`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = "source-over";
        if (sy < horizon) {
          ctx.fillStyle = "#fffaf0";
          ctx.beginPath(); ctx.arc(sx, sy, Math.max(7, w * 0.009), 0, 6.2832); ctx.fill();
        }
      }

      const war = (elapsed + warStart) % WORLD.warDayHours;
      const noonToday = (day - 1) * WORLD.dayHours + WORLD.dayHours / 2;
      put(root, "local", `${n(local, 1)} of ${n(WORLD.dayHours, 1)} h`);
      put(root, "war", clockText(war));
      if (day !== shownDay) {
        shownDay = day;
        put(root, "day", n(day));
        put(root, "noon", clockText((noonToday + warStart) % WORLD.warDayHours));
      }
      if (stripLocal) stripLocal.style.setProperty("--at", (local / WORLD.dayHours).toFixed(4));
      if (stripWar) stripWar.style.setProperty("--at", (war / WORLD.warDayHours).toFixed(4));
    };
  }, 1500);

  // ---------- 02 drop it ----------
  stage("fall", (root, s) => {
    const { ctx } = s, mech = inLand(vigilFrame(345), "snow"), puff = dust();
    const rail = root.querySelector("[data-rail]"), range = root.querySelector('input[name="height"]');
    let heightFt = 30, y = heightFt * FT, v = 0, mode = "hang", zoom = 0, shake = 0, lost = false, first = !calm, wait = 1.1, held = false;

    function read() {
      const { v: arrive, leg } = Physics.fall(heightFt * FT), gone = leg >= GAME.legHp;
      put(root, "height", `${n(heightFt)} ft`);
      put(root, "speed", `${n(arrive / MPH)} mph`);
      put(root, "speed-ms", `${n(arrive, 1)} m/s`);
      put(root, "leg", gone ? "Gone" : `${n(leg)} of ${GAME.legHp}`);
      put(root, "verdict", leg === 0 ? "A soft landing. Nothing breaks."
        : gone ? "Both legs are gone. It can still turn and shoot, but it will not walk again this life."
        : "A hard landing. Both legs take it.");
      root.style.setProperty("--h", clamp(heightFt / 160, 0, 1));
      root.style.setProperty("--leg", clamp(leg / GAME.legHp, 0, 1));
      root.dataset.state = leg === 0 ? "soft" : gone ? "lost" : "hard";
    }
    function setHeight(ft) {
      heightFt = clamp(Math.round(ft), 0, 160);
      range.value = heightFt;
      mode = "hang"; lost = false; first = false;
      root.classList.remove("has-landed");
      read();
    }
    function touchDown() {
      const { leg } = Physics.fall(heightFt * FT);
      y = 0; v = 0; mode = "down"; lost = leg >= GAME.legHp;
      root.classList.add("has-landed");
      shake = calm ? 0 : clamp(0.25 + leg / GAME.legHp * 0.3, 0, 0.55);
      const groundX = s.w >= 900 ? s.w * 0.42 : s.w * 0.6;
      puff.add(groundX, s.h * 0.86, 12 + Math.round(22 * clamp(leg / GAME.legHp, 0, 1)), 170 + leg, "206,219,236", s.h / 760);
    }
    function release() {
      if (mode !== "hang") return;
      first = false;
      if (heightFt === 0 || calm) { touchDown(); return; }
      v = 0; mode = "fall";
    }
    drag(rail, {
      start: e => { held = true; setHeight(160 * (1 - clamp((e.clientY - rail.getBoundingClientRect().top) / rail.clientHeight, 0, 1))); },
      move: e => setHeight(160 * (1 - clamp((e.clientY - rail.getBoundingClientRect().top) / rail.clientHeight, 0, 1))),
      end: (_, cancelled) => { held = false; if (!cancelled) release(); },
    });
    range.addEventListener("input", () => setHeight(Number(range.value)));
    range.addEventListener("keydown", e => { if (e.key === "Enter") release(); });
    chips(root, "height", value => { setHeight(Number(value)); release(); });
    const button = root.querySelector("[data-drop]");
    button.addEventListener("click", () => { if (mode === "down") setHeight(heightFt); release(); });
    read();

    return dt => {
      const { w, h } = s, gy = h * 0.86, x = w >= 900 ? w * 0.42 : w * 0.6;
      if (first && (wait -= dt) <= 0) release();
      if (mode === "hang") y = lerp(y, heightFt * FT, 1 - Math.exp(-12 * dt));
      else if (mode === "fall") {
        v += GAME.gravity * dt; y -= v * dt;
        if (y <= 0) touchDown();
      }
      const shown = mode === "fall" ? Math.max(y, 0) : y;
      const want = Math.min(h * 0.54 / GAME.standingM, h * (w >= 900 ? 0.8 : 0.62) / (shown + GAME.standingM + 3));
      zoom = zoom ? lerp(zoom, want, 1 - Math.exp(-(mode === "fall" ? 2.5 : 5) * dt)) : want;
      const tall = GAME.standingM * zoom;

      ctx.clearRect(0, 0, w, h);
      ctx.save();
      if (shake > 0) { shake -= dt; ctx.translate(Math.sin(shake * 90) * 3 * shake * 2, Math.cos(shake * 70) * 3 * shake * 2); }
      shadow(ctx, x, gy, tall * 0.34, clamp(0.62 / (1 + shown * 0.09), 0.08, 0.62));
      castShadow(ctx, mech, x, gy, tall, clamp(0.42 - shown * 0.05, 0, 0.42));
      puff.draw(ctx, dt);
      if (shown > 0.4) {
        ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
        ctx.beginPath(); ctx.moveTo(x + tall * 0.34, gy); ctx.lineTo(x + tall * 0.34, gy - shown * zoom); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#fff"; ctx.font = "600 15px 'B612 Mono', monospace"; ctx.textAlign = "left";
        ctx.fillText(`${n(shown / FT)} ft`, x + tall * 0.34 + 8, gy - shown * zoom * 0.5);
      }
      drawVigil(ctx, mech, x, gy - shown * zoom + (lost ? tall * 0.06 : 0), tall, lost ? -0.07 : 0);
      ctx.restore();
      if (held && mode !== "hang") mode = "hang";
    };
  });

  // ---------- 03 fly it ----------
  stage("flight", (root, s) => {
    const { ctx } = s, mech = inLand(vigilFrame(345), "desert"), puff = dust();
    const button = root.querySelector("[data-jets]"), lights = [...root.querySelectorAll("[data-light]")], lamps = root.querySelector("[data-lamps]");
    const heatBar = root.querySelector("[data-heat]");
    let operatingT = GAME.emptyT, f = Physics.newFlight(operatingT);
    let input = false, auto = !calm, autoClock = 0, zoom = 0, accumulator = 0, trail = [], clock = 0, best = 0, flicker = 0, shake = 0;
    const set = on => { input = on; if (on) { auto = false; root.classList.add("was-touched"); } };
    hold(button, set);
    const keys = e => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if ((e.key === "f" || e.key === "F") && s.visible && !e.repeat) set(e.type === "keydown");
    };
    window.addEventListener("keydown", keys);
    window.addEventListener("keyup", keys);

    function newLife(t = operatingT) {
      operatingT = t; f = Physics.newFlight(t); trail = []; best = 0; auto = false;
      root.dataset.state = "ready";
      root.classList.remove("is-legless");
      put(root, "verdict", "Hold the button. Let go to come down.");
      describeLoad();
    }
    function describeLoad() {
      put(root, "ceiling", `${n(f.w.ceilingM / FT)} ft`);
      put(root, "burn", `+${n(GAME.jetHeatPerSecond * f.w.drain, 1)} a second`);
      put(root, "hover", `${n(f.w.climbS, 1)} s`);
    }
    chips(root, "flight-load", value => newLife(value === "kit" ? GAME.emptyT + GAME.kitT + GAME.jetsT : GAME.emptyT));
    root.querySelector("[data-life]").addEventListener("click", () => newLife());

    function report(l) {
      if (l.leg > 0) {
        const gone = f.legs <= 0;
        put(root, "verdict", `${l.cut === "heat" ? "Overheated" : "Tank dry"}, no flare. It arrived at ${n(l.impact / MPH)} mph${gone ? ": both legs are gone." : `: each leg took ${n(l.leg)}.`}`);
        root.dataset.state = gone ? "lost" : "hard";
        root.classList.toggle("is-legless", gone);
        shake = 0.45;
      } else if (l.impact <= GAME.flareTouchdown + 0.01) {
        put(root, "verdict", `Flared at ${n(GAME.flareStartM / FT)} ft and touched down at ${n(GAME.flareTouchdown)} m/s. ${n(l.airTime, 1)} s in the air, ${n(l.peak / FT)} ft at the top.`);
        root.dataset.state = "soft";
      } else {
        put(root, "verdict", `Down at ${n(l.impact, 1)} m/s. ${n(l.airTime, 1)} s in the air.`);
        root.dataset.state = "soft";
      }
      best = Math.max(best, l.airTime);
      put(root, "best", best ? `${n(best, 1)} s` : "—");
    }
    describeLoad();

    return (dt, now) => {
      const { w, h } = s, gy = h * 0.86, x = w >= 900 ? w * 0.42 : w * 0.5;
      clock += dt; flicker = Math.sin(now * 61) * 0.5 + Math.sin(now * 37) * 0.5;
      let command = input;
      if (auto) {
        autoClock += dt;
        command = autoClock > 1 && autoClock < 3.6;
        if (autoClock > 10) { autoClock = -3; f = Physics.newFlight(operatingT); describeLoad(); }
      }
      accumulator += dt;
      while (accumulator >= 1 / 240) {
        Physics.flightStep(f, 1 / 240, command);
        accumulator -= 1 / 240;
        if (f.landed) {
          if (!auto) report(f.landed);
          puff.add(x, gy, f.landed.leg > 0 ? 34 : 12, f.landed.leg > 0 ? 300 : 110, "226,178,134", h / 620);
        }
      }
      if (clock - (trail.length ? trail[trail.length - 1].t : -1) > 0.05) {
        trail.push({ t: clock, h: f.h, thrust: f.thrust });
        if (trail.length > 400) trail.shift();
      }

      const top = Math.max(f.w.ceilingM, f.h, 16);
      const want = Math.min(h * 0.46 / GAME.standingM, h * (w >= 900 ? 0.76 : 0.6) / (top * clamp((f.h + 12) / top, 0.45, 1) + GAME.standingM + 3));
      zoom = zoom ? lerp(zoom, want, 1 - Math.exp(-3 * dt)) : want;
      const tall = GAME.standingM * zoom, feet = gy - f.h * zoom;

      ctx.clearRect(0, 0, w, h);
      ctx.save();
      if (shake > 0) { shake -= dt; ctx.translate(Math.sin(shake * 90) * 2.5, Math.cos(shake * 70) * 2.5); }

      // the ceiling and the flare line, at their true heights
      const ceilingY = gy - f.w.ceilingM * zoom, flareY = gy - GAME.flareStartM * zoom;
      const band = ctx.createLinearGradient(0, ceilingY, 0, ceilingY + GAME.serviceCeilingM * GAME.fadeFraction / f.w.drain * zoom);
      band.addColorStop(0, "rgba(255,190,110,.32)"); band.addColorStop(1, "rgba(255,190,110,0)");
      ctx.fillStyle = band; ctx.fillRect(0, ceilingY, w, GAME.serviceCeilingM * GAME.fadeFraction / f.w.drain * zoom);
      const labelX = w >= 900 ? w - Math.min(420, w * 0.34) - Math.max(16, Math.min(72, w * 0.05)) - 14 : w - 14;
      ctx.font = "600 13px 'B612 Mono', monospace"; ctx.textAlign = "right";
      ctx.fillStyle = "#ffd9a8"; ctx.fillRect(0, ceilingY - 1, w, 2);
      ctx.fillText(`Ceiling ${n(f.w.ceilingM / FT)} ft`, labelX, ceilingY - 8);
      ctx.fillStyle = "rgba(160,240,235,.9)"; ctx.fillRect(0, flareY, w, 1);
      ctx.fillText(`Flare ${n(GAME.flareStartM / FT)} ft`, labelX, flareY - 6);

      // your own flight, drawn behind you as it happens
      if (trail.length > 1) {
        ctx.lineWidth = 3; ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(255,255,255,.85)";
        ctx.beginPath();
        trail.forEach((p, i) => { const px = x - (clock - p.t) * Math.min(90, w * 0.1), py = gy - p.h * zoom; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
        ctx.stroke();
      }

      shadow(ctx, x, gy, tall * 0.34, clamp(0.62 / (1 + f.h * 0.09), 0.08, 0.62));
      castShadow(ctx, mech, x, gy, tall, clamp(0.4 - f.h * 0.05, 0, 0.4));
      puff.draw(ctx, dt);
      if (f.thrust || f.flaring) {
        const length = tall * (f.flaring ? 0.3 : 0.2 + 0.2 * clamp(f.v / GAME.thrustSpeed, 0, 1)) * (1 + 0.14 * flicker);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (const side of [-0.1, 0.1]) {
          const px = x + side * tall, g = ctx.createLinearGradient(0, feet - tall * 0.04, 0, feet + length);
          g.addColorStop(0, "rgba(255,246,225,.8)"); g.addColorStop(0.3, "rgba(255,190,110,.5)"); g.addColorStop(1, "rgba(255,110,40,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(px - tall * 0.03, feet - tall * 0.04); ctx.lineTo(px + tall * 0.03, feet - tall * 0.04); ctx.lineTo(px, feet + length);
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        if (f.h < 18 && Math.random() < 0.5) puff.add(x + (Math.random() - 0.5) * tall * 0.6, gy, 1, 120, "226,178,134", h / 620);
      }
      drawVigil(ctx, mech, x, feet + (f.legs <= 0 ? tall * 0.06 : 0), tall, f.legs <= 0 ? -0.07 : 0);
      ctx.restore();

      put(root, "alt", `${n(f.h / FT)} ft`);
      put(root, "heat", `${n(Math.min(f.heat, 100))}`);
      put(root, "tank", `${n(f.fuel, 1)} s`);
      put(root, "legs", f.legs <= 0 ? "Gone" : `${n(f.legs)} of ${GAME.legHp}`);
      heatBar.style.setProperty("--v", (Math.min(f.heat, 100) / 100).toFixed(3));
      root.classList.toggle("is-hot", f.heat >= 80 || f.latched);
      root.classList.toggle("is-thrust", f.thrust);
      const lit = Physics.landingLights(f);
      lamps.dataset.band = lit <= 1 ? "none" : lit <= GAME.cautionLights ? "caution" : "normal";
      const pulse = calm || lit !== 1 || now % 500 < 250;   // the last light flashes, at the game's two beats a second
      lights.forEach((light, i) => light.classList.toggle("is-on", i < lit && pulse));
      put(root, "lamps", lit === 0 ? "No margin. You cannot fly down from here" : lit === 1 ? "Last light. Get down now" : lit <= GAME.cautionLights ? "Thin. Start down" : "You can fly down");
    };
  });

  // ---------- 04 load it, then climb ----------
  stage("weight-inst", (root, s) => {
    const { ctx } = s, puff = dust(), mech = inLand(vigilFrame(75), "desert"), ghost = inLand(vigilFrame(75), "desert"), backdrop = root.querySelector(".stage__bg img");
    const walk = root.querySelector("[data-walk]"), gradeInput = root.querySelector('input[name="grade"]');
    const gauge = root.querySelector("[data-gauge]");
    const tray = [...root.querySelectorAll("[data-part]")];
    let pattern = null, grade = 20, input = false, auto = !calm, autoClock = 0;
    let along = 0, speed = 0, ghostAlong = 0, ghostSpeed = 0, phase = 0, climbed = 0;
    const fitted = new Set(tray.filter(b => b.getAttribute("aria-pressed") === "true"));

    function tap(button) {
      auto = false;
      root.querySelectorAll('[data-chip="kit"]').forEach(chip => chip.setAttribute("aria-pressed", "false"));
      if (fitted.has(button)) fitted.delete(button);
      else {
        const slot = button.dataset.slot;
        const same = [...fitted].filter(b => b.dataset.slot === slot);
        if (same.length >= (slot === "arm" ? 3 : 1)) fitted.delete(same[0]);   // the slot is full: the oldest comes off
        fitted.add(button);
      }
      tray.forEach(b => b.setAttribute("aria-pressed", String(fitted.has(b))));
      reckon();
    }
    tray.forEach(b => b.addEventListener("click", () => tap(b)));
    chips(root, "kit", value => {
      fitted.clear();
      if (value) value.split(",").forEach(id => { const b = tray.find(t => t.dataset.part === id); if (b) fitted.add(b); });
      tray.forEach(b => b.setAttribute("aria-pressed", String(fitted.has(b))));
      auto = false;
      reckon();
    });
    const massOf = button => button.dataset.slot === "module" ? GAME.moduleT[button.dataset.part] : GAME.weaponT[button.dataset.part];
    const payload = () => [...fitted].reduce((sum, b) => sum + massOf(b), 0);
    tray.forEach(b => { b.querySelector("[data-lb]").textContent = `${n(massOf(b) * Physics.LB_PER_T)} lb`; });

    function reckon() {
      const operatingT = GAME.emptyT + payload(), w = Physics.weight(operatingT), lb = operatingT * Physics.LB_PER_T;
      const over = w.lf > 1 + 1e-9, s2 = Physics.slope(grade, w.lf);
      put(root, "lb", `${n(lb)} lb`);
      put(root, "load", over ? `Overloaded, ${n(w.lf * 100)}%` : `${n(w.lf * 100)}% of its payload`);
      put(root, "speed", `${n(w.speed, 1)} mph`);
      put(root, "cooling", `${n(w.cooling * 100)}%`);
      put(root, "ceiling", `${n(w.ceilingM / FT)} ft`);
      put(root, "climb", `${n(w.climbS, 1)} s`);
      gauge.style.setProperty("--v", clamp(w.lf / 1.4, 0, 1).toFixed(3));
      root.classList.toggle("is-over", over);
      put(root, "grade", `${n(grade)}°`);
      put(root, "band", s2.band === "slow" ? "Slow" : s2.band === "slip" ? "Slip" : "Stall");
      put(root, "hill-speed", s2.band === "slow" ? `${n(w.speed * s2.mult, 1)} mph` : s2.band === "slip" ? `${n(GAME.slideBack / MPH, 1)} mph back` : "0 mph");
      put(root, "note", s2.band === "slow" ? `${n(s2.mult * 100)}% of its ${n(w.speed)} mph on the flat.`
        : s2.band === "slip" ? "The feet lose their grip. Push on and it slides back down."
        : "Too steep for the legs to reach. It stops dead.");
      root.dataset.state = s2.band;
    }
    hold(walk, on => { input = on; if (on) auto = false; });
    gradeInput.addEventListener("input", () => { auto = false; grade = Number(gradeInput.value); reckon(); });
    reckon();

    /** The ground's texture is the desert floor of the picture behind it, mirrored so that it tiles. */
    function makePattern() {
      const iw = backdrop.naturalWidth, ih = backdrop.naturalHeight, tile = document.createElement("canvas");
      tile.width = 1024; tile.height = 256;
      const t = tile.getContext("2d");
      t.drawImage(backdrop, iw * 0.2, ih * 0.74, iw * 0.3, ih * 0.22, 0, 0, 512, 256);
      t.save(); t.translate(1024, 0); t.scale(-1, 1); t.drawImage(backdrop, iw * 0.2, ih * 0.74, iw * 0.3, ih * 0.22, 0, 0, 512, 256); t.restore();
      pattern = ctx.createPattern(tile, "repeat");
    }

    return (dt, now) => {
      const { w, h } = s, fx = w >= 900 ? w * 0.3 : w * 0.34, fy = h * 0.8;
      if (auto) {
        autoClock += dt;
        grade = Math.round(30 + 22 * Math.sin(autoClock * 0.42 - 0.6));
        gradeInput.value = grade;
        reckon();
      }
      const operatingT = GAME.emptyT + payload(), wt = Physics.weight(operatingT), band = Physics.slope(grade, wt.lf);
      const pushing = input || auto;
      const target = !pushing ? 0 : band.band === "slow" ? wt.speed * MPH * band.mult : band.band === "slip" ? -GAME.slideBack : 0;
      const rate = (Math.abs(target) > Math.abs(speed) ? wt.speed * MPH / GAME.accelS : wt.speed * MPH / GAME.decelS) * dt;
      speed += clamp(target - speed, -rate, rate);
      if (band.band === "stall" && speed > 0) speed = 0;
      along += speed * dt;
      climbed = Math.max(0, climbed + speed * dt * Math.sin(grade * Math.PI / 180));
      phase += Math.abs(speed) * dt * 0.62;

      const ghostBand = Physics.slope(grade, 0), ghostTop = Physics.weight(GAME.emptyT).speed * MPH;
      const ghostTarget = !pushing ? 0 : ghostBand.band === "slow" ? ghostTop * ghostBand.mult : ghostBand.band === "slip" ? -GAME.slideBack : 0;
      ghostSpeed += clamp(ghostTarget - ghostSpeed, -ghostTop / GAME.accelS * dt, ghostTop / GAME.accelS * dt);
      ghostAlong += ghostSpeed * dt;
      if (!pushing || Math.abs(ghostAlong - along) > 45) ghostAlong = lerp(ghostAlong, along, 1 - Math.exp(-1.6 * dt));

      const tall = Math.min(h * 0.52, w >= 900 ? 1e9 : w * 0.82), pxm = tall / GAME.standingM, angle = -grade * Math.PI / 180;

      ctx.clearRect(0, 0, w, h);
      if (!pattern && ready(backdrop)) makePattern();
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(angle);
      const offset = -along * pxm;
      ctx.save();
      ctx.translate(offset % 1024, 0);
      ctx.fillStyle = pattern || "#7a4a2c";
      ctx.fillRect(-3 * w - 1024, 0, 6 * w + 2048, 2.6 * h);
      ctx.restore();
      const edge = ctx.createLinearGradient(0, 0, 0, 90);
      edge.addColorStop(0, "rgba(255,214,170,.32)"); edge.addColorStop(0.06, "rgba(120,70,40,.1)"); edge.addColorStop(1, "rgba(30,14,6,.5)");
      ctx.fillStyle = edge; ctx.fillRect(-3 * w, 0, 6 * w, 2.6 * h);
      ctx.fillStyle = "rgba(255,240,220,.95)"; ctx.fillRect(-3 * w, -1.5, 6 * w, 3);
      // stakes every 10 metres, so the eye reads the speed
      const first = Math.floor((along - w / pxm) / 10) * 10;
      ctx.font = "600 12px 'B612 Mono', monospace"; ctx.textAlign = "center";
      for (let m = first; m < along + 1.4 * w / pxm; m += 10) {
        const px = (m - along) * pxm;
        ctx.fillStyle = "rgba(255,240,220,.8)"; ctx.fillRect(px - 1, -18, 2, 18);
      }
      // the empty VIGIL on the same hill
      const ghostX = (ghostAlong - along) * pxm;
      ctx.restore();

      const sx = fx + Math.cos(angle) * ghostX, sy = fy + Math.sin(angle) * ghostX;
      if (Math.abs(ghostX) > tall * 0.1) {
        drawVigil(ctx, ghost, sx, sy, tall, 0, 0.34);
        ctx.font = "600 12px 'B612 Mono', monospace"; ctx.fillStyle = "#fff"; ctx.textAlign = "center";
        if (sy - tall > h * 0.3) ctx.fillText("Empty", sx, sy - tall - 6);
      }
      const bob = Math.abs(Math.sin(phase)) * tall * 0.012 * clamp(Math.abs(speed) / 8, 0, 1);
      shadow(ctx, fx, fy, tall * 0.42, 0.5);
      drawVigil(ctx, mech, fx, fy - bob, tall, Math.sin(phase) * 0.012 * clamp(Math.abs(speed) / 8, 0, 1));
      if (band.band === "slip" && speed < -0.3 && Math.random() < 0.5) puff.add(fx + 20, fy, 1, 90, "226,178,134", h / 620);
      puff.draw(ctx, dt);

      put(root, "climbed", `${n(climbed / FT)} ft`);
      put(root, "live", `${n(Math.abs(speed) / MPH, 1)} mph${speed < -0.05 ? " back" : ""}`);
    };
  });

  // ---------- 05 wade it ----------
  stage("water", (root, s) => {
    const { ctx } = s, mech = inLand(vigilFrame(75), "jungle");
    const rail = root.querySelector("[data-rail]"), range = root.querySelector('input[name="depth"]');
    let depth = 9, phase = 0, under = 0, flow = 0;
    function read() {
      const limit = Physics.wade(depth), deep = depth > GAME.standingM;
      put(root, "depth", `${n(depth, depth < 10 ? 1 : 0)} m`);
      put(root, "wade", depth <= 0.01 ? "No limit" : `${n(limit / MPH)} mph`);
      root.style.setProperty("--h", clamp(depth / 24, 0, 1).toFixed(3));
      root.classList.toggle("is-under", deep);
    }
    const setDepth = v => { depth = clamp(v, 0, 24); range.value = depth; read(); };
    const fromY = e => 24 * (1 - clamp((e.clientY - rail.getBoundingClientRect().top) / rail.clientHeight, 0, 1));
    drag(rail, { start: e => setDepth(fromY(e)), move: e => setDepth(fromY(e)) });
    range.addEventListener("input", () => setDepth(Number(range.value)));
    read();

    return (dt, now) => {
      const { w, h } = s, gy = h * 0.92, x = w >= 900 ? w * 0.42 : w * 0.6;
      const tall = Math.min(h * 0.66, w >= 900 ? 1e9 : w * 1.1), pxm = tall / GAME.standingM;
      const limit = Physics.wade(depth);
      if (depth > GAME.standingM) under += dt; else under = 0;
      put(root, "under", depth > GAME.standingM ? (under >= GAME.drownS ? "Lost" : `${n(GAME.drownS - under, 1)} s`) : `${n(GAME.drownS)} s, once it is under`);
      root.classList.toggle("is-lost", under >= GAME.drownS);
      phase += Math.min(limit, 12) * dt * 0.6;
      if (!calm) flow += Math.min(limit, 12) * dt * pxm * 0.5;

      ctx.clearRect(0, 0, w, h);
      shadow(ctx, x, gy, tall * 0.42, 0.45);
      drawVigil(ctx, mech, x, gy - Math.abs(Math.sin(phase)) * tall * 0.01, tall, under >= GAME.drownS ? -0.05 : 0, under >= GAME.drownS ? 0.65 : 1);
      if (depth > 0.05) {
        const top = gy - depth * pxm;
        const water = ctx.createLinearGradient(0, top, 0, Math.max(gy, top + 1));
        water.addColorStop(0, "rgba(90,190,200,.62)"); water.addColorStop(1, "rgba(14,70,92,.86)");
        ctx.fillStyle = water;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let px = 0; px <= w + 12; px += 12) {
          ctx.lineTo(px, top + (calm ? 0 : Math.sin((px + flow) * 0.022) * 3 + Math.sin((px - flow) * 0.05 + now) * 1.5));
        }
        ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "rgba(220,250,250,.85)"; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let px = 0; px <= w + 12; px += 12) {
          const py = top + (calm ? 0 : Math.sin((px + flow) * 0.022) * 3 + Math.sin((px - flow) * 0.05 + now) * 1.5);
          if (px) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.stroke();
      }
    };
  });

  // ---------- 06 ram it ----------
  stage("ram", (root, s) => {
    const { ctx } = s, puff = dust(), attackerFrame = inLand(vigilFrame(75), "snow"), facing = inLand(vigilFrame(285), "snow"), away = inLand(vigilFrame(105), "snow");
    const handle = root.querySelector("[data-pull]");
    const kit = GAME.emptyT + GAME.kitT;
    let charge = 40, mode = "ready", clock = 0, ax = 0, tx = 0, hit = null, pulling = false;
    let targetMass = kit, targetMoves = false, fromBehind = false, autoLeft = calm ? 0 : 1, demo = !calm;
    const layout = () => {
      const { w, h } = s, wide = w >= 900, tall = Math.min(h * 0.5, wide ? w * 0.28 : w * 0.72);
      return { wide, tall, gy: h * 0.88, contact: wide ? w * 0.3 : w * 0.5, gap: tall * 0.3, start: wide ? w * 0.06 : w * 0.17 };
    };
    function preview() {
      const closing = (charge + (targetMoves ? charge : 0)) * MPH;
      const r = Physics.ram(closing, kit, targetMass), plate = fromBehind ? GAME.ctRear : GAME.ctFront;
      put(root, "charge", `${n(charge)} mph`);
      put(root, "closing", `${n(closing / MPH)} mph`);
      put(root, "yours", r.a < 0.5 ? "None" : `${n(r.a)} of ${n(GAME.ctFront)}`);
      put(root, "theirs", r.b < 0.5 ? "None" : `${n(r.b)} of ${n(plate)}`);
      return { r, plate, closing };
    }
    function strike() {
      const { r, plate } = preview();
      const aMom = kit * charge * MPH, tMom = targetMass * (targetMoves ? charge * MPH : 0);
      const down = r.b > 0 && Physics.knocked(aMom, tMom);
      const killsThem = r.b >= plate, killsYou = r.a >= GAME.ctFront;
      hit = { r, down, killsThem };
      mode = "hit"; clock = 0;
      const verdict = r.b === 0 ? `A shove. Below ${n(GAME.ramMinClosing / MPH)} mph of closing speed nothing is damaged.`
        : killsThem && killsYou ? "Both centre torsos gone. Neither pilot walks away."
        : killsThem ? "The plate is gone. That one is over."
        : down ? "Knocked down. Two seconds to stand, then two when nothing can put it down again."
        : "Damage on both. Their momentum met yours, so nobody goes over.";
      put(root, "verdict", verdict);
      root.dataset.state = down ? "down" : "hit";
    }
    function fire(fromDemo = false) {
      if (mode === "run") return;
      autoLeft = 0;
      if (!fromDemo) demo = false;
      const l = layout();
      if (calm) { ax = l.contact - l.gap; tx = l.contact + l.gap; strike(); return; }
      ax = pulling ? ax : l.start; tx = l.contact + l.gap + (targetMoves ? s.w * 0.14 : 0);
      mode = "run";
      hit = null;
      put(root, "verdict", `Charging at ${n(charge)} mph.`);
    }
    drag(handle, {
      start: () => { pulling = true; autoLeft = 0; demo = false; mode = "ready"; hit = null; },
      move: e => {
        root.querySelectorAll('[data-chip="ram-speed"]').forEach(chip => chip.setAttribute("aria-pressed", "false"));
        const l = layout(), box = s.canvas.getBoundingClientRect(), wx = e.clientX - box.left;
        const home = l.contact - l.gap;
        const share = clamp((home - wx) / (home - l.start * 0.4), 0.05, 1);
        charge = Math.round(share * Physics.weight(kit).speed);
        preview();
      },
      end: (_, cancelled) => { pulling = false; if (!cancelled) fire(); },
    });
    chips(root, "ram-speed", value => { charge = Number(value); preview(); fire(); });
    chips(root, "ram-target", value => { targetMoves = value === "charge"; fromBehind = value === "behind"; targetMass = value === "light" ? GAME.emptyT : kit; mode = "ready"; hit = null; preview(); fire(); });
    root.querySelector("[data-charge]").addEventListener("click", () => fire());
    preview();

    return dt => {
      const { w, h } = s, l = layout(), home = l.contact - l.gap;
      clock += dt;
      if (autoLeft > 0 && (autoLeft -= dt) <= 0) fire(true);
      const backDrawn = pulling ? clamp(charge / Physics.weight(kit).speed, 0, 1) : 0;
      const pxPerMph = (w >= 900 ? w * 0.42 : w * 0.9) / 40;
      if (mode === "ready") { ax = lerp(home, l.start * 0.6, backDrawn); tx = l.contact + l.gap; }
      if (mode === "run") {
        ax += charge * pxPerMph * dt;
        if (targetMoves) tx -= charge * pxPerMph * dt;
        if (ax + l.gap * 2 >= tx) { strike(); puff.add((ax + tx) / 2, l.gy - l.tall * 0.3, 26, 220, "244,247,250", h / 620); }
      }
      if (mode === "hit" && clock > 6) { mode = "ready"; hit = null; root.dataset.state = "ready"; if (demo && !pulling) autoLeft = 3; }

      let tilt = 0, alpha = 1, ring = 0;
      if (hit && hit.down) {
        const fallTilt = 1.36;
        if (clock < GAME.fallBeatS) tilt = fallTilt * Math.pow(clock / GAME.fallBeatS, 2);
        else if (clock < GAME.recoveryS - 0.8) tilt = fallTilt;
        else if (clock < GAME.recoveryS) tilt = fallTilt * (1 - (clock - (GAME.recoveryS - 0.8)) / 0.8);
        else if (clock < GAME.recoveryS + GAME.immuneS) ring = 1 - (clock - GAME.recoveryS) / GAME.immuneS;
      }
      if (hit && hit.killsThem) alpha = 0.55;

      ctx.clearRect(0, 0, w, h);
      shadow(ctx, ax, l.gy, l.tall * 0.42, 0.5);
      shadow(ctx, tx, l.gy, l.tall * 0.42, 0.5);
      if (mode === "ready" && (pulling || autoLeft <= 0)) {
        const reach = home - ax;
        if (reach > 2) {
          ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = 3; ctx.setLineDash([8, 8]);
          ctx.beginPath(); ctx.moveTo(ax + l.gap, l.gy - l.tall * 0.45); ctx.lineTo(home + l.gap, l.gy - l.tall * 0.45); ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      const bob = mode === "run" ? Math.abs(Math.sin(clock * 11)) * l.tall * 0.012 : 0;
      drawVigil(ctx, attackerFrame, ax, l.gy - bob, l.tall);
      const targetImage = fromBehind ? away : facing;
      drawVigil(ctx, targetImage, tx, l.gy - (mode === "run" && targetMoves ? bob : 0), l.tall, tilt, alpha);
      if (ring > 0) {
        ctx.strokeStyle = `rgba(120,240,230,${0.25 + 0.55 * ring})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(tx, l.gy - l.tall * 0.5, l.tall * 0.42, l.tall * 0.58, 0, 0, 6.2832); ctx.stroke();
      }
      puff.draw(ctx, dt);
      if (hit && hit.r.b > 0 && clock < 2.2) {
        const lift = calm ? 0 : clock * 26, fade = clamp(2.2 - clock, 0, 1);
        ctx.font = `600 ${clamp(l.tall * 0.14, 28, 64)}px 'Barlow Condensed', sans-serif`;
        ctx.textAlign = "center"; ctx.globalAlpha = fade;
        ctx.fillStyle = "#ffcf9e"; ctx.fillText(`−${n(hit.r.a)}`, ax, l.gy - l.tall * 1.02 - lift);
        ctx.fillStyle = "#ff9f7a"; ctx.fillText(`−${n(hit.r.b)}`, tx, l.gy - l.tall * 1.02 - lift);
        ctx.globalAlpha = 1;
      }
      // the handle follows the attacker, so the thing you pull is the mech itself
      handle.style.transform = `translate(${(ax - handle.offsetWidth / 2).toFixed(1)}px, ${(l.gy - l.tall).toFixed(1)}px)`;
      handle.style.width = `${(l.tall * 0.6).toFixed(0)}px`;
      handle.style.height = `${l.tall.toFixed(0)}px`;
    };
  });

  // ---------- 07 fire it ----------
  stage("scope", (root, s) => {
    const { ctx } = s, target = inLand(vigilFrame(0), "desert"), small = vigilFrame(285), scene = picture(land("desert-4"));
    const glass = root.querySelector("[data-glass]");
    let rangeYd = 1000, windMph = 10, aimX = 0, aimY = 0, shot = null, marks = [], hits = 0, shots = 0, phase = 0, driftPhase = 0;
    let lay = { cx: 0, cy: 0, R: 1, K: 1 };

    function read() {
      const m = rangeYd * YD, d = Physics.drop(m);
      const driftM = Physics.drift("DART-20", m, windMph);
      put(root, "range", `${n(rangeYd)} yd`);
      put(root, "wind", `${n(windMph)} mph`);
      const zeroed = Math.abs(d.mrad / GAME.tickMrad) < 0.02;   // within a fiftieth of a tick of the zero, nothing to hold
      const ft = Math.abs(d.m / FT), shown = n(ft, ft < 10 ? 1 : 0);
      put(root, "drop", zeroed ? "On the line" : `${shown} ft ${d.m >= 0 ? "low" : "high"}`);
      put(root, "hold", zeroed ? "None: zeroed here" : `${n(Math.abs(d.mrad) / GAME.tickMrad, 2)} ticks ${d.mrad > 0 ? "over" : "under"}`);
      put(root, "drift", `${n(driftM / FT)} ft downwind`);
    }
    function reset() { aimX = 0; aimY = 0; marks = []; shot = null; put(root, "verdict", "Drag the picture to lay the sight, then fire."); read(); }
    chips(root, "scope-range", value => { rangeYd = Number(value); reset(); });
    chips(root, "scope-wind", value => { windMph = Number(value); marks = []; read(); });
    drag(glass, {
      move: (_, dx, dy) => { aimX = clamp(aimX - dx / lay.K, -70, 70); aimY = clamp(aimY + dy / lay.K, -70, 70); },
    });
    glass.addEventListener("keydown", e => {
      const step = GAME.tickMrad / 10;
      if (e.key === "ArrowUp") aimY += step; else if (e.key === "ArrowDown") aimY -= step;
      else if (e.key === "ArrowLeft") aimX -= step; else if (e.key === "ArrowRight") aimX += step;
      else if (e.key === "Enter" || e.key === " ") fire(); else return;
      e.preventDefault();
    });
    function fire() {
      if (shot) return;
      const m = rangeYd * YD, flight = m / GAME.dartMuzzle;
      shot = { m, flight, t: 0, ax: aimX, ay: aimY, dropMrad: Physics.drop(m).mrad, driftMrad: 1000 * GAME.wind["DART-20"] * windMph * MPH };
      shots++;
      if (calm) shot.t = flight;
    }
    function settle(sh) {
      const tallMrad = GAME.standingM / sh.m * 1000;
      const x = sh.ax + sh.driftMrad, y = sh.ay - sh.dropMrad;   // relative to the VIGIL's centre, up positive
      const across = (320 + x / tallMrad * 610) / 640, down = (640 - (target.feetGap || 0) - 305 - y / tallMrad * 610) / 640;
      const solid = solidAt(target, across, down);
      const inside = solid === null ? Math.abs(x) < tallMrad * 0.26 && Math.abs(y) < tallMrad * 0.5 : solid;
      if (inside) hits++;
      marks.push({ x, y, hit: inside, age: 0 });
      if (marks.length > 12) marks.shift();
      const offX = (x * sh.m / 1000) / FT, offY = (y * sh.m / 1000) / FT;
      put(root, "tally", `${n(hits)} of ${n(shots)}`);
      const where = Math.abs(offX) < 1 && Math.abs(offY) < 1 ? "dead centre"
        : `${n(Math.abs(offY))} ft ${offY < 0 ? "low" : "high"}, ${n(Math.abs(offX))} ft ${offX > 0 ? "downwind" : "upwind"} of its centre`;
      put(root, "verdict", inside ? `Hit: ${where}.` : `Miss: ${where}.`);
    }
    root.querySelector("[data-fire]").addEventListener("click", fire);
    read();

    return dt => {
      const { w, h } = s, wide = w >= 900;
      const R = wide ? Math.min(h * 0.4, w * 0.24) : Math.min(w * 0.42, h * 0.3);
      const cx = wide ? w * 0.4 : w * 0.5, cy = wide ? h * 0.5 : Math.min(h - R - 90, 128 + R);
      const T = R / 4.2, K = T / GAME.tickMrad, m = rangeYd * YD;
      lay = { cx, cy, R, K };
      glass.style.width = glass.style.height = `${(R * 2).toFixed(0)}px`;
      glass.style.transform = `translate(${(cx - R).toFixed(1)}px, ${(cy - R).toFixed(1)}px)`;
      phase += dt; driftPhase += dt * windMph * 6;
      if (shot && !calm) shot.t += dt;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(8,10,14,.56)"; ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.2832); ctx.clip();
      const toX = x => cx + (x - aimX) * K, toY = y => cy - (y - aimY) * K;
      const tallMrad = GAME.standingM / m * 1000, feetY = toY(-tallMrad / 2);
      // the land behind the target, at a fixed optical size; its floor sits at the VIGIL's feet
      if (ready(scene)) {
        const iw = T * 46, ih = iw * scene.naturalHeight / scene.naturalWidth;
        ctx.drawImage(scene, toX(0) - iw * 0.5, feetY - ih * 0.62, iw, ih);
        ctx.fillStyle = "rgba(255,240,215,.08)"; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      } else { ctx.fillStyle = "#6d5a48"; ctx.fillRect(cx - R, cy - R, R * 2, R * 2); }
      shadow(ctx, toX(0), feetY, tallMrad * K * 0.42, 0.55);
      drawVigil(ctx, target, toX(0), feetY, tallMrad * K);

      // wind across the glass: streaks that go at the wind's speed
      if (windMph > 0 && !calm) {
        ctx.strokeStyle = "rgba(255,245,225,.3)"; ctx.lineWidth = 1.5;
        for (let i = 0; i < 16; i++) {
          const y = cy - R + (i + 0.5) / 16 * 2 * R;
          const x = cx - R + ((driftPhase * (1 + (i % 3) * 0.3) + i * 73) % (2 * R + 80)) - 40;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 18 + windMph * 0.8, y); ctx.stroke();
        }
      }
      // where earlier rounds went
      for (const mark of marks) {
        mark.age += dt;
        const px = toX(mark.x), py = toY(mark.y), size = Math.max(4, GAME.tickMrad * 0.14 * K);
        ctx.fillStyle = mark.hit ? "rgba(255,200,120,.95)" : "rgba(240,225,200,.8)";
        ctx.beginPath(); ctx.arc(px, py, size * (mark.hit ? 1 : 0.8), 0, 6.2832); ctx.fill();
        if (mark.age < 0.9 && !calm) {
          const g = ctx.createRadialGradient(px, py, 0, px, py, size * 7 * (0.4 + mark.age));
          g.addColorStop(0, mark.hit ? `rgba(255,190,110,${0.8 * (1 - mark.age)})` : `rgba(226,190,150,${0.7 * (1 - mark.age)})`);
          g.addColorStop(1, "rgba(226,190,150,0)");
          ctx.fillStyle = g; ctx.fillRect(px - size * 8, py - size * 8, size * 16, size * 16);
        }
      }
      // the round: it leaves above the line, crosses it at the zero, and falls away below it
      if (shot) {
        const share = clamp(shot.t / shot.flight, 0, 1), r = Math.max(1, share * shot.m), angle = Physics.drop(r).mrad;
        const entry = Math.pow(1 - share, 3);
        const px = toX(shot.ax + shot.driftMrad * (1 - entry)) , py = toY(shot.ay - angle) + entry * R * 1.3;
        const size = lerp(7, 2.4, Math.sqrt(share));
        const g = ctx.createRadialGradient(px, py, 0, px, py, size * 5);
        g.addColorStop(0, "rgba(255,245,215,1)"); g.addColorStop(0.3, "rgba(255,190,100,.8)"); g.addColorStop(1, "rgba(255,150,60,0)");
        ctx.fillStyle = g; ctx.fillRect(px - size * 5, py - size * 5, size * 10, size * 10);
        if (share >= 1) { settle(shot); shot = null; }
      }
      // the sight: a diagram of the ladder, one tick to a line
      ctx.strokeStyle = "rgba(10,14,16,.9)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
      ctx.font = "600 13px 'B612 Mono', monospace"; ctx.fillStyle = "rgba(10,14,16,.95)"; ctx.textAlign = "left";
      for (let i = 1; i <= 3; i++) {
        const half = 10 + i * 4;
        ctx.beginPath(); ctx.moveTo(cx - half, cy + i * T); ctx.lineTo(cx + half, cy + i * T); ctx.stroke();
        ctx.fillText(String(i), cx + half + 6, cy + i * T + 4);
        ctx.beginPath(); ctx.moveTo(cx + i * T, cy - 5); ctx.lineTo(cx + i * T, cy + 5); ctx.moveTo(cx - i * T, cy - 5); ctx.lineTo(cx - i * T, cy + 5); ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = "rgba(20,24,28,1)"; ctx.lineWidth = Math.max(10, R * 0.05);
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.2832); ctx.stroke();
      ctx.strokeStyle = "rgba(255,225,190,.55)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, R + Math.max(5, R * 0.025), 0, 6.2832); ctx.stroke();

      // the same round from the side: vertical much enlarged, so the arc can be seen
      const side = wide
        ? { x: 28, y: h - 150, w: Math.min(w * 0.26, 340), h: 118 }
        : { x: 12, y: cy + R + 16, w: w - 24, h: Math.max(62, h - (cy + R + 26)) };
      ctx.fillStyle = "rgba(8,10,14,.62)"; ctx.fillRect(side.x, side.y, side.w, side.h);
      const metres = m, sideX = r => side.x + 12 + (r / metres) * (side.w - 54), metreY = side.h / 70, lineY = side.y + side.h * 0.46;
      ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.setLineDash([5, 6]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(sideX(0), lineY); ctx.lineTo(sideX(metres), lineY); ctx.stroke(); ctx.setLineDash([]);
      const tallPx = GAME.standingM * metreY;
      drawVigil(ctx, small, sideX(metres) + 8, lineY + tallPx / 2, tallPx);
      const holdRad = aimY / 1000;
      ctx.strokeStyle = "#ffc27a"; ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const r = metres * i / 40, y = lineY - (holdRad * r - Physics.drop(r).m) * metreY;
        if (i) ctx.lineTo(sideX(r), y); else ctx.moveTo(sideX(r), y);
      }
      ctx.stroke();
      if (shot) {
        const r = metres * clamp(shot.t / shot.flight, 0, 1), y = lineY - (shot.ay / 1000 * r - Physics.drop(r).m) * metreY;
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(sideX(r), y, 4, 0, 6.2832); ctx.fill();
      }
      ctx.fillStyle = "#fff"; ctx.font = "600 11px 'B612 Mono', monospace"; ctx.textAlign = "left";
      ctx.fillText("From the side", side.x + 12, side.y + 15);
    };
  });

  // the wind on all eight guns
  (() => {
    const table = document.getElementById("drift-table");
    if (!table) return;
    const input = table.querySelector("input"), streaks = table.querySelector("[data-streaks]");
    const draw = () => {
      const mph = Number(input.value);
      put(table, "wind", `${n(mph)} mph`);
      if (streaks) streaks.style.setProperty("--wind", mph);
      table.querySelectorAll("[data-gun]").forEach(cell => {
        const gun = cell.dataset.gun, ft = Physics.drift(gun, GAME.rangeM[gun] || 0, mph) / FT;
        cell.textContent = (GAME.wind[gun] || 0) === 0 ? "None" : `${n(ft, ft < 10 ? 1 : 0)} ft`;
        const row = cell.closest("[data-row]");
        if (row) row.style.setProperty("--at", clamp(ft / 50, 0, 1).toFixed(3));
      });
    };
    input.addEventListener("input", draw);
    draw();
  })();

  // ---------- 08 the weather ----------
  stage("weather", (root, s) => {
    const { ctx } = s, field = root.querySelector("canvas[data-field]"), f = field.getContext("2d");
    const seed = 9974;   // one season's seed by the game's formula; the systems shown are that season's, not today's
    let hours = 3000, grabbed = false, pause = 0, probe = { x: 325, y: 250 };
    const motes = Array.from({ length: Math.min(420, Math.round(window.innerWidth * 0.34)) }, () => ({ x: Math.random() * GAME.mapW, y: Math.random() * GAME.mapH, age: Math.random() * 3 }));
    let map = { k: 1, ox: 0, oy: 0 };
    const toPx = (x, y) => [map.ox + x * map.k, map.oy + (GAME.mapH - y) * map.k];
    const toKm = (px, py) => [(px - map.ox) / map.k, GAME.mapH - (py - map.oy) / map.k];

    let moved = 0;
    drag(s.canvas, {
      start: () => { grabbed = true; moved = 0; },
      move: (_, dx) => { moved += Math.abs(dx); hours += dx / s.w * GAME.lifetimeH * 0.6; pause = 4; },
      end: (e, cancelled) => {
        grabbed = false;
        if (!cancelled && moved < 6) {
          const box = s.canvas.getBoundingClientRect(), [x, y] = toKm(e.clientX - box.left, e.clientY - box.top);
          probe = { x: clamp(x, 0, GAME.mapW), y: clamp(y, 0, GAME.mapH) };
        }
      },
    });

    return (dt) => {
      const { w, h } = s;
      if (field.width !== s.canvas.width || field.height !== s.canvas.height) { field.width = s.canvas.width; field.height = s.canvas.height; ctx.clearRect(0, 0, w, h); }
      f.setTransform(s.canvas.width / w, 0, 0, s.canvas.height / h, 0, 0);
      map.k = Math.max(w / GAME.mapW, h / GAME.mapH);
      map.ox = (w - GAME.mapW * map.k) / 2; map.oy = (h - GAME.mapH * map.k) / 2;
      if (!calm && !grabbed) { if (pause > 0) pause -= dt; else hours += dt * GAME.lifetimeH / 36; }
      const systems = Array.from({ length: GAME.systems }, (_, slot) => Physics.system(slot, hours, seed));

      f.clearRect(0, 0, w, h);
      for (const sys of systems) {
        if (sys.amp <= 0) continue;
        const [px, py] = toPx(sys.xKm, sys.yKm), r = GAME.radiusKm * map.k, depth = sys.amp / GAME.lowMax;
        const g = f.createRadialGradient(px, py, 0, px, py, r);
        if (sys.low) { g.addColorStop(0, `rgba(36,58,120,${0.2 + 0.62 * depth})`); g.addColorStop(0.65, `rgba(70,96,170,${0.32 * depth})`); g.addColorStop(1, "rgba(80,110,190,0)"); }
        else { g.addColorStop(0, `rgba(255,214,140,${0.1 + 0.55 * depth})`); g.addColorStop(1, "rgba(255,200,120,0)"); }
        f.fillStyle = g;
        f.beginPath(); f.arc(px, py, r, 0, 6.2832); f.fill();
        if (sys.low) {
          const shield = f.createRadialGradient(px, py, r * 0.12, px, py, r * 0.8);
          shield.addColorStop(0, "rgba(235,240,250,0)"); shield.addColorStop(0.4, `rgba(235,240,250,${0.55 * depth})`); shield.addColorStop(1, "rgba(235,240,250,0)");
          f.fillStyle = shield;
          f.beginPath(); f.arc(px, py, r * 0.8, 0, 6.2832); f.fill();
        }
        f.lineWidth = 1.5; f.strokeStyle = sys.low ? "rgba(190,210,255,.7)" : "rgba(255,226,170,.7)";
        for (const ring of [0.42, 0.72]) { f.beginPath(); f.arc(px, py, r * ring, 0, 6.2832); f.stroke(); }
        f.font = `600 ${clamp(r * 0.34, 26, 64)}px 'Barlow Condensed', sans-serif`;
        f.textAlign = "center"; f.textBaseline = "middle"; f.fillStyle = "#fff";
        f.fillText(sys.low ? "L" : "H", px, py);
        f.font = "600 13px 'B612 Mono', monospace";
        const inHg = GAME.standardInHg + (sys.low ? -1 : 1) * sys.amp;
        f.fillText(`${n(inHg, 2)} inHg`, px, py + clamp(r * 0.26, 24, 46));
      }
      const here = Physics.air(probe.x, probe.y, systems);
      const [qx, qy] = toPx(probe.x, probe.y);
      f.strokeStyle = "#fff"; f.lineWidth = 2;
      f.beginPath(); f.arc(qx, qy, 11, 0, 6.2832); f.moveTo(qx - 18, qy); f.lineTo(qx + 18, qy); f.moveTo(qx, qy - 18); f.lineTo(qx, qy + 18); f.stroke();
      const bearing = (Math.atan2(here.wx, here.wy) * 180 / Math.PI + 180 + 360) % 360;
      put(root, "altimeter", `${n(here.altimeter, 2)} inHg`);
      put(root, "wind", `${n(here.mph)} mph from ${n(Math.round(bearing / 10) * 10 % 360)}°`);
      put(root, "cool", here.severity > 0.01 ? `−${n(here.severity * GAME.stormCool)} °F` : "None");
      put(root, "lived", `Day ${n((hours / 24) % 365, 1)}`);

      // the wind itself: motes carried by the game's own field, leaving trails that fade
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = `rgba(0,0,0,${calm ? 1 : 0.055})`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (const mote of motes) {
        const a = Physics.air(mote.x, mote.y, systems);
        const [x0, y0] = toPx(mote.x, mote.y);
        const flow = calm ? 0.5 : dt * 7;   // km moved per mph, so that a storm's wind reads; the map's scale is far too big to show it true
        mote.x += a.wx * flow; mote.y += a.wy * flow;
        mote.age += dt;
        const [x1, y1] = toPx(mote.x, mote.y);
        ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
        if (mote.age > 3.2 || mote.x < 0 || mote.x > GAME.mapW || mote.y < 0 || mote.y > GAME.mapH) { mote.x = Math.random() * GAME.mapW; mote.y = Math.random() * GAME.mapH; mote.age = 0; }
      }
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    };
  }, 1400);

  // ---------- 09 hear it ----------
  stage("sound-inst", (root, s) => {
    const { ctx } = s, mech = inLand(vigilFrame(300), "badlands");
    const keptBand = root.querySelector("[data-kept]");
    let dist = 600, temp = 20, hum = 70, flash = 0, fired = -1, clock = 0, delay = 0, heard = false, audio = null, autoShown = false;

    function read() {
      const c = Physics.speedOfSound(temp), hz = Physics.cutoff(dist, temp, hum / 100);
      put(root, "dist", `${n(dist)} m · ${n(dist / YD)} yd`);
      put(root, "temp", `${n(temp)} °C · ${n(temp * 9 / 5 + 32)} °F`);
      put(root, "hum", `${n(hum)}%`);
      put(root, "c", `${n(c)} m/s`);
      put(root, "delay", `${n(dist / c, 2)} s`);
      put(root, "cut", hz >= 22000 ? "Nothing lost" : hz >= 1000 ? `Above ${n(hz / 1000, 1)} kHz` : `Above ${n(hz)} Hz`);
      keptBand.style.setProperty("--cut", (Math.log(hz / 500) / Math.log(22000 / 500)).toFixed(4));
      return { c, hz };
    }
    /** The report made in the browser: a burst of noise through the air's low-pass, and a thump the air does not touch. */
    function report(atSeconds, hz, metres) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      audio = audio || new Context();
      audio.resume();
      const start = audio.currentTime + atSeconds, rate = audio.sampleRate, length = Math.floor(rate * 1.4);
      const buffer = audio.createBuffer(1, length, rate), data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (rate * 0.16));
      const noise = audio.createBufferSource(); noise.buffer = buffer;
      const a = audio.createBiquadFilter(), b = audio.createBiquadFilter();
      a.type = b.type = "lowpass"; a.frequency.value = b.frequency.value = Math.min(hz, rate / 2 - 100); a.Q.value = b.Q.value = 0.7;
      const level = audio.createGain();
      const near = clamp(160 / (metres + 60), 0.14, 0.85);
      level.gain.value = near;
      noise.connect(a); a.connect(b); b.connect(level); level.connect(audio.destination);
      noise.start(start);
      const thump = audio.createOscillator(), body = audio.createGain();
      thump.type = "sine"; thump.frequency.setValueAtTime(92, start); thump.frequency.exponentialRampToValueAtTime(38, start + 0.5);
      body.gain.setValueAtTime(near * 1.1, start); body.gain.exponentialRampToValueAtTime(0.001, start + 0.7);
      thump.connect(body); body.connect(audio.destination);
      thump.start(start); thump.stop(start + 0.75);
    }
    function fire() {
      const { c, hz } = read();
      delay = dist / c; fired = 0; heard = false; flash = 1; clock = 0;
      root.classList.remove("is-heard");
      put(root, "count", "0.00 s");
      report(delay, hz, dist);
    }
    root.querySelector("[data-fire]").addEventListener("click", fire);
    chips(root, "air", value => { const [t, h] = value.split(",").map(Number); temp = t; hum = h; read(); });
    let farness = Math.log(dist);   // kept apart from the rounded metres, or a slow drag would round away to nothing
    const setDist = metres => { dist = metres; farness = Math.log(metres); read(); };
    drag(s.canvas, { move: (_, dx) => { farness = clamp(farness - dx * 0.006, Math.log(50), Math.log(2000)); dist = clamp(Math.round(Math.exp(farness) / 10) * 10, 50, 2000); read(); } });
    chips(root, "dist", value => setDist(Number(value)));
    read();

    return dt => {
      const { w, h } = s, wide = w >= 900;
      if (fired >= 0) {
        clock += dt;
        put(root, "count", `${n(Math.min(clock, delay), 2)} s`);
        if (clock >= delay && !heard) { heard = true; root.classList.add("is-heard"); }
        if (clock > delay + 2) fired = -1;
      }
      flash = calm ? (fired >= 0 && clock < 0.5 ? 1 : 0) : Math.max(0, flash - dt * 2.4);

      // the far VIGIL stands on the ground line; the ground climbs toward the horizon as it goes away from you
      const near = 19.05 / 50, depth = GAME.standingM / dist / near;   // 1 at 50 m
      const horizon = h * 0.5, floor = h * (wide ? 0.95 : 0.93);
      const feetY = horizon + (floor - horizon) * Math.min(1, Math.pow(depth, 0.72));
      const tall = Math.max(10, Math.min(h * 0.9, h * 1.05 * Math.pow(depth, 0.86)));
      const x = wide ? w * 0.4 : w * 0.56;

      ctx.clearRect(0, 0, w, h);
      shadow(ctx, x, feetY, tall * 0.42, 0.5);
      drawVigil(ctx, mech, x, feetY, tall);
      if (flash > 0) {
        const px = x - tall * 0.18, py = feetY - tall * 0.62, r = Math.max(70, tall * 1.1) * (0.6 + flash * 0.6);
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        const g = ctx.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, `rgba(255,250,235,${flash})`); g.addColorStop(0.2, `rgba(255,190,110,${0.75 * flash})`); g.addColorStop(1, "rgba(255,150,60,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r, 0, 6.2832); ctx.fill();
        ctx.restore();
      }
      // the sound on its way: a ring that reaches you when you hear it
      if (fired >= 0 && !heard && !calm) {
        const share = clamp(clock / delay, 0, 1), px = x - tall * 0.18, py = feetY - tall * 0.62;
        const reach = Math.hypot(Math.max(px, w - px), Math.max(py, h - py)) * share;
        ctx.strokeStyle = `rgba(255,255,255,${0.75 * (1 - share * 0.5)})`; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(px, py, reach, 0, 6.2832); ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(px, py, Math.max(0, reach - 26), 0, 6.2832); ctx.stroke();
      }
    };
  });

  // ---------- 10 thin air ----------
  stage("thin-air", (root, s) => {
    const { ctx } = s, pad = root.querySelector("[data-pad]"), puckEl = root.querySelector("[data-puck]");
    const dots = Array.from({ length: 150 }, () => [Math.random(), Math.random(), Math.random() * 6.28]);
    let elevation = -1002, temp = 50;
    function read() {
      const d = Physics.density(elevation, GAME.standardInHg, temp);
      put(root, "elev", `${n(elevation)} ft`);
      put(root, "temp", `${n(temp)} °C`);
      put(root, "da", `${d.da >= 0 ? "+" : "−"}${n(Math.abs(d.da))} ft`);
      const gap = d.da - elevation;
      put(root, "say", Math.abs(gap) < 50 ? "This air behaves just as high as you stand." : `This air behaves ${n(Math.abs(gap))} ft ${gap > 0 ? "higher" : "lower"} than you stand.`);
      puckEl.style.left = `${((temp + 20) / 70 * 100).toFixed(2)}%`;
      puckEl.style.top = `${((1 - (elevation + 2000) / 16000) * 100).toFixed(2)}%`;
      return d;
    }
    const from = e => {
      const box = pad.getBoundingClientRect();
      temp = Math.round(clamp((e.clientX - box.left) / box.width, 0, 1) * 70 - 20);
      elevation = Math.round((1 - clamp((e.clientY - box.top) / box.height, 0, 1)) * 16000 - 2000);
      read();
    };
    drag(pad, { start: from, move: from });
    pad.addEventListener("keydown", e => {
      if (e.key === "ArrowLeft") temp = Math.max(-20, temp - 1); else if (e.key === "ArrowRight") temp = Math.min(50, temp + 1);
      else if (e.key === "ArrowUp") elevation = Math.min(14000, elevation + 100); else if (e.key === "ArrowDown") elevation = Math.max(-2000, elevation - 100);
      else return;
      e.preventDefault(); read();
    });
    chips(root, "place", value => { const [e, t] = value.split(",").map(Number); elevation = e; temp = t; read(); });
    read();
    return (dt, now) => {
      const { w, h } = s, d = Physics.density(elevation, GAME.standardInHg, temp).da;
      ctx.clearRect(0, 0, w, h);
      // air drawn as motes: the thicker the air, the more of them. A picture of the idea, not a measured density.
      const count = Math.round(clamp(150 * (1 - (d + 4000) / 22000), 14, 150));
      ctx.fillStyle = "#fff";
      for (let i = 0; i < count; i++) {
        const [x, y, p] = dots[i], t = calm ? 0 : now * 0.05;
        ctx.globalAlpha = 0.25 + 0.3 * Math.sin(p + t * 6) ** 2;
        ctx.beginPath(); ctx.arc(((x + t * (0.4 + (i % 3) * 0.2)) % 1) * w, y * h, 1.2 + (i % 4) * 0.5, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
  });

  // ---------- 11 the crossing ----------
  stage("crossing", (root, s) => {
    const { ctx } = s, track = root.querySelector('input[name="voyage"]');
    const seconds = WORLD.earthMoonKm / (WORLD.cruise * WORLD.lightKmS);
    const burnYears = WORLD.burnDays / 365.25, total = burnYears * 2 + WORLD.coastYears;
    const gamma = 1 / Math.sqrt(1 - WORLD.cruise * WORLD.cruise);
    const stars = Array.from({ length: 70 }, () => [Math.random(), Math.random(), 0.5 + Math.random()]);
    let dash = -1, finished = false;
    const start = root.querySelector("[data-go]");
    start.addEventListener("click", () => { dash = 0; finished = false; put(root, "dash", "0.0 s"); root.classList.remove("is-there"); });

    function voyage() {
      const p = Number(track.value) / 1000;
      // the track draws each burn as an eighth of its length, far wider than they are (see the note on the page)
      const edge = 0.125;
      let years, speed, phase;
      if (p < edge) { const t = p / edge; years = burnYears * t; speed = Math.tanh(Math.atanh(WORLD.cruise) * t); phase = "Burn, 1 g"; }
      else if (p <= 1 - edge) { years = burnYears + WORLD.coastYears * (p - edge) / (1 - 2 * edge); speed = WORLD.cruise; phase = "Coast, engines quiet"; }
      else { const t = (p - (1 - edge)) / edge; years = burnYears + WORLD.coastYears + burnYears * t; speed = Math.tanh(Math.atanh(WORLD.cruise) * (1 - t)); phase = "Braking burn, 1 g"; }
      const coastDone = clamp(years - burnYears, 0, WORLD.coastYears);
      const behindDays = coastDone * 365.25 * (1 - 1 / gamma);
      put(root, "phase", phase);
      put(root, "speed", `${n(speed, 3)} c`);
      put(root, "kms", `${n(speed * WORLD.lightKmS)} km/s`);
      put(root, "years", years < 1 ? `${n(years * 365.25)} days out` : `${n(years, 1)} years out`);
      put(root, "behind", `${n(behindDays)} days`);
    }
    track.addEventListener("input", voyage);
    voyage();

    return (dt) => {
      const { w, h } = s, wide = w >= 900;
      if (dash >= 0 && !finished) {
        dash += dt;
        put(root, "dash", `${n(Math.min(dash, seconds), 1)} s`);
        if (dash >= seconds) { finished = true; root.classList.add("is-there"); }
      }
      ctx.clearRect(0, 0, w, h);
      const y = h * 0.5, left = wide ? w * 0.06 : 22, right = w - (wide ? w * 0.06 : 22), span = right - left;
      const scale = span / WORLD.earthMoonKm, earthR = Math.max(5, 6371 * scale), moonR = Math.max(2.5, 1737 * scale);
      ctx.fillStyle = "#fff";
      for (const [x, py, r] of stars) { ctx.globalAlpha = 0.2 + 0.5 * (r - 0.5); ctx.beginPath(); ctx.arc(x * w, py * h, r, 0, 6.2832); ctx.fill(); }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(255,255,255,.3)"; ctx.lineWidth = 1.5; ctx.setLineDash([3, 9]);
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke(); ctx.setLineDash([]);
      const earth = ctx.createRadialGradient(left - earthR * 0.3, y - earthR * 0.3, 0, left, y, earthR);
      earth.addColorStop(0, "#d9a06a"); earth.addColorStop(1, "#6d4326");
      ctx.fillStyle = earth; ctx.beginPath(); ctx.arc(left, y, earthR, 0, 6.2832); ctx.fill();
      ctx.fillStyle = "#d8d6d0"; ctx.beginPath(); ctx.arc(right, y, moonR, 0, 6.2832); ctx.fill();
      ctx.font = "600 13px 'B612 Mono', monospace"; ctx.fillStyle = "#fff";
      ctx.textAlign = "left"; ctx.fillText("Earth", left - 4, y + earthR + 20);
      ctx.textAlign = "right"; ctx.fillText("The Moon", right + 4, y + 22);
      if (dash >= 0) {
        const share = clamp(dash / seconds, 0, 1), x = left + span * share;
        if (!finished) {
          const tail = Math.min(span * 0.22, x - left), g = ctx.createLinearGradient(x - tail, 0, x, 0);
          g.addColorStop(0, "rgba(150,210,255,0)"); g.addColorStop(1, "rgba(220,240,255,.95)");
          ctx.fillStyle = g; ctx.fillRect(x - tail, y - 2, tail, 4);
          ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 6.2832); ctx.fill();
        }
      }
    };
  });
})();

if (typeof module !== "undefined") module.exports = { GAME, WORLD, Physics };
