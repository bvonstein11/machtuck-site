/* machtuck.com — the clan patch maker in THE GAME's first pillar, "Fly for a clan".
   The game's own designer, on the page: the same pieces (assets/patch/, built from the game's library by
   Tools/website/build_patch_library.py), the same rules and the same stitching (assets/patch.js, a checked port of the
   game's code). Nothing is stored: the design lives in the page and in its patch code, which the pilot copies, shares as
   a link (#patch=<code>), or pastes back in. The library loads only as the pillar comes near. */
(() => {
  "use strict";
  const root = document.querySelector("[data-patchmaker]");
  const P = window.ReachPatch;
  if (!root || !P || !window.fetch || !window.Promise) return;

  const BASE = "/assets/patch/";
  const PATCH_WIDTH = 512, INLAY_WIDTH = 464;   // the game's own sizes (ClanPatchArt), so the stitches look as they do there
  const THUMB_SHOWN = 48;
  // {CC} the names of each split's pieces, top or left first, as the game numbers them
  const PIECES = {
    solid: ["Field"], fess: ["Top", "Bottom"], pale: ["Left", "Right"], fess3: ["Top", "Middle", "Bottom"],
    pale3: ["Left", "Middle", "Right"], chief_pale: ["Top left", "Top right", "Bottom"], base_pale: ["Top", "Bottom left", "Bottom right"],
  };
  const PIECE_KEYS = ["field", "field2", "field3"];
  const TABS = [["field", "Field"], ["border", "Border"], ["emblem", "Emblem"], ["layout", "Layout"], ["inlay", "Inlay"]];
  // the game's own lines when a design may not be worn (PatchDesignerScreen)
  const HELD = {
    blocked: ["That combination is not allowed.", "Change the layout or an emblem."],
    studio: ["Block M and T stacked is the studio's mark.", "Change the layout or a letter."],
  };

  const SHARED = "A pilot shared this patch with you. Change anything to make it yours.";
  let rules = null, design = null, tab = "field", piece = 0, slot = 1, group = "charges", held = "";
  const masks = new Map(), ready = new Map();

  // ── building blocks ─────────────────────────────────────────────────────────────────────────────────────────────
  const el = (tag, className, text) => {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
  };
  const button = (className, text, onClick, pressed) => {
    const b = el("button", className, text);
    b.type = "button";
    if (pressed != null) b.setAttribute("aria-pressed", String(!!pressed));
    b.addEventListener("click", onClick);
    return b;
  };
  const title = (s) => s.charAt(0) + s.slice(1).toLowerCase();
  const nameOf = (hex) => (rules.palette.find((p) => p[1] === hex) || ["", hex])[0];
  const emblemName = (id) => {
    if (!id) return "none";
    const all = rules.charges.concat(rules.blockLetters, rules.serifLetters);
    const e = all.find((x) => x.id === id);
    const n = e ? e.name : id;
    return id.startsWith("Block_") ? "block " + n : id.startsWith("Letter_") ? "serif " + n : n.toLowerCase();
  };

  // ── the stage ───────────────────────────────────────────────────────────────────────────────────────────────────
  const fallback = root.querySelector("img");
  const maker = el("div", "maker");
  const stage = el("div", "maker__stage");
  const patchFigure = el("figure", "maker__patch");
  const patchCanvas = el("canvas");
  patchCanvas.width = PATCH_WIDTH; patchCanvas.height = 625;
  patchCanvas.setAttribute("role", "img");
  patchFigure.append(patchCanvas, el("figcaption", "", "The patch · every pilot wears it"));
  const tileFigure = el("figure", "maker__tile");
  const tileFrame = el("div", "maker__tileframe");
  const tileImage = el("img");
  tileImage.alt = "";
  tileImage.width = 420; tileImage.height = 512;
  const inlayCanvas = el("canvas", "maker__inlay");
  inlayCanvas.width = INLAY_WIDTH; inlayCanvas.height = 548;
  inlayCanvas.setAttribute("aria-hidden", "true");
  const tileCaption = el("figcaption", "", "The clan tile");
  tileFrame.append(tileImage, inlayCanvas);
  tileFigure.append(tileFrame, tileCaption);
  const heldNote = el("p", "maker__held");
  heldNote.hidden = true;
  heldNote.setAttribute("role", "status");
  stage.append(patchFigure, tileFigure, heldNote);

  const tabBar = el("div", "maker__tabs");
  tabBar.setAttribute("role", "tablist");
  tabBar.setAttribute("aria-label", "Patch designer");
  const tabButtons = TABS.map(([id, label]) => {
    const b = button("maker__tab", label, () => { tab = id; drawControls(); });
    b.setAttribute("role", "tab");
    b.dataset.tab = id;
    return b;
  });
  const shuffle = button("maker__shuffle", "Shuffle", () => {
    design = Object.assign({}, rules.sims[Math.floor(Math.random() * rules.sims.length)]);
    slot = 1; piece = 0;
    changed();
  });
  shuffle.title = "A patch the game made for one of its clans";
  tabBar.append(...tabButtons, shuffle);
  const panel = el("div", "maker__panel");
  panel.setAttribute("role", "tabpanel");

  const codeRow = el("div", "maker__code");
  const codeLabel = el("label", "maker__code-label", "Patch code");
  const codeInput = el("input", "maker__code-input");
  codeInput.id = "patch-code";
  codeLabel.htmlFor = codeInput.id;
  codeInput.spellcheck = false;
  codeInput.autocomplete = "off";
  codeInput.setAttribute("autocapitalize", "off");
  const codeStatus = el("p", "maker__status");
  codeStatus.setAttribute("aria-live", "polite");
  const say = (text) => { codeStatus.textContent = text; };
  const copy = (text, done) => {
    const fallbackCopy = () => { codeInput.select(); say("Selected. Copy it with your keyboard."); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => say(done), fallbackCopy);
    else fallbackCopy();
  };
  const link = () => location.origin + location.pathname + "#patch=" + P.encode(rules, design);
  const copyCode = button("maker__action", "Copy code", () => copy(P.encode(rules, design), "Code copied. Paste it here any time to bring this patch back."));
  const copyLink = button("maker__action", "Copy link", () => copy(link(), "Link copied. It opens this patch."));
  const save = button("maker__action", "Save picture", () => {
    patchCanvas.toBlob((blob) => {
      if (!blob) return;
      const a = el("a");
      a.href = URL.createObjectURL(blob);
      a.download = "clan-patch.png";
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, "image/png");
  });
  codeInput.addEventListener("change", () => {
    const d = P.decode(rules, codeInput.value);
    if (!d) { say("That is not a patch code."); return; }
    design = d;
    changed();
    say("Patch loaded from its code.");
  });
  const actions = el("div", "maker__actions");
  actions.append(copyCode, copyLink, save);
  codeRow.append(codeLabel, codeInput, actions, codeStatus);

  maker.append(stage, tabBar, panel, codeRow);

  // ── the controls ────────────────────────────────────────────────────────────────────────────────────────────────
  function swatches(key, label) {
    const wrap = el("div", "maker__row");
    if (label) wrap.append(el("p", "maker__label", label));
    const list = el("div", "maker__swatches");
    for (const [name, hex] of rules.palette) {
      const b = button("maker__swatch", "", () => { design[key] = hex; changed(); }, design[key] === hex);
      b.style.setProperty("--swatch", "#" + hex);
      b.setAttribute("aria-label", title(name));
      b.title = title(name);
      list.append(b);
    }
    wrap.append(list);
    return wrap;
  }

  function chips(items, current, pick, label, disabled) {
    const wrap = el("div", "maker__row");
    if (label) wrap.append(el("p", "maker__label", label));
    const list = el("div", "maker__chips");
    for (const [value, text] of items) {
      const b = button("maker__chip", text, () => pick(value), value === current);
      if (disabled) b.disabled = true;
      list.append(b);
    }
    wrap.append(list);
    return wrap;
  }

  /** A field split drawn small, in the design's own colours. */
  function splitPreview(pattern) {
    const [a, b, c] = PIECE_KEYS.map((k) => "#" + design[k]);
    const s = el("span", "maker__split");
    const cut = Math.round(rules.centreV * 100) + "%";
    const bg = {
      solid: a,
      fess: `linear-gradient(to bottom, ${a} ${cut}, ${b} ${cut})`,
      pale: `linear-gradient(to right, ${a} 50%, ${b} 50%)`,
      fess3: `linear-gradient(to bottom, ${a} 33.33%, ${b} 33.33% 66.67%, ${c} 66.67%)`,
      pale3: `linear-gradient(to right, ${a} 33.33%, ${b} 33.33% 66.67%, ${c} 66.67%)`,
      chief_pale: `linear-gradient(to right, ${a} 50%, ${b} 50%) top / 100% ${cut} no-repeat, ${c}`,
      base_pale: `linear-gradient(to bottom, ${a} ${cut}, transparent ${cut}), linear-gradient(to right, ${b} 50%, ${c} 50%)`,
    }[pattern];
    s.style.background = bg;
    return s;
  }

  function emblemGrid() {
    const groups = [["charges", "Emblems"], ["blockLetters", "Block letters"], ["serifLetters", "Serif letters"]];
    const wrap = el("div", "maker__row");
    wrap.append(chips(groups, group, (g) => { group = g; drawControls(); }, ""));
    const grid = el("div", "maker__grid");
    const key = "emblem" + slot;
    const cell = rules.thumbs.cell, cols = rules.thumbs.cols, scale = THUMB_SHOWN / cell;
    const none = button("maker__pick maker__pick--none", "None", () => { design[key] = ""; changed(); }, !design[key]);
    grid.append(none);
    for (const e of rules[group]) {
      const i = rules.thumbs.order.indexOf(e.id);
      const b = button("maker__pick", "", () => { design[key] = e.id; changed(); }, design[key] === e.id);
      const art = el("span", "maker__pick-art");
      art.style.backgroundPosition = `-${(i % cols) * cell * scale}px -${Math.floor(i / cols) * cell * scale}px`;
      art.style.backgroundSize = `${cols * THUMB_SHOWN}px auto`;
      b.append(art);
      b.setAttribute("aria-label", title(e.name));
      b.title = title(e.name);
      grid.append(b);
    }
    wrap.append(grid);
    return wrap;
  }

  let gridScroll = 0;
  function drawControls() {
    const oldGrid = panel.querySelector(".maker__grid");
    if (oldGrid) gridScroll = oldGrid.scrollTop;
    for (const b of tabButtons) b.setAttribute("aria-selected", String(b.dataset.tab === tab));
    panel.replaceChildren();
    const n = P.fieldColours(rules, design.pattern);
    if (piece >= n) piece = 0;
    if (tab === "field") {
      const list = el("div", "maker__chips maker__chips--splits");
      rules.patterns.forEach((p, i) => {
        const b = button("maker__chip maker__chip--split", "", () => { design.pattern = p; changed(); }, design.pattern === p);
        b.append(splitPreview(p), el("span", "", title(rules.patternNames[i])));
        list.append(b);
      });
      const row = el("div", "maker__row");
      row.append(el("p", "maker__label", "Split"), list);
      panel.append(row);
      if (n > 1) panel.append(chips(PIECES[design.pattern].map((label, i) => [i, label]), piece, (i) => { piece = i; drawControls(); }, "Piece"));
      panel.append(swatches(PIECE_KEYS[piece], "Colour"));
    } else if (tab === "border") {
      panel.append(swatches("border", "Border thread"));
    } else if (tab === "emblem") {
      panel.append(chips([[1, "First emblem"], [2, "Second emblem"]], slot, (s) => { slot = s; drawControls(); }, ""));
      if (design["emblem" + slot]) panel.append(swatches("color" + slot, "Thread"));
      panel.append(emblemGrid());
    } else if (tab === "layout") {
      const two = !!design.emblem2;
      panel.append(chips(rules.layouts.map((l, i) => [l, title(rules.layoutNames[i])]), two ? design.layout : "single",
        (l) => { design.layout = l; changed(); }, "Two emblems", !two));
      if (!two) panel.append(el("p", "maker__hint", "Pick a second emblem to stack them, set them side by side or lay one over the other."));
      const room = P.hasWingRoom(design);
      panel.append(chips([["", "None"]].concat(rules.wingStyles.map((w) => [w, title(w) + " wings"])), room ? design.wings : "",
        (w) => { design.wings = w; changed(); }, "Wings", !room));
      if (!room) panel.append(el("p", "maker__hint", "Two emblems side by side leave no room for wings."));
    } else {
      panel.append(chips(rules.inlays.map((m, i) => [m, title(rules.inlayNames[i])]), design.inlay, (m) => { design.inlay = m; changed(); }, "The clan tile's inlay"));
      panel.append(el("p", "maker__hint", "The same design, set into the clan's tile: the field in enamel, the emblems raised in metal or cut in stone."));
    }
    const grid = panel.querySelector(".maker__grid");
    if (grid) grid.scrollTop = gridScroll;
  }

  // ── drawing ─────────────────────────────────────────────────────────────────────────────────────────────────────
  function loadMask(id) {
    if (!id) return Promise.resolve(null);
    if (!masks.has(id)) {
      masks.set(id, new Promise((resolve) => {
        const image = new Image();
        image.decoding = "async";
        image.onload = () => {
          const c = document.createElement("canvas");
          c.width = image.naturalWidth; c.height = image.naturalHeight;
          const g = c.getContext("2d", { willReadFrequently: true });
          g.drawImage(image, 0, 0);
          const px = g.getImageData(0, 0, c.width, c.height).data;
          const a = new Uint8Array(c.width * c.height);
          for (let i = 0; i < a.length; i++) a[i] = px[i * 4];
          const m = P.mask(c.width, c.height, a);
          ready.set(id, m);
          resolve(m);
        };
        image.onerror = () => resolve(null);
        image.src = BASE + "m/" + id + ".png";
      }));
    }
    return masks.get(id);
  }
  const lib = {
    emblem: (id) => (id && ready.get(id)) || null,
    wing: (style, left) => (style ? ready.get("Wing_" + style + (left ? "_L" : "_R")) || null : null),
  };

  function paint(canvas, picture) {
    if (canvas.width !== picture.W) canvas.width = picture.W;
    if (canvas.height !== picture.H) canvas.height = picture.H;
    canvas.getContext("2d").putImageData(new ImageData(picture.data, picture.W, picture.H), 0, 0);
  }

  function describe(d) {
    const pieces = PIECE_KEYS.slice(0, P.fieldColours(rules, d.pattern)).map((k) => nameOf(d[k]).toLowerCase());
    const emblems = [d.emblem1, d.emblem2].filter(Boolean).map(emblemName);
    return `Clan patch: a ${pieces.join(", ")} field, ${emblems.length ? emblems.join(" and ") : "no emblem"}` +
      `${d.wings && P.hasWingRoom(d) ? " with wings" : ""}, edged in ${nameOf(d.border).toLowerCase()}`;
  }

  let drawing = false, again = false;
  async function draw() {
    if (drawing) { again = true; return; }
    drawing = true;
    do {
      again = false;
      const d = Object.assign({}, design);
      held = P.isBlocked(rules, d) ? "blocked" : P.isStudioMark(d) ? "studio" : "";
      stage.classList.toggle("is-held", !!held);
      heldNote.hidden = !held;
      if (held) heldNote.replaceChildren(...HELD[held].map((line) => el("span", "", line)));
      for (const b of [copyCode, copyLink, save]) b.disabled = !!held;
      codeInput.value = held ? "" : P.encode(rules, d);
      tileCaption.textContent = "The clan tile · " + title(rules.inlayNames[rules.inlays.indexOf(d.inlay)] || "");
      if (held) continue;
      await Promise.all(["Shield_" + rules.shape, "Recess", d.emblem1, d.emblem2,
        d.wings ? "Wing_" + d.wings + "_L" : "", d.wings ? "Wing_" + d.wings + "_R" : ""].map(loadMask));
      // let the pressed button show before the drawing holds the page; a hidden tab runs no frames, so a timer backs it up
      await new Promise((r) => { requestAnimationFrame(() => setTimeout(r, 0)); setTimeout(r, 80); });
      if (again) continue;
      const out = P.render(rules, d, lib, PATCH_WIDTH, INLAY_WIDTH);
      paint(patchCanvas, out.patch);
      paint(inlayCanvas, out.inlay);
      patchCanvas.setAttribute("aria-label", describe(d));
      stage.classList.add("is-drawn");
    } while (again);
    drawing = false;
  }

  function changed() {
    say("");
    drawControls();
    draw();
  }

  /** Jump to the maker, as a link to an anchor does: the page scrolls smoothly, which a long way down is slow. The
   *  maker's top goes just under the header (the page's scroll-padding-top): centred, a maker taller than the screen
   *  hid the shared patch behind the header. */
  function showMaker() {
    const html = document.documentElement, was = html.style.scrollBehavior;
    html.style.scrollBehavior = "auto";
    root.scrollIntoView({ block: "start" });
    html.style.scrollBehavior = was;
  }

  // ── start ───────────────────────────────────────────────────────────────────────────────────────────────────────
  function fromLink() {
    const m = /^#patch=(.+)$/.exec(location.hash);
    if (!m) return null;
    const d = P.decode(rules, decodeURIComponent(m[1]));
    return d && !P.isBlocked(rules, d) && !P.isStudioMark(d) ? d : null;
  }

  async function start() {
    try {
      rules = await (await fetch(BASE + "library.json")).json();
    } catch (e) {
      return;   // the picture stays; the page works without the maker
    }
    const r = rules.recessRect;
    inlayCanvas.style.left = (r.x / r.tileW) * 100 + "%";
    inlayCanvas.style.top = (r.y / r.tileH) * 100 + "%";
    inlayCanvas.style.width = (r.w / r.tileW) * 100 + "%";
    inlayCanvas.style.height = (r.h / r.tileH) * 100 + "%";
    tileImage.src = BASE + "tile.webp";
    const shared = fromLink();
    design = shared || Object.assign({}, rules.sims[Math.floor(Math.random() * rules.sims.length)]);
    if (fallback) fallback.remove();
    root.classList.add("is-live");
    root.append(maker);
    const note = document.querySelector("[data-patchmaker-note]");
    if (note) note.hidden = false;
    drawControls();
    await draw();
    if (shared) {
      say(SHARED);
      showMaker();
    }
  }

  window.addEventListener("hashchange", () => {
    if (!rules) return;
    const d = fromLink();
    if (d) { design = d; changed(); say(SHARED); showMaker(); }
  });

  // a shared link starts at once; otherwise the library loads as the pillar comes near
  if (/^#patch=/.test(location.hash) || !("IntersectionObserver" in window)) start();
  else {
    const near = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { near.disconnect(); start(); }
    }, { rootMargin: "900px 0px" });
    near.observe(root);
  }
})();
