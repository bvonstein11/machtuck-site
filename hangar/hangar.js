// The Hangar: the VIGIL's turntable and the loadout explorer. Every number comes from hangar-data.json, which the game
// writes (Vigil ▸ Website ▸ Export Hangar Data); this page only looks a loadout up and computes nothing of its own.
// Nothing is stored in the browser and nothing is sent anywhere.

(() => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // The turntable: 72 frames, one every 5 degrees. It turns slowly by itself until the visitor takes hold of it, by
  // dragging, by the arrow keys or by the dial under it.
  const spin = document.querySelector("[data-spin]");
  if (spin) {
    const frames = 72;
    const stage = spin.querySelector("[data-spin-stage]");
    const picture = spin.querySelector("[data-spin-frame]");
    const dial = spin.querySelector("[data-spin-dial]");
    // Four paints, each its own 72 frames, filmed from the game (the hub's VIGIL under the hangar's lights). A paint goes
    // on only once its frames are in, and the turn only ever shows a frame that has arrived: an <img> whose source moves
    // on every 140 ms never finishes loading any new frame over a phone's connection, so the old paint stayed on screen
    // (2026-11-03, on an iPhone: the desert paint would not load). While a paint comes in, its swatch fills as a ring.
    let skin = "base", wanted = "base";
    const source = (index, paint) => `/hangar/spin/${paint}/vigil-${String(index * 5).padStart(3, "0")}.webp`;
    const sets = new Map();
    /** Fetches a paint's frames once, the angle on screen first and then outward; resolves when every one has settled. */
    const load = (paint, onProgress) => {
      if (!sets.has(paint)) {
        const set = { images: [], ready: new Array(frames).fill(false), settled: 0, listeners: [] };
        const order = Array.from({ length: frames }, (_, k) => (frame + (k % 2 ? -1 : 1) * Math.ceil(k / 2) + frames) % frames);
        set.done = new Promise((resolve) => {
          for (const index of order) {
            const img = new Image();
            img.decoding = "async";
            const settle = (ok) => {
              set.ready[index] = ok;
              set.settled++;
              for (const listener of set.listeners) listener(set.settled / frames);
              if (set.settled === frames) resolve(set);
            };
            img.onload = () => settle(true);
            img.onerror = () => settle(false);
            img.src = source(index, paint);
            set.images.push(img);
          }
        });
        sets.set(paint, set);
      }
      const set = sets.get(paint);
      if (onProgress) { set.listeners.push(onProgress); onProgress(set.settled / frames); }
      return set.done;
    };
    let frame = 0;
    let idle = null;
    /** The nearest frame of the paint on show that has arrived, so the turn never waits on the network. */
    const nearestReady = (index) => {
      const set = sets.get(skin);
      if (!set) return index;
      for (let d = 0; d <= frames / 2; d++) {
        for (const candidate of [index + d, index - d]) {
          const k = (candidate + frames) % frames;
          if (set.ready[k]) return k;
        }
      }
      return -1;
    };
    const show = (index) => {
      frame = ((index % frames) + frames) % frames;
      const k = nearestReady(frame);
      if (k >= 0) picture.src = source(k, skin);
      dial.value = String(frame);
    };
    const takeHold = () => {
      if (idle) clearInterval(idle);
      idle = null;
      stage.classList.add("is-held");
    };
    let dragFrom = null;
    stage.addEventListener("pointerdown", (event) => {
      takeHold();
      dragFrom = { x: event.clientX, frame };
      stage.setPointerCapture(event.pointerId);
    });
    stage.addEventListener("pointermove", (event) => {
      if (!dragFrom) return;
      // One full turn across about two and a half widths of the picture.
      const pixelsPerFrame = (stage.clientWidth * 2.5) / frames;
      show(dragFrom.frame - Math.round((event.clientX - dragFrom.x) / pixelsPerFrame));
    });
    const letGo = () => { dragFrom = null; };
    stage.addEventListener("pointerup", letGo);
    stage.addEventListener("pointercancel", letGo);
    stage.addEventListener("keydown", (event) => {
      const step = { ArrowLeft: 1, ArrowRight: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      takeHold();
      show(frame + step);
    });
    dial.addEventListener("input", () => { takeHold(); show(Number(dial.value)); });
    // A paint is picked by its swatch; its frames are fetched then, the base paint's once the page has loaded.
    const skins = spin.querySelector("[data-spin-skins]");
    const press = (paint) => {
      for (const other of skins.querySelectorAll("[data-skin]")) {
        const on = other.dataset.skin === paint;
        other.classList.toggle("is-on", on);
        other.setAttribute("aria-pressed", String(on));
      }
    };
    if (skins) {
      for (const button of skins.querySelectorAll("[data-skin]")) {
        button.addEventListener("click", () => {
          const paint = button.dataset.skin;
          wanted = paint;
          press(paint);
          button.classList.add("is-loading");
          button.setAttribute("aria-busy", "true");
          load(paint, (share) => button.style.setProperty("--progress", share.toFixed(3))).then((set) => {
            button.classList.remove("is-loading");
            button.removeAttribute("aria-busy");
            if (wanted !== paint) return;
            if (!set.ready.some(Boolean)) { wanted = skin; press(skin); return; }   // nothing came: keep the paint on show
            skin = paint;
            show(frame);
          });
        });
      }
    }
    window.addEventListener("load", () => {
      load(skin);
      if (!reducedMotion) idle = setInterval(() => show(frame + 1), 140);
    });
  }

  // The loadout explorer: tap a slot to open it, pick what goes there, and the gauges follow.
  const fit = document.querySelector("[data-fit]");
  const gauges = document.querySelector("[data-gauges]");
  if (!fit || !gauges) return;

  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const pounds = (value) => `${Math.round(value).toLocaleString("en-US")} lb`;

  fetch("/hangar/hangar-data.json")
    .then((response) => response.json())
    .then(build)
    .catch(() => { fit.querySelector(".fit__noscript").textContent = "The loadout could not be loaded. Try a reload."; });

  function build(data) {
    const weapons = new Map(data.weapons.map((weapon) => [weapon.id, weapon]));
    const modules = new Map(data.modules.map((module) => [module.id, module]));
    const loadouts = new Map(data.loadouts.map((loadout) => [loadout.key, loadout]));
    const armOrder = data.weapons.filter((weapon) => weapon.slot === "arm").map((weapon) => weapon.id);
    const armSlots = data.slots.filter((slot) => slot.accepts === "arm").map((slot) => slot.id);
    const shoulderSlot = data.slots.find((slot) => slot.accepts === "shoulder").id;
    const moduleSlot = data.slots.find((slot) => slot.accepts === "module").id;
    const fitted = Object.fromEntries(data.slots.map((slot) => [slot.id, slot.default]));
    const heaviest = Math.max(...data.loadouts.map((loadout) => loadout.operatingLb));
    const { mech } = data;

    /** The export's key for what is fitted: the arm weapons in the game's weapon order, the shoulder, the module. */
    const keyNow = () => {
      const arms = armSlots.map((id) => fitted[id]).sort((a, b) => armOrder.indexOf(a) - armOrder.indexOf(b));
      return `${arms.join("+")}|${fitted[shoulderSlot]}|${fitted[moduleSlot]}`;
    };

    /** What a slot can take, as [id, name, weight, tag]. The torso can also stay empty. */
    const choicesFor = (slot) => {
      if (slot.accepts === "module") {
        return [["", "Empty", 0, ""], ...data.modules.map((module) => [module.id, module.name, module.weightLb, "Earned with Marks"])];
      }
      return data.weapons.filter((weapon) => weapon.slot === slot.accepts)
        .map((weapon) => [weapon.id, weapon.id, weapon.weightLb, weapon.earnedWithMarks ? "Earned with Marks" : "Starter"]);
    };
    const nameOf = (id) => (modules.get(id)?.name ?? (id || "Empty"));
    const weightOf = (id) => (weapons.get(id) ?? modules.get(id))?.weightLb ?? 0;

    const list = fit.querySelector("[data-fit-slots]");
    const rows = new Map();
    let open = null;

    const setOpen = (slotId) => {
      open = open === slotId ? null : slotId;
      for (const [id, row] of rows) {
        const isOpen = id === open;
        row.item.classList.toggle("is-open", isOpen);
        row.toggle.setAttribute("aria-expanded", String(isOpen));
        row.choices.hidden = !isOpen;
      }
    };

    const choose = (slot, id) => {
      // Arms carry three different weapons: picking one another arm already holds swaps the two.
      if (slot.accepts === "arm") {
        const other = armSlots.find((armId) => armId !== slot.id && fitted[armId] === id);
        if (other) fitted[other] = fitted[slot.id];
      }
      fitted[slot.id] = id;
      draw();
    };

    for (const slot of data.slots) {
      const item = make("li", "slot");
      const toggle = make("button", "slot__toggle");
      toggle.type = "button";
      toggle.setAttribute("aria-expanded", "false");
      const label = make("span", "slot__label", slot.label);
      const current = make("span", "slot__current");
      const weight = make("span", "slot__weight");
      toggle.append(label, current, weight);
      const choices = make("div", "slot__choices");
      choices.hidden = true;
      choices.setAttribute("role", "group");
      choices.setAttribute("aria-label", `${slot.label}: choose what to fit`);
      const buttons = choicesFor(slot).map(([id, name, weightLb, tag]) => {
        const button = make("button", "choice");
        button.type = "button";
        button.dataset.id = id;
        button.append(make("span", "choice__name", name), make("span", "choice__weight", weightLb ? `+${pounds(weightLb)}` : "—"));
        if (tag) button.append(make("span", `choice__tag${tag === "Starter" ? " is-starter" : ""}`, tag));
        button.addEventListener("click", () => choose(slot, id));
        choices.append(button);
        return button;
      });
      toggle.addEventListener("click", () => setOpen(slot.id));
      item.append(toggle, choices);
      if (slot.accepts === "module") item.append(make("p", "slot__note", "The torso slot itself is earned with Marks."));
      list.append(item);
      rows.set(slot.id, { item, toggle, current, weight, buttons });
    }

    const field = (name) => gauges.querySelector(`[data-g="${name}"]`);

    function draw() {
      for (const slot of data.slots) {
        const row = rows.get(slot.id);
        row.current.textContent = nameOf(fitted[slot.id]);
        row.weight.textContent = fitted[slot.id] ? pounds(weightOf(fitted[slot.id])) : "";
        for (const button of row.buttons) button.setAttribute("aria-pressed", String(button.dataset.id === fitted[slot.id]));
      }
      const loadout = loadouts.get(keyNow());
      if (!loadout) return;
      const over = loadout.operatingLb > mech.maxOperatingLb;
      gauges.classList.toggle("is-over", over);
      field("operating").textContent = pounds(loadout.operatingLb);
      field("mow").textContent = pounds(mech.maxOperatingLb);
      const share = (value) => `${((value - mech.emptyLb) / (heaviest - mech.emptyLb)) * 100}%`;
      field("weight-fill").style.width = share(loadout.operatingLb);
      field("mow-mark").style.left = share(mech.maxOperatingLb);
      field("load").textContent = over
        ? `Overloaded: ${loadout.loadPct}% of its carrying capacity. It still flies, slower and hotter.`
        : `${loadout.loadPct}% of its carrying capacity.`;
      field("speed").textContent = `${loadout.topSpeedMph.toFixed(1)} mph`;
      const lost = mech.topSpeedEmptyMph - loadout.topSpeedMph;
      field("speed-tax").textContent = lost > 0.05
        ? `${lost.toFixed(1)} mph under its ${mech.topSpeedEmptyMph.toFixed(1)} stripped`
        : `${(-lost).toFixed(1)} mph over its ${mech.topSpeedEmptyMph.toFixed(1)} stripped`;
      field("cooling").textContent = `${Math.round(loadout.coolingPct)}%`;
      if (loadout.flightSeconds !== undefined) {
        field("jets").textContent = `${loadout.flightSeconds.toFixed(1)} s`;
        field("jets-more").textContent = `of climb, to ${loadout.climbCeilingFt} ft (${mech.climbCeilingEmptyFt} ft stripped)`;
      } else {
        field("jets").textContent = "Not fitted";
        field("jets-more").textContent = "fit them in the centre torso";
      }
    }

    field("source").textContent = "Every figure comes from the game's own data, for a new pilot's VIGIL. Pre-alpha: they move as the game is tuned.";
    fit.querySelector(".fit__noscript").remove();
    gauges.hidden = false;
    draw();
  }
})();
