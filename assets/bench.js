/* The loadout bench in FEEL THE WEIGHT: the game's VIGIL on a turntable, in its four paints, under four loadouts. Every
   figure is a row of the Hangar's export (/hangar/hangar-data.json, written by the game's Vigil ▸ Website ▸ Export Hangar
   Data); this card looks a loadout up and computes nothing of its own. The bench steps through the loadouts and the paints
   by itself while it is on screen; a tap on either, or a drag on the mech, takes hold of it. Nothing is stored and nothing
   is sent anywhere. Without scripts, or if the data or the frames fail, the cockpit picture stays. */
(function () {
  "use strict";
  const root = document.querySelector("[data-bench]");
  if (!root || !("IntersectionObserver" in window)) return;

  // The four loadouts the bench shows. The labels are the site's, not names from the game; each key is the export's.
  const LOADOUTS = [
    { label: "Starter", key: "PULSE-50+CHAIN-30+SLUG-250|VOLLEY-6|" },
    { label: "Light", key: "PULSE-50+DART-20+THUMP-82|VOLLEY-6|" },
    { label: "Jump jets", key: "PULSE-50+DART-20+THUMP-82|VOLLEY-6|JumpJets" },
    { label: "Heavy", key: "CHAIN-30+SLUG-250+SPIKE-90|BREACH-275|ArmorModule" },
  ];
  // The paints, as the Hangar names them; their frames are the Hangar's (Tools/website/hangar_paint_frames.py).
  const PAINTS = [
    { id: "base", label: "Base" },
    { id: "tiger", label: "Tiger stripe" },
    { id: "desert", label: "Desert" },
    { id: "snow", label: "Snow" },
  ];
  const FRAMES = 72, TURN_MS = 120, STEP_MS = 5200, TWEEN_MS = 650;
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const thrifty = Boolean(navigator.connection && navigator.connection.saveData);
  const frameSrc = (paint, i) => `/hangar/spin/${paint}/vigil-${String(i * 5).padStart(3, "0")}.webp`;
  const fmt = (n) => Math.round(n).toLocaleString("en-US");
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // ── the frames: a paint's 72 are fetched once, and a paint is shown only once its frames are in ─────────────────
  const loaded = new Map();
  const loadPaint = (paint) => {
    if (!loaded.has(paint)) {
      loaded.set(paint, Promise.all(Array.from({ length: FRAMES }, (_, i) => new Promise((done, fail) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => done(img);
        img.onerror = fail;
        img.src = frameSrc(paint, i);
      }))));
    }
    return loaded.get(paint);
  };

  function build(data) {
    const rows = new Map(data.loadouts.map((l) => [l.key, l]));
    const shown = LOADOUTS.filter((l) => rows.has(l.key)).map((l) => ({ ...l, row: rows.get(l.key) }));
    if (shown.length < 2) return null;
    const modules = new Map(data.modules.map((m) => [m.id, m.name]));
    const { mech } = data;
    const heaviest = Math.max(...data.loadouts.map((l) => l.operatingLb));
    const share = (lb) => Math.max(0, Math.min(1, (lb - mech.emptyLb) / (heaviest - mech.emptyLb)));

    // ── the stage ──────────────────────────────────────────────────────────────────────────────────────────────
    const stage = el("div", "bench");
    const turntable = el("div", "bench__mech");
    turntable.tabIndex = 0;
    turntable.setAttribute("role", "img");
    const picture = el("img");
    picture.alt = "";
    picture.draggable = false;
    picture.width = 640; picture.height = 640;
    const floor = el("div", "bench__floor");
    const hint = el("div", "bench__hint", "Drag to turn");
    hint.setAttribute("aria-hidden", "true");
    turntable.append(floor, picture, hint);

    const sheet = el("div", "bench__sheet");
    const head = el("div", "bench__head");
    const kicker = el("span", "bench__label", "Loadout");
    const name = el("div", "bench__name");
    head.append(kicker, name);
    const fit = el("dl", "bench__fit");
    const fitRow = (term) => { const d = el("div"); const v = el("dd"); d.append(el("dt", null, term), v); fit.append(d); return v; };
    const fitArms = fitRow("Arms"), fitShoulder = fitRow("Shoulder"), fitTorso = fitRow("Torso");

    const weight = el("div", "bench__weight");
    const weightHead = el("div", "bench__weight-head");
    const weightValue = el("span", "bench__value");
    const weightUnit = el("span", "bench__unit", "lb");
    const readout = el("span", "bench__readout");
    readout.append(weightValue, weightUnit);
    weightHead.append(el("span", "bench__label", "Operating weight"), readout);
    const bar = el("div", "bench__bar");
    const fill = el("i", "bench__fill");
    const mow = el("i", "bench__mow");
    mow.style.left = `${share(mech.maxOperatingLb) * 100}%`;
    const mowLabel = el("span", "bench__mow-label", `Max ${fmt(mech.maxOperatingLb)}`);
    mow.append(mowLabel);
    bar.append(fill, mow);
    const load = el("div", "bench__load");
    weight.append(weightHead, bar, load);

    const stats = el("dl", "bench__stats");
    const stat = (term) => {
      const d = el("div"), v = el("dd"), figure = el("span"), unit = el("span", "bench__unit"), sub = el("span", "bench__sub");
      v.append(figure, unit);
      d.append(el("dt", "bench__label", term), v, sub); stats.append(d);
      return { set(text, units) { figure.textContent = text; unit.textContent = units ? ` ${units}` : ""; }, sub };
    };
    const speed = stat("Top speed"), cooling = stat("Cooling"), jets = stat("Jump jets");
    const source = el("div", "bench__source", "The game's own figures · pre-alpha");
    sheet.append(head, fit, weight, stats, source);

    const controls = el("div", "bench__controls");
    const loadoutGroup = el("div", "bench__loadouts");
    loadoutGroup.setAttribute("role", "group");
    loadoutGroup.setAttribute("aria-label", "Loadout");
    const loadoutButtons = shown.map((l, i) => {
      const b = el("button", "bench__loadout");
      b.type = "button";
      b.append(el("span", "bench__loadout-name", l.label), el("span", "bench__loadout-lb", `${fmt(l.row.operatingLb)} lb`));
      b.addEventListener("click", () => { takeHold(); showLoadout(i); });
      loadoutGroup.append(b);
      return b;
    });
    const paintGroup = el("div", "bench__paints");   // under the mech's feet, on the turntable
    paintGroup.setAttribute("role", "group");
    paintGroup.setAttribute("aria-label", "Paint");
    paintGroup.append(el("span", "bench__label", "Paint"));
    const paintButtons = PAINTS.map((p, i) => {
      const b = el("button", `bench__paint bench__paint--${p.id}`);
      b.type = "button";
      b.title = p.label;
      b.setAttribute("aria-label", `${p.label} paint`);
      b.addEventListener("click", () => { takeHold(); showPaint(i); });
      paintGroup.append(b);
      return b;
    });
    controls.append(loadoutGroup);
    turntable.append(paintGroup);
    stage.append(turntable, sheet, controls);

    // ── what is on the bench ───────────────────────────────────────────────────────────────────────────────────
    let frame = 0, paintAt = 0, loadoutAt = 0, playing = !calm, inView = false;
    let spinTimer = 0, stepTimer = 0, resumeTimer = 0, tween = 0, tweenEnd = 0, shownLb = shown[0].row.operatingLb;

    const drawFrame = () => { picture.src = frameSrc(PAINTS[paintAt].id, frame); };
    const describe = () => {
      turntable.setAttribute("aria-label", `The VX-21 VIGIL in ${PAINTS[paintAt].label.toLowerCase()} paint, ${shown[loadoutAt].label.toLowerCase()} loadout. Drag, or use the arrow keys, to turn it.`);
    };
    const setWeight = (lb) => {
      weightValue.textContent = fmt(lb);
      fill.style.transform = `scaleX(${share(lb)})`;
    };

    function showLoadout(i) {
      loadoutAt = i;
      const { row } = shown[i];
      const [arms, shoulder, module] = row.key.split("|");
      name.textContent = shown[i].label;
      // each weapon kept whole, so a line never breaks inside DART-20
      fitArms.replaceChildren(...arms.split("+").flatMap((id, k) => (k ? [" · ", el("span", "bench__nowrap", id)] : [el("span", "bench__nowrap", id)])));
      fitShoulder.textContent = shoulder;
      fitTorso.textContent = module ? modules.get(module) || module : "Empty";
      const over = row.operatingLb > mech.maxOperatingLb;
      stage.classList.toggle("is-over", over);
      load.textContent = over
        ? `${row.loadPct}% of its carrying capacity. Over its max: slower and hotter.`
        : `${row.loadPct}% of its carrying capacity.`;
      speed.set(row.topSpeedMph.toFixed(1), "mph");
      const lost = mech.topSpeedEmptyMph - row.topSpeedMph;
      speed.sub.textContent = lost > 0.05 ? `−${lost.toFixed(1)} from ${mech.topSpeedEmptyMph.toFixed(0)} stripped` : `${mech.topSpeedEmptyMph.toFixed(0)} stripped`;
      cooling.set(`${Math.round(row.coolingPct)}%`);
      cooling.sub.textContent = "of its heat shed";
      if (row.flightSeconds !== undefined) {
        jets.set(row.flightSeconds.toFixed(1), "s");
        jets.sub.textContent = `of climb, to ${row.climbCeilingFt} ft`;
      } else {
        jets.set("None");
        jets.sub.textContent = "fit them in the torso";
      }
      loadoutButtons.forEach((b, k) => b.setAttribute("aria-pressed", String(k === i)));
      // The weight counts across to its new figure, and the bar runs with it.
      cancelAnimationFrame(tween);
      clearTimeout(tweenEnd);
      const from = shownLb, to = row.operatingLb;
      if (calm || from === to) { shownLb = to; setWeight(to); }
      else {
        let t0 = null;
        const run = (now) => {
          if (t0 === null) t0 = now;   // timed from the first frame, never from a clock the frames may not share
          const t = Math.min(1, Math.max(0, (now - t0) / TWEEN_MS)), k = 1 - Math.pow(1 - t, 3);
          shownLb = from + (to - from) * k;
          setWeight(shownLb);
          if (t < 1) tween = requestAnimationFrame(run);
        };
        tween = requestAnimationFrame(run);
        // If frames stop (a hidden tab), the figure still lands where it belongs.
        tweenEnd = setTimeout(() => { cancelAnimationFrame(tween); shownLb = to; setWeight(to); }, TWEEN_MS + 120);
      }
      describe();
    }

    let paintWanted = 0;
    function showPaint(i) {
      paintWanted = i;
      loadPaint(PAINTS[i].id).then(() => {
        if (paintWanted !== i) return;   // a later pick overtook this one while its frames came in
        paintAt = i;
        paintButtons.forEach((b, k) => b.setAttribute("aria-pressed", String(k === i)));
        stage.style.setProperty("--paint", `url("/hangar/spin/swatch-${PAINTS[i].id}.webp")`);
        drawFrame();
        describe();
      }, () => {});
    }

    // ── motion: the turn, and the step through loadouts and paints ─────────────────────────────────────────────
    const turnTo = (i) => { frame = ((i % FRAMES) + FRAMES) % FRAMES; drawFrame(); };
    const spin = () => {
      clearInterval(spinTimer);
      spinTimer = 0;
      if (!calm && inView && !document.hidden && !dragFrom) spinTimer = setInterval(() => turnTo(frame + 1), TURN_MS);
    };
    const step = () => {
      clearTimeout(stepTimer);
      if (!playing || !inView || document.hidden) return;
      stepTimer = setTimeout(() => {
        const next = (loadoutAt + 1) % shown.length;
        showLoadout(next);
        // The paint moves on with the loadout, and the one after it is fetched while this one shows.
        if (!thrifty) {
          showPaint((paintAt + 1) % PAINTS.length);
          loadPaint(PAINTS[(paintAt + 2) % PAINTS.length].id).catch(() => {});
        }
        step();
      }, STEP_MS);
    };
    function takeHold() {
      playing = false;
      clearTimeout(stepTimer);
      stage.classList.add("is-held");
    }

    let dragFrom = null;
    turntable.addEventListener("pointerdown", (e) => {
      takeHold();
      clearTimeout(resumeTimer);
      dragFrom = { x: e.clientX, frame };
      spin();
      turntable.setPointerCapture(e.pointerId);
    });
    turntable.addEventListener("pointermove", (e) => {
      if (!dragFrom) return;
      // One full turn across about two and a half widths of the turntable, as in the Hangar.
      const perFrame = (turntable.clientWidth * 2.5) / FRAMES;
      turnTo(dragFrom.frame - Math.round((e.clientX - dragFrom.x) / perFrame));
    });
    const letGo = () => {
      if (!dragFrom) return;
      dragFrom = null;
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(spin, 3500);   // the slow turn comes back once the hand is off it
    };
    turntable.addEventListener("pointerup", letGo);
    turntable.addEventListener("pointercancel", letGo);
    turntable.addEventListener("keydown", (e) => {
      const d = { ArrowLeft: 1, ArrowRight: -1 }[e.key];
      if (!d) return;
      e.preventDefault();
      takeHold();
      clearInterval(spinTimer);
      spinTimer = 0;
      turnTo(frame + d);
    });

    const watch = new IntersectionObserver((entries) => {
      inView = entries[entries.length - 1].intersectionRatio >= 0.35;
      spin();
      step();
    }, { threshold: [0, 0.35, 0.7] });
    document.addEventListener("visibilitychange", () => { spin(); step(); });

    return {
      stage,
      start() {
        showLoadout(0);
        paintButtons[0].setAttribute("aria-pressed", "true");
        stage.style.setProperty("--paint", `url("/hangar/spin/swatch-${PAINTS[0].id}.webp")`);
        drawFrame();
        describe();
        watch.observe(root);
        if (!calm && !thrifty) loadPaint(PAINTS[1].id).catch(() => {});
      },
    };
  }

  let started = false;
  function mount() {
    started = true;
    Promise.all([fetch("/hangar/hangar-data.json").then((r) => (r.ok ? r.json() : Promise.reject())), loadPaint(PAINTS[0].id)])
      .then(([data]) => {
        const bench = build(data);
        if (!bench) return;
        root.replaceChildren(bench.stage);
        root.classList.add("is-bench");
        bench.start();
      })
      .catch(() => { /* the cockpit picture stays */ });
  }
  const near = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting) && !started) { near.disconnect(); mount(); }
  }, { rootMargin: "700px 0px" });
  near.observe(root);
})();
