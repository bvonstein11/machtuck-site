// machtuck.com — the page's small amount of behaviour: the ship's strip, the bar, the menu, the rail, the reveals,
// the parallax, and the Discord door. No libraries, no tracking, nothing sent anywhere.

/**
 * The Discord invite every "Join the community" button opens. Empty until the server exists: the buttons then say
 * so instead of leading nowhere. Paste the invite here (for example "https://discord.gg/abc123") and every button
 * on every page follows.
 */
const DISCORD_INVITE = "";

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

// The ship's status strip. The clock starts at the newest log's stamp (assets/ship.js) when the page opens and runs at
// real speed while it is open; the speed and voyage year are the ship's at that stamp.
const shipDate = document.querySelector("[data-ship-date]");
if (shipDate && typeof Voyage !== "undefined") {
  const opened = Date.now();
  const start = Voyage.shipDate.getTime();
  const tick = () => { shipDate.textContent = Voyage.stamp(new Date(start + Date.now() - opened), true); };
  tick();
  setInterval(tick, 1000);
  document.querySelector("[data-ship-speed]").textContent = `${Voyage.speedAt(Voyage.now).toFixed(3)} c`;
  document.querySelector("[data-ship-year]").textContent = Voyage.voyageYearAt(Voyage.now).toFixed(2);
}
