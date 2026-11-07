// Every picture on the site says Pre-Alpha, from this one place. It watches each picture's size rather than a list of pages, so a
// picture that appears later (a land's panel, a new page) gets its label too, and a thumbnail or an icon does not.
(() => {
  if (!("ResizeObserver" in window)) return;

  /** Narrower than SMALLEST is an icon. Narrower than FULL_SIZE takes the small label, so a weapon's card is not all label. */
  const SMALLEST = 140, FULL_SIZE = 220;

  /**
   * Not pictures of the game, or already labelled: the marks and the title lettering, the page's sky, the chapter buttons and a land's
   * thumbnails (the big picture above them carries it), and the war table, which draws its own.
   */
  const NOT_A_PICTURE = ".bar__brand, .foot__brand, .doc-bar, .studio__mark, .hero__copy, .world__sky, .tiles, .land__thumbs, .upg__coin, .hero__shadow, [data-frontmap], [data-no-label], img[src*='wordmark'], img[src*='title'], img[src*='/mt-']";

  /** What holds a picture and its label, where the picture's parent would be too small or would move with it. */
  const HOLDERS = ".hero__stage, .open, .stage__view, .archive__view, .story__art, .reach-map__frame, .land__shot, .pillars__art, .game__medals, .join__art, .bay, .lbay__bay, .piece__stage, .ord__art, .salv__frame, .salv__crate, figure, li";

  const seen = new WeakSet();

  function label(picture) {
    const width = picture.getBoundingClientRect().width;
    if (width < SMALLEST) return;
    const holder = picture.closest(HOLDERS) || picture.parentElement;
    if (!holder || holder.querySelector(":scope > .prealpha")) return;
    if (getComputedStyle(holder).position === "static") holder.style.position = "relative";
    const tag = document.createElement("span");
    tag.className = width < FULL_SIZE ? "prealpha prealpha--small" : "prealpha";
    tag.textContent = "Pre-Alpha";
    holder.append(tag);
  }

  const sizes = new ResizeObserver(entries => entries.forEach(entry => label(entry.target)));
  function watch(picture) {
    if (seen.has(picture) || picture.closest(NOT_A_PICTURE)) return;
    seen.add(picture);
    sizes.observe(picture);
  }

  document.querySelectorAll("img").forEach(watch);
  new MutationObserver(changes => changes.forEach(change => change.addedNodes.forEach(node => {
    if (node.nodeType !== 1) return;
    if (node.tagName === "IMG") watch(node);
    else node.querySelectorAll("img").forEach(watch);
  }))).observe(document.documentElement, { childList: true, subtree: true });
})();
