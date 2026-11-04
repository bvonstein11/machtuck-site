// machtuck.com — the page's small amount of behaviour: the ship's strip, the bar, the menu, the rail, the reveals,
// the parallax, the faction pick, and the Discord door. No libraries, no tracking, nothing sent anywhere.

/**
 * The Discord invite every "Join the Discord" button opens. Empty until the server exists: the buttons then say
 * so instead of leading nowhere. Paste the invite here (for example "https://discord.gg/abc123") and every button
 * on every page follows.
 */
const DISCORD_INVITE = "https://discord.gg/akCxskKStX";

/**
 * The Kit form the email sign-up sends to: the form's number, from its embed code in Kit. Empty until the form exists,
 * and the sign-up stays hidden while it is; the privacy page must describe the sign-up before this is filled in.
 */
const SIGNUP_FORM = "";

document.documentElement.classList.remove("no-js");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The one door. A live invite opens in a new tab; without one the button reads "opening soon" and does nothing.
for (const link of document.querySelectorAll("[data-discord]")) {
  if (DISCORD_INVITE) {
    link.href = DISCORD_INVITE;
    link.target = "_blank";
    link.rel = "noopener";
  } else {
    link.textContent = "Discord opening soon";
    link.setAttribute("aria-disabled", "true");
    link.removeAttribute("href");
  }
}

// The email sign-up: shown only once a Kit form is named above. It posts to Kit in a new tab; nothing loads from Kit.
const signup = document.querySelector("[data-signup]");
if (signup && SIGNUP_FORM) {
  signup.action = `https://app.kit.com/forms/${SIGNUP_FORM}/subscriptions`;
  signup.hidden = false;
}

// The bar turns solid once the hero has scrolled past, so the links stay readable over the sections below.
const bar = document.querySelector("[data-bar]");
const updateBar = () => bar.classList.toggle("is-solid", window.scrollY > 40);
updateBar();
window.addEventListener("scroll", updateBar, { passive: true });

// The phone menu: one button, closed by a choice, by Escape, or by a tap outside it.
const menuButton = document.querySelector("[data-menu]");
const nav = document.getElementById("site-nav");
const setMenu = (open) => {
  menuButton.setAttribute("aria-expanded", String(open));
  nav.classList.toggle("is-open", open);
  bar.classList.toggle("is-open", open);
};
menuButton.addEventListener("click", () => setMenu(menuButton.getAttribute("aria-expanded") !== "true"));
nav.addEventListener("click", (event) => { if (event.target.closest("a")) setMenu(false); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") setMenu(false); });
document.addEventListener("click", (event) => { if (!bar.contains(event.target)) setMenu(false); });

// The rail marks the section that fills the middle of the screen.
const railLinks = new Map([...document.querySelectorAll("[data-rail-for]")].map((link) => [link.dataset.railFor, link]));
const sectionWatcher = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    for (const link of railLinks.values()) link.classList.remove("is-here");
    railLinks.get(entry.target.id)?.classList.add("is-here");
  }
}, { rootMargin: "-45% 0px -45% 0px" });
for (const section of document.querySelectorAll("[data-section]")) sectionWatcher.observe(section);

// Things fade up once, as they arrive.
const revealWatcher = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    entry.target.classList.add("is-in");
    revealWatcher.unobserve(entry.target);
  }
}, { rootMargin: "0px 0px -8% 0px" });
for (const element of document.querySelectorAll("[data-reveal]")) {
  if (reducedMotion) element.classList.add("is-in");
  else revealWatcher.observe(element);
}

// Parallax: each layer drifts at its own data-depth, measured from where its section starts.
// The hero copy also fades as it rises, so it never sits on top of the next section's heading.
const layers = [...document.querySelectorAll("[data-depth]")].map((element) => ({
  element,
  depth: Number(element.dataset.depth),
  section: element.closest("section"),
  fades: element.hasAttribute("data-fade"),
}));
let ticking = false;
const drawParallax = () => {
  ticking = false;
  const viewport = window.innerHeight;
  for (const layer of layers) {
    const box = layer.section.getBoundingClientRect();
    if (box.bottom < -viewport || box.top > viewport * 2) continue;
    const travelled = -box.top;
    layer.element.style.transform = `translate3d(0, ${(travelled * layer.depth).toFixed(1)}px, 0)`;
    if (layer.fades) layer.element.style.opacity = String(Math.max(0, 1 - Math.max(0, travelled) / (viewport * 0.55)));
  }
};
if (!reducedMotion && layers.length) {
  window.addEventListener("scroll", () => {
    if (!ticking) { ticking = true; requestAnimationFrame(drawParallax); }
  }, { passive: true });
  window.addEventListener("resize", drawParallax);
  drawParallax();
}

for (const year of document.querySelectorAll("[data-year]")) year.textContent = String(new Date().getFullYear());

// The factions: a select screen. Picking a house shows its creed and tints this section in its colour for this visit; nothing
// is stored, as the privacy page promises, so every visit opens on the prompt. Torrath, the mercenary who swears to none
// of them, clears it.
const pick = document.querySelector("[data-pick]");
if (pick) {
  // A house's colour stays inside the FACTIONS section; the rest of the site keeps its own amber.
  const root = pick.closest(".factions") || pick;
  const marks = [...pick.querySelectorAll(".pick__mark")];
  const panels = [...pick.querySelectorAll("[data-panel]")];
  const choose = (house) => {
    let accent = "";
    for (const mark of marks) mark.setAttribute("aria-pressed", String(mark.dataset.house === house));
    for (const panel of panels) {
      const shown = panel.dataset.panel === house;
      panel.classList.toggle("is-shown", shown);
      if (shown) accent = panel.dataset.accent || "";
    }
    if (accent) {
      root.style.setProperty("--accent", accent);
      root.dataset.faction = house;
    } else {
      root.style.removeProperty("--accent");
      delete root.dataset.faction;
    }
  };
  pick.querySelector(".pick__panels").classList.add("is-live");
  choose("");
  // The colour fades only on a pick, never while the page first paints.
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("can-tint")));
  for (const button of document.querySelectorAll("[data-house]")) button.addEventListener("click", () => choose(button.dataset.house));
}

// The ship's live readouts, in the status strip and over the ship in THE ARCHIVE: the clock is today's date and time on
// the ship's calendar (assets/ship.js), and the speed, the voyage year, the share crossed and the state follow it, down
// through the braking burn to orbit. Every element carrying one of these attributes is filled, wherever it sits.
if (typeof Voyage !== "undefined" && document.querySelector("[data-ship-date]")) {
  const readouts = {
    date: document.querySelectorAll("[data-ship-date]"),
    speed: document.querySelectorAll("[data-ship-speed]"),
    year: document.querySelectorAll("[data-ship-year]"),
    crossed: document.querySelectorAll("[data-ship-crossed]"),
    state: document.querySelectorAll("[data-ship-state]"),
  };
  const fill = (elements, text) => { for (const element of elements) element.textContent = text; };
  const tick = () => {
    const date = Voyage.shipNow();
    const y = Voyage.voyageTime(date);
    fill(readouts.date, Voyage.stamp(date, true));
    fill(readouts.speed, `${Voyage.speedAt(y).toFixed(3)} c`);
    fill(readouts.year, Voyage.voyageYearAt(y).toFixed(2));
    // Rounded down, as The Crossing rounds it, so the ship never reads 100% before it is in orbit.
    fill(readouts.crossed, `${(Math.floor(Voyage.progressAt(y) * 1000) / 10).toFixed(1)}%`);
    fill(readouts.state, y >= Voyage.archive.arrive ? "In orbit" : "In transit");
  };
  tick();
  setInterval(tick, 1000);
}

// The Voyage Logs: hidden until PUBLISHED_LOGS (assets/ship.js) has its first log. Each published log gets a card, and
// the next one is teased as the next anticipated voyage log, by number only: the site does not publish the schedule.
const LOGS_IN_ALL = 8;   // the voyage's logs, 01 to 08; after the last, nothing is teased
function drawLogs(published) {
  const section = document.querySelector("[data-logs]");
  if (!section) return;
  const list = section.querySelector("[data-logs-list]");
  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  };
  const card = (frame, label, title) => {
    const item = make("li", "log");
    item.append(frame, make("p", "log__num", label), make("h3", "log__title", title));
    return item;
  };
  list.replaceChildren();
  for (const entry of published) {
    const frame = make(entry.url ? "a" : "div", "log__frame");
    if (entry.url) Object.assign(frame, { href: entry.url, target: "_blank", rel: "noopener" });
    if (entry.poster) frame.append(Object.assign(make("img"), { src: entry.poster, alt: "", loading: "lazy" }));
    else frame.append(make("span", "log__blank", entry.log));
    if (entry.url) frame.append(make("span", "log__play", "Watch"));
    list.append(card(frame, `Voyage log ${entry.log}`, entry.title || `Voyage Log ${entry.log}`));
  }
  const next = published.length ? Number(published[published.length - 1].log) + 1 : 1;
  if (next <= LOGS_IN_ALL) {
    const number = String(next).padStart(2, "0");
    const frame = make("div", "log__frame log__frame--next");
    frame.setAttribute("aria-hidden", "true");
    frame.append(make("span", "log__blank", number), make("span", "log__pending", "Not yet released"));
    const item = card(frame, "Next anticipated voyage log", `Voyage Log ${number}`);
    item.classList.add("log--next");
    list.append(item);
  }
  section.hidden = published.length === 0;
  for (const link of document.querySelectorAll("[data-logs-rail]")) link.hidden = section.hidden;
}
if (typeof PUBLISHED_LOGS !== "undefined") drawLogs(PUBLISHED_LOGS);

// The countdown under the title: the time left until the Archive reaches The Reach, from the ship's clock (assets/ship.js).
// It is the ship's arrival, never a release date, so a slipped beta never makes it wrong. At zero it reads as in orbit.
const eta = document.querySelector("[data-eta]");
if (eta && typeof Voyage !== "undefined") {
  const parts = Object.fromEntries([...eta.querySelectorAll("[data-eta-part]")].map((element) => [element.dataset.etaPart, element]));
  const label = eta.querySelector("[data-eta-label]");
  const place = eta.querySelector("[data-eta-place]");
  const two = (n) => String(n).padStart(2, "0");
  const draw = () => {
    const seconds = Math.max(0, Math.floor((Voyage.arrivesAt - Date.now()) / 1000));
    parts.days.textContent = String(Math.floor(seconds / 86400));
    parts.hours.textContent = two(Math.floor(seconds / 3600) % 24);
    parts.minutes.textContent = two(Math.floor(seconds / 60) % 60);
    parts.seconds.textContent = two(seconds % 60);
    if (seconds === 0) { label.textContent = "Archive · In orbit"; place.textContent = "Over The Reach"; }
  };
  draw();
  eta.hidden = false;
  setInterval(draw, 1000);
}

// The scroll cue steps aside when the hero's buttons would sit on it: on short, wide screens the countdown pushes them
// down to the cue. Measured at the top of the page, where the parallax has not moved anything.
const cue = document.querySelector(".hero__cue");
const heroButtons = document.querySelector(".hero__actions");
if (cue && heroButtons) {
  const placeCue = () => {
    if (window.scrollY > 0) return;
    cue.classList.remove("is-aside");
    const buttons = heroButtons.getBoundingClientRect();
    const mark = cue.getBoundingClientRect();
    const overlaps = buttons.bottom > mark.top - 16 && buttons.right > mark.left - 16 && buttons.left < mark.right + 16;
    cue.classList.toggle("is-aside", overlaps);
  };
  placeCue();
  document.fonts?.ready.then(placeCue);
  window.addEventListener("resize", placeCue);
}

// Boarding: arriving from another site opens on the shipboard network for about two seconds. It says "Welcome back",
// never "Welcome aboard": mid-crossing nobody comes aboard, and most people on the Archive grew up there. The inline
// script in the page's head decides whether it shows (not on a reload, Back, or a link from this site; never to a
// visitor who asks for less motion) and keeps the page dark until this draws it. Nothing is stored in the browser.
// Any key, click, touch or scroll goes straight to the page.
if (document.documentElement.classList.contains("is-boarding") && typeof Voyage !== "undefined") {
  const date = Voyage.shipNow();
  const y = Voyage.voyageTime(date);
  const screen = document.createElement("div");
  screen.className = "boarding";
  screen.setAttribute("aria-hidden", "true");
  const lines = [
    ["The Archive", "Shipboard network"],
    ["Earth date", Voyage.stamp(date, false)],
    ["Speed", `${Voyage.speedAt(y).toFixed(3)} c`],
    ["Link", "Open"],
  ];
  screen.innerHTML = `<div class="boarding__panel">${lines.map(([label, value]) => `<p><b>${label}</b><span>${value}</span></p>`).join("")}<p class="boarding__welcome">Welcome back</p></div>`;
  document.body.append(screen);
  document.documentElement.classList.remove("is-boarding");
  requestAnimationFrame(() => screen.classList.add("is-on"));
  let left = false;
  const leave = () => {
    if (left) return;
    left = true;
    screen.classList.add("is-leaving");
    setTimeout(() => screen.remove(), 500);
  };
  setTimeout(leave, 2100);
  for (const type of ["keydown", "pointerdown", "wheel", "touchstart"]) window.addEventListener(type, leave, { once: true, passive: true });
}

// Ship audio: the hum of the hull, made in the browser from noise and a few low tones (no sound file), off until the
// visitor turns it on. Browsers refuse sound before a click, so it can never start by itself.
const audioSwitch = document.querySelector("[data-ship-audio]");
const AudioEngine = window.AudioContext || window.webkitAudioContext;
if (audioSwitch && AudioEngine) {
  let context = null;
  let master = null;
  const build = () => {
    context = new AudioEngine();
    master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);
    // Brown noise through a low-pass filter: the air handlers.
    const length = context.sampleRate * 4;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const samples = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      samples[i] = last * 3.5;
    }
    const air = context.createBufferSource();
    air.buffer = buffer;
    air.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 350;
    const airLevel = context.createGain();
    airLevel.gain.value = 0.35;
    air.connect(filter).connect(airLevel).connect(master);
    air.start();
    // Two low tones a little apart so they beat slowly, the drum turning, with harmonics a laptop speaker can play.
    for (const [frequency, level] of [[55, 0.05], [55.4, 0.05], [110, 0.04], [165.2, 0.018], [220.5, 0.008]]) {
      const tone = context.createOscillator();
      tone.frequency.value = frequency;
      const toneLevel = context.createGain();
      toneLevel.gain.value = level;
      tone.connect(toneLevel).connect(master);
      tone.start();
    }
  };
  audioSwitch.hidden = false;
  audioSwitch.addEventListener("click", () => {
    const on = audioSwitch.getAttribute("aria-pressed") !== "true";
    audioSwitch.setAttribute("aria-pressed", String(on));
    if (!context) build();
    const now = context.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    if (on) {
      context.resume();
      master.gain.linearRampToValueAtTime(0.6, now + 2.5);
    } else {
      master.gain.linearRampToValueAtTime(0, now + 0.6);
    }
  });
}
