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

  var STORES  = (w.BF_DATA && w.BF_DATA.stores)  || [];
  var REGIONS = (w.BF_DATA && w.BF_DATA.regions) || [];
  var BASE    = (w.BF_CONFIG && w.BF_CONFIG.assetBase) || '';

  // same breakpoint as the CSS; rem in a media query is always 16px
  var MQ = w.matchMedia('(max-width: 47.99rem)');
  var REDUCED = w.matchMedia('(prefers-reduced-motion: reduce)');
  function isMobile() { return MQ.matches; }

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
  var elSidebar    = $('[data-sidebar]');
  var elSheetScroll= $('[data-sidebar-scroll]');
  var elHeroImg    = $('[data-s-img]');
  var elScrim      = $('[data-scrim]');
  var elMapCtrl    = $('[data-map-ctrl]');
  var elHint       = $('[data-map-hint]');
  var elPhotos     = $('[data-s-photos]');
  var rowTpl       = $('[data-store-row-tpl]');

  function remPx() { return parseFloat(getComputedStyle(d.documentElement).fontSize) || 16; }

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
      $('.storerow__name', li).textContent = s.name;
      $('.storerow__addr span', li).textContent = s.address;
      li.dataset.slug = s.slug;
      if (state.selected && state.selected.slug === s.slug) li.classList.add('is-active');

      li.addEventListener('click', function () { select(s, 'list'); });
      li.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(s, 'list'); }
      });
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
      m.el.classList.toggle('is-active', !!state.selected && slug === state.selected.slug);
    });
  }

  /* ── store sheet: content ─────────────────────────────────── */
  function show(el, on) { el.hidden = !on; }

  function fillSidebar(s) {
    var st = w.BFHours.status(s.hours);

    elHeroImg.src = s.image;
    elHeroImg.alt = 'BurgerFuel ' + s.name;
    elHeroImg.style.transform = '';
    $('[data-s-name]').textContent = s.name;

    $('[data-s-status]').classList.toggle('is-closed', !st.open);
    $('[data-s-status-text]').textContent = st.open ? 'Open now' : 'Closed';
    // "Closes at 9pm" → "Closes 9pm", as in the new design
    $('[data-s-next]').textContent = st.next.replace(' at ', ' ');
    $('[data-s-next]').parentNode.hidden = !st.next;

    $('[data-s-view]').href = '/nz/locations/' + s.slug;
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
    elPhotos.innerHTML = '';
    photos.forEach(function (src, i) {
      var img = d.createElement('img');
      img.src = src;
      img.alt = 'BurgerFuel ' + s.name + ' — photo ' + (i + 1);
      img.loading = i < 2 ? 'eager' : 'lazy';
      img.addEventListener('load', syncPhotoNav);   // widths aren't known until then
      elPhotos.appendChild(img);
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

  function openSidebar(s) {
    fillSidebar(s);
    clearTimeout(closeTimer);

    if (!isMobile()) {
      elSidebar.hidden = false;
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
    elSidebar.style.removeProperty('--drag');
    d.documentElement.classList.add('is-locked');
    void elSidebar.offsetHeight;           // commit the off-screen start before sliding
    d.body.classList.add('is-sheet-open', 'is-sidebar-open');
    elSidebar.setAttribute('aria-modal', 'true');
    state.sheetOpen = true;
    // keyboard users land on Close; a tap shouldn't leave a focus ring behind
    if (keyNav) $('[data-sidebar-close]').focus({ preventScroll: true });
  }

  function closeSidebar() {
    state.selected = null;
    writeHash(null);
    state.sheetOpen = false;
    syncListSelection();
    syncMarkerSelection();

    if (!isMobile() || elSidebar.hidden) {
      elSidebar.hidden = true;
      elScrim.hidden = true;
      d.body.classList.remove('is-sidebar-open', 'is-sheet-open');
      d.documentElement.classList.remove('is-locked');
      if (state.map) state.map.resize();
      return;
    }

    d.body.classList.remove('is-sheet-open');
    elSidebar.setAttribute('aria-modal', 'false');
    // 400ms ease-in-quad, set in CSS — wait it out, then take it off the page
    closeTimer = setTimeout(function () {
      elSidebar.hidden = true;
      elScrim.hidden = true;
      elSidebar.style.removeProperty('--drag');
      d.body.classList.remove('is-sidebar-open');
      d.documentElement.classList.remove('is-locked');
    }, REDUCED.matches ? 20 : 420);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  /* hero parallax: the photo drifts at a third of the scroll speed, and
     stretches when iOS rubber-bands past the top */
  var parallaxRaf = 0;
  function onSheetScroll() {
    if (parallaxRaf) return;
    parallaxRaf = w.requestAnimationFrame(function () {
      parallaxRaf = 0;
      if (!isMobile() || REDUCED.matches) { elHeroImg.style.transform = ''; return; }
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
      if (!isMobile() || !state.sheetOpen || e.touches.length !== 1) return;
      if (elSheetScroll.scrollTop > 0) return;
      startY = lastY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      lastT = e.timeStamp; v = 0;
      dragging = false; decided = false;
    }, { passive: true });

    elSidebar.addEventListener('touchmove', function (e) {
      if (!isMobile() || !state.sheetOpen || !startY) return;
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

  /* ── deep links ───────────────────────────────────────────────
     #ponsonby opens that store's sheet, #list opens the list; both can
     combine (#list&ponsonby). The hash follows the open store so a sheet
     can be shared. replaceState, so Back still leaves the page. */
  function readHash(hash) {
    var parts = decodeURIComponent(hash.slice(1)).split('&');
    if (parts.indexOf('list') > -1) setView('list');
    var s = STORES.find(function (x) { return parts.indexOf(x.slug) > -1; });
    if (s) select(s, 'link');
  }
  function writeHash(slug) {
    if (!w.history.replaceState) return;
    var parts = [];
    if (state.view === 'list') parts.push('list');
    if (slug) parts.push(slug);
    w.history.replaceState(null, '', w.location.pathname + w.location.search + (parts.length ? '#' + parts.join('&') : ''));
  }

  /* ── selection ────────────────────────────────────────────── */
  function select(store, source) {
    state.selected = store;
    writeHash(store.slug);
    openSidebar(store);
    syncListSelection();
    syncMarkerSelection();
    if (state.view === 'map' && source !== 'map' && state.map) {
      state.map.panTo(store.lat, store.lng, 13);
    }
  }

  /* ── view switching ───────────────────────────────────────── */
  function setView(view) {
    var stuck = d.body.classList.contains('is-stuck');
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
      fitToFilter();
    }
    // Mobile: if the switch was already stuck, land the new view's top
    // directly under it instead of wherever the old scroll happened to be.
    if (isMobile() && stuck) {
      var target = view === 'map' ? elMap : elListView;
      var bandBottom = elSegwrap.getBoundingClientRect().bottom;
      var gap = view === 'map' ? 0 : remPx();
      w.scrollTo(0, w.scrollY + target.getBoundingClientRect().top - bandBottom - gap);
    }
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
        state.map.fitBounds(STORES, { top: u * 3, right: u * 2, bottom: u * 3, left: u * 2 }, instant);
      } else {
        state.map.panTo(w.BF_CONFIG.center.lat, w.BF_CONFIG.center.lng, 0);
      }
      return;
    }
    // padding derived from the live root scale so it tracks the fluid layout
    state.map.fitBounds(stores, isMobile()
      ? { top: u * 5, right: u * 3, bottom: u * 3, left: u * 3 }
      : { top: u * 9, right: elSidebar.hidden ? u * 5 : u * 43, bottom: u * 6, left: u * 5 });
  }

  /* ── sticky switch shadow (mobile) ────────────────────────── */
  function updateStuck() {
    if (!isMobile()) { d.body.classList.remove('is-stuck'); return; }
    var navH = remPx() * 4.375;
    // stuck = the band sits pinned under the nav while the page has moved on
    var stuck = elSegwrap.getBoundingClientRect().top <= navH + 0.5 && w.scrollY > 0;
    d.body.classList.toggle('is-stuck', stuck);
  }

  /* ── map nudges (mobile) ──────────────────────────────────────
     1. A small toast, once, the first time the map comes into view —
        "Pinch to zoom", then "Tap a store". Gone the moment the map is
        touched.
     2. After 5s with no input at all, the pins on screen give a quick
        staggered wiggle, then again every 5s while the visitor stays
        idle. Any touch, scroll or key puts it back on a 5s cooldown. */
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
    if (hintsPlayed || state.mapTouched || !isMobile() || state.view !== 'map' || state.sheetOpen) return;
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

  var IDLE_MS = 5000;
  var idleTimer = 0;
  function armIdle() { clearTimeout(idleTimer); idleTimer = setTimeout(idleTick, IDLE_MS); }
  function idleTick() {
    if (canWiggle()) wigglePins();
    armIdle();
  }
  function canWiggle() {
    return isMobile() && !REDUCED.matches && !d.hidden && state.map &&
           state.view === 'map' && !state.sheetOpen && mapInView >= 0.35;
  }
  function wigglePins() {
    var box = elMap.getBoundingClientRect();
    var top = Math.max(box.top, remPx() * 9);       // below the nav + sticky band
    var pins = [];
    state.markers.forEach(function (m) {
      if (m.el.style.display === 'none') return;
      var r = m.el.getBoundingClientRect();
      if (r.right > box.left && r.left < box.right && r.bottom > top && r.top < box.bottom) {
        pins.push({ el: m.el, x: r.left });
      }
    });
    pins.sort(function (a, b) { return a.x - b.x; });
    pins.slice(0, 24).forEach(function (p, i) {
      setTimeout(function () {
        p.el.classList.remove('is-wiggle');
        void p.el.offsetWidth;
        p.el.classList.add('is-wiggle');
      }, i * 70);
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

  /* ── region dropdown ──────────────────────────────────────── */
  function buildRegionMenu() {
    var opts = [{ value: null, label: 'All Regions' }].concat(
      REGIONS.map(function (r) { return { value: r, label: r }; })
    );

    elRegionMenu.innerHTML = '';
    opts.forEach(function (o) {
      var li = d.createElement('li');
      var b = d.createElement('button');
      b.type = 'button';
      b.className = 'region__opt';
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(state.region === o.value));
      b.textContent = o.label;
      b.addEventListener('click', function () { setRegion(o.value); });
      li.appendChild(b);
      elRegionMenu.appendChild(li);
    });
  }

  function setRegion(value) {
    state.region = value;
    elRegionLbl.textContent = value ? value + ', NZ' : 'Select a Region';
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
    elRegion.dataset.open = '';
    elRegionMenu.hidden = false;
    elRegionBtn.setAttribute('aria-expanded', 'true');
  }
  function closeRegion() {
    delete elRegion.dataset.open;
    elRegionMenu.hidden = true;
    elRegionBtn.setAttribute('aria-expanded', 'false');
  }

  /* ── refresh ──────────────────────────────────────────────── */
  function refresh() {
    elSearchClr.hidden = state.query.trim() === '';
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

    var searchTimer;
    elSearch.addEventListener('input', function () {
      // show Clear as soon as they type, don't wait out the debounce
      elSearchClr.hidden = elSearch.value.trim() === '';
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { setQuery(elSearch.value); }, 160);
    });
    elSearchForm.addEventListener('submit', function (e) {
      e.preventDefault();
      clearTimeout(searchTimer);
      setQuery(elSearch.value, { fit: true });
      if (isMobile()) elSearch.blur();     // drop the keyboard so results show
    });

    // Esc inside the field clears it too
    elSearch.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && elSearch.value) {
        e.stopPropagation();
        clearTimeout(searchTimer);
        setQuery('', { fit: true, focus: true });
      }
    });

    elSearchClr.addEventListener('click', function () {
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

    elRegionBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if ('open' in elRegion.dataset) closeRegion(); else openRegion();
    });
    d.addEventListener('click', function (e) {
      if (!elRegion.contains(e.target)) closeRegion();
    });
    d.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
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
    // crossing the breakpoint with the sheet open: reset to that mode's shape.
    // Checked on resize as well as the media query event, whichever lands first.
    var wasMobile = isMobile();
    var onMode = function () {
      if (isMobile() === wasMobile) return;
      wasMobile = isMobile();
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
    if (MQ.addEventListener) MQ.addEventListener('change', onMode); else MQ.addListener(onMode);
    w.addEventListener('resize', function () {
      onMode();
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
    resolveAssets();
    buildRegionMenu();
    bind();
    bindNudges();
    var linked = w.location.hash;   // read before setView rewrites it
    refresh();
    setView('map');
    readHash(linked);

    w.BFMap.create(elMap, w.BF_CONFIG)
      .then(function (api) {
        state.map = api;
        STORES.forEach(function (s) {
          state.markers.set(s.slug, api.addMarker(s, function (store) { select(store, 'map'); }));
        });
        api.onClick(function () { if (state.sheetOpen && !isMobile()) closeSidebar(); });

        // mobile pins grow once the map is zoomed in far enough to have room
        var near = function (z) { elStage.toggleAttribute('data-near', z >= 10.5); };
        if (api.onZoom) { api.onZoom(near); near(api.getZoom()); }

        renderMarkers();
        if (isMobile()) fitToFilter(true);

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
