/* ------------------------------------------------------------------
   BurgerFuel Store Locations — loader

   The only script a host page (Webflow) needs. It never changes, so the
   Webflow code never has to either:

     <div id="bf-locator"></div>
     <script src="https://alex-psychoactive.github.io/burgerfuel-locations/loader.js"></script>

   On every page load it asks for version.json (bypassing all caches),
   then loads the stylesheet and the scripts stamped with that version,
   so a new release reaches the live site as soon as GitHub Pages has
   published it. The stylesheet is loaded first so the locator never
   flashes unstyled.
   ------------------------------------------------------------------ */
(function (d) {
  'use strict';

  var me = d.currentScript;
  var base = me ? me.src.replace(/loader\.js(\?.*)?$/, '') : '';

  // execution order matters: markup.js builds the DOM that app.js wires up
  var SCRIPTS = [
    'js/config.js',
    'js/stores-data.js',
    'js/hours.js',
    'js/map.js',
    'js/lightbox.js',
    'js/markup.js',
    'js/app.js'
  ];

  /* Until the stylesheet and markup arrive, hold the space on tablet and
     desktop with the map's water colour, so the page doesn't flash white
     under the site nav. app.js removes this once the locator is up. */
  var ph = d.createElement('style');
  ph.id = 'bf-placeholder';
  ph.textContent = '@media (min-width:48rem){#bf-locator{position:fixed;inset:0;z-index:0;background:#6f7176}}';
  d.head.appendChild(ph);

  function load(version) {
    var q = '?v=' + encodeURIComponent(version);

    var css = d.createElement('link');
    css.rel = 'stylesheet';
    css.href = base + 'css/style.css' + q;

    var started = false;
    function scripts() {
      if (started) return;
      started = true;
      // async=false: all download in parallel but run in this order
      SCRIPTS.forEach(function (src) {
        var s = d.createElement('script');
        s.src = base + src + q;
        s.async = false;
        d.body.appendChild(s);
      });
    }
    css.onload = css.onerror = scripts;
    setTimeout(scripts, 3000);   // never let a slow stylesheet hold the page hostage
    d.head.appendChild(css);
  }

  fetch(base + 'version.json', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (j) { load(j.version); })
    // no version file reachable: load uncached rather than not at all
    .catch(function () { load(String(Date.now())); });
})(document);
