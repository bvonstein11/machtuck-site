/* The Armory's loadout bay and ordnance strip. The page reads whole without this: every card is a link to its entry and every
   hardpoint card a link to the strip. With it, the strip filters by where a piece goes, a hardpoint card filters it to what
   fits there, a piece under the pointer lights the hardpoints it fits, and on a wide screen a line runs from each hardpoint
   card to its mark on the VIGIL. */
(() => {
  "use strict";

  const strip = document.querySelector("[data-ord]");
  const tabs = document.querySelector("[data-ord-tabs]");
  const bay = document.querySelector("[data-lbay]");
  if (!strip || !tabs || !bay) return;

  const cards = [...strip.querySelectorAll(".ord__card")];
  const buttons = [...tabs.querySelectorAll("button[data-filter]")];
  const slots = [...bay.querySelectorAll(".hp[data-slot]")];
  const marks = [...bay.querySelectorAll(".lbay__mark[data-mark]")];
  const svg = bay.querySelector("[data-lbay-lines]");
  const paths = new Map();   // a hardpoint's key → its line

  // The filter: all, or one mount (arm, shoulder, torso).
  const filter = (mount) => {
    for (const card of cards) card.hidden = mount !== "all" && card.dataset.mount !== mount;
    for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset.filter === mount));
  };
  for (const button of buttons) button.addEventListener("click", () => filter(button.dataset.filter));
  tabs.hidden = false;

  // A hardpoint card filters the strip to what fits it; its link then scrolls to the strip.
  for (const slot of slots) slot.addEventListener("click", () => filter(slot.dataset.accepts));

  // Light the hardpoints a mount fits: their marks, their cards and their lines.
  const light = (mount) => {
    for (const mark of marks) mark.classList.toggle("is-lit", mount !== null && mark.dataset.accepts === mount);
    for (const slot of slots) {
      const on = mount !== null && slot.dataset.accepts === mount;
      slot.classList.toggle("is-lit", on);
      paths.get(slot.dataset.slot)?.classList.toggle("is-lit", on);
    }
  };
  const lightOne = (key) => {
    for (const mark of marks) mark.classList.toggle("is-lit", mark.dataset.mark === key);
    for (const [k, path] of paths) path.classList.toggle("is-lit", k === key);
  };
  for (const card of cards) {
    const link = card.querySelector("a");
    link.addEventListener("pointerenter", () => light(card.dataset.mount));
    link.addEventListener("pointerleave", () => light(null));
    link.addEventListener("focus", () => light(card.dataset.mount));
    link.addEventListener("blur", () => light(null));
  }
  for (const slot of slots) {
    slot.addEventListener("pointerenter", () => lightOne(slot.dataset.slot));
    slot.addEventListener("pointerleave", () => lightOne(null));
    slot.addEventListener("focus", () => lightOne(slot.dataset.slot));
    slot.addEventListener("blur", () => lightOne(null));
  }

  // The lines: from the inner edge of each hardpoint card, level, then in to its mark. Only while the cards stand beside the
  // bay (the wide layout shows the svg); drawn again whenever the layout can have moved.
  const NS = "http://www.w3.org/2000/svg";
  const draw = () => {
    if (!svg || getComputedStyle(svg).display === "none") return;
    const box = bay.getBoundingClientRect();
    svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
    svg.replaceChildren();
    paths.clear();
    for (const slot of slots) {
      const mark = marks.find((m) => m.dataset.mark === slot.dataset.slot);
      if (!mark) continue;
      const s = slot.getBoundingClientRect(), m = mark.getBoundingClientRect();
      const mx = m.left + m.width / 2 - box.left, my = m.top + m.height / 2 - box.top;
      const fromLeft = s.right - box.left < mx;
      const sx = fromLeft ? s.right - box.left : s.left - box.left, sy = s.top + s.height / 2 - box.top;
      const elbow = mx + (fromLeft ? -1 : 1) * Math.min(36, Math.abs(mx - sx) / 3);
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", `M${sx},${sy} H${elbow} L${mx},${my}`);
      const dot = document.createElementNS(NS, "circle");
      dot.setAttribute("cx", sx); dot.setAttribute("cy", sy); dot.setAttribute("r", 2.5);
      svg.append(path, dot);
      paths.set(slot.dataset.slot, path);
    }
  };
  let queued = false;
  const redraw = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; draw(); }); } };
  addEventListener("resize", redraw);
  if ("ResizeObserver" in window) new ResizeObserver(redraw).observe(bay);
  for (const img of bay.querySelectorAll("img")) if (!img.complete) img.addEventListener("load", redraw, { once: true });
  document.fonts?.ready.then(redraw);
  draw();
})();
