// The press kit's two slots and its copy buttons. Add to the lists below by hand; while both are empty the page shows its
// one-line note instead. A new screenshot's file goes in presskit/files/ named screenshot-<what>.jpg, and
// Tools/website/build_press_kit.py then puts it in the zip.

/**
 * The trailer, or null. `url` is where it plays (the page links out: no video player loads from another site), and `poster`
 * a picture on this site:
 *   { url: "https://...", poster: "/presskit/files/trailer-poster.jpg", title: "Announcement trailer", length: "0:45" }
 */
const PRESS_TRAILER = null;

/**
 * Screenshots from the current build, best first:
 *   { file: "/presskit/files/screenshot-cockpit.jpg", alt: "What it shows", caption: "Cockpit, Snow Highlands · 2560 × 1440" }
 */
const PRESS_SCREENSHOTS = [];

const trailerSlot = document.querySelector("[data-press-trailer]");
const shotsSlot = document.querySelector("[data-press-shots]");

if (PRESS_TRAILER) {
  const link = Object.assign(document.createElement("a"), { href: PRESS_TRAILER.url, target: "_blank", rel: "noopener" });
  link.append(Object.assign(document.createElement("img"), { src: PRESS_TRAILER.poster, alt: "", loading: "lazy" }));
  const words = [PRESS_TRAILER.title, PRESS_TRAILER.length].filter(Boolean).join(" · ");
  trailerSlot.append(link, Object.assign(document.createElement("p"), { textContent: words }));
  trailerSlot.hidden = false;
}

for (const shot of PRESS_SCREENSHOTS) {
  const item = document.createElement("li");
  const link = Object.assign(document.createElement("a"), { href: shot.file });
  link.setAttribute("download", "");
  link.append(Object.assign(document.createElement("img"), { src: shot.file, alt: shot.alt || "", loading: "lazy" }));
  item.append(link, Object.assign(document.createElement("p"), { textContent: shot.caption || "" }));
  shotsSlot.append(item);
  shotsSlot.hidden = false;
}

if (PRESS_TRAILER || PRESS_SCREENSHOTS.length) document.querySelector("[data-press-waiting]").hidden = true;

// Copy buttons on the descriptions, shown only where the browser can copy. Paragraphs copy with a blank line between them.
if (navigator.clipboard) {
  for (const button of document.querySelectorAll("[data-copy]")) {
    button.hidden = false;
    button.addEventListener("click", async () => {
      const source = document.getElementById(button.dataset.copy);
      const paragraphs = source.querySelectorAll("p");
      const text = paragraphs.length ? [...paragraphs].map((p) => p.textContent.trim()).join("\n\n") : source.textContent.trim();
      try {
        await navigator.clipboard.writeText(text);
        button.textContent = "Copied";
      } catch (error) {
        button.textContent = "Select and copy";
      }
      setTimeout(() => { button.textContent = "Copy"; }, 1800);
    });
  }
}
