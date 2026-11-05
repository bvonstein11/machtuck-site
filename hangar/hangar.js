// The Hangar: the VIGIL's turntable and the loadout explorer. Every number comes from hangar-data.json, which the game
// writes (Vigil ▸ Website ▸ Export Hangar Data); this page only looks a loadout up and computes nothing of its own.
// Nothing is stored in the browser and nothing is sent anywhere.

(() => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // The turntable: 360 frames, one a degree, turned at thirty a second (a full turn in twelve seconds), so a 60 Hz screen
  // holds every frame for exactly two refreshes and the turn runs even. Until 2026-11-05 it was 72 frames five degrees
  // apart, stepped seven times a second, and it read choppy. It turns slowly by itself until the visitor
  // takes hold of it, by dragging, by the arrow keys or by the dial under it.
  const spin = document.querySelector("[data-spin]");
  if (spin) {
    const frames = 360, coarse = 5, perSecond = 30;
    const stage = spin.querySelector("[data-spin-stage]");
    const picture = spin.querySelector("[data-spin-frame]");
    const dial = spin.querySelector("[data-spin-dial]");
    dial.max = String(frames - 1);
    // Four paints, each its own 360 frames, filmed from the game (the hub's VIGIL under the hangar's lights). A paint comes
    // in two passes: every fifth degree first (72 frames, about 3 MB, all the page had before), then the degrees between,
    // those ahead of the turn first. A paint goes on once its first pass is in, and the turn only ever shows a frame that
    // has arrived: an <img> whose source moves on every 140 ms never finishes loading any new frame over a phone's
    // connection, so the old paint stayed on screen (2026-11-03, on an iPhone: the desert paint would not load). While a
    // paint's first pass comes in, its swatch fills as a ring. With data saving on, only the first pass is fetched.
    const thrifty = Boolean(navigator.connection && navigator.connection.saveData);
    let skin = "base", wanted = "base";
    const source = (index, paint) => `/hangar/spin/${paint}/vigil-${String(index).padStart(3, "0")}.webp`;
    const sets = new Map();
    let frame = 0;
    /** Fetches a paint's frames once, in its two passes; resolves when the first pass has settled. */
    const load = (paint, onProgress) => {
      if (!sets.has(paint)) {
        const set = { images: [], ready: new Array(frames).fill(false), settled: 0, listeners: [] };
        const fetchFrame = (index, settle) => {
          const img = new Image();
          img.decoding = "async";
          img.onload = () => { set.ready[index] = true; settle(); };
          img.onerror = () => settle();
          img.src = source(index, paint);
          set.images.push(img);
        };
        // The first pass from the angle on screen outward; the second from the angle on screen onward, the way it turns.
        const first = Array.from({ length: frames }, (_, k) => (frame + (k % 2 ? -1 : 1) * Math.ceil(k / 2) + frames) % frames)
          .filter((index) => index % coarse === 0);
        set.first = first.length;
        set.done = new Promise((resolve) => {
          for (const index of first) {
            fetchFrame(index, () => {
              set.settled++;
              for (const listener of set.listeners) listener(set.settled / set.first);
              if (set.settled < set.first) return;
              resolve(set);
              if (thrifty) return;
              for (let k = 0; k < frames; k++) {
                const index = (frame + k) % frames;
                if (index % coarse) fetchFrame(index, () => {});
              }
            });
          }
        });
        sets.set(paint, set);
      }
      const set = sets.get(paint);
      if (onProgress) { set.listeners.push(onProgress); onProgress(set.settled / set.first); }
      return set.done;
    };
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
    let drawn = "";
    const show = (index) => {
      frame = ((index % frames) + frames) % frames;
      const k = nearestReady(frame);
      if (k >= 0) {
        const want = source(k, skin);
        if (want !== drawn) { picture.src = want; drawn = want; }   // a frame still on its way leaves the last one up
      }
      dial.value = String(frame);
    };
    // The slow turn, timed by the screen's own refresh: it moves on by the time that has passed, so a late refresh never
    // slows it, and it rests while the turntable is off screen or the page is hidden. The count starts half a refresh's
    // worth in, so the steps land midway between refreshes and never flicker between two and three of them.
    let turning = false, inView = false, raf = 0, last = 0, carry = 0, fresh = true;
    const tick = (now) => {
      raf = 0;
      if (!turning || !inView || document.hidden) return;
      if (last) {
        const gained = (Math.min(now - last, 100) * perSecond) / 1000;
        if (fresh) { carry = gained / 2; fresh = false; }
        carry += gained;
        const step = Math.floor(carry);
        if (step) { carry -= step; show(frame + step); }
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!turning || !inView || document.hidden || raf) return;
      last = 0; fresh = true;
      raf = requestAnimationFrame(tick);
    };
    new IntersectionObserver((entries) => { inView = entries[entries.length - 1].isIntersecting; wake(); }).observe(stage);
    document.addEventListener("visibilitychange", wake);
    const takeHold = () => {
      turning = false;
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
      const step = { ArrowLeft: coarse, ArrowRight: -coarse }[event.key];   // five degrees a press, as before
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
      if (!reducedMotion && !stage.classList.contains("is-held")) { turning = true; wake(); }
    });

    // The bay's moving light: the game's HubBackdrop layers (bay.json), each between its low and full strength on its own
    // slow period, as HubBackdrop.Strength does it, and the arcs stepping through their eight frames at ten a second
    // (HubBackdrop.ArcFrame). With reduced motion they hold at the middle of their range, as the hub's still setting does.
    const bay = spin.querySelector("[data-bay]");
    if (bay) {
      fetch("/hangar/bay/bay.json").then((r) => (r.ok ? r.json() : Promise.reject(new Error("no bay")))).then((data) => {
        const shadow = bay.querySelector(".bay__shadow");
        const layers = [];
        for (const layer of data.layers) {
          if (layer.name === "plate") continue;
          const light = document.createElement("i");
          light.className = `bay__l bay__l--${layer.name}`;
          const [x, y, w, h] = layer.rect;
          Object.assign(light.style, { left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%`,
            backgroundImage: `url("/hangar/bay/${layer.file}")` });
          if (layer.frames > 1) light.style.backgroundSize = `100% ${layer.frames * 100}%`;
          layers.push({ light, low: layer.low ?? 1, period: layer.period ?? 0, frames: layer.frames, phase: Math.random() * 2 * Math.PI });
          bay.insertBefore(light, shadow);
        }
        const paint = (seconds) => {
          for (const l of layers) {
            const t = reducedMotion || !l.period ? 0.5 : 0.5 + 0.5 * Math.sin((seconds * 2 * Math.PI) / l.period + l.phase);
            l.light.style.opacity = (l.low + (1 - l.low) * t).toFixed(3);
            if (l.frames > 1) {
              const step = reducedMotion ? 0 : Math.floor(seconds * 10);
              l.light.style.backgroundPositionY = `${(((step + Math.floor(step / 5)) % l.frames) / (l.frames - 1)) * 100}%`;
            }
          }
        };
        paint(0);
        if (reducedMotion) return;
        let shown = false, raf = 0, last = 0;
        const tick = (now) => {
          raf = 0;
          if (!shown) return;
          if (now - last > 33) { last = now; paint(now / 1000); }   // about thirty a second is plenty for a slow glow
          raf = requestAnimationFrame(tick);
        };
        new IntersectionObserver((entries) => {
          shown = entries[entries.length - 1].isIntersecting;
          if (shown && !raf) raf = requestAnimationFrame(tick);
        }).observe(stage);
      }).catch(() => { /* the plate alone stays */ });
    }
  }

  // The fitting bay: tap a hardpoint to open its rack, pick what goes there, and the readout docked under the page follows.
  // Every choice in a rack first shows the loadout it would make (its weight, speed and cooling against what is fitted
  // now), looked up in the export like everything else here. The fit lives in the address (#fit=…), so a link shares it.
  const fit = document.querySelector("[data-fit]");
  const gauges = document.querySelector("[data-gauges]");
  if (!fit || !gauges) return;

  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const number = (value) => Math.round(value).toLocaleString("en-US");
  const pounds = (value) => `${number(value)} lb`;
  const signed = (value, digits, unit) => {
    const text = Math.abs(value).toFixed(digits);
    if (Number(text) === 0) return null;
    return `${value > 0 ? "+" : "−"}${digits ? text : number(Math.abs(value))}${unit}`;
  };

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
    const heaviest = Math.max(...data.loadouts.map((loadout) => loadout.operatingLb));
    const { mech } = data;
    let fitted = Object.fromEntries(data.slots.map((slot) => [slot.id, slot.default]));
    let touched = false;   // the address carries the fit once the visitor has changed it, or arrived with one

    /** The export's key for a fit: the arm weapons in the game's weapon order, the shoulder, the module. */
    const keyOf = (f) => {
      const arms = armSlots.map((id) => f[id]).sort((a, b) => armOrder.indexOf(a) - armOrder.indexOf(b));
      return `${arms.join("+")}|${f[shoulderSlot]}|${f[moduleSlot]}`;
    };
    /** The fit a choice would make. Arms carry three different weapons: picking one another arm holds swaps the two. */
    const withChoice = (f, slot, id) => {
      const next = { ...f };
      if (slot.accepts === "arm") {
        const other = armSlots.find((armId) => armId !== slot.id && next[armId] === id);
        if (other) next[other] = next[slot.id];
      }
      next[slot.id] = id;
      return next;
    };
    /** A fit from the address or a named loadout: slot by slot, in the slots' order. Anything illegal is refused. */
    const parseFit = (list) => {
      if (list.length !== data.slots.length) return null;
      const next = {};
      for (const [i, slot] of data.slots.entries()) {
        const id = list[i];
        const ok = slot.accepts === "module" ? id === "" || modules.has(id) : weapons.get(id)?.slot === slot.accepts;
        if (!ok) return null;
        next[slot.id] = id;
      }
      return loadouts.has(keyOf(next)) ? next : null;
    };
    const fromKey = (key) => parseFit(key.replace("|", "+").split(/[+|]/));
    const presets = (window.VIGIL_LOADOUTS || []).map((preset) => ({ ...preset, fit: fromKey(preset.key) })).filter((preset) => preset.fit);

    const nameOf = (id) => (modules.get(id)?.name ?? (id || "Empty"));
    const weightOf = (id) => (weapons.get(id) ?? modules.get(id))?.weightLb ?? 0;
    const choicesFor = (slot) => (slot.accepts === "module"
      ? [["", "Empty", ""], ...data.modules.map((module) => [module.id, module.name, "Earned with Marks"])]
      : data.weapons.filter((weapon) => weapon.slot === slot.accepts).map((weapon) => [weapon.id, weapon.id, weapon.earnedWithMarks ? "Earned with Marks" : "Basic"]));

    // ── the named loadouts, to start from ──────────────────────────────────────────────────────────────────────────
    const presetRow = fit.querySelector("[data-fit-presets]");
    presetRow.append(make("span", "fit__label", "Start from"));
    const presetButtons = presets.map((preset) => {
      const button = make("button", "preset");
      button.type = "button";
      button.append(make("span", "preset__name", preset.label), make("span", "preset__lb", pounds(loadouts.get(preset.key).operatingLb)));
      button.addEventListener("click", () => { fitted = { ...preset.fit }; touched = true; setOpen(null); draw(); });
      presetRow.append(button);
      return button;
    });

    // ── the hardpoints, each with its rack ─────────────────────────────────────────────────────────────────────────
    const list = fit.querySelector("[data-fit-slots]");
    const rows = new Map();
    let open = null;
    const setOpen = (slotId) => {
      open = slotId;
      for (const [id, row] of rows) {
        const isOpen = id === open;
        row.item.classList.toggle("is-open", isOpen);
        row.toggle.setAttribute("aria-expanded", String(isOpen));
        row.rack.hidden = !isOpen;
      }
      if (open) rows.get(open).item.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
    };
    for (const slot of data.slots) {
      const item = make("li", "hardpoint");
      const toggle = make("button", "hardpoint__toggle");
      toggle.type = "button";
      toggle.setAttribute("aria-expanded", "false");
      const current = make("span", "hardpoint__current");
      const weight = make("span", "hardpoint__weight");
      toggle.append(make("span", "hardpoint__label", slot.label), current, weight, make("span", "hardpoint__change", "Change"));
      const rack = make("div", "rack");
      rack.hidden = true;
      rack.setAttribute("role", "group");
      rack.setAttribute("aria-label", `${slot.label}: choose what to fit`);
      const choices = choicesFor(slot).map(([id, name, tag]) => {
        const button = make("button", "choice");
        button.type = "button";
        const effect = make("span", "choice__effect");
        button.append(make("span", "choice__name", name), make("span", "choice__weight", weightOf(id) ? pounds(weightOf(id)) : "—"), effect);
        if (tag) button.append(make("span", `choice__tag${tag === "Basic" ? " is-basic" : ""}`, tag));
        button.addEventListener("click", () => { fitted = withChoice(fitted, slot, id); touched = true; draw(); });
        rack.append(button);
        return { id, button, effect };
      });
      toggle.addEventListener("click", () => setOpen(open === slot.id ? null : slot.id));
      item.append(toggle, rack);
      if (slot.accepts === "module") item.append(make("p", "hardpoint__note", "The torso slot itself is earned with Marks."));
      list.append(item);
      rows.set(slot.id, { slot, item, toggle, current, weight, rack, choices });
    }

    // ── the readout ────────────────────────────────────────────────────────────────────────────────────────────────
    const field = (name) => gauges.querySelector(`[data-g="${name}"]`);
    const hashOf = (f) => `#fit=${data.slots.map((slot) => f[slot.id]).join(",")}`;
    const share = (value) => `${((value - mech.emptyLb) / (heaviest - mech.emptyLb)) * 100}%`;
    field("mow").textContent = `Max ${number(mech.maxOperatingLb)}`;
    field("mow-mark").style.left = share(mech.maxOperatingLb);
    let shownLb = null, deltaTimer = 0;

    /** What a choice would change, against the loadout fitted now. */
    function effectOf(now, next) {
      const parts = [signed(next.operatingLb - now.operatingLb, 0, " lb"), signed(next.topSpeedMph - now.topSpeedMph, 1, " mph"),
        signed(Math.round(next.coolingPct) - Math.round(now.coolingPct), 0, "% cooling")].filter(Boolean);
      const wasOver = now.operatingLb > mech.maxOperatingLb, isOver = next.operatingLb > mech.maxOperatingLb;
      const line = isOver && !wasOver ? "over max" : isOver ? "still over max" : wasOver ? "under max" : "";
      return { text: [parts.join(" · ") || "No change", line].filter(Boolean).join(" · "), crosses: isOver && !wasOver, still: isOver && wasOver };
    }

    function draw() {
      const key = keyOf(fitted);
      const loadout = loadouts.get(key);
      if (!loadout) return;
      for (const row of rows.values()) {
        const id = fitted[row.slot.id];
        row.current.textContent = nameOf(id);
        row.weight.textContent = id ? pounds(weightOf(id)) : "";
        for (const choice of row.choices) {
          const next = loadouts.get(keyOf(withChoice(fitted, row.slot, choice.id)));
          const holder = row.slot.accepts === "arm" && choice.id !== id ? rows.get(armSlots.find((armId) => fitted[armId] === choice.id)) : null;
          const effect = choice.id === id ? { text: "Fitted" } : holder ? { text: `Swaps with the ${holder.slot.label.toLowerCase()}` } : next ? effectOf(loadout, next) : { text: "" };
          choice.button.setAttribute("aria-pressed", String(choice.id === id));
          choice.effect.textContent = effect.text;
          choice.button.classList.toggle("is-over", Boolean(effect.crosses));
          choice.button.classList.toggle("is-still-over", Boolean(effect.still));
        }
      }
      for (const [i, preset] of presets.entries()) presetButtons[i].setAttribute("aria-pressed", String(preset.key === key));

      const over = loadout.operatingLb > mech.maxOperatingLb;
      gauges.classList.toggle("is-over", over);
      field("operating").textContent = number(loadout.operatingLb);
      field("weight-fill").style.width = share(loadout.operatingLb);
      field("load").textContent = over
        ? `Overloaded: ${loadout.loadPct}% of its carrying capacity. It still flies, slower and hotter.`
        : `${loadout.loadPct}% of its carrying capacity.`;
      field("speed").textContent = loadout.topSpeedMph.toFixed(1);
      const lost = mech.topSpeedEmptyMph - loadout.topSpeedMph;
      field("speed-tax").textContent = `${lost > 0.05 ? "−" : "+"}${Math.abs(lost).toFixed(1)} from ${mech.topSpeedEmptyMph} stripped`;
      field("cooling").textContent = `${Math.round(loadout.coolingPct)}%`;
      if (loadout.flightSeconds !== undefined) {
        field("jets").textContent = `${loadout.flightSeconds.toFixed(1)} s`;
        field("jets-more").textContent = `of climb, to ${loadout.climbCeilingFt} ft`;
      } else {
        field("jets").textContent = "None";
        field("jets-more").textContent = "fit them in the centre torso";
      }
      if (shownLb !== null && shownLb !== loadout.operatingLb) {   // a change shows its size for a moment, where it lands
        const delta = field("delta");
        delta.textContent = signed(loadout.operatingLb - shownLb, 0, " lb");
        delta.classList.remove("is-on"); void delta.offsetWidth; delta.classList.add("is-on");
        gauges.classList.remove("is-changed"); void gauges.offsetWidth; gauges.classList.add("is-changed");
        clearTimeout(deltaTimer);
        deltaTimer = setTimeout(() => { delta.classList.remove("is-on"); gauges.classList.remove("is-changed"); }, 1800);
      }
      shownLb = loadout.operatingLb;
      if (touched && location.hash !== hashOf(fitted)) history.replaceState(null, "", hashOf(fitted));
    }

    // ── share: the fit is in the address ───────────────────────────────────────────────────────────────────────────
    const shareRow = fit.querySelector("[data-fit-share-row]");
    const shareButton = fit.querySelector("[data-fit-share]");
    const shared = fit.querySelector("[data-fit-shared]");
    shareButton.addEventListener("click", async () => {
      const url = `${location.origin}${location.pathname}${hashOf(fitted)}`, title = "My VX-21 VIGIL loadout · The Reach: Unknown";
      try {
        if (navigator.share) { await navigator.share({ title, url }); return; }
        await navigator.clipboard.writeText(url);
        shared.textContent = "Link copied.";
      } catch (error) {
        if (error && error.name === "AbortError") return;
        shared.textContent = "Copy the address bar to share it.";
      }
    });

    const fromAddress = () => {
      const match = location.hash.match(/^#fit=([^&]*)$/);
      return match ? parseFit(decodeURIComponent(match[1]).split(",")) : null;
    };
    const arrived = fromAddress();
    if (arrived) { fitted = arrived; touched = true; }
    window.addEventListener("hashchange", () => { const next = fromAddress(); if (next) { fitted = next; touched = true; draw(); } });

    fit.querySelector(".fit__noscript").remove();
    gauges.hidden = false;
    shareRow.hidden = false;
    draw();
  }
})();
