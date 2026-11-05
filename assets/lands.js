// THE WORLD's five lands: each pin on the map of The Reach, each name in the phone legend, and a click on a land's own
// part of the picture open that land's panel, with its pictures. Without scripts the panels read as a list under the
// map and the pins are links to them. Nothing is stored and nothing is sent anywhere.
(() => {
  const map = document.querySelector("[data-reach-map]");
  const lands = document.querySelector("[data-lands]");
  if (!map || !lands || typeof HTMLDialogElement !== "function") return;

  const articles = [...lands.querySelectorAll(".land[data-land]")];
  const ids = articles.map((article) => article.dataset.land);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // The panel: one dialog the five lands move into, with a close button and the way to the next land and the last.
  const dialog = document.createElement("dialog");
  dialog.className = "lands-dialog";
  dialog.innerHTML = `
    <div class="lands-dialog__bar">
      <p class="lands-dialog__count" aria-live="polite"></p>
      <button type="button" class="lands-dialog__close" data-close aria-label="Close">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>
      </button>
    </div>
    <div class="lands-dialog__body"></div>
    <nav class="lands-dialog__nav" aria-label="The other lands">
      <button type="button" class="lands-dialog__go" data-go="-1"><span aria-hidden="true">&larr;</span> <span data-go-name></span></button>
      <button type="button" class="lands-dialog__go" data-go="1"><span data-go-name></span> <span aria-hidden="true">&rarr;</span></button>
    </nav>`;
  dialog.querySelector(".lands-dialog__body").append(lands);
  lands.classList.add("is-panel");
  document.body.append(dialog);
  const count = dialog.querySelector(".lands-dialog__count");
  const goButtons = [...dialog.querySelectorAll("[data-go]")];

  // Each land's pictures: one on show, the others a tap, a swipe or an arrow key away, and a strip of thumbnails.
  const galleries = new Map();
  for (const article of articles) {
    const gallery = article.querySelector("[data-gallery]");
    const shots = [...gallery.querySelectorAll(".land__shot")];
    const stage = gallery.querySelector(".land__stage");
    const thumbs = document.createElement("div");
    thumbs.className = "land__thumbs";
    thumbs.setAttribute("role", "group");
    thumbs.setAttribute("aria-label", "Pictures");
    shots.forEach((shot, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "land__thumb";
      button.setAttribute("aria-label", `Picture ${index + 1} of ${shots.length}: ${shot.querySelector("img").alt}`);
      const image = document.createElement("img");
      image.src = shot.dataset.thumb;
      image.alt = "";
      image.width = 240; image.height = 135;
      image.loading = "lazy"; image.decoding = "async";
      button.append(image);
      button.addEventListener("click", () => state.show(index));
      thumbs.append(button);
    });
    gallery.append(thumbs);
    for (const step of [-1, 1]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `land__step land__step--${step < 0 ? "prev" : "next"}`;
      button.setAttribute("aria-label", step < 0 ? "Previous picture" : "Next picture");
      button.innerHTML = `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="${step < 0 ? "M15 4l-8 8 8 8" : "M9 4l8 8-8 8"}" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>`;
      button.addEventListener("click", () => state.show(state.index + step));
      stage.append(button);
    }
    const state = {
      index: 0,
      show(index) {
        this.index = (index + shots.length) % shots.length;
        shots.forEach((shot, k) => shot.classList.toggle("is-on", k === this.index));
        [...thumbs.children].forEach((thumb, k) => thumb.setAttribute("aria-pressed", String(k === this.index)));
      },
    };
    // A swipe across the picture steps it, as on a phone's photo viewer; a tap on a button still works.
    let from = null;
    stage.addEventListener("pointerdown", (event) => { if (event.pointerType !== "mouse") from = { x: event.clientX, y: event.clientY }; });
    stage.addEventListener("pointerup", (event) => {
      if (!from) return;
      const dx = event.clientX - from.x, dy = event.clientY - from.y;
      from = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) state.show(state.index + (dx < 0 ? 1 : -1));
    });
    stage.addEventListener("pointercancel", () => { from = null; });
    state.show(0);
    galleries.set(article, state);
  }

  let current = -1;
  let opener = null;
  const show = (index) => {
    current = (index + articles.length) % articles.length;
    articles.forEach((article, k) => { article.hidden = k !== current; });
    const article = articles[current];
    dialog.setAttribute("aria-labelledby", article.querySelector("h3").id);
    count.textContent = `${current + 1} of ${articles.length} · The Reach`;
    goButtons.forEach((button) => {
      const other = articles[(current + Number(button.dataset.go) + articles.length) % articles.length];
      const name = other.querySelector("h3").textContent;
      button.querySelector("[data-go-name]").textContent = name;
      button.setAttribute("aria-label", `${Number(button.dataset.go) < 0 ? "Back to" : "On to"} ${name}`);
    });
    galleries.get(article).show(0);
    dialog.querySelector(".lands-dialog__body").scrollTop = 0;
    dialog.scrollTop = 0;
  };
  const open = (id, from) => {
    const index = ids.indexOf(id);
    if (index < 0) return;
    opener = from || null;
    show(index);
    if (!dialog.open) {
      dialog.showModal();
      document.documentElement.classList.add("has-panel");
    }
    dialog.querySelector("[data-close]").focus({ preventScroll: true });
  };
  const close = () => { if (dialog.open) dialog.close(); };
  dialog.addEventListener("close", () => {
    document.documentElement.classList.remove("has-panel");
    // A panel opened from a link to it (#land-…) lets the address go back to the page, or a reload would reopen it.
    if (location.hash.startsWith("#land-")) history.replaceState(null, "", location.pathname + location.search);
    if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();   // a click on the dimmed page round the panel
    if (event.target.closest("[data-close]")) close();
    const go = event.target.closest("[data-go]");
    if (go) show(current + Number(go.dataset.go));
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.target.closest("input, textarea, select")) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const gallery = galleries.get(articles[current]);
      gallery.show(gallery.index + (event.key === "ArrowRight" ? 1 : -1));
    }
  });

  // The pins and the legend's names: links to the lands without scripts, the panel with them.
  for (const link of document.querySelectorAll("[data-land-open]")) {
    link.setAttribute("aria-haspopup", "dialog");
    link.addEventListener("click", (event) => { event.preventDefault(); open(link.dataset.landOpen, link); });
  }

  // A click anywhere on the picture opens the land whose middle is nearest it, and the pointer lights that land's pin.
  const frame = map.querySelector(".reach-map__frame");
  const pins = [...map.querySelectorAll(".reach-map__pins li")].map((item) => {
    const style = getComputedStyle(item);
    return { item, link: item.querySelector("a"), x: parseFloat(style.getPropertyValue("--cx")), y: parseFloat(style.getPropertyValue("--cy")) };
  });
  const nearest = (event) => {
    const box = frame.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * 100, y = ((event.clientY - box.top) / box.height) * 100;
    let best = null, bestD = Infinity;
    for (const pin of pins) {
      const d = (pin.x - x) ** 2 + ((pin.y - y) * (box.height / box.width)) ** 2;   // in the picture's own proportions
      if (d < bestD) { bestD = d; best = pin; }
    }
    return best;
  };
  frame.classList.add("is-live");
  frame.addEventListener("click", (event) => {
    if (event.target.closest("a")) return;
    const pin = nearest(event);
    if (pin) open(pin.link.dataset.landOpen, pin.link);
  });
  frame.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    const pin = nearest(event);
    for (const p of pins) p.item.classList.toggle("is-hot", p === pin);
  });
  frame.addEventListener("pointerleave", () => { for (const p of pins) p.item.classList.remove("is-hot"); });

  // A link to a land (#land-desert) opens its panel, on arrival or later.
  const fromHash = () => {
    const id = location.hash.replace(/^#land-/, "");
    if (location.hash.startsWith("#land-") && ids.includes(id)) open(id, null);
  };
  window.addEventListener("hashchange", fromHash);
  fromHash();
  if (reducedMotion) dialog.classList.add("is-still");
})();
