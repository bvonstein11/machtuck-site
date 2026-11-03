# machtuck.com

The website of Mach Tuck Games. The address is machtuck.com; the bare address opens the game's page at `/thereach/`.

Plain HTML, CSS and JavaScript, with no build step, no libraries, no cookies and no analytics. The fonts are served
from the site itself, so a visit sends nothing to a third party.

| Path | What it is |
|---|---|
| `index.html` | Sends machtuck.com to `/thereach/` |
| `thereach/index.html` | The Reach: Unknown |
| `404.html` | The page for an address that does not exist |
| `assets/site.css`, `assets/site.js` | The look and the behaviour, shared by every page |
| `assets/img/`, `assets/fonts/`, the icons | Made from the game's own art by `Tools/website/build_site_assets.py` in the game's repository; never edited by hand |
| `CNAME` | Tells GitHub Pages the site's address |

**The Discord buttons** read one line at the top of `assets/site.js`, `DISCORD_INVITE`. While it is empty they say
"Discord opening soon" and lead nowhere.

**Aboard the Archive.** The first page of a visit opens on the shipboard network for about two seconds (a short script in
the head of `thereach/index.html` decides, `assets/site.js` draws it; never twice in a visit, never with reduced motion,
skipped by any key, click or scroll). The status strip's **Ship audio** switch plays a hull hum made in the browser, with
no sound file, and only after a click. Every element marked `data-ship-date`, `-speed`, `-year`, `-crossed` or `-state`
shows the ship's live numbers from `assets/ship.js`, wherever it sits.

**To look at it on this Mac**, from the game's repository:

```bash
python3 -m http.server 8742 --directory Website
```

then open http://localhost:8742.

The fonts are Barlow and Barlow Condensed (the site's own, kept in `Art/Website/Fonts/`), and B612 Mono and Cinzel (the game's),
all under the SIL Open Font License 1.1; each family's `OFL.txt` sits beside its files.
