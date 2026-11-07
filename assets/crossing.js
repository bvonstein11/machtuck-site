// The Crossing: the journey map, on the Archive's own picture. The small ship leaves first, then the Archive; the advance crew
// lands and switches on the signal; the Archive flies closer and sends help ahead; the signal stops. It always comes back to
// where the Archive is now and when it should arrive. Every date comes from Voyage (assets/ship.js).

/** The story as beats on the voyage's scale. Pure arithmetic, so the check can run it without a page. */
const Crossing = (() => {
  const { archive, ships, logs, now, monthYear, progressAt } = Voyage;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const logBeats = logs.filter(entry => entry.y <= now).map(entry => ({
    id: `log-${entry.log}`, y: entry.y, when: Voyage.dayStamp(entry.date), title: `Voyage Log ${entry.log}.`,
    text: "Recorded aboard on this date.", art: "archive", log: entry.log,
  }));
  const beats = [
    { id: "advance", y: ships.advance.leave, when: monthYear(ships.advance.leave), title: "A small ship went first.",
      text: "A few hundred crew left two years ahead of the Archive, on a faster ship, to make a place for the rest of us.", art: "story-advance", phone: "66% 50%" },
    { id: "archive", y: archive.depart, when: "19 Jan 3310", title: "The Archive left Earth.",
      text: "Families came aboard with young children. It carried everything worth saving, and the memory of what went wrong.", art: "story-archive", phone: "62% 50%" },
    { id: "awake", y: (archive.coast + ships.advance.land) / 2, when: "More than thirty years", title: "We crossed awake.",
      text: "Children were born aboard who would never see Earth, and every deck trained for the work waiting on the ground.", art: "story-crossing", phone: "56% 45%" },
    { id: "landed", y: ships.advance.land, when: monthYear(ships.advance.land), title: "The advance crew landed.",
      text: "Seventeen years after they left Earth, they came down on open ground, with nothing built.", art: "reach-landing", focus: "22% 68%", phone: "20% 68%" },
    { id: "signal", y: ships.signal.on, when: monthYear(ships.signal.on), title: "They switched on the signal.",
      text: "Three years on, they knew it could be done. Now watch it cross, at the speed of light.", art: "reach-camp", focus: "22% 68%", phone: "20% 68%" },
    { id: "heard", y: ships.signal.heard, when: monthYear(ships.signal.heard), title: "It reached us.",
      text: "The signal told the Archive they had made it, and every deck had hope.", art: "archive", phone: "78% 50%" },
    { id: "help", y: ships.supply.leave, when: monthYear(ships.supply.leave), title: "We sent help ahead.",
      text: "A faster ship left the Archive with new materials, and young people to help and to learn.", art: "archive", phone: "78% 50%" },
    { id: "helped", y: ships.supply.land, when: monthYear(ships.supply.land), title: "The supply ship landed.",
      text: "Every picture they sent showed more: shelters, then domes, then fields. Every year we flew closer.", art: "story-supply", phone: "44% 34%" },
    { id: "silence", y: ships.signal.lastHeard, when: monthYear(ships.signal.lastHeard), title: "Then the signal stopped.",
      text: "The logs didn't come anymore. Deck by deck, no one could agree on what it meant.", art: "archive", dim: true, phone: "78% 50%" },
    ...logBeats,
    { id: "now", y: now, when: "Now", title: "The Archive is still coming.",
      text: "This is where it stands today, on the ship's own clock.", art: "archive", phone: "78% 50%" },
    { id: "orbit", y: archive.arrive, when: "22 Oct 3342", title: "Anticipated arrival.",
      text: "If nothing changes, the Archive reaches orbit over The Reach on this date.", art: "story-centauri", phone: "72% 52%" },
  ].sort((a, b) => a.y - b.y);

  /** How far along the route each ship is, from 0 at Earth to 1 at The Reach. */
  const advanceShare = y => clamp((y - ships.advance.leave) / (ships.advance.land - ships.advance.leave), 0, 1);
  const supplyStart = progressAt(ships.supply.leave);
  const supplyShare = y => supplyStart + (1 - supplyStart) * clamp((y - ships.supply.leave) / (ships.supply.land - ships.supply.leave), 0, 1);

  /** Where a pulse of the signal sent at `sent` stands at `y`. Light covers one light-year in a year, whatever the ships do. */
  const pulseShare = (sent, y) => 1 - (y - sent) / archive.lightYears;

  /** The moment a pulse sent at `sent` meets the Archive, found by halving: the check holds this to the story's timeline. */
  function pulseMeetsArchive(sent) {
    let low = sent, high = archive.arrive;
    for (let i = 0; i < 40; i++) {
      const middle = (low + high) / 2;
      if (pulseShare(sent, middle) > progressAt(middle)) low = middle; else high = middle;
    }
    return (low + high) / 2;
  }

  /** The beat a moment belongs to: the latest one it has passed. */
  function beatAt(y) {
    let found = beats[0];
    for (const beat of beats) if (beat.y <= y + 1e-6) found = beat;
    return found;
  }

  return { beats, advanceShare, supplyShare, pulseShare, pulseMeetsArchive, beatAt };
})();

(() => {
  if (typeof document === "undefined") return;
  const root = document.querySelector("[data-crossing]");
  if (!root) return;

  const { archive, ships } = Voyage;
  const { beats } = Crossing;
  const stage = root.querySelector(".crossing__stage");
  const canvas = root.querySelector("[data-route]");
  const ctx = canvas.getContext("2d");
  const out = name => root.querySelector(`[data-out="${name}"]`);
  const range = root.querySelector("[data-range]");
  const playButton = root.querySelector("[data-play]");
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = navigator.connection && navigator.connection.saveData;
  const narrow = window.matchMedia("(max-width: 760px)");
  const START = beats[0].y - 0.5, END = archive.arrive;
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#e08a3c";
  const mono = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim() || "monospace";

  let y = Voyage.voyageTime(Voyage.shipNow()), following = true, playing = false, played = false, seen = false, onScreen = false;
  let segment = 0, segmentAt = 0, dirty = true, shownBeat = null, width = 0, height = 0, wanted = null;
  const AHEAD = { id: "ahead", when: "Still ahead", title: "Not flown yet.",
    text: "From here the line is the plan: a braking burn from 30 Aug 3342, then a last week's approach.", art: "archive", phone: "78% 50%" };

  // ---------- the pictures: two layers, and a new picture only takes the stage once it has arrived ----------
  const layers = [0, 1].map(() => {
    const image = document.createElement("img");
    image.className = "crossing__art"; image.alt = ""; image.setAttribute("aria-hidden", "true");
    stage.insertBefore(image, stage.querySelector(".crossing__shade"));
    return image;
  });
  let front = 0;
  const big = () => (stage.clientWidth * (window.devicePixelRatio || 1)) > 1400;
  const fileFor = art => (art === "archive" ? (big() ? "/assets/img/archive-full.webp" : "/assets/img/archive-1280.webp") : `/assets/img/${art}-${big() ? 2560 : 1280}.webp`);
  const loaded = new Map();
  function fetchArt(art) {
    const src = fileFor(art);
    if (!loaded.has(src)) {
      const image = new Image();
      image.decoding = "async";
      image.src = src;
      loaded.set(src, (image.decode ? image.decode() : Promise.resolve()).then(() => src));
    }
    return loaded.get(src);
  }
  function show(beat) {
    wanted = beat;
    fetchArt(beat.art).then(src => {
      if (wanted !== beat) return;
      const next = layers[1 - front];
      next.src = src;
      next.style.objectPosition = narrow.matches ? (beat.phone || "50% 50%") : (beat.focus || "50% 50%");
      next.classList.toggle("is-dim", !!beat.dim);
      next.classList.add("is-on");
      layers[front].classList.remove("is-on");
      front = 1 - front;
    }).catch(() => {});
    const index = beats.indexOf(beat);
    [beats[index + 1], beats[index + 2]].forEach(ahead => { if (ahead) fetchArt(ahead.art).catch(() => {}); });
  }

  // ---------- the words and the readouts ----------
  function write() {
    const passed = following ? beats.find(b => b.id === "now") : Crossing.beatAt(y);
    const beat = passed.id === "now" && !following && y > Voyage.now + 0.01 ? AHEAD : passed;
    if (beat !== shownBeat) {
      shownBeat = beat;
      out("when").textContent = beat.when;
      out("title").textContent = beat.title;
      out("text").textContent = beat.text;
      const link = out("watch");
      const entry = beat.log && PUBLISHED_LOGS.find(item => item.log === beat.log);
      link.hidden = !(entry && entry.url);
      if (entry && entry.url) link.href = entry.url;
      show(beat);
    }
    const share = Voyage.progressAt(y);
    const state = y >= archive.arrive ? "In orbit" : y < archive.depart ? "At Earth" : "In transit";
    out("state").textContent = state;
    out("date").textContent = following && !narrow.matches ? Voyage.stamp(Voyage.shipNow(), true) : Voyage.dayStamp(following ? Voyage.shipNow() : Voyage.dateAt(y));
    out("crossed").textContent = `${(Math.floor(share * 1000) / 10).toFixed(1)}%`;
    out("left").textContent = `${((1 - share) * archive.lightYears).toFixed(2)} ly`;
    out("speed").textContent = `${Voyage.speedAt(y).toFixed(3)} c`;
    const days = Math.max(0, Math.ceil((Voyage.arrivesAt - Date.now()) / 86400000));
    out("eta").textContent = `${days.toLocaleString("en-US")} days from now`;
    range.value = y;
    range.setAttribute("aria-valuetext", `${beat.when}: ${beat.title}`);
    root.classList.toggle("is-now", following);
    root.classList.toggle("is-ahead", !following && y > Voyage.now);
  }

  // ---------- the route and the timeline ----------
  const SIDE = () => (width < 620 ? 34 : 64);
  const routeX = share => SIDE() + share * (width - SIDE() * 2);
  const timeX = at => SIDE() + (at - START) / (END - START) * (width - SIDE() * 2);
  const timeAt = x => START + Math.max(0, Math.min(1, (x - SIDE()) / (width - SIDE() * 2))) * (END - START);

  function fit() {
    const box = canvas.getBoundingClientRect(), scale = Math.min(2, window.devicePixelRatio || 1);
    width = box.width; height = box.height;
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    dirty = true;
  }
  const tag = (text, x, top, colour, size = 12) => {
    ctx.font = `600 ${size}px ${mono}`;
    ctx.fillStyle = colour;
    const wide = ctx.measureText(text).width;
    ctx.textAlign = "left";
    ctx.fillText(text, Math.max(2, Math.min(width - wide - 2, x - wide / 2)), top);
  };
  function glow(x, line, radius, colour) {
    const g = ctx.createRadialGradient(x, line, 0, x, line, radius);
    g.addColorStop(0, colour); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, line, radius, 0, 6.2832); ctx.fill();
  }
  function dart(x, line, colour, length) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(x + length, line); ctx.lineTo(x - length * 0.6, line - length * 0.55); ctx.lineTo(x - length * 0.25, line); ctx.lineTo(x - length * 0.6, line + length * 0.55);
    ctx.closePath(); ctx.fill();
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    const line = height * 0.36, rail = height * 0.78, share = Voyage.progressAt(y);

    // the route: Earth to The Reach, gone over in amber, still ahead in dashes
    const startX = routeX(0), endX = routeX(1), shipX = routeX(share);
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 7]);
    ctx.strokeStyle = "rgba(232,228,220,0.45)";
    ctx.beginPath(); ctx.moveTo(shipX, line); ctx.lineTo(endX, line); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = accent; ctx.lineWidth = 3;
    if (y >= archive.depart) { ctx.beginPath(); ctx.moveTo(startX, line); ctx.lineTo(shipX, line); ctx.stroke(); }

    // the light-years, so "how far" means something
    ctx.fillStyle = "rgba(232,228,220,0.5)";
    for (let ly = 1; ly < archive.lightYears; ly++) ctx.fillRect(routeX(ly / archive.lightYears) - 0.5, line + 7, 1, 6);

    // Earth and The Reach
    glow(startX, line, 22, "rgba(200,150,100,0.55)");
    ctx.fillStyle = "#c79a6c"; ctx.beginPath(); ctx.arc(startX, line, 7, 0, 6.2832); ctx.fill();
    const lit = y >= ships.advance.land;
    const quiet = y >= ships.signal.lastSent;
    glow(endX, line, lit && !quiet ? 34 : 24, lit && !quiet ? "rgba(120,220,255,0.75)" : "rgba(120,190,255,0.4)");
    ctx.fillStyle = "#8fd2ff"; ctx.beginPath(); ctx.arc(endX, line, 8, 0, 6.2832); ctx.fill();
    tag("EARTH", startX, line + 30, "rgba(232,228,220,0.9)");
    tag("THE REACH", endX, line + 30, "rgba(232,228,220,0.9)");

    // the signal, crossing at the speed of light, and gone once it has passed the ship
    if (y > ships.signal.on) {
      ctx.strokeStyle = "rgba(130,235,255,0.8)"; ctx.lineWidth = 2;
      for (let sent = ships.signal.on; sent < Math.min(y, ships.signal.lastSent); sent += 0.14) {
        const place = Crossing.pulseShare(sent, y);
        if (place < share || place > 1) continue;
        ctx.beginPath(); ctx.arc(routeX(place), line, 9, Math.PI * 0.68, Math.PI * 1.32); ctx.stroke();
      }
    }

    // the small ships
    if (y >= ships.advance.leave && y < ships.advance.land) {
      const x = routeX(Crossing.advanceShare(y));
      glow(x, line, 16, "rgba(255,255,255,0.55)");
      dart(x, line, "#ffffff", 8);
      tag("ADVANCE CREW", x, line - 18, "#ffffff");
    }
    if (y >= ships.supply.leave && y < ships.supply.land) {
      const x = routeX(Crossing.supplyShare(y));
      glow(x, line, 16, "rgba(140,255,210,0.6)");
      dart(x, line, "#a8ffd8", 8);
      tag("SUPPLY SHIP", x, line - 34, "#a8ffd8");
    }

    // the Archive
    if (y >= archive.depart) {
      glow(shipX, line, 26, "rgba(255,170,90,0.7)");
      ctx.fillStyle = "#fff0dc";
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(shipX - 11, line - 4, 22, 8, 4) : ctx.rect(shipX - 11, line - 4, 22, 8);
      ctx.fill();
      if (share > 0.5) tag("ARCHIVE", shipX, line - 16, accent); else tag("ARCHIVE", shipX, line + 30, accent);
    }

    // the timeline you drag: every beat a dot, the years marked, what is still ahead in dashes
    const nowX = timeX(Voyage.now), headX = timeX(y);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(232,228,220,0.5)";
    ctx.beginPath(); ctx.moveTo(timeX(START), rail); ctx.lineTo(nowX, rail); ctx.stroke();
    ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.moveTo(nowX, rail); ctx.lineTo(timeX(END), rail); ctx.stroke();
    ctx.setLineDash([]);
    const everyYears = width < 620 ? 10 : 5;
    ctx.font = `500 11px ${mono}`;
    for (let year = 3310; year <= 3340; year += everyYears) {
      const x = timeX(year - (3310 + 18 / 365.25 - archive.depart));
      ctx.fillStyle = "rgba(232,228,220,0.75)";
      ctx.textAlign = "center"; ctx.fillText(String(year), x, rail + 22);
      ctx.fillRect(x - 0.5, rail + 4, 1, 5);
    }
    ctx.textAlign = "left";
    for (const beat of beats) {
      const x = timeX(beat.y), passed = beat.y <= y + 1e-6;
      ctx.fillStyle = passed ? accent : "rgba(232,228,220,0.85)";
      ctx.beginPath(); ctx.arc(x, rail, beat.id === "now" ? 6 : 4, 0, 6.2832); ctx.fill();
    }
    tag("NOW", nowX, rail - 11, "#ffffff", 11);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(headX - 1, rail - 15, 2, 30);
    ctx.beginPath(); ctx.arc(headX, rail, 8, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.stroke();
  }

  // ---------- moving through it ----------
  const setPlaying = on => {
    playing = on;
    root.classList.toggle("is-playing", on);
    playButton.querySelector("span").textContent = on ? "Pause" : "Play the crossing";
    out("words").setAttribute("aria-live", on ? "off" : "polite");
    dirty = true;
  };
  function goTo(at) {
    following = false;
    y = END - at < 0.03 ? END : Math.max(START, at);
    dirty = true;
  }
  function goToNow() {
    setPlaying(false);
    following = true;
    y = Voyage.voyageTime(Voyage.shipNow());
    dirty = true;
  }
  const easing = u => { const s = u * u; return s * s * (3 - 2 * s); };
  function startPlay() {
    following = false;
    const nowBeat = beats.findIndex(beat => beat.id === "now");
    let from = beats.findIndex(beat => beat.y > y + 1e-6) - 1;
    if (from < 0 || from >= nowBeat) { from = 0; y = beats[0].y; }
    segment = from; segmentAt = 0;
    played = true;
    setPlaying(true);
    fetchArt(beats[segment].art).catch(() => {});
  }
  function tickPlay(dt) {
    const nowBeat = beats.findIndex(beat => beat.id === "now");
    segmentAt += dt / 3.5;
    while (segmentAt >= 1) {
      segmentAt -= 1;
      segment++;
      if (segment >= nowBeat) { goToNow(); return; }
    }
    y = beats[segment].y + (beats[segment + 1].y - beats[segment].y) * easing(segmentAt);
    dirty = true;
  }

  let last = 0, raf = 0;
  function frame(time) {
    raf = 0;
    const dt = Math.min(0.1, (time - last) / 1000 || 0); last = time;
    if (playing && onScreen) tickPlay(dt);
    if (dirty) { dirty = false; write(); draw(); }
    if (playing && onScreen) schedule();
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(frame); }
  const redraw = () => { dirty = true; schedule(); };

  let grabbed = false;
  const fromEvent = e => goTo(timeAt(e.clientX - canvas.getBoundingClientRect().left));
  canvas.addEventListener("pointerdown", e => {
    grabbed = true;
    played = true;
    setPlaying(false);
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    fromEvent(e); redraw();
  });
  canvas.addEventListener("pointermove", e => { if (grabbed) { fromEvent(e); redraw(); } });
  const drop = () => { grabbed = false; };
  canvas.addEventListener("pointerup", drop);
  canvas.addEventListener("pointercancel", drop);
  range.min = START; range.max = END; range.step = "any";
  range.addEventListener("input", () => { played = true; setPlaying(false); goTo(Number(range.value)); redraw(); });

  playButton.addEventListener("click", () => {
    if (playing) setPlaying(false); else startPlay();
    last = performance.now(); redraw();
  });
  root.querySelector("[data-now]").addEventListener("click", () => { played = true; goToNow(); redraw(); });
  const step = direction => {
    played = true; setPlaying(false);
    const here = following ? Voyage.now : y;
    const target = direction > 0 ? beats.find(beat => beat.y > here + 1e-3) : [...beats].reverse().find(beat => beat.y < here - 1e-3);
    if (!target) return;
    if (target.id === "now") goToNow(); else goTo(target.y);
    redraw();
  };
  root.querySelector("[data-prev]").addEventListener("click", () => step(-1));
  root.querySelector("[data-next]").addEventListener("click", () => step(1));

  // ---------- going live ----------
  root.classList.add("is-live");
  fit();
  window.addEventListener("resize", () => { fit(); schedule(); });
  if ("ResizeObserver" in window) new ResizeObserver(() => { fit(); schedule(); }).observe(canvas);
  setInterval(() => { if (following && onScreen) { y = Voyage.voyageTime(Voyage.shipNow()); redraw(); } }, 1000);

  new IntersectionObserver(entries => {
    const entry = entries[entries.length - 1];
    const was = onScreen;
    onScreen = entry.intersectionRatio >= 0.35;
    if (onScreen && !was) { last = performance.now(); schedule(); }
    if (onScreen && !seen) {
      seen = true;
      if (!calm && !saveData && !played) startPlay();
      redraw();
    }
  }, { threshold: [0, 0.35, 0.6] }).observe(stage);

  // the first picture and the opening frame, before anyone reaches it
  new IntersectionObserver((entries, watcher) => {
    if (entries.some(entry => entry.isIntersecting)) { watcher.disconnect(); redraw(); }
  }, { rootMargin: "600px 0px" }).observe(stage);

  window.__crossingState = () => ({ y, following, playing, beat: shownBeat && shownBeat.id, onScreen });
})();
