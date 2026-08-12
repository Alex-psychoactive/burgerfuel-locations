# BurgerFuel — Store Locations

A rebuild of `burgerfuel.com/nz/locations` against your design files.
Plain HTML / CSS / JS — no build step, no framework.

```bash
python -m http.server 5180 --directory "burgerfuel-locations"
```

Then open <http://localhost:5180>. (It's also wired up as the
`burgerfuel-locations` launch config, so "run the preview" works too.)

---

## What changed vs. the live page

| Issue you raised | Fix |
|---|---|
| Map view unusable | Map is a full-bleed layer at `inset:0` of the stage; every other element floats on top of it |
| Scrolling out zoomed the page instead of the map | `body{overflow:hidden}`, the stage swallows wheel events, and the map uses `gestureHandling:'greedy'` — wheel always zooms |
| List view didn't resize with the monitor | Whole page is fluid rem; the list column is `min(59rem, 100% - 4rem)` centred in the space beside the sidebar |
| Footer | Removed — there is no footer element |
| A–Z was a dropdown | Now a **switch**. One press flips A–Z ⇄ Z–A and swaps the ascending/descending icon |
| Region items had no hover state | Custom listbox (not a native `<select>`) with hover, focus and selected states |
| Sidebar ran past the fold, hiding "Order now" | Sidebar is `top/right/bottom: 1rem` with a flex column: scrolling body + **sticky** order bar. The button is always above the fold |
| No way to tell a search was still active | A **Clear** pill appears inside the search field whenever there's a query (Esc clears it too) |
| "No results" gave no reason | The empty state names the conflict — e.g. a search for "auckland" while filtered to Hawkes Bay — and offers *Clear search* or *Search all regions (25)* |

---

## Embedding in Webflow

Live at <https://alex-psychoactive.github.io/burgerfuel-locations/> · working
embed demo at
<https://alex-psychoactive.github.io/burgerfuel-locations/embed-test.html>
(that file is the Webflow setup, verbatim).

**1 — Page Settings → Inside `<head>` tag**

```html
<link rel="stylesheet" href="https://alex-psychoactive.github.io/burgerfuel-locations/css/style.css?v=1">
```

**2 — Drag an Embed element onto the canvas, paste just this**

```html
<div id="bf-locator"></div>
```

**3 — Page Settings → Before `</body>` tag**

```html
<script src="https://alex-psychoactive.github.io/burgerfuel-locations/js/config.js?v=1"></script>
<script src="https://alex-psychoactive.github.io/burgerfuel-locations/js/stores-data.js?v=1"></script>
<script src="https://alex-psychoactive.github.io/burgerfuel-locations/js/hours.js?v=1"></script>
<script src="https://alex-psychoactive.github.io/burgerfuel-locations/js/map.js?v=1"></script>
<script src="https://alex-psychoactive.github.io/burgerfuel-locations/js/markup.js?v=1"></script>
<script src="https://alex-psychoactive.github.io/burgerfuel-locations/js/app.js?v=1"></script>
```

Notes that will save you an hour each:

* **Custom code only runs on the published site**, never on the Designer
  canvas. Publish to the `.webflow.io` staging domain to see anything.
* **Order matters** — `markup.js` injects the DOM and must run before `app.js`.
* **Bump `?v=1` → `?v=2` after every push.** GitHub Pages sends
  `Cache-Control: max-age=600`, so without it browsers can serve a stale file
  for ten minutes.
* `js/markup.js` is **generated from `index.html`** — regenerate it after
  changing markup:

  ```bash
  python -c "import io,re,json; s=io.open('index.html',encoding='utf-8').read(); b=re.sub(r'<script[^>]*></script>\s*','',re.search(r'<body>(.*?)</body>',s,re.S).group(1)).strip(); io.open('js/markup.js','w',encoding='utf-8').write('(function(){var m=document.getElementById(\"bf-locator\");if(!m||m.getAttribute(\"data-bf-mounted\"))return;m.setAttribute(\"data-bf-mounted\",\"1\");m.innerHTML='+json.dumps(b)+';})();\n')"
  ```

* Asset URLs are **not** hardcoded — `config.js` derives `assetBase` from its
  own `<script src>`, and `app.js` resolves every `<img data-bf-src>` against
  it. Move the repo anywhere and the images follow.

### Before this goes on the client site

The stylesheet sets `html{font-size:clamp(…)}` and `body{overflow:hidden}`.
Those are correct for a page the locator *owns*, but on a page with Webflow's
own nav they will rescale its text and kill scrolling. Two ways out: put the
locator in an `<iframe>`, or move the fluid scale off the root onto a scoped
custom property (`.bf-locator{--u:clamp(…)}` with `calc(var(--u) * n)` in
place of `rem`). The markup also ships its own BurgerFuel nav — drop that
`<header class="nav">` when the host page already has one.

---

## Responsive model (Webflow-style fluid rem)

One knob, on the root:

```css
html{ font-size: clamp(.5rem, .8333333vw, 1.3333333rem) }
```

* `0.8333vw` = exactly **16px at 1920**, so *design px ÷ 16 = rem*.
* Scales up with the viewport and **caps at 2560** (`1rem` = 21.33px).
* Floors at 960 so the tablet view stays legible.

Everything else in the stylesheet is rem — no pixel values. The map is the
one exception by design: it fills the viewport at any width, so on your
5120×1440 the page furniture stays at its 2560 size, pinned to the left and
right edges, and the map stretches behind it (verified at 5120×1440).

---

## Map

`js/map.js` exposes one interface with two drivers.

**Google Maps** — paste a key into `js/config.js`:

```js
window.BF_CONFIG = { googleMapsApiKey: 'AIza…' };
```

Get one at <https://console.cloud.google.com/google/maps-apis>, enable
*Maps JavaScript API*, and restrict it to your domain. The medium-contrast
greyscale skin is the `GOOGLE_STYLE` array in `js/map.js`.

**Keyless fallback** — with no key the page uses MapLibre GL + CARTO vector
tiles, recoloured at runtime to the *same* palette, so the build is always
viewable. A small note appears bottom-left when the fallback is active.

Both drivers render markers as real DOM (`.bf-pin`), so the hover and active
states are plain CSS in `css/style.css`.

Palette used for both: land `#f2f2f4` · water `#6f7176` · roads `#ffffff`
with `#dcdce0` casings · parks `#e1e5e1` · place labels `#2c2e35`.

---

## Store data

`data/stores.json` — **all 62 NZ stores**, scraped from the live page's
Webflow CMS collection. Every record has:

`name · slug · address · region · postal · lat · lng · image ·
description · phone · gmaps (directions URL) · hours` (7 days)

`js/stores-data.js` is the same data as a plain `window.BF_DATA` global so
the page also works straight off the filesystem. **Regenerate it after
editing the JSON:**

```bash
python -c "import json,io; d=json.load(open('data/stores.json',encoding='utf-8')); io.open('js/stores-data.js','w',encoding='utf-8').write('window.BF_DATA = '+json.dumps(d,ensure_ascii=False,indent=1)+';\n')"
```

Regions present: Auckland (25), Wellington (9), Waikato (7), Bay of Plenty
(6), Canterbury (6), Hawkes Bay (2), Manawatū-Whanganui (2), Otago,
Southland, Taranaki, South Canterbury, Whangārei.

`js/hours.js` derives Open/Closed from those hours in **Pacific/Auckland**
(so it's correct regardless of the viewer's timezone), handles past-midnight
trading, and groups consecutive identical days into `Sun – Wed` style rows.

---

## Assets

`assets/map-pin.png` is the custom BurgerFuel pin. Two sources exist:

* the 320×144 pin from your folder — **used**, higher resolution
* `assets/map-marker.png`, the live site's own marker, only 108×48 — kept for reference

Fonts in `fonts/` are the real webfonts pulled from BurgerFuel's CDN
(Instrument Sans 400/500/600, Vanguard CF Medium/Bold/Heavy). Vanguard
DemiBold isn't served by the site, so weight 600 uses the Fontspring demo
OTF from your folder — swap in a licensed `VanguardCF-DemiBold.woff2` when
you have one.

Icons are inlined as SVG so they inherit `currentColor`.

---

## Colours (pulled from the live site's own variables)

```
--bf-black #121317   --bf-grey  #f2f2f4   --bf-purple      #592c83
--bf-white #ffffff   --bf-blue  #36a7e9   --bf-dark-purple #3d1e5c
--bf-pink  #f7b3c8   --bf-yellow #ffd449  --bf-dark-grey   #2c2e35
open #cfffd7 / #186411       closed #ffcfcf / #3b0b0b
```

---

## Debugging

`window.BF.state` is exposed in the console; `BF.state.map.map` is the raw
Google/MapLibre instance.

## Known gaps

* Tablet and mobile were explicitly out of scope — there's a minimal floor
  at `max-width:60rem` so it degrades rather than breaks, nothing more.
* Store hero images are hot-linked to the Webflow CDN. Download them locally
  if you need this to work offline.
