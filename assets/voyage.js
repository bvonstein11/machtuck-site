// The Crossing: an interactive chart of the survey probe's flight and the Archive's voyage to The Reach, seen from
// aboard. It opens where the ship's clock stands (assets/ship.js); what lies ahead of that is drawn as planned.

const { probe: PROBE, archive: ARCHIVE } = Voyage;
const NOW = Voyage.now;

/** The chart runs from the probe's launch to the Archive's planned arrival in orbit. */
const SPAN_START = 0;
const SPAN_END = ARCHIVE.arrive;

/** The beats on the chart, in order. `date` is shown when the calendar gives the day; otherwise the year alone. */
const BEATS = [
  { at: 0, year: "3289", title: "A probe leaves a failing Earth",
    text: "Earth is failing. Survey probes go out to the nearest stars at half the speed of light." },
  { at: 8.68, year: "3298", title: "The probe arrives",
    text: "It reaches the nearest star and begins a year and a half of survey." },
  { at: 10.18, year: "3299", title: "It sends home what it found",
    text: "An Earth-like world, with water. The report crosses back at the speed of light." },
  { at: 14.52, year: "3304", title: "Earth hears back",
    text: "The report is four years old when it lands. Nobody chose this star: urgency took the first answer that came back." },
  { at: 20.39, date: "19 Jan 3310", title: "The Archive leaves Earth",
    text: "Humanity's evacuation ship leaves orbit and burns at one gravity for 46 days." },
  { at: 20.52, date: "Mar 3310", title: "Engines quiet",
    text: "The Archive coasts at 13% of the speed of light. Nobody aboard sleeps through it: the crossing is made awake." },
  { at: 36.84, year: "3326", title: "Halfway",
    text: "Sixteen years out. People are born, grow up, grow old and die aboard. A generation is coming of age that has never seen Earth." },
  { at: 53.0, date: "Aug 3342", title: "The braking burn",
    text: "Forty-six days at one gravity again, to stop." },
  { at: 53.15, date: "22 Oct 3342", title: "Orbit",
    text: "The Archive reaches orbit over The Reach at the end of a 32.63-year voyage. The generation that arrives will not be the one that left." },
];

/** What the caption says ahead of the clock, before the next planned beat. */
const PLANNED_COAST = { title: "On course",
  text: "Still coasting at 13% of the speed of light. The braking burn is planned for August 3342." };

/** What the caption says when the chart stands at the ship's clock. */
const NOW_BEAT = { title: "We are here",
  text: `Year ${Math.floor(Voyage.voyageYearAt(NOW))} of the crossing, coasting at 13% of the speed of light. Everyone aboard is awake.` };

/** Deterministic noise for the star field, so every visit sees the same sky. */
function seededRandom(seed) {
  let state = seed;
  return () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296; };
}

const SVG_NS = "http://www.w3.org/2000/svg";
const make = (name, attributes = {}, parent) => {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (parent) parent.appendChild(element);
  return element;
};

/** Builds one chart into its section and wires its controls. */
function mountVoyage(root) {
  const chart = root.querySelector("[data-voyage-chart]");
  const scrubber = root.querySelector("[data-voyage-scrubber]");
  const playButton = root.querySelector("[data-voyage-play]");
  const beatList = root.querySelector("[data-voyage-beats]");
  const readouts = {
    date: root.querySelector("[data-readout='date']"),
    underway: root.querySelector("[data-readout='underway']"),
    speed: root.querySelector("[data-readout='speed']"),
    crossed: root.querySelector("[data-readout='crossed']"),
  };
  const caption = {
    when: root.querySelector("[data-caption='when']"),
    title: root.querySelector("[data-caption='title']"),
    text: root.querySelector("[data-caption='text']"),
  };
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let shown = NOW;
  const EPSILON = 0.004; // about a day and a half on the voyage's scale
  const atClock = () => Math.abs(shown - NOW) < EPSILON;
  let shapes = null;

  // The beat buttons under the scrubber: one per beat, placed at its moment.
  const beatButtons = BEATS.map((beat) => {
    const item = document.createElement("li");
    item.style.setProperty("--at", String((beat.at - SPAN_START) / (SPAN_END - SPAN_START)));
    const button = document.createElement("button");
    button.type = "button";
    button.className = "voyage__beat";
    button.setAttribute("aria-label", `${beat.date || beat.year}: ${beat.title}`);
    button.classList.toggle("is-planned", beat.at > NOW);
    button.addEventListener("click", () => { stop(); setTime(beat.at); });
    item.appendChild(button);
    beatList.appendChild(item);
    return button;
  });
  const clockTick = document.createElement("li");
  clockTick.className = "voyage__now";
  clockTick.style.setProperty("--at", String((NOW - SPAN_START) / (SPAN_END - SPAN_START)));
  const clockButton = document.createElement("button");
  clockButton.type = "button";
  clockButton.textContent = "Now";
  clockButton.setAttribute("aria-label", `Now: ${Voyage.stamp(Voyage.shipDate)}`);
  clockButton.addEventListener("click", () => { stop(); setTime(NOW); });
  clockTick.appendChild(clockButton);
  beatList.appendChild(clockTick);

  /** Lays the chart out at the container's real pixel size, so its words stay readable on a phone. */
  function layout() {
    const width = Math.max(300, chart.clientWidth);
    const narrow = width < 640;
    const height = narrow ? Math.round(Math.max(260, width * 0.62)) : Math.round(Math.min(460, Math.max(380, width * 0.4)));
    chart.innerHTML = "";
    const svg = make("svg", { viewBox: `0 0 ${width} ${height}`, width, height, role: "img",
      "aria-label": "A chart of the crossing from Earth to The Reach" }, chart);

    const random = seededRandom(3310);
    const stars = make("g", { class: "voyage__stars" }, svg);
    const starCount = Math.round(width * height / 2600);
    for (let i = 0; i < starCount; i++) {
      make("circle", { cx: (random() * width).toFixed(1), cy: (random() * height).toFixed(1),
        r: (random() * 1.1 + 0.25).toFixed(2), opacity: (random() * 0.6 + 0.15).toFixed(2) }, stars);
    }

    const margin = narrow ? 34 : 90;
    const baseline = narrow ? 0.66 : 0.5;
    const earth = { x: margin, y: height * baseline };
    const reach = { x: width - margin, y: height * baseline };
    const lift = height * (narrow ? 0.3 : 0.26);
    const mid = (earth.x + reach.x) / 2;

    // The probe's line rides higher than the Archive's, so the two journeys read as two.
    const probeLine = make("path", { class: "voyage__probe-line",
      d: `M${earth.x},${earth.y} Q${mid},${earth.y - lift * 1.55} ${reach.x},${reach.y}` }, svg);
    const archiveLine = make("path", { class: "voyage__line",
      d: `M${earth.x},${earth.y} Q${mid},${earth.y - lift} ${reach.x},${reach.y}` }, svg);
    const archiveTravelled = make("path", { class: "voyage__line-done", d: archiveLine.getAttribute("d") }, svg);
    const archiveLength = archiveLine.getTotalLength();
    const probeLength = probeLine.getTotalLength();
    archiveTravelled.setAttribute("stroke-dasharray", `${archiveLength} ${archiveLength}`);

    const sun = make("g", { class: "voyage__body voyage__body--earth" }, svg);
    make("circle", { cx: earth.x, cy: earth.y, r: 18, class: "voyage__glow" }, sun);
    make("circle", { cx: earth.x, cy: earth.y, r: 6 }, sun);
    // On a narrow screen the end labels lean inward so neither runs off the edge.
    make("text", { x: narrow ? earth.x - 14 : earth.x, y: earth.y + 34, "text-anchor": narrow ? "start" : "middle" }, sun).textContent = "EARTH";

    const star = make("g", { class: "voyage__body voyage__body--reach" }, svg);
    make("circle", { cx: reach.x, cy: reach.y, r: 26, class: "voyage__glow" }, star);
    make("circle", { cx: reach.x, cy: reach.y, r: 8 }, star);
    make("text", { x: narrow ? reach.x + 18 : reach.x, y: reach.y + 40, "text-anchor": narrow ? "end" : "middle" }, star).textContent = "THE REACH";

    // The stretch still ahead of the ship's clock, drawn as planned; and a ring where the clock stands.
    const nowLength = Voyage.progressAt(NOW) * archiveLength;
    const ahead = [];
    for (let step = 0; step <= 24; step++) {
      const at = archiveLine.getPointAtLength(nowLength + (archiveLength - nowLength) * step / 24);
      ahead.push(`${at.x.toFixed(1)},${at.y.toFixed(1)}`);
    }
    make("polyline", { class: "voyage__line-planned", points: ahead.join(" ") }, svg);
    const nowPoint = archiveLine.getPointAtLength(nowLength);
    const nowMark = make("g", { class: "voyage__now-mark", transform: `translate(${nowPoint.x.toFixed(1)},${nowPoint.y.toFixed(1)})` }, svg);
    make("circle", { r: 11 }, nowMark);
    make("text", { y: 28, "text-anchor": "middle" }, nowMark).textContent = "NOW";

    const probe = make("circle", { r: 3.5, class: "voyage__probe" }, svg);
    const report = make("circle", { r: 4, class: "voyage__report" }, svg);
    const archive = make("g", { class: "voyage__archive" }, svg);
    make("circle", { r: 14, class: "voyage__glow" }, archive);
    make("circle", { r: 5 }, archive);
    const archiveLabel = make("text", { y: -16, "text-anchor": "middle" }, archive);
    archiveLabel.textContent = "THE ARCHIVE";

    shapes = { probeLine, probeLength, archiveLine, archiveLength, archiveTravelled, probe, report, archive, archiveLabel, width };
    draw();
  }

  /** Puts every moving thing where it is at `shown`, and fills the readouts and the caption. */
  function draw() {
    if (!shapes) return;
    const y = shown;

    // The probe flies out, waits through its survey, then its report crosses back; it fades once Earth has heard.
    const probeShare = Math.min(1, Math.max(0, y / PROBE.arrive));
    const probePoint = shapes.probeLine.getPointAtLength(probeShare * shapes.probeLength);
    shapes.probe.setAttribute("cx", probePoint.x);
    shapes.probe.setAttribute("cy", probePoint.y);
    shapes.probe.style.opacity = y > PROBE.received + 2 ? "0" : "1";
    const reportShare = (y - PROBE.transmit) / (PROBE.received - PROBE.transmit);
    if (reportShare > 0 && reportShare < 1) {
      const reportPoint = shapes.probeLine.getPointAtLength((1 - reportShare) * shapes.probeLength);
      shapes.report.setAttribute("cx", reportPoint.x);
      shapes.report.setAttribute("cy", reportPoint.y);
      shapes.report.style.opacity = "1";
    } else {
      shapes.report.style.opacity = "0";
    }

    // The Archive waits at Earth until it leaves, then draws its own line behind it.
    const share = Voyage.progressAt(y);
    const point = shapes.archiveLine.getPointAtLength(share * shapes.archiveLength);
    shapes.archive.setAttribute("transform", `translate(${point.x.toFixed(1)},${point.y.toFixed(1)})`);
    shapes.archive.style.opacity = y < ARCHIVE.depart - 1.5 ? "0" : "1";
    shapes.archiveTravelled.setAttribute("stroke-dashoffset", String(shapes.archiveLength * (1 - Math.min(share, Voyage.progressAt(NOW)))));
    shapes.archive.classList.toggle("is-planned", shown > NOW + EPSILON);
    // Keep the label off the screen's edges at either end of the line.
    const edge = 46;
    shapes.archiveLabel.setAttribute("text-anchor", point.x < edge * 2 ? "start" : point.x > shapes.width - edge * 2 ? "end" : "middle");
    shapes.archiveLabel.setAttribute("x", point.x < edge * 2 ? "-8" : point.x > shapes.width - edge * 2 ? "8" : "0");

    readouts.date.textContent = Voyage.monthYear(y);
    readouts.underway.textContent = y < ARCHIVE.depart ? "—" : `${Voyage.voyageYearAt(y).toFixed(2)} yr`;
    const speed = Voyage.speedAt(y);
    readouts.speed.textContent = y < ARCHIVE.depart ? "—" : y >= ARCHIVE.arrive ? "In orbit" : `${(speed * 100).toFixed(1)}% light`;
    readouts.crossed.textContent = `${Math.floor(share * 100)}%`;

    // The caption: where the clock stands, the planned course ahead of it, or the latest beat passed.
    let current = 0;
    BEATS.forEach((beat, index) => { if (beat.at <= y + 1e-6) current = index; });
    const atNow = atClock();
    const beat = BEATS[current];
    const beatIsPlanned = beat.at > NOW + EPSILON;
    const showing = atNow ? NOW_BEAT : (y > NOW && !beatIsPlanned) ? PLANNED_COAST : beat;
    caption.when.textContent = atNow ? `Now · ${Voyage.stamp(Voyage.shipDate)}`
      : y > NOW ? `Planned · ${beatIsPlanned ? (beat.date || beat.year) : Voyage.monthYear(y)}`
      : (beat.date || beat.year);
    caption.title.textContent = showing.title;
    caption.text.textContent = showing.text;
    beatButtons.forEach((button, index) => {
      button.classList.toggle("is-past", BEATS[index].at <= y + 1e-6);
      button.classList.toggle("is-current", !atNow && showing === BEATS[index]);
    });
    clockButton.classList.toggle("is-current", atNow);

    scrubber.value = String(y);
    scrubber.setAttribute("aria-valuetext", `${Voyage.monthYear(y)}: ${showing.title}`);
  }

  function setTime(y) {
    shown = Math.min(SPAN_END, Math.max(SPAN_START, y));
    draw();
  }

  // Play replays the crossing so far, from the probe's launch to the ship's clock, in about half a minute, holding a
  // moment on each beat so its words can be read.
  const pastBeats = BEATS.filter((beat) => beat.at < NOW);
  const yearsPerSecond = (NOW - SPAN_START) / 24;
  const holdSeconds = 1.8;
  let playing = false;
  let lastFrame = 0;
  let holdUntil = 0;
  let nextBeat = 0;

  function frame(timestamp) {
    if (!playing) return;
    const seconds = lastFrame ? (timestamp - lastFrame) / 1000 : 0;
    lastFrame = timestamp;
    if (timestamp < holdUntil) { requestAnimationFrame(frame); return; }
    let target = shown + seconds * yearsPerSecond;
    if (nextBeat < pastBeats.length && target >= pastBeats[nextBeat].at) {
      target = pastBeats[nextBeat].at;
      nextBeat += 1;
      holdUntil = timestamp + holdSeconds * 1000;
    }
    if (target >= NOW) { setTime(NOW); stop(); return; }
    setTime(target);
    requestAnimationFrame(frame);
  }

  function play() {
    if (shown >= NOW - EPSILON) setTime(SPAN_START);
    nextBeat = pastBeats.findIndex((beat) => beat.at > shown + 1e-6);
    if (nextBeat < 0) nextBeat = pastBeats.length;
    playing = true;
    lastFrame = 0;
    holdUntil = 0;
    playButton.setAttribute("aria-pressed", "true");
    playButton.querySelector("span").textContent = "Pause";
    requestAnimationFrame(frame);
  }

  function stop() {
    playing = false;
    playButton.setAttribute("aria-pressed", "false");
    playButton.querySelector("span").textContent = shown >= NOW - EPSILON ? "Replay the crossing" : "Play the crossing";
  }

  playButton.addEventListener("click", () => (playing ? stop() : play()));
  scrubber.min = String(SPAN_START);
  scrubber.max = String(SPAN_END);
  scrubber.step = "0.01";
  scrubber.addEventListener("input", () => { stop(); setTime(Number(scrubber.value)); });

  layout();
  let resizeTimer = 0;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 120); });

  // It starts on its own the first time it comes into view, unless the visitor has asked for less motion.
  if (!reducedMotion) {
    const starter = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { starter.disconnect(); if (atClock()) { setTime(SPAN_START); play(); } }
    }, { threshold: 0.5 });
    starter.observe(chart);
  }
}

for (const root of document.querySelectorAll("[data-voyage]")) mountVoyage(root);
