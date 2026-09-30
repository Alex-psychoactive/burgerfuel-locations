/* ------------------------------------------------------------------
   BurgerFuel Store Locations — app controller
   View switching, search, region filter, sort switch, store sheet.
   Below 48rem the page runs in its mobile mode: a scrolling page with a
   sticky Map/List switch, a slide-up store sheet, and a few gesture
   nudges on the map.
   ------------------------------------------------------------------ */
(function (w, d) {
  'use strict';

  var $  = function (s, r) { return (r || d).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };

  /* ── store data ───────────────────────────────────────────────
     On the Webflow site the page carries a hidden Collection List of the
     "NZ — Locations" collection ([data-bf-stores], one [data-bf-store]
     per item, each field in an element tagged data-f="…"). When it's
     there it is the source of truth, so CMS edits show up on publish.
     Anywhere else (the GitHub preview) the bundled stores-data.js copy
     is used. */
  var CMS = readCms();
  var STORES  = CMS ? CMS.stores  : (w.BF_DATA && w.BF_DATA.stores)  || [];
  var REGIONS = CMS ? CMS.regions : (w.BF_DATA && w.BF_DATA.regions) || [];

  function readCms() {
    var root = d.querySelector('[data-bf-stores]');
    if (!root) return null;
    var BLOG = (w.BF_CONFIG && w.BF_CONFIG.blogBase) || '/nz/world-of-burgerfuel/articles/';
    function el(scope, f) { return scope.querySelector('[data-f="' + f + '"]'); }
    function empty(n) { return !n || n.classList.contains('w-dyn-bind-empty') || n.classList.contains('w-condition-invisible'); }
    function txt(scope, f) { var n = el(scope, f); return empty(n) ? '' : n.textContent.trim(); }
    function src(n) { return empty(n) ? '' : (n.getAttribute('src') || ''); }
    function on(scope, f) { var n = el(scope, f); return !!n && !n.classList.contains('w-condition-invisible'); }
    var stores = [];
    Array.prototype.forEach.call(root.querySelectorAll('[data-bf-store]'), function (it) {
      var lat = parseFloat(txt(it, 'lat')), lng = parseFloat(txt(it, 'lng'));
      var slug = txt(it, 'slug');
      if (!slug || isNaN(lat) || isNaN(lng)) return;          // can't place it on the map
      // latitude and longitude typed into each other's fields (NZ: lat ≈ -34…-47,
      // lng ≈ 166…179): swap them back rather than lose the store
      if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
        var t = lat; lat = lng; lng = t;
        if (w.console) console.warn('[BF] ' + slug + ': latitude/longitude are swapped in the CMS');
      }
      // "Monday 10 am–11 pm" per paragraph → { Monday: '10 am–11 pm' }
      var hours = {};
      var hn = el(it, 'hours');
      if (hn) Array.prototype.forEach.call(hn.querySelectorAll('p, li'), function (p) {
        var m = /^\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*:?\s*(.+)$/i.exec(p.textContent);
        if (m) hours[m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase()] = m[2].trim();
      });
      var image = src(el(it, 'image'));
      var photos = Array.prototype.map.call(it.querySelectorAll('[data-f="photo"]'), src).filter(Boolean);
      var ev = txt(it, 'event-title') ? {
        title: txt(it, 'event-title'), body: txt(it, 'event-body'),
        image: src(el(it, 'event-image')), link: txt(it, 'event-link')
      } : null;
      var blog = txt(it, 'blog-title') ? {
        title: txt(it, 'blog-title'), image: src(el(it, 'blog-image')),
        tag: txt(it, 'blog-tag'), url: BLOG + txt(it, 'blog-slug')
      } : null;
      stores.push({
        name: txt(it, 'name'), slug: slug,
        address: txt(it, 'address'), region: txt(it, 'region'), postal: txt(it, 'postal'),
        lat: lat, lng: lng, image: image || photos[0] || '',
        description: txt(it, 'description'), started: txt(it, 'started'),
        phone: txt(it, 'phone'), gmaps: txt(it, 'gmaps'),
        google: txt(it, 'google'), facebook: txt(it, 'facebook'),
        order: txt(it, 'order'),
        tempClosed: on(it, 'closed'), noOrder: on(it, 'noorder'),
        hours: hours, photos: photos.length ? photos : (image ? [image] : []),
        event: ev, blog: blog
      });
    });
    if (!stores.length) return null;
    var regions = stores.map(function (s) { return s.region; })
      .filter(function (r, i, a) { return r && a.indexOf(r) === i; })
      .sort(function (a, b) { return a.localeCompare(b, 'en'); });
    return { stores: stores, regions: regions };
  }
  var BASE    = (w.BF_CONFIG && w.BF_CONFIG.assetBase) || '';

  /* Three modes, same breakpoints as the CSS (rem in a media query is
     always 16px):
       mobile  < 768   scrolling page, slide-up sheet
       tablet  768–1199  map is the page, floating bar, slide-up sheet
       desktop ≥ 1200  map is the page, sidebar
     "Sheet mode" = mobile or tablet. */
  var MQ = w.matchMedia('(max-width: 47.99rem)');
  var MQ_SHEET = w.matchMedia('(max-width: 74.99rem)');
  var COARSE = w.matchMedia('(pointer: coarse)');
  var REDUCED = w.matchMedia('(prefers-reduced-motion: reduce)');
  function isMobile() { return MQ.matches; }
  function sheetMode() { return MQ_SHEET.matches; }
  function mode() { return isMobile() ? 'mobile' : sheetMode() ? 'tablet' : 'desktop'; }

  var CFG = w.BF_CONFIG || {};
  var AUTO_OPEN = CFG.autoOpenSingle !== false;    // one match → countdown → open

  var EASE_OUT_QUINT = 'cubic-bezier(.22,1,.36,1)';
  var EASE_IN_CUBIC  = 'cubic-bezier(.32,0,.67,0)';
  var OPEN_MS = 450, CLOSE_MS = 400;

  /* ?demo shows the event and blog blocks on every store, using the copy
     from the Figma frames. No live store has either right now. */
  var DEMO = /[?&]demo\b/.test(w.location.search);
  var DEMO_EVENT = {
    title: 'Burgers ‘N Cars',
    body: "BurgerFuel Kapiti are hosting Burgers 'N Cars on Friday 20th December, check it out anytime between 5pm - 10pm. Bring your machine, the older the better and when you purchase any large burger on the night, you'll score Spud Fries on us! T&Cs apply, head HERE' for more info.",
    image: BASE + 'assets/m/demo-event.webp',
    link: 'https://www.burgerfuel.com/nz/world-of-burgerfuel'
  };
  var DEMO_BLOG = {
    title: 'Johnsonville, Meet your newest Franchisees, Tracy and Matthew!',
    image: BASE + 'assets/m/demo-blog.webp',
    tag: 'Our Food',
    url: 'https://www.burgerfuel.com/nz/world-of-burgerfuel'
  };

  var state = {
    view: 'map',
    region: null,          // null = all of New Zealand
    query: '',
    sortDesc: false,       // false = A–Z, true = Z–A
    selected: null,
    map: null,
    markers: new Map(),
    sheetOpen: false,
    mapTouched: false
  };

  /* ── elements ─────────────────────────────────────────────── */
  var elStage      = $('.stage');
  var elMap        = $('#map');
  var elListView   = $('[data-listview]');
  var elListScroll = $('[data-list-scroll]');
  var elList       = $('[data-store-list]');
  var elEmpty      = $('[data-list-empty]');
  var elCount      = $('[data-list-count]');
  var elRegionName = $('[data-list-region]');
  var elSort       = $('[data-sort-switch]');
  var elSortLabel  = $('[data-sort-label]');
  var elSearchForm = $('[data-search-form]');
  var elSearch     = $('[data-search-input]');
  var elSearchClr  = $('[data-search-clear]');
  var elRegion     = $('[data-region]');
  var elRegionBtn  = $('[data-region-btn]');
  var elRegionMenu = $('[data-region-menu]');
  var elRegionLbl  = $('[data-region-label]');
  var elSegwrap    = $('[data-segwrap]');
  var elToolbar    = $('.toolbar');
  var elSidebar    = $('[data-sidebar]');
  var elSheetScroll= $('[data-sidebar-scroll]');
  var elHeroImg    = $('[data-s-img]');
  var elScrim      = $('[data-scrim]');
  var elMapCtrl    = $('[data-map-ctrl]');
  var elHint       = $('[data-map-hint]');
  var elPhotos     = $('[data-s-photos]');
  var rowTpl       = $('[data-store-row-tpl]');

  // the locator's own scale unit (--u on #bf-locator, its font-size), not the host page's rem
  var HOST = d.getElementById('bf-locator') || d.body;
  function remPx() { return parseFloat(getComputedStyle(HOST).fontSize) || 16; }

  /* On the site the Webflow nav component is the nav (markup.js ships
     without ours): measure it, so everything that sits "under the nav"
     lines up with it at every breakpoint. */
  function syncSiteNav() {
    if ($('[data-bf-nav]', HOST)) return;                       // standalone: our own nav
    var nav = d.querySelector(CFG.navSelector || 'nav.nav, .nav, header');
    if (!nav || HOST.contains(nav)) return;
    HOST.style.setProperty('--nav-h', Math.round(nav.getBoundingClientRect().height) + 'px');
  }

  /* ── filtering & sorting ──────────────────────────────────── */

  /* region and query are passed in rather than read off state, so the empty
     state can ask counterfactuals like "how many would match without the
     region filter?" */
  function filterStores(region, query) {
    var q = String(query || '').trim().toLowerCase();
    return STORES.filter(function (s) {
      if (region && s.region !== region) return false;
      if (!q) return true;
      return (s.name + ' ' + s.address + ' ' + s.region + ' ' + s.postal).toLowerCase().indexOf(q) > -1;
    });
  }

  function visibleStores() {
    var out = filterStores(state.region, state.query);
    out.sort(function (a, b) {
      var r = a.name.localeCompare(b.name, 'en');
      return state.sortDesc ? -r : r;
    });
    return out;
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /* ── list view ────────────────────────────────────────────── */
  function renderList() {
    var stores = visibleStores();
    elList.innerHTML = '';

    stores.forEach(function (s) {
      var li = rowTpl.content.firstElementChild.cloneNode(true);
      var img = $('img', li);
      img.src = s.image;
      img.alt = 'BurgerFuel ' + s.name;
      $('.storerow__hit', li).textContent = s.name;
      $('.storerow__addr span', li).textContent = s.address;
      li.dataset.slug = s.slug;
      if (state.selected && state.selected.slug === s.slug) li.classList.add('is-active');

      li.addEventListener('click', function () { select(s, 'list', li); });   // the name's button bubbles here too
      elList.appendChild(li);
    });

    elCount.textContent = stores.length;
    elRegionName.textContent = (state.region ? state.region + ', NZ' : 'New Zealand').toUpperCase();

    elEmpty.hidden = stores.length > 0;
    if (!stores.length) renderEmptyState();
  }

  /* Says why the result set is empty. The interesting case is an active
     search silently cancelling out an active region filter. */
  function renderEmptyState() {
    var q = state.query.trim();
    var region = state.region;
    var title, body;
    var showClear = !!q;
    var showAllRegions = false;
    var allRegionsLabel = '';

    if (q && region) {
      var inRegion = filterStores(region, '').length;
      var elsewhere = filterStores(null, q).length;

      title = 'No stores in ' + region + ' match “' + q + '”';
      body = 'Your search for “' + q + '” is still active, and it is filtering out '
           + 'the ' + plural(inRegion, 'store', 'stores') + ' in ' + region + '. '
           + 'Clear the search to see them';

      if (elsewhere > 0) {
        body += ', or drop the region filter to see the '
             +  plural(elsewhere, 'store', 'stores') + ' matching “' + q + '” elsewhere in NZ';
        showAllRegions = true;
        allRegionsLabel = 'Search all regions (' + elsewhere + ')';
      }
      body += '.';

    } else if (q) {
      title = 'No stores match “' + q + '”';
      body = 'Try a suburb, city or region — Ponsonby, Hamilton, Otago. '
           + 'Or clear the search to see all ' + STORES.length + ' stores.';

    } else if (region) {
      title = 'No stores in ' + region;
      body = 'Choose another region to keep looking.';

    } else {
      title = 'No stores found';
      body = '';
    }

    $('[data-empty-title]').textContent = title;
    $('[data-empty-body]').textContent = body;
    $('[data-empty-clear-search]').hidden = !showClear;
    $('[data-empty-clear-region]').hidden = !showAllRegions;
    if (showAllRegions) $('[data-empty-clear-region-label]').textContent = allRegionsLabel;
  }

  function syncListSelection() {
    $$('.storerow', elList).forEach(function (row) {
      row.classList.toggle('is-active', !!state.selected && row.dataset.slug === state.selected.slug);
    });
  }

  /* ── markers ──────────────────────────────────────────────── */
  function renderMarkers() {
    if (!state.map) return;
    var shown = {};
    visibleStores().forEach(function (s) { shown[s.slug] = true; });

    state.markers.forEach(function (m, slug) {
      m.el.style.display = shown[slug] ? '' : 'none';
    });
  }

  function syncMarkerSelection() {
    state.markers.forEach(function (m, slug) {
      var on = !!state.selected && slug === state.selected.slug;
      var was = m.el.classList.contains('is-active');
      m.el.classList.toggle('is-active', on);
      if (on && !was) drawInk(m.el);
      if (!on && was) eraseInk(m.el);
    });
  }

  /* ── hand-drawn ink circle ─────────────────────────────────────
     The selected pin gets circled the way you'd circle something on a
     printed map with a purple pen: one loose loop, drawn counter-
     clockwise from the upper left. Every circle is generated fresh —
     its tilt, wobble and start point vary, and its ends either cross
     past each other or stop just short. */
  var SVGNS = 'http://www.w3.org/2000/svg';
  function rand(a, b) { return a + Math.random() * (b - a); }

  function inkPath() {
    var cx = 100, cy = 50, rx = 88, ry = 36;
    var tilt = rand(-7, -1) * Math.PI / 180;         // right side rides a little high
    var start = rand(195, 235) * Math.PI / 180;      // upper left
    var over = Math.random() < 0.55 ? rand(0.12, 0.42) : -rand(0.08, 0.3);  // cross, or a gap
    var sweep = Math.PI * 2 + over;
    var drift = rand(-0.06, 0.06);                   // the loop doesn't close on itself
    var w1 = rand(0, 6.28), w2 = rand(0, 6.28), a1 = rand(0.02, 0.05), a2 = rand(0.04, 0.09);
    var lead = rand(0.04, 0.14);                     // the pen lands a little outside the loop
    var N = 72, pts = [];
    for (var i = 0; i <= N; i++) {
      var f = i / N;
      var t = start - sweep * f;                      // decreasing angle = counter-clockwise on screen
      var k = 1 + drift * f + lead * Math.max(0, 1 - f / 0.12);
      var x = rx * k * (1 + a1 * Math.sin(3 * t + w1)) * Math.cos(t);
      var y = ry * k * (1 + a2 * Math.sin(2 * t + w2)) * Math.sin(t);
      pts.push([cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)]);
    }
    // Catmull-Rom through the points → smooth cubic Béziers
    var d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (var j = 0; j < pts.length - 1; j++) {
      var p0 = pts[j - 1] || pts[j], p1 = pts[j], p2 = pts[j + 1], p3 = pts[j + 2] || p2;
      d += ' C' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + ' ' + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1) +
           ' ' + (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + ' ' + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1) +
           ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
    }
    return d;
  }

  function drawInk(pin) {
    var old = pin.querySelector('.bf-ink');
    if (old) old.remove();
    var svg = d.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'bf-ink');
    svg.setAttribute('viewBox', '0 0 200 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    var shape = inkPath();
    // a firm main stroke plus a thin, offset second pass: the uneven
    // pressure of a real pen
    // widths are screen px (non-scaling), so the line stays pen-even
    // however the loop is stretched
    [{ w: 3.4, o: 0.95, dx: 0, dy: 0 },
     { w: 1.4, o: 0.4, dx: 0.9, dy: 0.7 }].forEach(function (pass) {
      var path = d.createElementNS(SVGNS, 'path');
      path.setAttribute('d', shape);
      path.setAttribute('stroke-width', pass.w);
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      path.setAttribute('opacity', pass.o);
      if (pass.dx) path.setAttribute('transform', 'translate(' + pass.dx + ' ' + pass.dy + ')');
      svg.appendChild(path);
    });
    pin.insertBefore(svg, pin.firstChild);
    if (REDUCED.matches) return;
    Array.prototype.forEach.call(svg.children, function (path, i) {
      var len = path.getTotalLength();
      path.style.strokeDasharray = len;
      path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
                   { duration: 350, delay: i * 25, easing: 'cubic-bezier(.45,.05,.25,1)', fill: 'backwards' });
    });
  }
  function eraseInk(pin) {
    var ink = pin.querySelector('.bf-ink');
    if (!ink) return;
    ink.classList.add('is-out');
    setTimeout(function () { if (ink.parentNode) ink.remove(); }, 260);
  }

  /* ── store sheet: content ─────────────────────────────────── */
  function show(el, on) { el.hidden = !on; }

  function fillSidebar(s) {
    var st = w.BFHours.status(s.hours);

    elHeroImg.src = s.image;
    elHeroImg.alt = 'BurgerFuel ' + s.name;
    elHeroImg.style.transform = '';
    $('[data-s-name]').textContent = s.name;

    if (s.tempClosed) st = { open: false, next: '' };           // CMS "Is Temporary Closed"
    $('[data-s-status]').classList.toggle('is-closed', !st.open);
    $('[data-s-status-text]').textContent = st.open ? 'Open now' : s.tempClosed ? 'Temporarily closed' : 'Closed';
    // "Closes at 9pm" → "Closes 9pm", as in the new design
    $('[data-s-next]').textContent = st.next.replace(' at ', ' ');
    $('[data-s-next]').parentNode.hidden = !st.next;

    // desktop + tablet: a link to the store's own page (the CMS template)
    $('[data-s-view]').href = (ROUTE ? ROUTE.stores : (CFG.storePageBase || '/nz/locations')) + '/' + s.slug;

    // the store's own order link; hidden when the CMS switches it off
    var order = $('[data-s-order]');
    order.href = s.order || (CFG.orderUrl || 'https://eat.burgerfuel.com/order');
    order.closest('.sidebar__orderbar').hidden = !!s.noOrder;

    $('[data-s-address]').textContent = s.address;
    $('[data-s-directions]').href = s.gmaps ||
      ('https://www.google.com/maps/search/?api=1&query=' + s.lat + ',' + s.lng);
    $('[data-s-phone]').textContent = s.phone || '—';
    $('[data-s-call]').href = 'tel:' + String(s.phone || '').replace(/\s+/g, '');

    var dl = $('[data-s-hours]');
    dl.innerHTML = '';
    w.BFHours.group(s.hours).forEach(function (g) {
      var dt = d.createElement('dt'); dt.textContent = g.days;
      var dd = d.createElement('dd'); dd.textContent = g.time;
      dl.appendChild(dt); dl.appendChild(dd);
    });

    // event — fields on the store's CMS item
    var ev = s.event || (DEMO ? DEMO_EVENT : null);
    show($('[data-s-event]'), !!ev);
    if (ev) {
      $('[data-s-event-title]').textContent = ev.title;
      $('[data-s-event-body]').textContent = ev.body;
      $('[data-s-event-img]').src = ev.image || '';
      show($('[data-s-event-img]'), !!ev.image);
      $('[data-s-event-link]').href = ev.link || '#';
      show($('[data-s-event-link]'), !!ev.link);
    }
    elSidebar.toggleAttribute('data-has-event', !!ev);

    $('[data-s-desc]').textContent = s.description || '';
    $('[data-s-google]').href = s.google || '#';
    $('[data-s-facebook]').href = s.facebook || '#';
    show($('[data-s-google]'), !!s.google);
    show($('[data-s-facebook]'), !!s.facebook);
    show($('[data-s-review]'), !!(s.google || s.facebook));

    var photos = (s.photos && s.photos.length) ? s.photos : [s.image];
    // desktop lays out 1 or 2 photos in place; only 3+ become a slider
    $('[data-s-photos-sec]').dataset.count = photos.length > 2 ? 'many' : String(photos.length);
    elPhotos.innerHTML = '';
    photos.forEach(function (src, i) {
      var b = d.createElement('button');
      b.type = 'button';
      b.className = 'sheet-photo';
      b.setAttribute('aria-label', 'View photo ' + (i + 1) + ' of ' + photos.length + ' full screen');
      var img = d.createElement('img');
      img.src = src;
      img.alt = 'BurgerFuel ' + s.name + ' — photo ' + (i + 1);
      img.loading = i < 2 ? 'eager' : 'lazy';
      img.draggable = false;
      img.addEventListener('load', syncPhotoNav);   // widths aren't known until then
      b.appendChild(img);
      b.insertAdjacentHTML('beforeend',
        '<span class="sheet-photo__expand" aria-hidden="true"><svg fill="none" viewBox="0 0 18 18">' +
        '<path d="M9 10.05L7.95 9L3 13.95L3 10.5L1.5 10.5L1.5 16.5L7.5 16.5L7.5 15L4.05 15L9 10.05Z" fill="currentColor"/>' +
        '<path d="M16.5 7.5L16.5 1.5L10.5 1.5L10.5 3L13.95 3L9 7.95L10.05 9L15 4.05L15 7.5L16.5 7.5Z" fill="currentColor"/></svg></span>');
      b.addEventListener('click', function () {
        if (photoDragged) return;                 // the end of a drag isn't a click
        openPhotos(photos, i, s);
      });
      elPhotos.appendChild(b);
    });
    elPhotos.scrollLeft = 0;
    syncPhotoNav();

    $('[data-s-started]').textContent = s.started || '';
    show($('[data-s-started-sec]'), !!s.started);

    var blog = s.blog || (DEMO ? DEMO_BLOG : null);
    show($('[data-s-blog]'), !!blog);
    if (blog) {
      $('[data-s-blog-link]').href = blog.url || '#';
      $('[data-s-blog-img]').src = blog.image || '';
      $('[data-s-blog-title]').textContent = blog.title;
      $('[data-s-blog-tag]').textContent = blog.tag || '';
    }

    var next = nextStore(s);
    $('[data-s-next-img]').src = next.image;
    $('[data-s-next-name]').textContent = next.name;
    $('[data-s-next-store]').setAttribute('aria-label', 'Next store: ' + next.name);

    elSheetScroll.scrollTop = 0;
  }

  // next along the list as the visitor currently sees it, wrapping round
  function nextStore(s) {
    var list = visibleStores();
    if (list.length < 2) list = STORES.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'en'); });
    var i = list.findIndex(function (x) { return x.slug === s.slug; });
    return list[(i + 1) % list.length];
  }

  function openPhotos(photos, i, s) {
    if (!w.BFLightbox) return;
    w.BFLightbox.open({
      photos: photos,
      index: i,
      alt: 'BurgerFuel ' + s.name,
      keyboard: keyNav,
      thumb: function (n) { var b = elPhotos.children[n]; return b ? b.querySelector('img') : null; },
      // keep the strip in step (it glides along behind the dimmed
      // backdrop), so closing flies back to the right thumbnail
      onIndex: function (n) {
        var el = elPhotos.children[n];
        if (el) elPhotos.scrollTo({ left: el.offsetLeft - elPhotos.firstElementChild.offsetLeft, behavior: 'smooth' });
      }
    });
  }

  /* mouse users can drag the strip like a touch slider; snapping is off
     while the button is down and back on to settle */
  var photoDragged = false;
  function bindPhotoDrag() {
    var x0 = 0, left0 = 0, down = false, vx = 0, lastX = 0, lastT = 0, settle = 0;
    elPhotos.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      down = true; photoDragged = false;
      clearTimeout(settle);
      x0 = lastX = e.clientX; lastT = e.timeStamp; vx = 0;
      left0 = elPhotos.scrollLeft;
    });
    w.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - x0;
      if (!photoDragged && Math.abs(dx) > 5) {
        photoDragged = true;
        elPhotos.classList.add('is-dragging');
      }
      if (photoDragged) elPhotos.scrollLeft = left0 - dx;
      var dt = e.timeStamp - lastT;
      if (dt > 0) vx = (e.clientX - lastX) / dt;
      lastX = e.clientX; lastT = e.timeStamp;
    });
    w.addEventListener('pointerup', function () {
      if (!down) return;
      down = false;
      if (photoDragged) {
        /* Glide to the nearest photo in the direction of the throw, with
           snapping still off; switching snapping back on mid-drag is what
           made the strip jump straight to a photo. */
        var kids = [].slice.call(elPhotos.children);
        var base = elPhotos.firstElementChild.offsetLeft;
        var aim = elPhotos.scrollLeft - vx * 180;
        var best = 0, bestD = Infinity;
        kids.forEach(function (k) {
          var dd = Math.abs(k.offsetLeft - base - aim);
          if (dd < bestD) { bestD = dd; best = k.offsetLeft - base; }
        });
        best = Math.min(best, elPhotos.scrollWidth - elPhotos.clientWidth);
        elPhotos.scrollTo({ left: best, behavior: 'smooth' });
        settle = setTimeout(function () { elPhotos.classList.remove('is-dragging'); }, 450);
      } else {
        elPhotos.classList.remove('is-dragging');
      }
      // let the click that follows this pointerup see the flag, then clear it
      setTimeout(function () { photoDragged = false; }, 0);
    });
  }

  function syncPhotoNav() {
    var max = elPhotos.scrollWidth - elPhotos.clientWidth - 2;
    $('[data-photos-prev]').disabled = elPhotos.scrollLeft <= 2;
    $('[data-photos-next]').disabled = elPhotos.scrollLeft >= max;
  }
  function stepPhotos(dir) {
    var first = elPhotos.firstElementChild;
    if (!first) return;
    var gap = parseFloat(getComputedStyle(elPhotos).columnGap) || 0;
    elPhotos.scrollBy({ left: dir * (first.getBoundingClientRect().width + gap), behavior: 'smooth' });
  }

  /* ── store sheet: open / close ────────────────────────────── */
  var closeTimer = null;
  var lastFocus = null;
  var keyNav = false;
  d.addEventListener('keydown', function () { keyNav = true; }, true);
  d.addEventListener('pointerdown', function () { keyNav = false; }, true);

  var flip = null;   // { row } while the sheet was opened from a list card

  function openSidebar(s, fromRow) {
    fillSidebar(s);
    clearTimeout(closeTimer);

    if (!sheetMode()) {
      elSidebar.hidden = false;
      elSheetScroll.scrollTop = 0;
      d.body.classList.add('is-sidebar-open');
      if (state.map) state.map.resize();
      state.sheetOpen = true;
      return;
    }

    if (state.sheetOpen) {
      // already up: swap content in place rather than re-running the slide
      if (elSheetScroll.animate && !REDUCED.matches) {
        elSheetScroll.animate(
          [{ opacity: 0, transform: 'translateY(1rem)' }, { opacity: 1, transform: 'none' }],
          { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)' });
      }
      return;
    }

    lastFocus = d.activeElement;
    elSidebar.hidden = false;
    elScrim.hidden = false;
    // a hidden element ignores scrollTop, so reset once it's back on the
    // page — every store opens at its hero, never where the last one was
    elSheetScroll.scrollTop = 0;
    elHeroImg.style.transform = '';
    elSidebar.style.removeProperty('--drag');
    d.documentElement.classList.add('is-locked');

    // phones only: the card grows into the sheet. Tablet's centred sheet
    // just slides up with its photo already in place.
    var thumb = isMobile() && fromRow && $('.storerow__thumb img', fromRow);
    if (thumb && inView(thumb) && !REDUCED.matches) {
      morphOpen(fromRow, thumb);
    } else {
      flip = null;
      void elSidebar.offsetHeight;           // commit the off-screen start before sliding
      d.body.classList.add('is-sheet-open', 'is-sidebar-open');
    }
    // a dialog while it's a sheet over the page; beside the map on desktop it's just a panel
    if (sheetMode()) { elSidebar.setAttribute('role', 'dialog'); elSidebar.setAttribute('aria-modal', 'true'); }
    state.sheetOpen = true;
    // keyboard users land on Close; a tap shouldn't leave a focus ring behind
    if (keyNav) $('[data-sidebar-close]').focus({ preventScroll: true });
  }

  function closeSidebar() {
    var curSlug = state.selected && state.selected.slug;
    state.selected = null;
    writeHash(null);
    state.sheetOpen = false;
    syncListSelection();
    syncMarkerSelection();

    if (!sheetMode() || elSidebar.hidden) {
      flip = null;
      elSidebar.hidden = true;
      elScrim.hidden = true;
      d.body.classList.remove('is-sidebar-open', 'is-sheet-open');
      d.documentElement.classList.remove('is-locked');
      if (state.map) state.map.resize();
      return;
    }

    elSidebar.removeAttribute('role');
    elSidebar.removeAttribute('aria-modal');
    var done = function () {
      elSheetScroll.scrollTop = 0;
      elSidebar.hidden = true;
      elScrim.hidden = true;
      elSidebar.classList.remove('is-flip');
      elSidebar.style.removeProperty('--drag');
      d.body.classList.remove('is-sidebar-open');
      d.documentElement.classList.remove('is-locked');
    };

    // shrink back into the card we came from, if it's still on screen and
    // the sheet hasn't been scrolled far past its photo
    // (the store now showing, which "Next store" may have changed)
    var row = flip && curSlug && $('.storerow[data-slug="' + curSlug + '"]', elList);
    var thumb = row && $('.storerow__thumb img', row);
    flip = null;
    if (thumb && inView(thumb) && !REDUCED.matches &&
        elSheetScroll.scrollTop < elHeroImg.parentNode.offsetHeight &&
        !elSidebar.classList.contains('is-dragging') && !elSidebar.style.getPropertyValue('--drag')) {
      d.body.classList.remove('is-sheet-open');   // scrim fades (CSS, ease-in-cubic)
      morphClose(row, thumb, done);
      return;
    }

    d.body.classList.remove('is-sheet-open');
    // 400ms ease-in-cubic, set in CSS — wait it out, then take it off the page
    closeTimer = setTimeout(done, REDUCED.matches ? 20 : CLOSE_MS + 20);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  /* ── list card → sheet morph (sheet mode, list view) ──────────
     The card's photo lifts off and flies to the sheet's hero slot while
     the sheet grows out of the card's own rectangle around it — a clip
     that starts as the card and opens to the full sheet. Same timings as
     the slide: 450ms ease-out-quint in, 400ms ease-in-cubic out. */
  /* Run fn once, when the animation finishes — or shortly after it should
     have, if the browser stopped painting (backgrounded tab) and 'finish'
     never arrives. The UI must never be left mid-morph. */
  function whenDone(anim, ms, fn) {
    var ran = false;
    var go = function () { if (!ran) { ran = true; fn(); } };
    anim.onfinish = anim.oncancel = go;
    setTimeout(go, ms + 150);
  }
  function inView(el) {
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < w.innerHeight;
  }
  function insetFrom(outer, inner) {
    return 'inset(' + Math.max(0, inner.top - outer.top) + 'px ' +
                      Math.max(0, outer.right - inner.right) + 'px ' +
                      Math.max(0, outer.bottom - inner.bottom) + 'px ' +
                      Math.max(0, inner.left - outer.left) + 'px round 0px)';
  }
  function heroTarget() {
    // the hero photo is taller than its slot (for the parallax); the slot clips it
    var img = elHeroImg.getBoundingClientRect();
    var slot = elHeroImg.parentNode.getBoundingClientRect();
    return { img: img, clipTop: Math.max(0, slot.top - img.top), clipBottom: Math.max(0, img.bottom - slot.bottom) };
  }
  function makeClone(src, r) {
    var c = d.createElement('img');
    c.className = 'flip-clone';
    c.src = src; c.alt = '';
    c.style.cssText = 'top:' + r.top + 'px;left:' + r.left + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
    d.body.appendChild(c);
    return c;
  }
  function rectFrames(from, to, fromClip, toClip) {
    return [
      { top: from.top + 'px', left: from.left + 'px', width: from.width + 'px', height: from.height + 'px', clipPath: fromClip },
      { top: to.top + 'px', left: to.left + 'px', width: to.width + 'px', height: to.height + 'px', clipPath: toClip }
    ];
  }

  function morphOpen(row, thumb) {
    flip = { slug: row.dataset.slug };
    elSidebar.classList.add('is-flip');                  // no slide: the sheet sits in place
    d.body.classList.add('is-sheet-open', 'is-sidebar-open');   // scrim fades in (CSS)

    var S = elSidebar.getBoundingClientRect();
    var R = row.getBoundingClientRect();
    var T = thumb.getBoundingClientRect();
    var H = heroTarget();
    var radius = getComputedStyle(elSidebar).borderTopLeftRadius;

    var clone = makeClone(thumb.currentSrc || thumb.src, T);
    elHeroImg.style.visibility = 'hidden';
    thumb.style.visibility = 'hidden';

    var opts = { duration: OPEN_MS, easing: EASE_OUT_QUINT };
    elSidebar.animate([
      { clipPath: insetFrom(S, R) },
      { clipPath: 'inset(0px 0px 0px 0px round ' + radius + ' ' + radius + ' 0px 0px)' }
    ], opts);
    $$('.sheet-grey > *, .sidebar__orderbar', elSidebar).forEach(function (el, i) {
      el.animate([{ opacity: 0, transform: 'translateY(1.5rem)' }, { opacity: 1, transform: 'none' }],
                 { duration: OPEN_MS, delay: 60 + i * 40, easing: EASE_OUT_QUINT, fill: 'backwards' });
    });
    // top corners soften from the card's square edge to the sheet's radius
    // over the whole flight, so nothing snaps when the real photo takes over
    var a = clone.animate(rectFrames(T, H.img, 'inset(0px 0px 0px 0px round 0px 0px 0px 0px)',
                                     'inset(' + H.clipTop + 'px 0px ' + H.clipBottom + 'px 0px round ' + radius + ' ' + radius + ' 0px 0px)'), opts);
    whenDone(a, OPEN_MS, function () {
      elHeroImg.style.visibility = '';
      thumb.style.visibility = '';
      clone.remove();
      elSidebar.getAnimations().forEach(function (an) { an.cancel(); });
      elSidebar.classList.remove('is-flip');
    });
  }

  function morphClose(row, thumb, done) {
    elSheetScroll.scrollTop = Math.min(elSheetScroll.scrollTop, 0);
    elHeroImg.style.transform = '';
    elSidebar.classList.add('is-flip');

    var S = elSidebar.getBoundingClientRect();
    var R = row.getBoundingClientRect();
    var T = thumb.getBoundingClientRect();
    var H = heroTarget();
    var radius = getComputedStyle(elSidebar).borderTopLeftRadius;

    var clone = makeClone(elHeroImg.currentSrc || elHeroImg.src, H.img);
    elHeroImg.style.visibility = 'hidden';
    thumb.style.visibility = 'hidden';

    var opts = { duration: CLOSE_MS, easing: EASE_IN_CUBIC, fill: 'forwards' };
    elSidebar.animate([
      { clipPath: 'inset(0px 0px 0px 0px round ' + radius + ' ' + radius + ' 0px 0px)' },
      { clipPath: insetFrom(S, R) }
    ], opts);
    elSheetScroll.animate([{ opacity: 1 }, { opacity: 0 }],
                          { duration: CLOSE_MS * 0.6, easing: EASE_IN_CUBIC, fill: 'forwards' });
    var a = clone.animate(rectFrames(H.img, T, 'inset(' + H.clipTop + 'px 0px ' + H.clipBottom + 'px 0px round ' + radius + ' ' + radius + ' 0px 0px)',
                                     'inset(0px 0px 0px 0px round 0px 0px 0px 0px)'), opts);
    whenDone(a, CLOSE_MS, function () {
      thumb.style.visibility = '';
      elHeroImg.style.visibility = '';
      clone.remove();
      elSidebar.getAnimations().forEach(function (an) { an.cancel(); });
      elSheetScroll.getAnimations().forEach(function (an) { an.cancel(); });
      done();
    });
  }

  /* hero parallax: the photo drifts at a third of the scroll speed, and
     stretches when iOS rubber-bands past the top */
  var parallaxRaf = 0;
  function onSheetScroll() {
    if (parallaxRaf) return;
    parallaxRaf = w.requestAnimationFrame(function () {
      parallaxRaf = 0;
      if (!sheetMode() || REDUCED.matches) { elHeroImg.style.transform = ''; return; }
      var y = elSheetScroll.scrollTop;
      var h = elHeroImg.parentNode.offsetHeight;
      if (y < 0) {
        elHeroImg.style.transform = 'translate3d(0,' + y + 'px,0) scale(' + (1 - y / h) + ')';
      } else if (y <= h) {
        elHeroImg.style.transform = 'translate3d(0,' + (y * 0.35).toFixed(1) + 'px,0)';
      }
    });
  }

  /* swipe the sheet down from the top of its scroll to dismiss */
  function bindSheetDrag() {
    var startY = 0, startX = 0, lastY = 0, lastT = 0, v = 0, dragging = false, decided = false;

    elSidebar.addEventListener('touchstart', function (e) {
      if (!sheetMode() || !state.sheetOpen || e.touches.length !== 1) return;
      if (elSheetScroll.scrollTop > 0) return;
      startY = lastY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      lastT = e.timeStamp; v = 0;
      dragging = false; decided = false;
    }, { passive: true });

    elSidebar.addEventListener('touchmove', function (e) {
      if (!sheetMode() || !state.sheetOpen || !startY) return;
      var y = e.touches[0].clientY, dy = y - startY, dx = e.touches[0].clientX - startX;
      if (!decided) {
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
        decided = true;
        dragging = dy > 0 && Math.abs(dy) > Math.abs(dx) && elSheetScroll.scrollTop <= 0;
        if (dragging) elSidebar.classList.add('is-dragging');
      }
      if (!dragging) return;
      e.preventDefault();
      v = (y - lastY) / Math.max(1, e.timeStamp - lastT);
      lastY = y; lastT = e.timeStamp;
      elSidebar.style.setProperty('--drag', Math.max(0, dy) + 'px');
      elScrim.style.opacity = String(Math.max(0, 1 - dy / (elSidebar.offsetHeight * 1.2)));
    }, { passive: false });

    function end() {
      if (!dragging) { startY = 0; return; }
      var dy = lastY - startY;
      elSidebar.classList.remove('is-dragging');
      elScrim.style.opacity = '';
      dragging = false; startY = 0;
      if (dy > 110 || v > 0.6) closeSidebar();
      else elSidebar.style.setProperty('--drag', '0px');
    }
    elSidebar.addEventListener('touchend', end);
    elSidebar.addEventListener('touchcancel', end);
  }

  /* ── store URLs ───────────────────────────────────────────────
     On the live site every store has its own address, which Google
     indexes: /nz/locations/albany. Opening a sheet moves the address bar
     there (pushState, no reload), closing it returns to the list's
     address, and Back/Forward open and close sheets. The Webflow CMS
     store template page carries the same embed with the store's slug —
     <div id="bf-locator" data-store="albany"> — and starts with that
     sheet open, so a Google result lands on the new design.

     Optional attributes on #bf-locator, for the build period when the
     pages live at other addresses:
       data-store       the store to open on load (template page)
       data-store-base  where store pages live   (default: see below)
       data-list-url    the list page's address  (default: see below)
     Defaults: on the list page, stores live under its own path; on a
     store page, the list is the store path's parent.

     Anywhere else (the GitHub preview, a test page) it falls back to
     hash links: #ponsonby opens a sheet, #list / #map pick the view. */
  var ROUTE = (function () {
    var host = d.getElementById('bf-locator');
    if (!host || !w.history.pushState) return null;
    var path = w.location.pathname.replace(/\/+$/, '');
    var start = host.getAttribute('data-store');
    var parent = path.slice(0, path.lastIndexOf('/'));
    if (!start && !/\/locations[^\/]*$/i.test(path)) return null;  // not a locations page: hash links
    var list = host.getAttribute('data-list-url') || (start ? parent : path);
    return {
      start: start,
      list: list.replace(/\/+$/, '') || '/',
      stores: (host.getAttribute('data-store-base') || (start ? parent : path)).replace(/\/+$/, '')
    };
  })();
  var LIST_TITLE = ROUTE && ROUTE.start ? (CFG.listTitle || 'BurgerFuel Store Locations | NZ') : d.title;
  var routing = false;          // true while applying Back/Forward, so nothing is pushed

  function slugFromPath() {
    if (!ROUTE) return null;
    var path = w.location.pathname.replace(/\/+$/, '');
    if (path.indexOf(ROUTE.stores + '/') !== 0) return null;
    return decodeURIComponent(path.slice(ROUTE.stores.length + 1).split('/')[0]);
  }
  function viewHash() {
    // only note the view when it isn't this mode's default
    return state.view !== defaultView() ? '#' + state.view : '';
  }
  function storeUrl(slug) {
    return (slug ? ROUTE.stores + '/' + encodeURIComponent(slug) : ROUTE.list) + w.location.search + viewHash();
  }

  function readHash(hash) {
    var parts = decodeURIComponent(hash.slice(1)).split('&');
    if (parts.indexOf('list') > -1) setView('list');
    if (parts.indexOf('map') > -1) setView('map');
    var slug = ROUTE ? (ROUTE.start || slugFromPath()) : null;
    var s = STORES.find(function (x) { return slug ? x.slug === slug : parts.indexOf(x.slug) > -1; });
    if (s) select(s, 'link');
  }
  function writeHash(slug) {
    if (!w.history.replaceState) return;
    if (ROUTE) {
      if (routing) return;
      var want = storeUrl(slug);
      var here = w.location.pathname.replace(/\/+$/, '') + w.location.search + w.location.hash;
      if (want === here) return;
      var onStore = !!slugFromPath();
      // opening or closing a sheet is a step Back can undo; swapping one
      // store for another (or changing view) just updates the address
      if (!!slug !== onStore) w.history.pushState({ bf: slug || null }, '', want);
      else w.history.replaceState({ bf: slug || null }, '', want);
      d.title = slug ? storeTitle(slug) : LIST_TITLE;
      return;
    }
    var parts = [];
    if (state.view !== defaultView()) parts.push(state.view);
    if (slug) parts.push(slug);
    w.history.replaceState(null, '', w.location.pathname + w.location.search + (parts.length ? '#' + parts.join('&') : ''));
  }
  function storeTitle(slug) {
    var s = STORES.find(function (x) { return x.slug === slug; });
    return s ? 'BurgerFuel ' + s.name + ' | Gourmet Burgers' : LIST_TITLE;
  }
  // Back / Forward: open or close the sheet the address now describes
  w.addEventListener('popstate', function () {
    if (!ROUTE) return;
    var slug = slugFromPath();
    var s = slug && STORES.find(function (x) { return x.slug === slug; });
    routing = true;
    try {
      if (s) { if (!state.selected || state.selected.slug !== s.slug) select(s, 'link'); }
      else if (state.sheetOpen) closeSidebar();
      d.title = s ? storeTitle(s.slug) : LIST_TITLE;
    } finally { routing = false; }
  });

  // phones open on the list; tablet and desktop on the map
  function defaultView() { return isMobile() ? 'list' : 'map'; }

  /* ── selection ────────────────────────────────────────────── */
  function select(store, source, fromRow) {
    state.selected = store;
    writeHash(store.slug);
    openSidebar(store, fromRow);
    syncListSelection();
    syncMarkerSelection();
    if (state.view === 'map' && source !== 'map' && state.map) {
      state.map.panTo(store.lat, store.lng, 13);
    }
  }

  /* ── view switching ───────────────────────────────────────── */
  function setView(view) {
    if (view === 'map') bootMap();
    state.view = view;
    d.body.dataset.view = view;
    elListView.hidden = view !== 'list';
    elMapCtrl.hidden = view !== 'map';
    $$('.segment__btn').forEach(function (b) {
      var on = b.dataset.view === view;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
    });
    if (view === 'map' && state.map) {
      state.map.resize();
      fitToFilter(!state.fitted);     // first showing jumps; later ones ease
      state.fitted = true;
    }
    // mobile: the list starts at its title; the map view doesn't scroll
    if (isMobile()) w.scrollTo(0, 0);
    if (view !== 'map') hideHint();
    writeHash(state.selected && state.selected.slug);
    updateStuck();
  }

  function fitToFilter(instant) {
    if (!state.map) return;
    var stores = visibleStores();
    if (!stores.length) return;
    var u = remPx();
    if (!state.region && !state.query) {
      if (isMobile()) {
        state.map.fitBounds(STORES, { top: u * 11, right: u * 2, bottom: u * 7, left: u * 2 }, instant);
      } else if (sheetMode()) {
        state.map.fitBounds(STORES, { top: toolbarBottom() + u * 2, right: u * 3, bottom: u * 3, left: u * 3 }, instant);
      } else {
        var t = toolbarBottom() + u * 2;
        state.map.fitBounds(STORES, { top: t, right: elSidebar.hidden ? u * 5 : u * 43, bottom: u * 6, left: u * 5 }, instant);
      }
      return;
    }
    // padding derived from the live root scale and the toolbar's real height
    var tb = toolbarBottom() + u * 2;
    state.map.fitBounds(stores, isMobile()
      ? { top: u * 12, right: u * 3, bottom: u * 8, left: u * 3 }
      : sheetMode()
        ? { top: tb, right: u * 4, bottom: u * 4, left: u * 4 }
        : { top: tb, right: elSidebar.hidden ? u * 5 : u * 43, bottom: u * 6, left: u * 5 });
  }

  /* The toolbar's bottom edge within the stage, published as --tb so the
     list starts below it. Measured, not assumed: on tablet the bar can
     wrap onto a second row, and nothing may sit underneath it. */
  function toolbarBottom() {
    return elToolbar.offsetTop + elToolbar.offsetHeight;
  }
  function measureToolbar() {
    if (isMobile()) { elStage.style.removeProperty('--tb'); return; }
    elStage.style.setProperty('--tb', toolbarBottom() + 'px');
  }

  /* ── sticky switch shadow (mobile) ────────────────────────── */
  function updateStuck() {
    // the mobile switch now floats at the bottom; nothing sticks any more
    if (true) { d.body.classList.remove('is-stuck'); return; }
    var navH = remPx() * 4.375;
    // stuck = the band sits pinned under the nav while the page has moved on
    var stuck = elSegwrap.getBoundingClientRect().top <= navH + 0.5 && w.scrollY > 0;
    d.body.classList.toggle('is-stuck', stuck);
  }

  /* ── map nudges (mobile) ──────────────────────────────────────
     1. A small toast, once, the first time the map comes into view —
        "Pinch to zoom", then "Tap a store". Gone the moment the map is
        touched.
     2. After 3.25s with no input at all, the pins on screen give a
        quick wiggle in a random order, then again every 3.25s while the
        visitor stays idle. Any touch, scroll, wheel or key puts it back
        on a 3.25s cooldown. Desktop also wiggles once on load. */
  var mapInView = 0;
  var HINTS = [
    { icon: 'zoom', text: 'Pinch to zoom' },
    { icon: 'tap',  text: 'Tap a store for details' }
  ];
  var hintTimers = [];
  var hintsPlayed = false;

  function hideHint() {
    hintTimers.forEach(clearTimeout); hintTimers = [];
    elHint.removeAttribute('data-show');
  }
  function playHints() {
    // touch screens only — "pinch" means nothing to a mouse
    if (hintsPlayed || state.mapTouched || !(isMobile() || COARSE.matches) || state.view !== 'map' || state.sheetOpen) return;
    hintsPlayed = true;
    var t = 700;
    HINTS.forEach(function (h) {
      hintTimers.push(setTimeout(function () {
        $$('[data-hint-icon]', elHint).forEach(function (i) { i.hidden = i.dataset.hintIcon !== h.icon; });
        $('[data-map-hint-text]', elHint).textContent = h.text;
        elHint.setAttribute('data-show', '');
      }, t));
      t += 2600;
      hintTimers.push(setTimeout(function () { elHint.removeAttribute('data-show'); }, t));
      t += 450;
    });
  }

  var IDLE_MS = 3250;
  var idleTimer = 0;
  function armIdle() { clearTimeout(idleTimer); idleTimer = setTimeout(idleTick, IDLE_MS); }
  function idleTick() {
    if (canWiggle()) wigglePins();
    armIdle();
  }
  function canWiggle() {
    return !REDUCED.matches && !d.hidden && state.map && state.view === 'map' &&
           !state.sheetOpen && mapInView >= 0.35 && !(w.BFLightbox && w.BFLightbox.isOpen());
  }
  function wigglePins() {
    var box = elMap.getBoundingClientRect();
    // below the nav and whatever floats over the map's top edge
    var top = Math.max(box.top, (isMobile() ? elMFOpen : elToolbar).getBoundingClientRect().bottom);
    var pins = [];
    state.markers.forEach(function (m) {
      if (m.el.style.display === 'none') return;
      var r = m.el.getBoundingClientRect();
      if (r.right > box.left && r.left < box.right && r.bottom > top && r.top < box.bottom) {
        pins.push({ el: m.el, x: r.left });
      }
    });
    // random order and a little random spacing each time, so the wave
    // never plays the same way twice
    for (var k = pins.length - 1; k > 0; k--) {
      var r = Math.floor(Math.random() * (k + 1));
      var t = pins[k]; pins[k] = pins[r]; pins[r] = t;
    }
    var at = 0;
    pins.slice(0, 24).forEach(function (p) {
      setTimeout(function () {
        p.el.classList.remove('is-wiggle');
        void p.el.offsetWidth;
        p.el.classList.add('is-wiggle');
      }, at);
      at += 40 + Math.random() * 60;
    });
  }

  function bindNudges() {
    elMap.appendChild(elHint);   // positioned against the map box

    ['pointerdown', 'touchstart', 'wheel', 'keydown'].forEach(function (t) {
      w.addEventListener(t, armIdle, { passive: true, capture: true });
    });
    w.addEventListener('scroll', armIdle, { passive: true });

    elMap.addEventListener('pointerdown', function () {
      state.mapTouched = true;
      hideHint();
    }, { passive: true });

    elMap.addEventListener('animationend', function (e) {
      var pin = e.target.closest && e.target.closest('.bf-pin');
      if (pin) pin.classList.remove('is-wiggle');
    });

    if ('IntersectionObserver' in w) {
      new IntersectionObserver(function (entries) {
        mapInView = entries[0].intersectionRatio;
        if (mapInView >= 0.5) playHints();
      }, { threshold: [0, 0.35, 0.5, 0.75, 1] }).observe(elMap);
    } else {
      mapInView = 1;
    }
    armIdle();
  }

  /* ── region dropdown ──────────────────────────────────────────
     The panel drops out of the button (clip-mask reveal in CSS) and its
     rows stagger in; each row carries its store count. */
  var elRegionPanel = $('[data-region-panel]');
  var elRegionClear = $('[data-region-clear]');
  var REGION_COUNT = {};
  STORES.forEach(function (s) { REGION_COUNT[s.region] = (REGION_COUNT[s.region] || 0) + 1; });
  var regionCloseTimer = 0, regionAnimTimer = 0;

  function buildRegionMenu() {
    var opts = [{ value: null, label: 'All regions', count: STORES.length }].concat(
      REGIONS.map(function (r) { return { value: r, label: r, count: REGION_COUNT[r] || 0 }; })
    );

    elRegionMenu.innerHTML = '';
    opts.forEach(function (o, i) {
      var li = d.createElement('li');
      li.setAttribute('role', 'none');       // the listbox's children are the options
      var b = d.createElement('button');
      b.type = 'button';
      b.className = 'region__opt';
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(state.region === o.value));
      b.style.setProperty('--i', i);
      b.appendChild(d.createTextNode(o.label));
      var c = d.createElement('span');
      c.className = 'region__count';
      c.textContent = o.count;
      b.appendChild(c);
      b.addEventListener('click', function () { setRegion(o.value); });
      li.appendChild(b);
      elRegionMenu.appendChild(li);
    });
  }

  function setRegion(value) {
    state.region = value;
    elRegionLbl.textContent = value ? value + ', NZ' : 'Select a Region';
    elRegionBtn.classList.toggle('has-value', !!value);
    elRegionClear.hidden = !value;
    closeRegion();
    buildRegionMenu();
    refresh();
    fitToFilter();
  }

  function setQuery(value, opts) {
    state.query = value;
    if (elSearch.value !== value) elSearch.value = value;
    refresh();
    if (opts && opts.fit) fitToFilter();
    if (opts && opts.focus) elSearch.focus();
  }

  function openRegion() {
    clearTimeout(regionCloseTimer);
    elRegionPanel.hidden = false;
    void elRegionPanel.offsetHeight;          // start from the clipped state
    elRegion.dataset.open = '';
    elRegionBtn.setAttribute('aria-expanded', 'true');
    var sel = $('[aria-selected="true"]', elRegionMenu);
    elRegionMenu.scrollTop = sel ? Math.max(0, sel.offsetTop - elRegionMenu.clientHeight / 2) : 0;
    clearTimeout(regionAnimTimer);
    elRegionPanel.classList.remove('is-anim');
    if (!REDUCED.matches) {
      void elRegionPanel.offsetWidth;
      elRegionPanel.classList.add('is-anim');
      // drop the stagger once it has played so hover transitions aren't held
      regionAnimTimer = setTimeout(function () { elRegionPanel.classList.remove('is-anim'); },
                                   175 + elRegionMenu.children.length * 50 + 50);
    }
  }
  function closeRegion() {
    if (!('open' in elRegion.dataset)) return;
    delete elRegion.dataset.open;
    elRegionBtn.setAttribute('aria-expanded', 'false');
    regionCloseTimer = setTimeout(function () {
      if (!('open' in elRegion.dataset)) elRegionPanel.hidden = true;
    }, 240);
  }

  /* ── one match → open it ─────────────────────────────────────
     If what's typed (3+ characters) narrows to exactly one store, a ring
     in the field counts down 0.8s, then opens that store in the list
     view. Any further keystroke, Esc or clear cancels it, and it never
     re-fires for the same query. BF_CONFIG.autoOpenSingle switches it. */
  var elSfRing = $('[data-sf-ring]');
  var searchTimer = 0;
  var autoTimer = 0, autoDoneFor = '';

  /* open a store found by search; in the list view the card morphs open */
  function openFromSearch(store, toList) {
    if (toList && state.view !== 'list') setView('list');
    if (state.view !== 'list') { select(store, 'search'); return; }
    var li = $('.storerow[data-slug="' + store.slug + '"]', elList);
    if (li) {
      var r = li.getBoundingClientRect();
      if (isMobile()) {
        var bandBottom = elSegwrap.getBoundingClientRect().bottom;
        if (r.top < bandBottom || r.bottom > w.innerHeight) w.scrollTo(0, w.scrollY + r.top - bandBottom - remPx());
      } else {
        li.scrollIntoView({ block: 'nearest' });
      }
    }
    select(store, 'list', li);
  }

  function checkAuto() {
    if (!AUTO_OPEN) return;
    var q = elSearch.value.trim().toLowerCase();
    if (q !== autoDoneFor) autoDoneFor = '';
    var m = q.length >= 3 && !autoDoneFor ? filterStores(state.region, q) : [];
    if (m.length === 1) startAuto(m[0], q); else cancelAuto();
  }
  function startAuto(store, q) {
    if (autoTimer && elSfRing.dataset.slug === store.slug) return;   // already counting
    cancelAuto();
    elSfRing.dataset.slug = store.slug;
    elSfRing.setAttribute('data-on', '');
    void elSfRing.getBoundingClientRect();
    elSfRing.setAttribute('data-run', '');
    autoTimer = setTimeout(function () {
      autoTimer = 0;
      autoDoneFor = q;
      cancelAuto();
      if (isMobile() || COARSE.matches) elSearch.blur();
      clearTimeout(searchTimer);
      setQuery(elSearch.value);              // the list narrows to that one card
      openFromSearch(store, true);
    }, REDUCED.matches ? 300 : 800);
  }
  function cancelAuto() {
    clearTimeout(autoTimer);
    autoTimer = 0;
    elSfRing.removeAttribute('data-run');
    elSfRing.removeAttribute('data-on');
    delete elSfRing.dataset.slug;
  }

  /* ── mobile: filter pill + search overlay ──────────────────────
     The pill opens an overlay that grows out of it (a clip that starts
     as the pill's own rounded box and opens to the card — 450ms
     ease-out-quint) and shrinks back into it on the way out (400ms
     ease-in-cubic). The keyboard comes straight up. What's typed and the
     region picked only apply on Search; closing any other way discards
     them, the way Airbnb's search does. */
  var elMF      = $('[data-mfilter]');
  var elMFOpen  = $('[data-mfilter-open]');
  var elMFClear = $('[data-mfilter-clear]');
  var elFM      = $('[data-fmodal]');
  var elFMCard  = $('[data-fmodal-card]');
  var elFMInput = $('[data-fmodal-input]');
  var elFMForm  = $('[data-fmodal-form]');
  var elFMGo    = $('[data-fmodal-go]');
  var elFRegion = $('[data-fregion]');
  var elFRBtn   = $('[data-fregion-btn]');
  var elFRPanel = $('[data-fregion-panel]');
  var elFRList  = $('[data-fregion-list]');
  var elFMClearAll = $('[data-fmodal-clearall]');
  var fm = { open: false, region: null, busy: false, frTimer: 0, frAnim: 0 };

  function syncFilterChip() {
    var on = !!(state.query.trim() || state.region);
    elMFClear.hidden = !on;
    elMF.classList.toggle('is-filtered', on);     // purple icon + dot while filtering
    d.body.classList.toggle('has-filter', on);    // mobile list shows its "In … · Showing" line
  }
  // each field clears only itself: the search × shows once there's text,
  // the region × once a region is picked
  function syncFMClear() {
    $('[data-fmodal-x]', elFM).hidden = !elFMInput.value.trim();
    $('[data-fregion-clear]', elFM).hidden = !fm.region;
    // and once both are set, one chip under Search clears the lot
    elFMClearAll.hidden = !(elFMInput.value.trim() && fm.region);
  }

  function roundInset(outer, inner, r) {
    return 'inset(' + Math.max(0, inner.top - outer.top) + 'px ' +
                      Math.max(0, outer.right - inner.right) + 'px ' +
                      Math.max(0, outer.bottom - inner.bottom) + 'px ' +
                      Math.max(0, inner.left - outer.left) + 'px round ' + r + ')';
  }
  function fmChrome() { return [$('.fmodal__overlay', elFM)]; }
  function fmTrail() { return [elFMGo, elFMClearAll]; }
  /* Search and Clear all hang off the card's bottom edge: the card's clip
     and their travel share one duration and easing, so they stay 12px
     under its growing (or shrinking) edge and read as one piece — they
     start out tucked under the pill, narrow and squashed, and unfold. */
  function trailFrom(pill, card) {
    var go = elFMGo.getBoundingClientRect();
    return 'translateY(' + (pill.bottom - card.bottom) + 'px) scale(' +
           (pill.width / go.width).toFixed(3) + ', .5)';
  }

  function openFM() {
    if (fm.open || fm.busy) return;
    fm.open = true;
    fm.region = state.region;
    elFMInput.value = state.query;
    syncFRegion();
    syncFMClear();
    buildFRegion();
    elFM.hidden = false;
    d.documentElement.classList.add('is-locked');
    // still inside the tap, so iOS will raise the keyboard
    elFMInput.focus({ preventScroll: true });

    if (REDUCED.matches) { elMF.classList.add('is-hidden'); return; }
    var pill = elMFOpen.getBoundingClientRect();
    var card = elFMCard.getBoundingClientRect();
    elMF.classList.add('is-hidden');
    fm.busy = true;
    var a = elFMCard.animate([
      { clipPath: roundInset(card, pill, (pill.height / 2) + 'px') },
      { clipPath: 'inset(0px 0px 0px 0px round ' + getComputedStyle(elFMCard).borderTopLeftRadius + ')' }
    ], { duration: OPEN_MS, easing: EASE_OUT_QUINT });
    $$('.fmodal__card > *', elFM).forEach(function (el, i) {
      // the focused search field is already at its grown size: end there,
      // so nothing snaps when the stagger hands back to the stylesheet
      var end = el.contains(d.activeElement) && el.classList.contains('fmodal__search') ? 'scale(1.02)' : 'none';
      el.animate([{ opacity: 0, transform: 'translateY(.5rem) ' + (end === 'none' ? '' : end) }, { opacity: 1, transform: end }],
                 { duration: 350, delay: 90 + i * 30, easing: EASE_OUT_QUINT, fill: 'backwards' });
    });
    fmChrome().forEach(function (el) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: EASE_OUT_QUINT });
    });
    var from = trailFrom(pill, card);
    fmTrail().forEach(function (el) {
      el.style.transformOrigin = '50% 0';
      el.animate([{ transform: from, opacity: 0 }, { opacity: 1, offset: .35 }, { transform: 'none', opacity: 1 }],
                 { duration: OPEN_MS, delay: 50, easing: EASE_OUT_QUINT, fill: 'backwards' });
    });
    whenDone(a, OPEN_MS, function () { fm.busy = false; });
  }

  function closeFM(apply) {
    if (!fm.open) return;
    fm.open = false;
    closeFRegion(true);
    elFMInput.blur();
    if (apply) {
      clearTimeout(searchTimer);
      var q = elFMInput.value.trim();
      state.region = fm.region;                 // set both, then filter and fit once
      elRegionLbl.textContent = fm.region ? fm.region + ', NZ' : 'Select a Region';
      elRegionBtn.classList.toggle('has-value', !!fm.region);
      elRegionClear.hidden = !fm.region;
      buildRegionMenu();
      setQuery(q, { fit: true });
      if (state.view === 'list') w.scrollTo(0, 0);
    }
    var finish = function () {
      elFM.hidden = true;
      fm.busy = false;
      elMF.classList.remove('is-hidden');
      elFMGo.classList.remove('is-pressed');
      d.documentElement.classList.remove('is-locked');
      if (keyNav) elMFOpen.focus({ preventScroll: true });
      [elFMCard].concat($$('.fmodal__card > *', elFM), fmChrome(), fmTrail())
        .forEach(function (el) { el.getAnimations().forEach(function (an) { an.cancel(); }); });
    };
    if (REDUCED.matches) { finish(); return; }
    var pill = elMFOpen.getBoundingClientRect();
    var card = elFMCard.getBoundingClientRect();
    fm.busy = true;
    var a = elFMCard.animate([
      { clipPath: 'inset(0px 0px 0px 0px round ' + getComputedStyle(elFMCard).borderTopLeftRadius + ')' },
      { clipPath: roundInset(card, pill, (pill.height / 2) + 'px') }
    ], { duration: CLOSE_MS, easing: EASE_IN_CUBIC, fill: 'forwards' });
    $$('.fmodal__card > *', elFM).forEach(function (el) {
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: EASE_IN_CUBIC, fill: 'forwards' });
    });
    fmChrome().forEach(function (el) {
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CLOSE_MS * 0.8, easing: EASE_IN_CUBIC, fill: 'forwards' });
    });
    var to = trailFrom(pill, card);
    fmTrail().forEach(function (el) {
      el.style.transformOrigin = '50% 0';
      el.animate([{ transform: 'none', opacity: 1 }, { opacity: 1, offset: .65 }, { transform: to, opacity: 0 }],
                 { duration: CLOSE_MS, easing: EASE_IN_CUBIC, fill: 'forwards' });
    });
    whenDone(a, CLOSE_MS, finish);
  }

  /* the overlay's region dropdown — same look and motion as desktop's */
  function syncFRegion() {
    $('[data-fregion-label]', elFRegion).textContent = fm.region || 'All regions';
    elFRBtn.classList.toggle('has-value', !!fm.region);
    syncFMClear();
  }
  function buildFRegion() {
    var opts = [{ value: null, label: 'All regions', count: STORES.length }].concat(
      REGIONS.map(function (r) { return { value: r, label: r, count: REGION_COUNT[r] || 0 }; }));
    elFRList.innerHTML = '';
    opts.forEach(function (o, i) {
      var li = d.createElement('li');
      li.setAttribute('role', 'none');       // the listbox's children are the options
      var b = d.createElement('button');
      b.type = 'button';
      b.className = 'region__opt';
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(fm.region === o.value));
      b.style.setProperty('--i', i);
      b.appendChild(d.createTextNode(o.label));
      var c = d.createElement('span');
      c.className = 'region__count';
      c.textContent = o.count;
      b.appendChild(c);
      b.addEventListener('click', function () {
        fm.region = o.value;
        syncFRegion();
        buildFRegion();
        closeFRegion();
      });
      li.appendChild(b);
      elFRList.appendChild(li);
    });
  }
  function openFRegion() {
    clearTimeout(fm.frTimer);
    elFMInput.blur();                         // drop the keyboard so the list has room
    elFRPanel.hidden = false;
    elFRegion.classList.add('is-fr-active');
    elFMForm.classList.add('is-fregion-open');
    fitFRegion();
    void elFRPanel.offsetHeight;             // start from the field's own shape
    elFRegion.dataset.open = '';
    elFRBtn.setAttribute('aria-expanded', 'true');
    var sel = $('[aria-selected="true"]', elFRList);
    elFRList.scrollTop = sel ? Math.max(0, sel.parentNode.offsetTop - elFRList.clientHeight / 2) : 0;
    clearTimeout(fm.frAnim);
    elFRPanel.classList.remove('is-anim');
    if (!REDUCED.matches) {
      void elFRPanel.offsetWidth;
      elFRPanel.classList.add('is-anim');
      fm.frAnim = setTimeout(function () { elFRPanel.classList.remove('is-anim'); },
                             175 + elFRList.children.length * 50 + 50);
    }
  }
  // the list may never run off the bottom of the screen (the page is
  // locked, so nothing below it could be scrolled to): cap it to the
  // visible viewport, re-measuring as the keyboard slides away
  function fitFRegion() {
    var vv = w.visualViewport;
    var bottom = vv ? vv.offsetTop + vv.height : w.innerHeight;
    var room = bottom - elFRList.getBoundingClientRect().top - 16;
    elFRList.style.setProperty('--fr-max', Math.max(156, Math.floor(room)) + 'px');
    // the panel's open height: header + the list at its capped height
    var ps = getComputedStyle(elFRPanel);
    var list = Math.min(elFRList.scrollHeight, parseFloat(getComputedStyle(elFRList).maxHeight) || Infinity);
    elFRPanel.style.setProperty('--fr-h',
      Math.ceil(parseFloat(ps.paddingTop) + parseFloat(ps.borderTopWidth) * 2 + list) + 'px');
  }
  function closeFRegion(now) {
    if (!('open' in elFRegion.dataset)) return;
    delete elFRegion.dataset.open;
    elFRBtn.setAttribute('aria-expanded', 'false');
    var done = function () {
      if ('open' in elFRegion.dataset) return;
      elFRPanel.hidden = true;
      elFRegion.classList.remove('is-fr-active');
      elFMForm.classList.remove('is-fregion-open');   // hand the layer back once it's shut
    };
    if (now || REDUCED.matches) { done(); return; }
    fm.frTimer = setTimeout(done, 320);            // once it has folded back into the field
  }

  function bindFilterModal() {
    elMFOpen.addEventListener('click', openFM);
    elMFClear.addEventListener('click', function () {
      clearTimeout(searchTimer);
      state.query = '';
      elSearch.value = '';
      setRegion(null);
    });
    $$('[data-fmodal-dismiss]', elFM).forEach(function (el) {
      el.addEventListener('click', function () { closeFM(false); });
    });
    // search × clears the text only, then goes back to typing
    $('[data-fmodal-x]', elFM).addEventListener('click', function () {
      elFMInput.value = '';
      syncFMClear();
      elFMInput.focus();
    });
    // region × resets to all regions
    $('[data-fregion-clear]', elFM).addEventListener('click', function (e) {
      e.stopPropagation();
      fm.region = null;
      syncFRegion();
      buildFRegion();
    });
    elFMInput.addEventListener('input', syncFMClear);
    elFMInput.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      if (!fm.open || fm.busy) return;
      elFMGo.classList.add('is-pressed');
      closeFM(true);
    });
    $('[data-fmodal-form]', elFM).addEventListener('submit', function (e) {
      e.preventDefault();
      elFMGo.classList.add('is-pressed');    // stays purple while it shrinks away
      closeFM(true);
    });
    elFRBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if ('open' in elFRegion.dataset) closeFRegion(); else openFRegion();
    });
    elFMCard.addEventListener('click', function (e) {
      if (!elFRegion.contains(e.target)) closeFRegion();
    });
    elFMInput.addEventListener('focus', function () { closeFRegion(); });
    elFMClearAll.addEventListener('click', function () {
      elFMInput.value = '';
      fm.region = null;
      syncFRegion();
      buildFRegion();
      closeFRegion();
    });
    if (w.visualViewport) w.visualViewport.addEventListener('resize', function () {
      if ('open' in elFRegion.dataset) fitFRegion();
    });
  }

  /* ── refresh ──────────────────────────────────────────────── */
  function refresh() {
    elSearchClr.hidden = state.query.trim() === '';
    syncFilterChip();
    renderList();
    renderMarkers();
    syncMarkerSelection();
  }

  /* ── wiring ───────────────────────────────────────────────── */
  function bind() {
    $$('.segment__btn').forEach(function (b) {
      b.addEventListener('click', function () { setView(b.dataset.view); });
    });

    // Sort is a switch, not a dropdown: one press flips asc ⇄ desc
    elSort.addEventListener('click', function () {
      state.sortDesc = !state.sortDesc;
      elSort.setAttribute('aria-pressed', String(state.sortDesc));
      elSortLabel.textContent = state.sortDesc ? 'Z–A' : 'A–Z';
      renderList();
      elListScroll.scrollTo({ top: 0, behavior: 'smooth' });
    });

    elSearch.addEventListener('input', function () {
      // show Clear as soon as they type, don't wait out the debounce
      elSearchClr.hidden = elSearch.value.trim() === '';
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { setQuery(elSearch.value); }, 160);
      checkAuto();
    });
    elSearchForm.addEventListener('submit', function (e) {
      e.preventDefault();
      cancelAuto();
      clearTimeout(searchTimer);
      setQuery(elSearch.value, { fit: true });
      if (isMobile()) elSearch.blur();     // drop the keyboard so results show
    });

    // Esc inside the field clears it too
    elSearch.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && elSearch.value) {
        e.stopPropagation();
        cancelAuto();
        clearTimeout(searchTimer);
        setQuery('', { fit: true, focus: true });
      }
    });

    elSearchClr.addEventListener('click', function () {
      cancelAuto();
      clearTimeout(searchTimer);
      setQuery('', { fit: true, focus: true });
    });
    $('[data-empty-clear-search]').addEventListener('click', function () {
      clearTimeout(searchTimer);
      setQuery('', { fit: true, focus: true });
    });
    $('[data-empty-clear-region]').addEventListener('click', function () {
      setRegion(null);   // keeps the query, widens the region
    });

    elRegionClear.addEventListener('click', function (e) {
      e.stopPropagation();
      setRegion(null);
    });
    elRegionBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if ('open' in elRegion.dataset) closeRegion(); else openRegion();
    });
    d.addEventListener('click', function (e) {
      if (!elRegion.contains(e.target)) closeRegion();
    });
    /* Tab never wanders out of the modal on top: the lightbox, the
       search overlay, or (phones and tablets) the store sheet */
    d.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var lb = $('[data-lightbox]');
      var box = lb && !lb.hidden ? lb
              : fm.open ? elFM
              : (sheetMode() && state.sheetOpen) ? elSidebar : null;
      if (!box) return;
      var f = $$('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])', box)
        .filter(function (el) { return !el.disabled && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (!box.contains(d.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && d.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && d.activeElement === last) { e.preventDefault(); first.focus(); }
    }, true);
    d.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (fm.open) { if ('open' in elFRegion.dataset) closeFRegion(); else closeFM(false); return; }
      if ('open' in elRegion.dataset) closeRegion();
      else if (state.sheetOpen) closeSidebar();
    });

    $('[data-sidebar-close]').addEventListener('click', closeSidebar);
    elScrim.addEventListener('click', closeSidebar);
    $('[data-s-back]').addEventListener('click', closeSidebar);
    $('[data-s-next-store]').addEventListener('click', function () {
      if (state.selected) select(nextStore(state.selected), 'sheet');
    });
    $('[data-photos-prev]').addEventListener('click', function () { stepPhotos(-1); });
    $('[data-photos-next]').addEventListener('click', function () { stepPhotos(1); });
    elPhotos.addEventListener('scroll', syncPhotoNav, { passive: true });
    bindPhotoDrag();
    elSheetScroll.addEventListener('scroll', onSheetScroll, { passive: true });
    bindSheetDrag();

    $$('[data-zoom]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (state.map) state.map.zoomBy(b.dataset.zoom === 'in' ? 1 : -1);
      });
    });

    // Desktop: keep the wheel on the map, the page itself must never scroll.
    elStage.addEventListener('wheel', function (e) {
      if (isMobile()) return;
      var inScroller = e.target.closest('.listview__scroll, .sidebar__scroll, .region__menu');
      if (!inScroller) e.preventDefault();
    }, { passive: false });

    w.addEventListener('scroll', updateStuck, { passive: true });
    // crossing a breakpoint with the sheet open: reset to that mode's shape.
    // Checked on resize as well as the media query events, whichever lands first.
    var wasMode = mode();
    var onMode = function () {
      if (mode() === wasMode) return;
      wasMode = mode();
      flip = null;
      if (fm.open) { fm.open = false; fm.busy = false; elFM.hidden = true; elMF.classList.remove('is-hidden'); d.documentElement.classList.remove('is-locked'); }
      if (state.sheetOpen && state.selected) {
        var s = state.selected;
        closeSidebar();
        clearTimeout(closeTimer);
        elSidebar.hidden = true; elScrim.hidden = true;
        d.body.classList.remove('is-sheet-open', 'is-sidebar-open');
        d.documentElement.classList.remove('is-locked');
        select(s, 'mode');
      }
      if (state.map) { state.map.resize(); fitToFilter(); }
      updateStuck();
    };
    [MQ, MQ_SHEET].forEach(function (q) {
      if (q.addEventListener) q.addEventListener('change', onMode); else q.addListener(onMode);
    });
    if (w.ResizeObserver) new ResizeObserver(measureToolbar).observe(elToolbar);
    w.addEventListener('resize', function () {
      onMode();
      measureToolbar();
      if (state.map) state.map.resize();
      updateStuck();
    });
  }

  /* Point <img data-bf-src="assets/…"> at wherever the scripts are served
     from. Without this the images 404 when the markup is embedded in a
     site whose own URL differs (Webflow). */
  function resolveAssets() {
    $$('[data-bf-src]').forEach(function (img) {
      img.src = BASE + img.getAttribute('data-bf-src');
    });
    $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
  }

  /* ── boot ─────────────────────────────────────────────────── */
  function init() {
    d.documentElement.classList.add('bf-app');
    /* The site smooth-scrolls every page with Lenis (a global `lenis`
       made by the site-wide footer script). The locator doesn't want it:
       it swallows the wheel inside the panels. Switch it off on any page
       that carries the locator — now, and again after the site's own
       load handler has run (it calls lenis.start()). */
    HOST.setAttribute('data-lenis-prevent', '');
    var noLenis = function () {
      try { if (typeof lenis !== 'undefined' && lenis && lenis.destroy) lenis.destroy(); } catch (e) { /* not there */ }
      d.documentElement.classList.remove('lenis', 'lenis-smooth', 'lenis-stopped', 'lenis-scrolling');
    };
    noLenis();
    if (d.readyState !== 'complete') w.addEventListener('load', function () { setTimeout(noLenis, 0); });
    // the loader's placeholder has done its job once the real layout is here
    var ph = d.getElementById('bf-placeholder');
    if (ph) ph.remove();
    syncSiteNav();
    w.addEventListener('resize', syncSiteNav);
    if (w.ResizeObserver) {
      var siteNav = d.querySelector(CFG.navSelector || 'nav.nav, .nav, header');
      if (siteNav && !HOST.contains(siteNav)) new ResizeObserver(syncSiteNav).observe(siteNav);
    }
    resolveAssets();
    buildRegionMenu();
    bind();
    bindFilterModal();
    bindNudges();
    var linked = w.location.hash;   // read before setView rewrites it
    refresh();
    setView(defaultView());
    readHash(linked);

    /* Phones open on the list, where the map isn't on screen: the map
       library (the heaviest thing on the page) waits until the page has
       settled, or until someone taps Map, whichever comes first. */
    if (state.view === 'map') bootMap(); else whenIdle(bootMap);
    // the store sheet's icons were left lazy so they don't compete with
    // first paint; fetch them now so the first sheet opens complete
    whenIdle(function () {
      $$('.sidebar img[loading="lazy"]').forEach(function (img) { img.loading = 'eager'; });
    });
  }

  function whenIdle(fn) {
    var go = function () {
      if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 2000 }); else setTimeout(fn, 200);
    };
    if (d.readyState === 'complete') go(); else w.addEventListener('load', go, { once: true });
  }

  var mapBooted = false;
  function bootMap() {
    if (mapBooted) return;
    mapBooted = true;
    w.BFMap.create(elMap, w.BF_CONFIG)
      .then(function (api) {
        state.map = api;
        STORES.forEach(function (s) {
          // one bad record must never stop the rest of the pins
          try { state.markers.set(s.slug, api.addMarker(s, function (store) { select(store, 'map'); })); }
          catch (e) { if (w.console) console.warn('[BF] no pin for ' + s.slug, e); }
        });
        api.onClick(function () { if (state.sheetOpen && !sheetMode()) closeSidebar(); });

        // mobile pins grow once the map is zoomed in far enough to have room
        var near = function (z) { elStage.toggleAttribute('data-near', z >= 10.5); };
        if (api.onZoom) { api.onZoom(near); near(api.getZoom()); }

        renderMarkers();
        measureToolbar();
        if (sheetMode() && state.view === 'map') { fitToFilter(true); state.fitted = true; }
        // desktop greets with a wiggle; mobile waits for the first idle 3s
        if (!sheetMode() && canWiggle()) setTimeout(wigglePins, 600);

        if (api.driver === 'maplibre') {
          console.info('[BF] Keyless preview basemap in use. Add a Google Maps API ' +
                       'key in js/config.js for the real Google basemap.');
        }
      })
      .catch(function (err) {
        console.error('[BF] map failed to load', err);
        var note = d.createElement('div');
        note.className = 'map-note';
        note.textContent = 'Map could not load (no network?). List view still works.';
        elStage.appendChild(note);
      });
  }

  // handy in the console while tweaking: BF.state.map.map is the raw map instance
  w.BF = { state: state, wiggle: wigglePins, hints: function () { hintsPlayed = false; state.mapTouched = false; playHints(); } };

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init);
  else init();
})(window, document);
