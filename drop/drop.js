// The scroll drop (test): the page's scroll position inside a tall track picks a frame of the game's opening, drawn on a
// canvas that stays on screen until the track ends, when the page carries on. The frames load only once the visitor has
// scrolled the track a quarter of the way onto the screen. Nothing is stored and nothing is sent anywhere.

(() => {
  const drop = document.querySelector("[data-drop]");
  if (!drop) return;
  document.documentElement.classList.remove("no-js");

  const count = Number(drop.dataset.frames);
  const source = (n) => drop.dataset.src.replace("{n}", String(n).padStart(3, "0"));
  const canvas = drop.querySelector("[data-drop-canvas]");
  const context = canvas.getContext("2d");
  const loading = drop.querySelector("[data-drop-loading]");
  const progress = drop.querySelector("[data-drop-progress]");
  const phases = [...drop.querySelectorAll("[data-from]")];
  const frames = new Array(count).fill(null);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let loaded = 0;
  let shown = -1;

  /** Which frame the scroll asks for: 0 at the top of the track, the last as its end leaves the screen. */
  const wanted = () => {
    if (reducedMotion) return count - 1;
    const box = drop.getBoundingClientRect();
    const travel = box.height - window.innerHeight;
    const share = travel > 0 ? Math.min(1, Math.max(0, -box.top / travel)) : 0;
    return Math.round(share * (count - 1));
  };

  /** The nearest loaded frame to the one asked for, so a fast scroll on a slow line still shows something close. */
  const nearestLoaded = (index) => {
    for (let step = 0; step < count; step++) {
      if (frames[index - step]) return index - step;
      if (frames[index + step]) return index + step;
    }
    return -1;
  };

  const fit = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * ratio);
    canvas.height = Math.round(canvas.clientHeight * ratio);
    shown = -1;
    draw();
  };

  function draw() {
    const index = wanted();
    const frame = nearestLoaded(index);
    progress.style.transform = `scaleX(${index / (count - 1)})`;
    for (const phase of phases) phase.classList.toggle("is-on", index >= Number(phase.dataset.from) && index <= Number(phase.dataset.to));
    if (frame < 0 || frame === shown) return;
    shown = frame;
    // Cover the canvas the way object-fit: cover would, centred.
    const image = frames[frame];
    const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  }

  /** Fetch the frames, the first ones first, and draw as they arrive. A visitor who asks for less motion gets the last
   *  frame only: the drop does not play for them. */
  const load = () => {
    const wantedFrames = reducedMotion ? [count - 1] : [...Array(count).keys()];
    for (const n of wantedFrames) {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        frames[n] = image;
        loaded++;
        if (loaded === wantedFrames.length) loading.hidden = true;
        else loading.textContent = `Loading the drop · ${Math.round((loaded / wantedFrames.length) * 100)}%`;
        draw();
      };
      image.src = source(n);
    }
  };

  const near = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    near.disconnect();
    load();
  }, { rootMargin: "0px 0px -25% 0px" });   // once the track's top is a quarter of the way up the screen
  near.observe(drop);

  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; draw(); });
  }, { passive: true });
  window.addEventListener("resize", fit);
  fit();
})();
