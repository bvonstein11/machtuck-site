# machtuck.com

The website of Mach Tuck Games. The address is machtuck.com; the bare address opens the game's page at `/thereach/`.

Plain HTML, CSS and JavaScript, with no build step, no libraries, no cookies and no analytics. The fonts are served
from the site itself, so a visit sends nothing to a third party.

| Path | What it is |
|---|---|
| `index.html` | Sends machtuck.com to `/thereach/`, and carries the studio's details for search engines (the same JSON-LD `Organization` as `/thereach/`) |
| `robots.txt`, `sitemap.xml` | What search engines may read, and the list of pages they should. A page kept out of search says `noindex` in its own head and stays out of the sitemap (`/welcome/`, `/drop/`, the 404). A new public page needs its own `<url>` line. `python3 -I Tools/website/seo_check.py` checks the sitemap against the pages, and every listed page's title, description, canonical address, share tags, h1 and alt text, and the JSON-LD (which must also pass the social copy check); the publisher runs it and warns |
| `thereach/index.html` | The Reach: Unknown |
| `404.html` | The page for an address that does not exist |
| `assets/site.css`, `assets/site.js` | The look and the behaviour, shared by every page |
| `assets/crossing.js` | The journey map on the Archive's picture: the story's beats, the ships and the signal on one clock, from `assets/ship.js`. `assets/voyage.js` is the older chart, no longer loaded |
| `assets/prealpha.js` | Puts a Pre-Alpha label on every picture from one place, by the picture's size. A page with pictures loads it; `data-no-label` keeps a picture clean |
| `assets/img/`, `assets/fonts/`, the icons | Made from the game's own art by `Tools/website/build_site_assets.py` in the game's repository; never edited by hand |
| `assets/patch.js`, `assets/patchmaker.js` | The clan patch maker in the first pillar: a port of the game's own patch code, which `Tools/website/build_patch_library.py` checks against the game pixel for pixel, and the designer around it |
| `assets/patch/` | The game's patch pieces and rules, written by `Tools/website/build_patch_library.py`; never edited by hand |
| `assets/story.js` | HOW WE GOT HERE as a voyage you scroll through: scrolling moves time from Earth's failure to the ship's clock now, the timeline drags, a ship tapped shows its readout, and the last chapter sends a message; the Archive's numbers are `ship.js`'s |
| `assets/valor.js` | The Valor wings in the third pillar: the game's seven wings (`assets/img/valor/`) on a stage that climbs them under the game's Ranked rules |
| `armory/` | The Armory: what the VIGIL carries, to handle. It opens on the VIGIL as the Command Hub stands it, its five hardpoints marked and following it as it turns, with all twelve pieces to bolt on, each fit looked up in the Hangar's export. Then every gun on a held trigger with its heat, a target to drag out of range, an enemy to break for salvage, the daily crate and the Mk ladder; every entry in full behind the last fold. `armory/armory.js` keeps every number in one `GAME` block; `python3 -I Tools/website/armory_check.py` reads them back from the game, and `node Tools/website/layout_check.mjs <origin> armory` checks nothing is cut off, covered or lying on a figure at eighteen window sizes |
| `physics/` | The Physics: the game's rules to play with, each chapter a full-width picture with a demo on it. Drop a VIGIL, fly its jets until the heat runs out, load it and walk it up a hill until it slips and stalls, raise water round it, ram with it, fire a DART-20 that falls and drifts, see a far shot before you hear it, run The Reach's day against the war's clock, watch the game's pressure systems cross the war map, read density altitude, race the Archive's cruise to the Moon. Every game number the demos use is in one block, `GAME`, at the top of `physics/physics.js`; `Tools/website/physics_check.py` reads each back from the game's code, recomputes the readouts the page types for readers without scripts, checks the game figures in the prose, and fails on any that has drifted. Run it whenever the jets, heat, weight, slopes, water, collisions, a gun's ballistics, the weather or the sound model is retuned. `Physics.flightStep` is a hand port of the jets' and the reactor's update: the check reads its constants, not its logic, so reread both when either moves. The world's own figures (`WORLD`: the day, the voyage) are the setting's and are checked by hand. The VIGIL is drawn from the Hangar's turntable frames, never mirrored, so the hex pod and the sensor block stay on their shoulders. The small weapon pictures are in `assets/img/physics/`, cut from the Armory's by `Tools/website/build_site_assets.py`. `node Tools/website/layout_check.mjs <origin> physics` runs the same check here through every state a press can make, what the canvases draw included |
| `presskit/` | The press kit. `presskit/index.html` holds the words; `presskit/files/`, `presskit/key-art-clean-1280.webp` and `presskit/the-reach-unknown-press-kit.zip` are made from the site's own art by `Tools/website/build_press_kit.py` (run it with `/usr/bin/python3` after changing the kit's words or art). It draws the Pre-Alpha label into every picture but the logos, and reads each file back to prove it |
| `community-terms/` | The Community Terms, built around the ideas clause, whose words change only with the studio's say-so |
| `welcome/` | Where Kit sends a pilot after the closed beta form: thanks, and the Discord invite. Linked from nowhere on the site, and not indexed |
| `CNAME` | Tells GitHub Pages the site's address |

**The clan patch maker** stores nothing. A design is its patch code (`1.` and twelve values joined by dots, written in
`assets/patch.js`), which the visitor copies, shares as a link (`/thereach/#patch=<code>`) or pastes back in. The game
will read the same code, so change its format only by adding a version.

**The Valor wings** climb by themselves only while on screen. The rules they play are the game's: Valor paid once per
best of three (2–0 +200, 2–1 +100, the same off for a loss), a Cadet's loss halved, the save points as floors, a new
season back to Rookie. Change them in `assets/valor.js` only when the game's `ValorProgression` changes.

**The Discord buttons** read one line at the top of `assets/site.js`, `DISCORD_INVITE`. While it is empty they say
"Discord opening soon" and lead nowhere.

**The switches** are the lines at the top of `assets/site.js`. All of them start off, and everything they control stays hidden:

| Line | What it does when set |
|---|---|
| `SIGNUP_FORM` | The closed beta request appears: the hero's button, the bar's button, the pinned bar on phones and the form in JOIN. A plain POST to Kit, with no script from Kit. See the steps below before setting it |
| `STEAM_WISHLIST` | The "Wishlist on Steam" button appears in JOIN |
| `PILOT_COUNT` | The real sign-up total from Kit, by hand. Shown above the form once it passes `PILOT_COUNT_SHOWN_ABOVE` (100). Never an estimate; Kit's API key never goes in the page |
| `LATEST_CLIPS` | The latest clips strip appears above STUDIO, showing the first four. A clip is a poster on this site and a link out; nothing loads from another site |

**Turning on the closed beta request.** The privacy page and the Community Terms go live first. Then, in Kit, on the form: custom fields `requested_callsign`, `faction` and `source` exist; the confirmation email is off until the studio's postal address is in Kit's footer, since Kit must send nothing before then; the after-subscribing action redirects to `https://machtuck.com/welcome/`; Invisible reCAPTCHA is off, because a plain POST carries no token. Send one real test, delete the test subscriber, and only then set `SIGNUP_FORM`. A link may name its source with `?src=tiktok`, which is read as the form goes, cleaned to a short plain word, sent as `source`, and never stored. The form's callsign is a request: nothing on this site reserves one.

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
