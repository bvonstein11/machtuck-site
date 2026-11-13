// machtuck.com — the page's small amount of behaviour: the ship's strip, the bar, the menu, the rail, the reveals,
// the parallax, the faction pick, the Discord door and the closed beta request. No libraries and no tracking. The one thing
// this site ever sends anywhere is the closed beta form, when a visitor sends it. The switches below are the only lines to
// change by hand; the README's "The switches" says when.

/**
 * The Discord invite every "Join the Discord" button opens. Empty until the server exists: the buttons then say
 * so instead of leading nowhere. Paste the invite here (for example "https://discord.gg/abc123") and every button
 * on every page follows.
 */
const DISCORD_INVITE = "https://discord.gg/akCxskKStX";

/**
 * The Kit form the closed beta request sends to: the form's number, from its embed code in Kit. While this is empty every
 * part of the request stays hidden (the hero's and the bar's buttons, the phones' pinned bar, the form in JOIN) and nothing
 * can be sent. The privacy page must describe the form, and Kit's own settings must be done, before this is filled in.
 */
const SIGNUP_FORM = "10158135";

/**
 * 2026-11-12 — the callsign reservation. Before the form goes to Kit, the page reserves the callsign in the game's own
 * registry through our callsign Worker (Tools/cloudflare/callsign-worker.js), which calls Unity Gaming Services as a server.
 * A visitor never becomes a player of the game, and the page keeps nothing: no token, cookie or name is stored in the browser,
 * as the privacy page promises. Empty until the Worker exists, and then the Worker's address.
 */
const CALLSIGN_API = "https://vigil-callsign.machtuck.workers.dev";

/** Cloudflare Turnstile's site key (public), which tells a person from a script so no one can reserve names in bulk. Away from
 *  machtuck.com it is Cloudflare's always-pass test key; on machtuck.com, empty until his widget exists. Its script loads only
 *  once a visitor starts a form, never on a plain visit. */
const TURNSTILE_SITEKEY = /(^|\.)machtuck\.com$/.test(location.hostname) ? "0x4AAAAAAF_wsmBHsGzVD5eB" : "1x00000000000000000000AA";
let turnstileLoad = null;
const loadTurnstile = () => (turnstileLoad ??= new Promise((resolve, reject) => {
  const tag = document.createElement("script");
  tag.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  tag.async = true;
  tag.onload = () => resolve(window.turnstile);
  tag.onerror = () => { turnstileLoad = null; reject(new Error("turnstile")); };
  document.head.appendChild(tag);
}));

/** A fresh Turnstile pass for one call, from a widget in `holder` that shows itself only if Cloudflare wants a click. */
async function humanCheck(holder) {
  const turnstile = await loadTurnstile();
  return new Promise((resolve, reject) => {
    holder.replaceChildren();
    turnstile.render(holder, { sitekey: TURNSTILE_SITEKEY, appearance: "interaction-only", callback: resolve,
      "error-callback": () => reject(new Error("turnstile")) });
  });
}

/** The game's Steam page. Empty hides the wishlist button in JOIN; paste the page's address the day it exists. */
const STEAM_WISHLIST = "";

/**
 * How many pilots have asked for closed beta access: the real total from Kit, typed here by hand. It stays hidden until it
 * passes PILOT_COUNT_SHOWN_ABOVE, and it sits inside the form's block, so it never shows without the form. Real sign-ups
 * only, never an estimate. Kit's API key never goes in this page.
 */
const PILOT_COUNT = 0;
const PILOT_COUNT_SHOWN_ABOVE = 100;

/**
 * The latest clips strip in the game's page, newest first; the first LATEST_CLIPS_SHOWN are drawn. While the list is empty
 * the strip is hidden, so it can never look stale. Each entry is
 *   { url: "https://...", title: "What it shows", where: "TikTok", poster: "/assets/img/clips/name.webp" }
 * A clip is a picture on this site and a link out: no video player and nothing else from another site loads here.
 */
const LATEST_CLIPS = [];
const LATEST_CLIPS_SHOWN = 4;

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

// What the page says when the registry refuses a callsign, by the outcome Cloud Code answers (CallsignReservation).
const RESERVE_REFUSED = {
  TAKEN: (a) => (a.suggestion ? `${a.name} is taken. ${a.suggestion} is free.` : `${a.name} is taken. Try another.`),
  MODERATED: (a) => `${a.name} is taken. Try another.`,
  HAS_ONE: () => "This email has already reserved a callsign. It's one per pilot.",
  INVALID: () => "That callsign can't be used. Use up to 16 letters, numbers, - or _.",
  BAD_EMAIL: () => "That email address doesn't look right.",
};
const RESERVE_FAILED = "We couldn't reach the callsign registry. Please try again in a minute.";

/** Reserve a callsign for an email in the game's registry (Cloud Code's ReserveCallsign). Answers { outcome, name, suggestion };
 *  throws when Unity can't be reached. The call itself is callsignCall, below. */
const reserveCallsign = (callsign, email) => callsignCall("ReserveCallsign", { callsign, email }, document.querySelector("[data-signup] [data-turnstile]"));

/** Call the callsign Worker: ReserveCallsign or TakeReservedCallsign. Answers the module's { outcome, name, suggestion };
 *  throws when it can't be reached. */
async function callsignCall(fn, params, holder) {
  const path = { ReserveCallsign: "/reserve", TakeReservedCallsign: "/take" }[fn];
  const turnstile = await humanCheck(holder);
  const call = await fetch(CALLSIGN_API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...params, turnstile }) });
  if (!call.ok) throw new Error(`${fn} ${call.status}`);
  return call.json();
}

// The claim page (/claim/): a callsign reserved here moves to the pilot's career when they enter it with the email they
// reserved with and the link code their Service Record shows. The game never handles the email; this page sends it once,
// to be checked against the reservation, and keeps nothing.
const TAKE_SAYS = {
  CLAIMED: (a) => `${a.name} is in your career now. Open the Service Record to see it.`,
  YOURS: (a) => `${a.name} is already in your career.`,
  TAKEN: (a) => `${a.name} wasn't reserved with that email.`,
  BAD_CODE: () => "That code has expired or was already used. Get a new one in the Service Record.",
  BAD_EMAIL: () => "That email address doesn't look right.",
  INVALID: () => "That callsign can't be used. Use up to 16 letters, numbers, - or _.",
  MODERATED: (a) => `${a.name} can't be used.`,
};
const claimForm = document.querySelector("[data-claim]");
if (claimForm) {
  const claimStatus = claimForm.querySelector("[data-claim-status]");
  const claimButton = claimForm.querySelector("[type=submit]");
  claimForm.addEventListener("focusin", () => loadTurnstile().catch(() => {}), { once: true });
  claimForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const field = (n) => claimForm.elements[n].value.trim();
    claimStatus.textContent = "Checking…";
    claimButton.disabled = true;
    let answer = null;
    try { answer = await callsignCall("TakeReservedCallsign", { callsign: field("callsign").toUpperCase(), email: field("email"), code: field("code") }, claimForm.querySelector("[data-turnstile]")); } catch { answer = null; }
    claimButton.disabled = false;
    claimStatus.textContent = answer && TAKE_SAYS[answer.outcome] ? TAKE_SAYS[answer.outcome](answer) : RESERVE_FAILED;
  });
}

// The closed beta sign-up: shown only once a Kit form is named above. It is a plain POST to Kit, with no script from Kit on
// the page, into a hidden frame once the callsign is reserved; Kit then sends that frame on to /welcome/ (a setting on the
// form in Kit), which tells the page it landed. The one ask takes the lead: the hero's Discord button steps back a rank and "Explore the game" steps aside.
const signup = document.querySelector("[data-signup]");
if (signup && SIGNUP_FORM) {
  signup.action = `https://app.kit.com/forms/${SIGNUP_FORM}/subscriptions`;
  document.documentElement.classList.add("has-signup");
  for (const part of document.querySelectorAll("[data-request], [data-signup-cta], [data-pin]")) part.hidden = false;
  document.querySelector(".hero__actions [data-discord]")?.classList.add("btn--ghost");
  document.querySelector(".join__doors [data-discord]")?.classList.add("btn--ghost");
  const heroExplore = document.querySelector("[data-hero-explore]");
  if (heroExplore) heroExplore.hidden = true;

  const callsign = signup.elements["fields[requested_callsign]"];
  const cleanCallsign = () => { callsign.value = callsign.value.trim().toUpperCase(); };
  callsign.addEventListener("change", cleanCallsign);
  // Where the visitor came from is read from the address here, as the form goes, and goes nowhere but into the form: nothing
  // is kept in the browser, as the privacy page promises. A value that is not a plain short word (an address pasted into a
  // link, say) is dropped, not sent.
  // The form posts into a hidden frame, not this tab, so the page can stay and hand the pilot their wingman link. Each send
  // asks the registry first; only once it holds the name for this email does the same form go on to Kit.
  const email = signup.elements["email_address"];
  const sendButton = signup.querySelector("[type=submit]");
  const status = document.querySelector("[data-signup-status]");
  const done = document.querySelector("[data-signup-done]");
  const kitStatus = document.querySelector("[data-kit-status]");
  const kitFrame = document.querySelector("iframe[name='kit-post']");
  let reservedFor = "";   // "CALLSIGN email" the registry has answered RESERVED or YOURS for
  let awaitingKit = false;
  signup.addEventListener("focusin", () => loadTurnstile().catch(() => {}), { once: true });   // ready before the send
  signup.addEventListener("submit", async (event) => {
    cleanCallsign();
    const source = (new URLSearchParams(location.search).get("src") || "").trim().toLowerCase();
    signup.elements["fields[source]"].value = /^[a-z0-9_-]{1,32}$/.test(source) ? source : "";
    const key = `${callsign.value} ${email.value.trim().toLowerCase()}`;
    if (reservedFor === key) { awaitingKit = true; return; }   // the registry holds it: this post goes on to Kit
    event.preventDefault();
    status.textContent = "Checking your callsign…";
    sendButton.disabled = true;
    let answer = null;
    try { answer = await reserveCallsign(callsign.value, email.value.trim()); } catch { answer = null; }
    sendButton.disabled = false;
    const outcome = answer && answer.outcome;
    if (outcome === "RESERVED" || outcome === "YOURS") {
      reservedFor = key;
      status.textContent = "";
      showReserved(answer.name);
      signup.requestSubmit();
    } else {
      status.textContent = answer && RESERVE_REFUSED[outcome] ? RESERVE_REFUSED[outcome](answer) : RESERVE_FAILED;
    }
  });

  // The frame lands on /welcome/ when Kit takes the address. Anywhere else (one of Kit's own pages) can't be read from here,
  // so the pilot is told it couldn't be confirmed and gets the form back; sending again finds the name already theirs.
  kitFrame?.addEventListener("load", () => {
    if (!awaitingKit) return;
    awaitingKit = false;
    let landed = "";
    try { landed = kitFrame.contentWindow.location.pathname; } catch { landed = ""; }
    if (landed.startsWith("/welcome")) {
      kitStatus.textContent = "You're on the closed beta list too. We'll email you when invitations go out.";
    } else {
      kitStatus.textContent = "Your callsign is reserved, but we couldn't confirm the closed beta list. Send the form again to make sure.";
      signup.hidden = false;
    }
  });

  const showReserved = (name) => {
    const link = `https://machtuck.com/thereach/?src=r-${name.toLowerCase()}`;
    done.querySelector("[data-done-name]").textContent = name;
    done.querySelector("[data-wingman-link]").textContent = link;
    kitStatus.textContent = "Adding you to the closed beta list…";
    signup.hidden = true;
    done.hidden = false;
    const copy = done.querySelector("[data-copy-link]");
    copy.onclick = () => navigator.clipboard?.writeText(link).then(() => { copy.textContent = "Copied"; }, () => {});
  };

  // The pinned bar on phones: up once the hero's own button has scrolled away, and down again from the form on, so it never
  // covers the form or the footer.
  const pin = document.querySelector("[data-pin]");
  const heroAsk = document.querySelector(".hero__actions [data-signup-cta]");
  const request = document.querySelector("[data-request]");
  if (pin && heroAsk && request) {
    let pastHero = false;
    let atForm = false;
    const placePin = () => pin.classList.toggle("is-up", pastHero && !atForm);
    new IntersectionObserver(([entry]) => {
      pastHero = !entry.isIntersecting && entry.boundingClientRect.top < 0;
      placePin();
    }).observe(heroAsk);
    new IntersectionObserver(([entry]) => {
      atForm = entry.isIntersecting || entry.boundingClientRect.top < 0;
      placePin();
    }).observe(request);
  }

  const pilots = document.querySelector("[data-pilot-count]");
  if (pilots && PILOT_COUNT > PILOT_COUNT_SHOWN_ABOVE) {
    pilots.querySelector("b").textContent = PILOT_COUNT.toLocaleString("en-US");
    pilots.hidden = false;
  }
}

// The Steam wishlist button: hidden until the store page is named above.
if (STEAM_WISHLIST) {
  for (const link of document.querySelectorAll("[data-steam]")) {
    Object.assign(link, { href: STEAM_WISHLIST, target: "_blank", rel: "noopener", hidden: false });
  }
}

// The latest clips: hidden until the list above has something in it.
const clips = document.querySelector("[data-clips]");
if (clips && LATEST_CLIPS.length) {
  const list = clips.querySelector("[data-clips-list]");
  for (const clip of LATEST_CLIPS.slice(0, LATEST_CLIPS_SHOWN)) {
    const item = document.createElement("li");
    const link = Object.assign(document.createElement("a"), { className: "clip", href: clip.url, target: "_blank", rel: "noopener" });
    const poster = Object.assign(document.createElement("img"), { src: clip.poster, alt: "", loading: "lazy" });
    const where = Object.assign(document.createElement("span"), { className: "clip__where", textContent: clip.where || "" });
    const title = Object.assign(document.createElement("span"), { className: "clip__title", textContent: clip.title || "" });
    link.append(poster, where, title);
    item.append(link);
    list.append(item);
  }
  clips.hidden = false;
}

// The bar turns solid once the hero has scrolled past, so the links stay readable over the sections below. The plain pages
// that load this file for their Discord button have no bar.
const bar = document.querySelector("[data-bar]");
if (bar) {
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
}

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

// Parallax: each layer drifts at its own data-depth, measured from where its section starts. A layer marked data-fade also
// fades as it rises; the hero's words no longer do (2026-11-04): they scroll with the page and stay solid.
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

// The factions: five answers and a mercenary. Picking a faction opens its plan and tints this section in its colour for this
// visit; a second tap closes it. Nothing is stored, as the privacy page promises, so every visit opens with none picked.
const pick = document.querySelector("[data-pick]");
if (pick) {
  // A faction's colour stays inside the FACTIONS section; the rest of the site keeps its own amber.
  const root = pick.closest(".factions") || pick;
  const marks = [...pick.querySelectorAll(".pick__mark[aria-controls]")];
  const panels = [...pick.querySelectorAll("[data-panel]")];
  const free = pick.querySelector(".pick__mark--free");
  // CR-11: after a pick, the page's Join buttons read "Join the Discord as <faction>", Torrath included; the same invite, and
  // the Discord's own onboarding gives the role. The bar's small button keeps its words, and closing a pick restores them.
  const joins = [...document.querySelectorAll("main [data-discord]")];
  const joinWords = joins.map((join) => join.textContent);
  let chosen = null;   // null: none picked. "": Torrath, who swears to none of them.
  const choose = (house) => {
    chosen = house;
    let accent = "";
    for (const mark of marks) mark.setAttribute("aria-expanded", String(mark.dataset.house === house));
    free?.setAttribute("aria-pressed", String(house === ""));
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
    if (DISCORD_INVITE) joins.forEach((join, i) => {
      const name = house === null ? "" : (house === "" ? "Torrath" : marks.find((mark) => mark.dataset.house === house)?.querySelector(".pick__name")?.textContent.trim());
      join.textContent = name ? `Join the Discord as ${name}` : joinWords[i];
    });
  };
  pick.classList.add("is-live");
  choose(null);
  // The colour fades only on a pick, never while the page first paints.
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("can-tint")));
  for (const button of [...marks, free]) button?.addEventListener("click", () => {
    // A row closing above the one tapped would pull it out from under the finger: hold it where it was.
    const before = button.getBoundingClientRect().top;
    choose(chosen === button.dataset.house ? null : button.dataset.house);
    const moved = button.getBoundingClientRect().top - before;
    if (Math.abs(moved) > 1) window.scrollBy({ top: moved, behavior: "instant" });
  });
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

// The Voyage Logs: always shown (CR-10). Each log in PUBLISHED_LOGS (assets/ship.js) gets a card, and the next one is
// teased as the next anticipated voyage log, by number only: the site does not publish the schedule. The crew card
// (CR-8) appears with the first log, filled from LOG_CREW (assets/ship.js).
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
  const crew = section.querySelector("[data-crew]");
  const who = typeof LOG_CREW !== "undefined" ? LOG_CREW : null;
  if (crew) {
    crew.hidden = !(published.length && who && who.name);
    if (!crew.hidden) {
      crew.querySelector("[data-crew-name]").textContent = who.name;
      crew.querySelector("[data-crew-role]").textContent = who.role || "";
      // The picture comes from LOG_CREW too, so nothing in the page itself shows the person before ship.js does.
      if (who.image && !crew.querySelector(".crew__image")) {
        const picture = make("img", "crew__image");
        Object.assign(picture, { src: who.image, alt: who.alt || "", width: 720, height: 540, decoding: "async" });
        crew.prepend(picture);
      }
    }
  }
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
