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
| `assets/patch.js`, `assets/patchmaker.js` | The clan patch maker in the first pillar: a port of the game's own patch code, which `Tools/website/build_patch_library.py` checks against the game pixel for pixel, and the designer around it |
| `assets/patch/` | The game's patch pieces and rules, written by `Tools/website/build_patch_library.py`; never edited by hand |
| `assets/story.js` | HOW WE GOT HERE as a voyage you scroll through: scrolling moves time from Earth's failure to the ship's clock now, the timeline drags, a ship tapped shows its readout, and the last chapter sends a message; the Archive's numbers are `ship.js`'s |
| `assets/valor.js` | The Valor wings in the third pillar: the game's seven wings (`assets/img/valor/`) on a stage that climbs them under the game's Ranked rules |
| `armory/` | The Armory. It opens on the VIGIL as the Command Hub stands it (the Hangar's turntable frame and bay), its five hardpoints marked, then the ordnance strip of all twelve pieces; then each weapon, the modules, heat, the Mk I–IV upgrade path and salvage, all with the game's own art. The figures are typed into the page; `Tools/website/armory_check.py` reads each back from the game and fails on any that has drifted, so run it whenever a weapon, an upgrade fee or the salvage rules change. The art (weapon and module renders, salvage parts, the Marks coin, the crate) is built into `assets/img/armory/` by `Tools/website/build_site_assets.py`; `armory/armory.js` filters the strip and draws the bay's lines |
| `CNAME` | Tells GitHub Pages the site's address |

**The clan patch maker** stores nothing. A design is its patch code (`1.` and twelve values joined by dots, written in
`assets/patch.js`), which the visitor copies, shares as a link (`/thereach/#patch=<code>`) or pastes back in. The game
will read the same code, so change its format only by adding a version.

**The Valor wings** climb by themselves only while on screen. The rules they play are the game's: Valor paid once per
best of three (2–0 +200, 2–1 +100, the same off for a loss), a Cadet's loss halved, the save points as floors, a new
season back to Rookie. Change them in `assets/valor.js` only when the game's `ValorProgression` changes.

**The Discord buttons** read one line at the top of `assets/site.js`, `DISCORD_INVITE`. While it is empty they say
"Discord opening soon" and lead nowhere.

**Aboard the Archive.** Arriving from another site opens on the shipboard network for about two seconds (a short script in
the head of `thereach/index.html` decides, `assets/site.js` draws it; not on a reload, Back, or a link from this site,
never with reduced motion, skipped by any key, click or scroll). Nothing is stored in the browser: the privacy page says so. The status strip's **Ship audio** switch plays a hull hum made in the browser, with
no sound file, and only after a click. Every element marked `data-ship-date`, `-speed`, `-year`, `-crossed` or `-state`
shows the ship's live numbers from `assets/ship.js`, wherever it sits.

**To look at it on this Mac**, from the game's repository:

```bash
python3 -m http.server 8742 --directory Website
```

then open http://localhost:8742.

The fonts are Barlow and Barlow Condensed (the site's own, kept in `Art/Website/Fonts/`), and B612 Mono and Cinzel (the game's),
all under the SIL Open Font License 1.1; each family's `OFL.txt` sits beside its files.
