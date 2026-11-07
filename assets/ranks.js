/* The ranks in THE GAME: all twenty-two, in the game's own metal collar insignia, one at a time on a lit stage, and the commission
   that stands between the enlisted and the officers, in the game's own words. Names follow RankLadder, what each wears follows the
   insignia sheets, and the commission's answer follows CommissionOffer: any case, spaces collapsed. Nothing is stored. */
(function () {
  "use strict";
  const root = document.querySelector("[data-ranks]");
  if (!root) return;

  const FIRST_OFFICER = 12;
  const RANKS = [
    { name: "Private", wears: "A bare collar. Everyone starts here." },
    { name: "Private First Class", wears: "One chevron" },
    { name: "Lance Corporal", wears: "One chevron with a diamond beneath" },
    { name: "Corporal", wears: "Two chevrons" },
    { name: "Sergeant", wears: "Three chevrons" },
    { name: "Staff Sergeant", wears: "Three chevrons and one rocker" },
    { name: "Technical Sergeant", wears: "Three chevrons and two rockers" },
    { name: "Master Sergeant", wears: "Three chevrons and three rockers" },
    { name: "First Sergeant", wears: "Three chevrons and a raptor crest" },
    { name: "Battalion Sergeant", wears: "Three chevrons, a raptor crest and a diamond" },
    { name: "Sergeant Major", wears: "Three chevrons, a raptor crest and a star", note: "The top of the enlisted ranks. A pilot can stay here for good." },
    { name: "Second Lieutenant", wears: "One copper bar", note: "Reached only by accepting the commission." },
    { name: "First Lieutenant", wears: "One silver bar" },
    { name: "Captain", wears: "Two silver bars" },
    { name: "Major", wears: "A pair of copper feathers" },
    { name: "Lieutenant Colonel", wears: "A pair of silver feathers" },
    { name: "Colonel", wears: "A silver raptor crest" },
    { name: "Brigadier General", wears: "A gold raptor crest and one star" },
    { name: "Major General", wears: "A gold raptor crest and two stars" },
    { name: "Lieutenant General", wears: "A gold raptor crest and three stars" },
    { name: "General", wears: "A gold raptor crest and four stars" },
    { name: "General of the Faction", wears: "A gold raptor crest and five stars in a ring", note: "Not earned by service. Won by competition, by leading the faction, and kept for good." },
  ];
  const file = (rank, size) => `/assets/img/ranks/rank-${String(rank).padStart(2, "0")}-${size}.webp`;

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const tierOf = (rank) => (rank < FIRST_OFFICER ? "enlisted" : "officer");

  // ── the two tiers ────────────────────────────────────────────────────────
  const tabs = el("div", "ranks__tabs");
  tabs.setAttribute("role", "group");
  tabs.setAttribute("aria-label", "Rank tiers");
  const tab = (tier, label, span, opens) => {
    const b = el("button", "ranks__tab");
    b.type = "button";
    b.dataset.tier = tier;
    b.append(el("span", "ranks__tab-name", label), el("span", "ranks__tab-span", span));
    b.addEventListener("click", () => show(opens));
    tabs.append(b);
    return b;
  };
  const tierTabs = [tab("enlisted", "Enlisted", "Ranks 1 to 11", 1), tab("officer", "Officer", "Ranks 12 to 22", FIRST_OFFICER)];

  // ── the stage ────────────────────────────────────────────────────────────
  const stage = el("div", "ranks__stage");
  const device = el("div", "ranks__device");
  const picture = el("img");
  picture.alt = "";
  picture.dataset.noLabel = "";   // the stage carries one label; a narrow bar would otherwise take none
  const bare = el("div", "ranks__bare", "No insignia");
  device.append(picture, bare);
  const caption = el("div", "ranks__caption");
  caption.setAttribute("aria-live", "polite");
  const num = el("p", "ranks__num"), name = el("p", "ranks__name"), wears = el("p", "ranks__wears"), note = el("p", "ranks__note");
  caption.append(num, name, wears, note);
  const step = (cls, label, by) => {
    const b = el("button", `ranks__step ${cls}`);
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.addEventListener("click", () => show(current + by));
    return b;
  };
  const down = step("ranks__step--down", "One rank down", -1);
  const up = step("ranks__step--up", "One rank up", 1);
  const tag = el("span", "prealpha", "Pre-Alpha");
  stage.append(device, caption, down, up, tag);

  // ── the rungs of the tier on show ────────────────────────────────────────
  const rungs = el("div", "ranks__rungs");
  rungs.setAttribute("role", "group");
  rungs.setAttribute("aria-label", "Ranks");
  const rungFor = RANKS.map((rank, i) => {
    const n = i + 1;
    const b = el("button", "ranks__rung");
    b.type = "button";
    b.setAttribute("aria-label", `${rank.name}, rank ${n}`);
    if (n === 1) b.textContent = "—";
    else {
      const thumb = el("img");
      thumb.src = file(n, 96);
      thumb.alt = "";
      thumb.loading = "lazy";
      b.append(thumb);
    }
    b.addEventListener("click", () => show(n));
    return b;
  });

  root.append(tabs, stage, rungs);

  let current = 0;
  function show(n) {
    n = Math.max(1, Math.min(RANKS.length, n));
    if (n === current) return;
    const tierChanged = !current || tierOf(n) !== tierOf(current);
    current = n;
    const rank = RANKS[n - 1];
    num.textContent = `Rank ${n} of ${RANKS.length}`;
    name.textContent = rank.name;
    wears.textContent = rank.wears;
    note.textContent = rank.note || "";
    note.hidden = !rank.note;
    const isBare = n === 1;
    bare.hidden = !isBare;
    picture.hidden = isBare;
    if (!isBare) {
      const next = file(n, 480);
      picture.classList.add("is-loading");
      const loaded = new Image();
      loaded.onload = () => {
        if (current !== n) return;
        picture.src = next;
        picture.alt = `${rank.name}: ${rank.wears.toLowerCase()}`;
        picture.classList.remove("is-loading");
      };
      loaded.src = next;
    }
    down.disabled = n === 1;
    up.disabled = n === RANKS.length;
    if (tierChanged) {
      for (const b of tierTabs) b.setAttribute("aria-pressed", String(b.dataset.tier === tierOf(n)));
      rungs.replaceChildren(...rungFor.filter((_, i) => tierOf(i + 1) === tierOf(n)));
    }
    rungFor.forEach((b, i) => b.setAttribute("aria-pressed", String(i + 1 === n)));
  }
  show(11);   // opens on the top of the enlisted ranks, with the question beside it

  // ── the commission, in the game's words ──────────────────────────────────
  const offer = document.querySelector("[data-offer]");
  if (!offer) return;
  const screens = [...offer.querySelectorAll("[data-offer-screen]")];
  const open = (which) => { for (const s of screens) s.hidden = s.dataset.offerScreen !== which; };
  const field = offer.querySelector("[data-offer-field]");
  const accept = offer.querySelector("[data-offer-accept]");
  const defer = offer.querySelector("[data-offer-defer]");
  offer.querySelector("[data-offer-controls]").hidden = false;
  const isAcceptance = (typed) => typed.trim().split(/\s+/).join(" ").toUpperCase() === "I ACCEPT";
  field.addEventListener("input", () => { accept.disabled = !isAcceptance(field.value); });
  const answerYes = () => {
    if (!isAcceptance(field.value)) return;
    field.blur();
    field.value = "";
    accept.disabled = true;
    open("accepted");
    show(FIRST_OFFICER);
    // On a phone the stage is above the question: bring the new rank into view.
    const box = stage.getBoundingClientRect();
    if (box.top < 90 || box.bottom > innerHeight - 90) window.scrollBy({ top: box.top - 110, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  accept.addEventListener("click", answerYes);
  field.addEventListener("keydown", (e) => { if (e.key === "Enter") answerYes(); });
  defer.addEventListener("click", () => open("deferred"));
  for (const back of offer.querySelectorAll("[data-offer-back]")) back.addEventListener("click", () => open("ask"));
})();
