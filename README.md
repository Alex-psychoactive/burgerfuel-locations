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

The Webflow code is **two lines and never changes**, whatever gets released:

**1 — Drag an Embed element onto the canvas, paste just this**

```html
<div id="bf-locator"></div>
```

**2 — Page Settings → Before `</body>` tag**

```html
<script src="https://alex-psychoactive.github.io/burgerfuel-locations/loader.js"></script>
```

Nothing goes in the `<head>`: the loader adds the stylesheet itself.

**Already on the older seven-script setup?** It keeps working as-is and
never needs editing. The `?v=` number in those tags doesn't choose a
version; it's only a cache label. GitHub Pages always serves the latest
files at those addresses, so each release reaches that setup on its own,
within 10 minutes at most (the Pages cache time). The loader just
removes that 10-minute wait.

How it works: on every page load `loader.js` fetches `version.json`,
bypassing every cache, then loads the stylesheet and each script stamped
with that version (`?v=5`). A new release reaches the live site as soon as
GitHub Pages has published it, usually within a minute of the push. There's
nothing to bump in Webflow.

Notes that will save you an hour each:

* **Custom code only runs on the published site**, never on the Designer
  canvas. Publish to the `.webflow.io` staging domain to see anything.
* `js/markup.js` is **generated from `index.html`**. The release script
  regenerates it (below), so don't edit it by hand.
* Asset URLs are **not** hardcoded. `config.js` derives `assetBase` from its
  own `<script src>`, and `app.js` resolves every `<img data-bf-src>` against
  it. Move the repo anywhere and the images follow.

### Releases and rollbacks

```bash
python tools/release.py
git commit -am "Release v6: what changed"
git tag v6
git push origin main --tags
```

`tools/release.py` bumps `version.json` and every `?v=` in `index.html`,
and regenerates `js/markup.js`. Every release is a git tag (`v1`, `v2`, …),
so any past version can be looked at or restored:

```bash
git checkout v4 -- .                 # put v4's files back
python tools/release.py              # stamp them as a new version
git commit -am "Roll back to v4" && git tag v7 && git push origin main --tags
```

| Tag | What it was |
|---|---|
| v1 | Desktop build, first Webflow embed |
| v2 | Mobile layout, slide-up store sheet, richer store data |
| v3 | Tablet, photo lightbox, card morph, region dropdown |
| v4 | Lightbox tap fix, sheet scroll reset, polish |
| v5 | Mobile filter pill + search overlay, list-first mobile, loader.js |
| v6 | Mobile overlay: search and region each get their own clear |
| v7 | Mobile list: "In <region> · Showing N" heading and empty state when filtered; smaller search clear icon |
| v8 | Mobile search overlay v2: compact card with close inside, outlined fields, picked-region dot, "Clear all" chips, softer shadows, dropdown kept on screen; white region dropdown on desktop too |
| v9 | Accessibility + performance audit: store rows and map pins are real buttons, valid listbox, focus trap and focus return in overlay/sheet/lightbox, one h1, contrast fixes, fuller reduced-motion; map loads after the list on phones, lazy sheet icons, lighter nav and texture images |
| v10 | Store sheet redesign (outlined status tags, grey section icons on the right, new jump cards, 1/2/3+ photo layouts), Mon→Sun hours, smooth wheel zoom (pins keep up), region field grows into its dropdown, desktop region dot, store URLs with Back/Forward, locator fully scoped for the Webflow site (uses the site nav), tablet list = desktop rows, darkened lightbox neighbours |
| v11 | Reads store data from the hidden Webflow CMS list when present (per-store order link, temporarily-closed and disable-order switches, events, latest blog post); falls back to the bundled data elsewhere |
| v12 | Live-site fixes: swapped lat/lng in the CMS corrected on read and one bad pin can no longer stop the rest; panels scroll under the site's Lenis smooth-scroll; water-coloured placeholder and map fade-in instead of a white flash |
| v13 | Lenis smooth-scroll switched off on locator pages; page scroll lock beats the site's inline body overflow |
| v14 | View store page button back on desktop + tablet (links to the store's CMS page); brand fonts preloaded and set to font-display:block so the first store panel no longer snaps from a fallback font |
| v15 | Desktop: "Previous store" card replaces "Back to all stores"; mobile card-to-sheet photo morph works again (the flying copy lives inside #bf-locator and waits to decode); mobile footer removed |
| v16 | Previous-store name right-aligned, more bottom padding in the jump-card labels, STORES title closer to the pill, solid white grab handle, nav shadow fades out while the mobile sheet is open |
| v17 | Mobile morph: the flying photo sits inside the sheet under its close button and grab handle, so they unmask with the sheet instead of popping in |
| v18 | View store button removed (the store panel is the store page on every breakpoint); schema.org Restaurant structured data for the open store, for search results |

### Store pages and store URLs

Each store has its own address, which Google indexes
(`/nz/locations/upper-hutt`). The Webflow **CMS store template page** gets
the same two lines, with the store's slug bound into the embed (Embed →
insert field → Slug):

```html
<div id="bf-locator" data-store="{{Slug}}"></div>
```

It opens with that store's sheet up. On the list page, opening a sheet
moves the address bar to the store's URL (no reload), closing it goes back
to the list's URL, and Back/Forward open and close sheets. Keep the
template page's own SEO title and description in its page settings.

Optional attributes on `#bf-locator` for the build period, when the pages
live somewhere else: `data-store-base="/nz/locations"` (where store pages
live) and `data-list-url="/nz/locations-v2"` (the list page). Without them:
on the list page stores live under the list's own path; on a store page the
list is the parent path. Anywhere that isn't a `…/locations…` page (the
GitHub preview, a test page) it uses hash links instead (`#albany`).

### Living on someone else's page

The locator is fully scoped, so it can't disturb the Webflow site:

* every rule is under `#bf-locator`; the fluid scale is `--u` on
  `#bf-locator` (`calc(var(--u) * n)` where there used to be `rem`), so the
  site's own `rem` sizes are untouched. `tools/scope-css.py` did the
  conversion; write new CSS the same way.
* only three things touch the page itself, via `html.bf-app` (added by
  app.js): full-height html/body, the no-scroll body on desktop, and the
  background.
* `js/markup.js` ships **without** our nav. The Webflow nav component is the
  nav; app.js measures it (`nav.nav` by default, or `BF_CONFIG.navSelector`)
  and lines everything up under it at every breakpoint.

---

## Mobile (below 768px)

Built from the "Mobile Designs" Figma frames (393 wide). Same fluid-rem rule
as desktop, just a different anchor: `1rem` = 16px at 393
(`clamp(.8125rem, 4.0712468vw, 1.25rem)`, so 13px on a 320 phone, capped at 20px).

* **Opens on the list view.** The list scrolls (title, cards, footer). The
  map view is the map alone, fixed full screen, and the page doesn't scroll,
  so there's nothing to get stuck below. `#map` in the URL opens the map.
* **Floating controls, both views.** A "Filter & Search Stores" pill floats
  at the top, with a Clear chip under it while a search or region is active.
  The Map/List switch floats in a bar at the bottom.
* **Search overlay.** Tapping the pill grows the overlay out of it (a clip
  morph, 450ms ease-out-quint) with the keyboard already up. The search field
  lights purple and grows slightly when focused. The region dropdown matches
  desktop's. Nothing applies until **Search** is pressed. That button turns
  purple instantly, then the overlay shrinks back into the pill (400ms
  ease-in-cubic). The ×, tapping the dark area or Esc close it without
  applying anything.
* **Store sheet.** Tapping a store on the map slides the sheet up over a
  70% black scrim: 450ms ease-out-quint in, 400ms ease-in-cubic out. From
  the list, the card's photo flies up into the sheet's hero while the sheet
  grows out of the card (same timings), and it shrinks back into the card
  on close. Close by
  the × button, tapping the scrim, Esc, "Back to all stores", or swiping down
  from the top of the sheet. The hero photo scrolls with parallax. The purple
  "Order from this store" bar floats over the sheet, and its gradient is
  click-through.
* **Map nudges.** "Pinch to zoom", then "Tap a store for details", show once
  as a toast the first time the map is on screen, and vanish on the first
  touch. After 3.25s without any input, the pins on screen do a quick
  wiggle-and-grow in a random order, repeating every 3.25s while the
  visitor stays idle. Any touch, scroll, wheel or key resets the 3.25s. Desktop and tablet do the same, and
  desktop also wiggles once as soon as the map loads. Off when the OS asks
  for reduced motion.
* **Pins** grow to the design's 103px once zoomed in (zoom ≥ 10.5) and have an
  invisible padded tap target.
* **Footer** appears under the list view only.

The new status chips (green dot / red clock), the Location / Phone / Hours
layout and the extra sections (store info, review links, photos, how it
started, blog, next store) are shared with the **desktop sidebar** too.

**Deep links:** `#ponsonby` opens that store's sheet, `#list` opens the list,
and `#list&ponsonby` does both. The hash follows the open store, so a sheet
can be shared.

**`?demo`** turns on the event and blog blocks for every store using the
Figma copy, because no live store has either right now.

---

## Tablet (768–1199px)

From the iPad Pro 11" frame. The root is pinned at 16px here (no vw
scaling), so rem = design px ÷ 16 and nothing shrinks as the window
narrows. Same model as desktop: the map is the page, with one floating
bar holding the Map/List switch, region and search, slimmed to 52px
controls. Where all three don't fit on one row (around 768px), search
wraps onto its own full-width row. The list's top padding is the
bar's measured height (`--tb`, set by a ResizeObserver), so even a
wrapped bar can't sit on top of it. Store sheet = the mobile sheet,
centred and capped at 640px.

## Search, region dropdown and buttons

* **Search**: goes lighter with a hint of purple on hover, and full purple
  with white text while focused. Typed text is a size up from the
  placeholder. The search button goes black-on-white while pressed, with
  no scaling anywhere.
* **Region Clear**: once a region is chosen, the same Clear pill as the
  search appears inside the region button.
* **Region dropdown**: the designed grey panel. It drops out of the
  button with a clip-mask reveal, and its rows stagger in (50ms apart,
  175ms fade + rise, ease-out-quint). Hovering a row eases its text in
  (padding, 250ms ease-out-quint). Each row shows its store count. It
  scrolls with the wheel and shows about 7 rows.
* **Buttons with a background change** (Get directions, Call store,
  Google / Facebook, Learn more, View store, Clear, Close, Order): a
  rounded block rises from below the button and squares off as it fills
  (300ms ease-out-quint in and out) while the outline fades away. Pressing
  darkens it.
* **Order button**: fills black on hover while the bag in its white disc
  slides out to the top-right and an arrow slides in from the bottom-left
  (same 300ms ease-out-quint).
* **Selected store on the map**: circled in purple "ink", drawn
  counter-clockwise like a pen. Each circle is generated fresh: tilt,
  wobble, start point, and whether the ends cross or stop short all vary. Hover is gated to
  mouse/trackpad so a tap on a phone doesn't stick.
* **One match → open**: `autoOpenSingle: true` in `js/config.js`. When the
  query (3+ characters) narrows to exactly one store, a ring in the field
  fills over 0.8s and then opens that store in the list view. Keep typing,
  press Esc or clear to cancel.

## Photo lightbox

Each photo in the sheet's strip darkens and zooms slightly on hover
while a fullscreen badge rises in (200ms ease-out-quint). With a mouse
the strip can also be dragged. `js/lightbox.js`: tapping a photo grows it out of its thumbnail
into a full-screen viewer. Pinch or double-tap to zoom, drag to pan,
swipe sideways for the next photo, swipe down to close. Closing flies it
back into the matching thumbnail.

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

**On the Webflow site the CMS is the source.** The Stores v2 page carries a
hidden Collection List of *NZ — Locations* (`<div data-bf-stores hidden>`,
one `[data-bf-store]` per item, every field in a child tagged
`data-f="…"`: slug, name, address, postal, lat, lng, phone, gmaps, google,
facebook, order, region, closed, noorder, image, hours, description,
started, event-*, a nested *Photo Gallery* list of `data-f="photo"` images,
and a nested *Blog Posts* list limited to the newest post). app.js reads it
on load, so publishing a CMS edit updates the locator. Keep the data-f names
if you restyle or move it; images in it are lazy, so the hidden list costs
no downloads. Without that list (the GitHub preview) the bundled
`js/stores-data.js` below is used.


`data/stores.json` — **all 62 NZ stores**, scraped from the live page's
Webflow CMS collection. Every record has:

`name · slug · address · region · postal · lat · lng · image ·
description · phone · gmaps (directions URL) · hours` (7 days)

plus, from each store's own page (`python tools/scrape-store-details.py`
re-pulls them and rewrites both data files):

`photos[] · started ("How it started") · google · facebook · event · blog`

**Events live in Webflow.** They're fields on each store's CMS item (title,
body, image, "Learn more" link). The live store template has a purple event
section that Webflow only shows when those fields are filled. The scraper
picks them up the same way. No store had an event on 2026-09-29, so
`event` is `null` everywhere (use `?demo` to preview the block). The "blog
post from this store" is a CMS reference on the same item and is also empty
today.

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

* Desktop now starts at 1200px. Between 1200 and ~1440 the desktop ramp
  runs at 10–12px/rem, which is small. Worth a look alongside laptop sizes.
* The mobile hamburger is visual only. On the client site the host nav
  supplies the real menu.
* The list view's sort switch and "In New Zealand · N stores" header aren't
  in the mobile design, so they're hidden below 768px.
* Store hero images are hot-linked to the Webflow CDN. Download them locally
  if you need this to work offline.
