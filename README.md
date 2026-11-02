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

**To look at it on this Mac**, from the game's repository:

```bash
python3 -m http.server 8742 --directory Website
```

then open http://localhost:8742.

The fonts are B612 and Cinzel, under the SIL Open Font License 1.1; each family's `OFL.txt` sits beside its files.
