/* ------------------------------------------------------------------
   BurgerFuel Store Locations — app controller
   View switching, search, region filter, sort switch, sidebar.
   ------------------------------------------------------------------ */
(function (w, d) {
  'use strict';

  var $  = function (s, r) { return (r || d).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };

  var STORES  = (w.BF_DATA && w.BF_DATA.stores)  || [];
  var REGIONS = (w.BF_DATA && w.BF_DATA.regions) || [];

  var state = {
    view: 'map',
    region: null,          // null = all of New Zealand
    query: '',
    sortDesc: false,       // false = A–Z, true = Z–A
    selected: null,
    map: null,
    markers: new Map()
  };

  /* ── elements ─────────────────────────────────────────────── */
  var elStage      = $('.stage');
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
  var elSidebar    = $('[data-sidebar]');
  var elMapCtrl    = $('[data-map-ctrl]');
  var rowTpl       = $('[data-store-row-tpl]');

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

  /* ── sidebar ──────────────────────────────────────────────── */
  function fillSidebar(s) {
    var st = w.BFHours.status(s.hours);

    $('[data-s-img]').src = s.image;
    $('[data-s-img]').alt = 'BurgerFuel ' + s.name;
    $('[data-s-name]').textContent = s.name;

    var status = $('[data-s-status]');
    status.classList.toggle('is-closed', !st.open);
    $('[data-s-status-text]').textContent = st.open ? 'Open now' : 'Closed';
    $('[data-s-next]').textContent = st.next;

    $('[data-s-view]').href = '/nz/locations/' + s.slug;
    $('[data-s-desc]').textContent = s.description || '';
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

    $('[data-sidebar-scroll]').scrollTop = 0;
  }

  function openSidebar(s) {
    fillSidebar(s);
    elSidebar.hidden = false;
    d.body.classList.add('is-sidebar-open');
    if (state.map) state.map.resize();
  }

  function closeSidebar() {
    elSidebar.hidden = true;
    d.body.classList.remove('is-sidebar-open');
    state.selected = null;
    syncListSelection();
    syncMarkerSelection();
    if (state.map) state.map.resize();
  }

  /* ── selection ────────────────────────────────────────────── */
  function select(store, source) {
    state.selected = store;
    openSidebar(store);
    syncListSelection();
    syncMarkerSelection();
    if (state.view === 'map' && source !== 'map' && state.map) {
      state.map.panTo(store.lat, store.lng, 13);
    }
  }

  /* ── view switching ───────────────────────────────────────── */
  function setView(view) {
    state.view = view;
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
  }

  function fitToFilter() {
    if (!state.map) return;
    var stores = visibleStores();
    if (!stores.length) return;
    if (!state.region && !state.query) {
      state.map.panTo(w.BF_CONFIG.center.lat, w.BF_CONFIG.center.lng, 0);
      return;
    }
    // padding derived from the live root scale so it tracks the fluid layout
    var u = parseFloat(getComputedStyle(d.documentElement).fontSize) || 16;
    state.map.fitBounds(stores, {
      top: u * 9,
      right: elSidebar.hidden ? u * 5 : u * 43,
      bottom: u * 6,
      left: u * 5
    });
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
      else if (!elSidebar.hidden) closeSidebar();
    });

    $('[data-sidebar-close]').addEventListener('click', closeSidebar);

    $$('[data-zoom]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (state.map) state.map.zoomBy(b.dataset.zoom === 'in' ? 1 : -1);
      });
    });

    // Keep the wheel on the map: the page itself must never scroll.
    elStage.addEventListener('wheel', function (e) {
      var inScroller = e.target.closest('.listview__scroll, .sidebar__scroll, .region__menu');
      if (!inScroller) e.preventDefault();
    }, { passive: false });

    w.addEventListener('resize', function () { if (state.map) state.map.resize(); });
  }

  /* ── boot ─────────────────────────────────────────────────── */
  function init() {
    buildRegionMenu();
    bind();
    refresh();
    setView('map');

    w.BFMap.create($('#map'), w.BF_CONFIG)
      .then(function (api) {
        state.map = api;
        STORES.forEach(function (s) {
          state.markers.set(s.slug, api.addMarker(s, function (store) { select(store, 'map'); }));
        });
        api.onClick(function () { if (!elSidebar.hidden) closeSidebar(); });
        renderMarkers();

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
  w.BF = { state: state };

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init);
  else init();
})(window, document);
