// The Crossing: the Archive's voyage as a navigation chart, seen from aboard. Three views share one clock (assets/ship.js):
// INTERSTELLAR, the straight crossing from the Sun to Alpha Centauri; DEPARTURE, the climb out of the solar system during
// the first burn; ARRIVAL, the capture into orbit around The Reach. It opens where the ship's clock stands today; what lies
// ahead of that is drawn as planned. Local systems are schematic; only the interstellar line is drawn to its distances.

const { archive: ARCHIVE } = Voyage;
const NOW = Voyage.now;
const SPAN_START = ARCHIVE.depart;
const SPAN_END = ARCHIVE.arrive;

/** The milestones under the timeline. Dates are the story's calendar; `text` is what the phase panel says on the day. */
const MILESTONES = [
  { at: ARCHIVE.depart, name: "Launch", date: "19 Jan 3310",
    text: "Humanity's evacuation ship leaves Earth orbit. Survey probes went out first, and the nearest star answered first: an Earth-like world, with water. Earth could not wait for a second answer." },
  { at: ARCHIVE.coast, name: "Cruise", date: "07 Mar 3310",
    text: "The engines go quiet. The Archive coasts at 0.130 of the speed of light, and nobody aboard sleeps through it: the crossing is made awake." },
  { at: (ARCHIVE.coast + ARCHIVE.arrive) / 2, name: "Halfway", date: "Jul 3326",
    text: "Sixteen years out. People are born, grow up, grow old and die aboard. A generation is coming of age that has never seen Earth." },
  { at: ARCHIVE.brake, name: "Braking", date: "30 Aug 3342",
    text: "Forty-six days at one gravity again, to stop." },
  { at: ARCHIVE.arrive, name: "Orbit", date: "22 Oct 3342",
    text: "The Archive reaches orbit over The Reach at the end of a 32.63-year voyage. The generation that arrives is not the one that left." },
  ...Voyage.logs.map((entry) => ({
    at: entry.y, name: `Log ${entry.log}`, isLog: true,
    date: Voyage.dayStamp(entry.date).replace(/ ([A-Z])([A-Z]{2}) /, (_, first, rest) => ` ${first}${rest.toLowerCase()} `),
    text: `Voyage Log ${entry.log} was recorded aboard on this date.` })),
].sort((a, b) => a.at - b.at);

/** What the phase panel says between milestones. */
const PHASES = {
  departure: ["Departure burn.", "One gravity for 46 days, climbing out of the solar system."],
  cruise: ["Interstellar cruise.", "The engines are quiet. The Archive coasts at 0.130 of the speed of light, and everyone aboard is awake."],
  braking: ["Braking burn.", "Forty-six days at one gravity, to stop."],
  approach: ["Final approach.", "A week over the last three million kilometers, at about five kilometers a second."],
  orbit: ["In orbit over The Reach.", "The Archive stays in orbit, and every drop to the surface starts here."],
};

const VIEWS = {
  interstellar: { title: "Interstellar cruise",
    note: "Not to scale: star sizes and local systems are schematic. The crossing itself is a nearly straight line." },
  departure: { title: "Departure · the solar system",
    note: "Schematic: distance from the Sun is on a stretched scale. The heliopause is approximate and has no edge you could see." },
  arrival: { title: "Arrival · Alpha Centauri",
    note: "Schematic: orbits and positions are illustrative, not where the bodies stand on any given day." },
};

const LIGHT_SPEED_KMS = 299792.458;
const SVG_NS = "http://www.w3.org/2000/svg";
const make = (name, attributes = {}, parent) => {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (parent) parent.appendChild(element);
  return element;
};
const label = (parent, x, y, text, className, anchor = "middle") =>
  Object.assign(make("text", { x, y, "text-anchor": anchor, class: className }, parent), { textContent: text });
const pointList = (points) => points.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ");

/** Deterministic noise for the star field, so every visit sees the same faint sky. No star in it is a real star. */
function seededRandom(seed) {
  let state = seed;
  return () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296; };
}

/** Three significant figures with thousands separators: 38,973 becomes 39,000. */
function roughly(value) {
  if (value === 0) return "0";
  const digits = Math.floor(Math.log10(Math.abs(value))) + 1;
  const step = 10 ** Math.max(0, digits - 3);
  return (Math.round(value / step) * step).toLocaleString("en-US");
}

/** Builds one chart into its section and wires its controls. */
function mountVoyage(root) {
  const chart = root.querySelector("[data-voyage-chart]");
  const scrubber = root.querySelector("[data-voyage-scrubber]");
  const playButton = root.querySelector("[data-voyage-play]");
  const nowButton = root.querySelector("[data-voyage-now]");
  const logButton = root.querySelector("[data-voyage-latest-log]");
  const milestoneList = root.querySelector("[data-voyage-milestones]");
  const viewButtons = [...root.querySelectorAll("[data-view]")];
  const viewTitle = root.querySelector("[data-view-title]");
  const viewNote = root.querySelector("[data-view-note]");
  const readout = (name) => root.querySelector(`[data-readout='${name}']`);
  const phaseName = root.querySelector("[data-phase='name']");
  const phaseText = root.querySelector("[data-phase='text']");
  const phaseNote = root.querySelector("[data-phase='note']");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const EPSILON = 0.004; // about a day and a half on the voyage's scale
  let shown = NOW;
  let view = "interstellar";
  let moveArchive = () => {};

  // The milestone buttons: name and date, planned ones marked, published logs among them.
  const milestoneButtons = MILESTONES.map((milestone) => {
    const planned = milestone.at > NOW + EPSILON;
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "voyage__milestone";
    button.classList.toggle("is-planned", planned);
    button.classList.toggle("is-log", Boolean(milestone.isLog));
    button.append(Object.assign(document.createElement("b"), { textContent: milestone.name }),
      Object.assign(document.createElement("span"), { textContent: milestone.date }));
    button.setAttribute("aria-label", `${milestone.name}, ${milestone.date}${planned ? ", planned" : ""}`);
    button.addEventListener("click", () => { stop(); setTime(milestone.at); });
    item.appendChild(button);
    milestoneList.appendChild(item);
    return button;
  });

  // "Latest log" appears once a log has been published.
  const latestLog = Voyage.logs.length ? Voyage.logs[Voyage.logs.length - 1] : null;
  if (latestLog) {
    logButton.hidden = false;
    logButton.addEventListener("click", () => { stop(); setTime(latestLog.y); });
  }
  nowButton.addEventListener("click", () => { stop(); setTime(NOW); });

  /** Draws the current view at the container's own pixel size, so its words stay readable on a phone. */
  function layout() {
    const width = Math.max(300, chart.clientWidth);
    const narrow = width < 640;
    const height = narrow ? Math.round(Math.max(250, width * 0.72)) : Math.round(Math.min(440, Math.max(340, width * 0.36)));
    chart.innerHTML = "";
    const svg = make("svg", { viewBox: `0 0 ${width} ${height}`, width, height, role: "img" }, chart);

    const random = seededRandom(3310);
    const stars = make("g", { class: "voyage__stars" }, svg);
    for (let i = 0, count = Math.round(width * height / 2400); i < count; i++) {
      make("circle", { cx: (random() * width).toFixed(1), cy: (random() * height).toFixed(1),
        r: (random() * 0.9 + 0.2).toFixed(2), opacity: (random() * 0.45 + 0.1).toFixed(2) }, stars);
    }

    const draw = { interstellar: drawInterstellar, departure: drawDeparture, arrival: drawArrival }[view];
    moveArchive = draw(svg, width, height, narrow);
    svg.setAttribute("aria-label", `${VIEWS[view].title}. ${VIEWS[view].note}`);
    update();
  }

  /** A small crosshair for the Archive: a ring, four ticks and a label. */
  function archiveMarker(svg) {
    const group = make("g", { class: "voyage__ship" }, svg);
    make("circle", { r: 9, class: "voyage__ship-glow" }, group);
    make("circle", { r: 4.5, class: "voyage__ship-ring" }, group);
    for (const [x1, y1, x2, y2] of [[-11, 0, -6, 0], [6, 0, 11, 0], [0, -11, 0, -6], [0, 6, 0, 11]]) {
      make("line", { x1, y1, x2, y2, class: "voyage__ship-tick" }, group);
    }
    const text = label(group, 0, -17, "THE ARCHIVE", "voyage__ship-label");

    /** Puts the tag in the first spot (above, below, right, left) that touches no other label and stays inside. */
    function place() {
      const spots = [["middle", 0, -17], ["middle", 0, 26], ["start", 15, 4], ["end", -15, 4]];
      const others = [...svg.querySelectorAll("text")]
        .filter((other) => other !== text && other.style.display !== "none")
        .map((other) => other.getBoundingClientRect())
        .filter((box) => box.width > 0);
      const frame = svg.getBoundingClientRect();
      for (const [anchor, x, y] of spots) {
        text.setAttribute("text-anchor", anchor);
        text.setAttribute("x", x);
        text.setAttribute("y", y);
        const box = text.getBoundingClientRect();
        const inside = box.left >= frame.left && box.right <= frame.right && box.top >= frame.top && box.bottom <= frame.bottom;
        const clear = others.every((o) => box.right + 4 < o.left || o.right + 4 < box.left || box.bottom + 2 < o.top || o.bottom + 2 < box.top);
        if (inside && clear) return;
      }
      const [anchor, x, y] = spots[0];
      text.setAttribute("text-anchor", anchor);
      text.setAttribute("x", x);
      text.setAttribute("y", y);
    }
    return { group, text, place };
  }

  /** Keeps a marker's label inside the chart when the marker nears an edge. */
  function keepInside(text, x, width) {
    const edge = 70;
    text.setAttribute("text-anchor", x < edge ? "start" : x > width - edge ? "end" : "middle");
    text.setAttribute("x", x < edge ? "-8" : x > width - edge ? "8" : "0");
  }

  /** INTERSTELLAR: the Sun, Alpha Centauri, and the straight line between them, marked at each light-year. */
  function drawInterstellar(svg, width, height, narrow) {
    const left = narrow ? 44 : 120;
    const right = width - (narrow ? 44 : 120);
    const lineY = height * (narrow ? 0.5 : 0.52);
    const along = (share) => left + (right - left) * share;
    const nowX = along(Voyage.progressAt(NOW));

    make("line", { x1: left, y1: lineY, x2: right, y2: lineY, class: "voyage__route" }, svg);
    const done = make("line", { x1: left, y1: lineY, x2: left, y2: lineY, class: "voyage__route-done" }, svg);
    make("line", { x1: nowX, y1: lineY, x2: right, y2: lineY, class: "voyage__route-planned" }, svg);

    // Marks at 1, 2 and 3 light-years; a fourth would sit on top of the destination at this scale.
    for (let ly = 1; ly <= 3; ly++) {
      const x = along(ly / ARCHIVE.lightYears);
      make("line", { x1: x, y1: lineY - 7, x2: x, y2: lineY + 7, class: "voyage__tick" }, svg);
      label(svg, x, lineY + 26, `${ly} LY`, "voyage__tick-label");
    }

    // On a phone each date sits above its star's name, leaving the space under the line to the light-year marks.
    const bodySize = narrow ? { halo: 16, core: 5, name: 30, date: -48 } : { halo: 24, core: 7, name: 46, date: 48 };
    // On a phone the end labels lean inward from each star, so none runs off the screen.
    const solX = narrow ? left - bodySize.halo : left;
    const cenX = narrow ? right + bodySize.halo : right;
    const solAnchor = narrow ? "start" : "middle";
    const cenAnchor = narrow ? "end" : "middle";
    const sun = make("g", { class: "voyage__star voyage__star--sol" }, svg);
    make("circle", { cx: left, cy: lineY, r: bodySize.halo, class: "voyage__halo" }, sun);
    make("circle", { cx: left, cy: lineY, r: bodySize.core }, sun);
    label(svg, solX, lineY - bodySize.name, "SOL", "voyage__body-name", solAnchor);
    if (!narrow) label(svg, left, lineY - 28, "Earth · departure", "voyage__body-sub");
    label(svg, solX, lineY + bodySize.date, "19 JAN 3310", "voyage__body-date", solAnchor);

    const pair = make("g", { class: "voyage__star voyage__star--cen" }, svg);
    make("circle", { cx: right, cy: lineY, r: bodySize.halo, class: "voyage__halo" }, pair);
    make("circle", { cx: right, cy: lineY, r: bodySize.core }, pair);
    make("circle", { cx: right + bodySize.core * 1.9, cy: lineY - bodySize.core * 1.3, r: bodySize.core * 0.62, class: "voyage__star-b" }, pair);
    label(svg, cenX, lineY - bodySize.name, "α CENTAURI", "voyage__body-name", cenAnchor);
    if (!narrow) label(svg, right, lineY - 28, "The Reach · arrival", "voyage__body-sub");
    label(svg, cenX, lineY + bodySize.date, "22 OCT 3342", "voyage__body-date", cenAnchor);

    make("circle", { cx: nowX, cy: lineY, r: 13, class: "voyage__now-ring" }, svg);
    label(svg, nowX, lineY + (narrow ? 52 : 68), "NOW", "voyage__now-label");

    const ship = archiveMarker(svg);
    return (y) => {
      const x = along(Voyage.progressAt(y));
      done.setAttribute("x2", Math.min(x, nowX).toFixed(1));
      ship.group.setAttribute("transform", `translate(${x.toFixed(1)},${lineY})`);
      ship.group.classList.toggle("is-planned", y > NOW + EPSILON);
      ship.place();
    };
  }

  /** DEPARTURE: the Sun, Earth's orbit, the heliopause, and the burn outward on a stretched scale of distance. */
  function drawDeparture(svg, width, height, narrow) {
    const sunX = width * (narrow ? 0.2 : 0.22);
    const sunY = height * 0.58;
    const edge = width - (narrow ? 28 : 60);
    const reach = edge - sunX;
    const earthR = Math.max(26, reach * 0.06);
    const finalAU = Voyage.departureDistanceAU(ARCHIVE.coast);
    // Distance from the Sun on a stretched scale: 1 AU at Earth's orbit, the burn's end at the right edge.
    const radiusFor = (au) => earthR + (reach - earthR) * Math.log(Math.max(1, au)) / Math.log(finalAU);

    const sun = make("g", { class: "voyage__star voyage__star--sol" }, svg);
    make("circle", { cx: sunX, cy: sunY, r: 16, class: "voyage__halo" }, sun);
    make("circle", { cx: sunX, cy: sunY, r: 6 }, sun);
    label(svg, sunX, sunY + 34, "THE SUN", "voyage__body-name");

    make("circle", { cx: sunX, cy: sunY, r: earthR, class: "voyage__orbit" }, svg);
    const earthAngle = -0.55;
    const earth = { x: sunX + earthR * Math.cos(earthAngle), y: sunY + earthR * Math.sin(earthAngle) };
    make("circle", { cx: earth.x, cy: earth.y, r: 4, class: "voyage__earth" }, svg);
    label(svg, earth.x - 6, earth.y - 10, "EARTH", "voyage__body-sub", "end");

    const helioR = radiusFor(120);
    make("circle", { cx: sunX, cy: sunY, r: helioR, class: "voyage__heliopause" }, svg);
    // Its label sits just inside the part of the ring that stays in the chart, below and right of the Sun.
    const helioAngle = Math.asin(Math.min(0.95, (height - sunY - 22) / helioR));
    label(svg, sunX + helioR * Math.cos(helioAngle) - 10, sunY + helioR * Math.sin(helioAngle),
      narrow ? "≈120 AU" : "Heliopause · ≈120 AU, approximate", "voyage__ref-label", "end");

    // The burn heads outward from Earth and straightens toward Alpha Centauri, off the right edge.
    const steps = 60;
    const points = [];
    for (let i = 0; i <= steps; i++) {
      const share = i / steps;
      const r = earthR + (reach - earthR) * share;
      const angle = earthAngle * (1 - share) ** 2;
      points.push([sunX + r * Math.cos(angle), sunY + r * Math.sin(angle)]);
    }
    make("polyline", { points: pointList(points), class: "voyage__route-done" }, svg);
    const onward = label(svg, edge, sunY - 14, "TO α CENTAURI →", "voyage__ref-label", "end");
    const ship = archiveMarker(svg);
    const distance = label(svg, 0, 0, "", "voyage__readout-label");

    return (y) => {
      const au = Voyage.departureDistanceAU(y);
      const share = Math.max(0, Math.min(1, (radiusFor(au) - earthR) / (reach - earthR)));
      const [x, py] = points[Math.min(steps, Math.round(share * steps))];
      ship.group.setAttribute("transform", `translate(${x.toFixed(1)},${py.toFixed(1)})`);
      keepInside(ship.text, x, width);
      // At Earth the tag sits to the right, clear of Earth's name; at the edge the pointer gives way to the tag.
      if (share < 0.05) { ship.text.setAttribute("text-anchor", "start"); ship.text.setAttribute("x", "10"); }
      onward.style.display = "";
      const tag = ship.text.getBoundingClientRect();
      const pointer = onward.getBoundingClientRect();
      const touching = tag.left < pointer.right + 6 && pointer.left < tag.right + 6 && tag.top < pointer.bottom + 4 && pointer.top < tag.bottom + 4;
      onward.style.display = touching ? "none" : "";
      distance.setAttribute("x", x.toFixed(1));
      distance.setAttribute("y", (py + 30).toFixed(1));
      distance.setAttribute("text-anchor", x > width - 120 ? "end" : "middle");
      const cruising = narrow ? "Cruising on →" : "Burn complete · cruising on, off this view";
      const fromSun = `${roughly(Math.max(1, au))} AU${narrow ? "" : " from the Sun"}`;
      distance.textContent = y >= ARCHIVE.coast ? cruising : fromSun;
    };
  }

  /** ARRIVAL: Alpha Centauri A and B, The Reach's orbit, Proxima far off to one side, and the capture into orbit. */
  function drawArrival(svg, width, height, narrow) {
    const starX = width * (narrow ? 0.62 : 0.6);
    const starY = height * 0.55;
    const orbitR = Math.min(height * 0.3, width * 0.2);
    const planetAngle = Math.PI * 0.82;
    const planet = { x: starX + orbitR * Math.cos(planetAngle), y: starY + orbitR * Math.sin(planetAngle) };

    const a = make("g", { class: "voyage__star voyage__star--cen" }, svg);
    make("circle", { cx: starX, cy: starY, r: 22, class: "voyage__halo" }, a);
    make("circle", { cx: starX, cy: starY, r: 8 }, a);
    label(svg, starX, starY + 38, "α CENTAURI A", "voyage__body-name");

    const bX = Math.min(width - 50, starX + orbitR * (narrow ? 1.05 : 1.6));
    const bY = starY - orbitR * 0.9;
    const b = make("g", { class: "voyage__star voyage__star--b" }, svg);
    make("circle", { cx: bX, cy: bY, r: 14, class: "voyage__halo" }, b);
    make("circle", { cx: bX, cy: bY, r: 5 }, b);
    label(svg, bX, bY - 20, "α CENTAURI B", "voyage__body-sub");

    make("circle", { cx: starX, cy: starY, r: orbitR, class: "voyage__orbit" }, svg);
    make("circle", { cx: planet.x, cy: planet.y, r: 15, class: "voyage__capture" }, svg);
    make("circle", { cx: planet.x, cy: planet.y, r: 6, class: "voyage__planet" }, svg);
    label(svg, planet.x, planet.y + 30, "THE REACH", "voyage__body-name");

    const inset = make("g", { class: "voyage__inset" }, svg);
    make("circle", { cx: narrow ? 20 : 30, cy: height - (narrow ? 22 : 30), r: 2.5, class: "voyage__proxima" }, inset);
    label(inset, narrow ? 30 : 42, height - (narrow ? 18 : 26),
      narrow ? "Proxima · 0.21 ly away" : "Proxima Centauri · about 0.21 light-years away, far off this view", "voyage__ref-label", "start");

    // The inbound line comes in from the left and curls into the capture orbit around The Reach.
    const entry = { x: narrow ? 14 : 40, y: height * 0.32 };
    const steps = 60;
    const points = [];
    for (let i = 0; i <= steps; i++) {
      const s = i / steps;
      const ease = s * s * (3 - 2 * s);
      const swing = Math.sin(s * Math.PI) * height * 0.12;
      points.push([entry.x + (planet.x - 15 - entry.x) * ease, entry.y + (planet.y - entry.y) * ease - swing]);
    }
    make("polyline", { points: pointList(points), class: "voyage__route-planned" }, svg);
    const done = make("polyline", { class: "voyage__route-done" }, svg);
    const ship = archiveMarker(svg);

    // Before braking the Archive waits at the view's edge; through braking (the last 46 days cover most of the line,
    // slowing as it goes) and the week's approach it follows the line in.
    const shareAt = (y) => {
      if (y < ARCHIVE.brake) return 0;
      if (y < ARCHIVE.approach) {
        const remaining = (ARCHIVE.approach - y) / (ARCHIVE.approach - ARCHIVE.brake);
        return 0.85 * (1 - remaining * remaining);
      }
      return Math.min(1, 0.85 + 0.15 * (y - ARCHIVE.approach) / (ARCHIVE.arrive - ARCHIVE.approach));
    };

    return (y) => {
      const [x, py] = y >= ARCHIVE.arrive ? [planet.x, planet.y - 15] : points[Math.round(shareAt(y) * steps)];
      // Solid as far as the ship's clock has gone; the rest stays planned.
      const flown = Math.round(shareAt(Math.min(y, NOW)) * steps);
      done.setAttribute("points", pointList(points.slice(0, flown + 1)));
      ship.group.setAttribute("transform", `translate(${x.toFixed(1)},${py.toFixed(1)})`);
      ship.group.classList.toggle("is-planned", y > NOW + EPSILON);
      ship.place();
    };
  }

  /** Puts the Archive where it is at `shown` and fills every readout from that one moment. */
  function update() {
    const y = shown;
    moveArchive(y);

    const atNow = Math.abs(y - NOW) < EPSILON;
    const planned = y > NOW + EPSILON;
    const date = atNow ? Voyage.shipNow() : Voyage.dateAt(y);
    const beta = Voyage.speedAt(y);
    readout("date").textContent = Voyage.dayStamp(date);
    readout("elapsed").textContent = `${Voyage.voyageYearAt(y).toFixed(2)} years`;
    readout("speed").textContent = y >= ARCHIVE.arrive ? "In orbit" : `β ${beta.toFixed(3)}`;
    readout("kms").textContent = y >= ARCHIVE.arrive ? "Orbiting The Reach" : `About ${roughly(beta * LIGHT_SPEED_KMS)} km/s`;
    readout("crossed").textContent = `${(Math.floor(Voyage.progressAt(y) * 1000) / 10).toFixed(1)}%`;

    const milestone = MILESTONES.find((m) => Math.abs(m.at - y) < EPSILON);
    const [name, text] = PHASES[Voyage.phaseAt(y)];
    phaseName.textContent = milestone ? `${milestone.name}.` : planned ? `Planned · ${name}` : name;
    phaseText.textContent = milestone ? milestone.text : text;
    phaseNote.textContent = atNow ? `You are here: the ship's clock reads ${Voyage.stamp(Voyage.shipNow())}.`
      : planned ? "Ahead of the ship's clock: this part of the crossing has not happened yet." : "";
    phaseNote.hidden = !phaseNote.textContent;

    milestoneButtons.forEach((button, index) => {
      button.classList.toggle("is-current", Math.abs(MILESTONES[index].at - y) < EPSILON);
      button.classList.toggle("is-past", MILESTONES[index].at <= y + EPSILON);
    });
    nowButton.classList.toggle("is-current", atNow);

    scrubber.value = String(y);
    scrubber.setAttribute("aria-valuetext", `${Voyage.dayStamp(date)}: ${milestone ? milestone.name : name}`);
  }

  function setTime(y) {
    shown = Math.min(SPAN_END, Math.max(SPAN_START, y));
    update();
  }

  function setView(next) {
    view = next;
    viewButtons.forEach((button) => button.setAttribute("aria-selected", String(button.dataset.view === view)));
    viewTitle.textContent = VIEWS[view].title;
    viewNote.textContent = VIEWS[view].note;
    layout();
  }
  viewButtons.forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));

  // Play replays the crossing so far, from launch to the ship's clock, in about twenty seconds, holding a moment on the
  // launch and on each milestone it passes so its words can be read.
  const pastMilestones = MILESTONES.filter((m) => m.at < NOW - EPSILON && m.at > SPAN_START + EPSILON);
  const yearsPerSecond = (NOW - SPAN_START) / 20;
  const holdSeconds = 1.6;
  let playing = false;
  let lastFrame = 0;
  let holdUntil = 0;
  let nextMilestone = 0;

  function frame(timestamp) {
    if (!playing) return;
    const seconds = lastFrame ? (timestamp - lastFrame) / 1000 : 0;
    lastFrame = timestamp;
    if (timestamp < holdUntil) { requestAnimationFrame(frame); return; }
    let target = shown + seconds * yearsPerSecond;
    if (nextMilestone < pastMilestones.length && target >= pastMilestones[nextMilestone].at) {
      target = pastMilestones[nextMilestone].at;
      nextMilestone += 1;
      holdUntil = timestamp + holdSeconds * 1000;
    }
    if (target >= NOW) { setTime(NOW); stop(); return; }
    setTime(target);
    requestAnimationFrame(frame);
  }

  function play() {
    if (shown >= NOW - EPSILON) setTime(SPAN_START);
    nextMilestone = pastMilestones.findIndex((m) => m.at > shown + EPSILON);
    if (nextMilestone < 0) nextMilestone = pastMilestones.length;
    playing = true;
    lastFrame = 0;
    holdUntil = Math.abs(shown - SPAN_START) < EPSILON ? performance.now() + holdSeconds * 1000 : 0;
    playButton.setAttribute("aria-pressed", "true");
    playButton.querySelector("span").textContent = "Pause";
    requestAnimationFrame(frame);
  }

  function stop() {
    playing = false;
    playButton.setAttribute("aria-pressed", "false");
    playButton.querySelector("span").textContent = shown >= NOW - EPSILON ? "Replay" : "Play";
  }

  playButton.addEventListener("click", () => (playing ? stop() : play()));
  scrubber.min = String(SPAN_START);
  scrubber.max = String(SPAN_END);
  scrubber.step = "0.001";
  scrubber.addEventListener("input", () => { stop(); setTime(Number(scrubber.value)); });

  setView("interstellar");
  stop();
  let resizeTimer = 0;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 120); });

  // The first time it comes into view it replays the crossing up to today, unless the visitor asks for less motion.
  if (!reducedMotion) {
    const starter = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        starter.disconnect();
        if (Math.abs(shown - NOW) < EPSILON && !playing) { setTime(SPAN_START); play(); }
      }
    }, { threshold: 0.45 });
    starter.observe(chart);
  }
}

for (const root of document.querySelectorAll("[data-voyage]")) mountVoyage(root);
