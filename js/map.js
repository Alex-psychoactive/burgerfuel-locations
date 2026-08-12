/* ------------------------------------------------------------------
   Map layer.

   One small interface, two drivers:
     • Google Maps JS API  — used when config.googleMapsApiKey is set.
     • MapLibre GL + CARTO — keyless fallback so the page always renders.

   Both are given the same medium-contrast greyscale skin, both put the
   same `.bf-pin` DOM element on the map, and both zoom on the wheel
   rather than letting the page scroll.

     BFMap.create(el, opts) → Promise<{
       addMarker, setActive, panTo, fitBounds, zoomBy, driver
     }>
   ------------------------------------------------------------------ */
(function (w) {
  'use strict';

  var PIN = 'assets/map-pin.png';

  /* ── Greyscale skin, Google styles[] format ────────────────────── */
  var GOOGLE_STYLE = [
    { elementType: 'geometry',            stylers: [{ color: '#f2f2f4' }] },
    { elementType: 'labels.icon',         stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill',    stylers: [{ color: '#5e5e63' }] },
    { elementType: 'labels.text.stroke',  stylers: [{ color: '#ffffff' }, { weight: 3 }] },
    { featureType: 'administrative',              elementType: 'geometry.stroke', stylers: [{ color: '#cfcfd4' }] },
    { featureType: 'administrative.land_parcel',  stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative.locality',     elementType: 'labels.text.fill', stylers: [{ color: '#2c2e35' }] },
    { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill', stylers: [{ color: '#6b6b70' }] },
    { featureType: 'landscape.man_made',  elementType: 'geometry', stylers: [{ color: '#ededf0' }] },
    { featureType: 'poi',                 elementType: 'geometry', stylers: [{ color: '#e7e7eb' }] },
    { featureType: 'poi',                 elementType: 'labels',   stylers: [{ visibility: 'off' }] },
    { featureType: 'poi.park',            elementType: 'geometry', stylers: [{ color: '#e1e5e1' }] },
    { featureType: 'road',                elementType: 'geometry',        stylers: [{ color: '#ffffff' }] },
    { featureType: 'road',                elementType: 'geometry.stroke', stylers: [{ color: '#dcdce0' }] },
    { featureType: 'road.arterial',       elementType: 'geometry',        stylers: [{ color: '#fbfbfc' }] },
    { featureType: 'road.highway',        elementType: 'geometry',        stylers: [{ color: '#e4e4e9' }] },
    { featureType: 'road.highway',        elementType: 'geometry.stroke', stylers: [{ color: '#cdcdd3' }] },
    { featureType: 'road.local',          elementType: 'labels',          stylers: [{ visibility: 'off' }] },
    { featureType: 'transit',             stylers: [{ visibility: 'off' }] },
    { featureType: 'water',               elementType: 'geometry',           stylers: [{ color: '#6f7176' }] },
    { featureType: 'water',               elementType: 'labels.text.fill',   stylers: [{ color: '#ffffff' }] },
    { featureType: 'water',               elementType: 'labels.text.stroke', stylers: [{ visibility: 'off' }] }
  ];

  /* Same palette, applied to CARTO vector layers in the fallback */
  var SKIN = {
    land:'#f2f2f4', water:'#6f7176', park:'#e1e5e1', poi:'#e7e7eb',
    road:'#ffffff', roadCasing:'#dcdce0', motorway:'#e4e4e9',
    label:'#5e5e63', labelHalo:'#ffffff', waterLabel:'#ffffff', boundary:'#cfcfd4'
  };

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.async = true; s.onload = res;
      s.onerror = function () { rej(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadCss(href) {
    var l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href;
    document.head.appendChild(l);
  }

  function makePin() {
    var el = document.createElement('div');
    el.className = 'bf-pin';
    var img = document.createElement('img');
    img.src = PIN; img.alt = ''; img.setAttribute('aria-hidden', 'true');
    el.appendChild(img);
    return el;
  }

  /* ════════════════════════ GOOGLE DRIVER ════════════════════════ */
  function createGoogle(el, opts) {
    var key = opts.googleMapsApiKey;
    return loadScript('https://maps.googleapis.com/maps/api/js?v=weekly&key=' + encodeURIComponent(key))
      .then(function () {
        if (!w.google || !w.google.maps) throw new Error('Google Maps did not initialise');

        var map = new google.maps.Map(el, {
          center: opts.center,
          zoom: opts.zoom,
          minZoom: opts.minZoom,
          maxZoom: opts.maxZoom,
          styles: GOOGLE_STYLE,
          // wheel zooms straight away — never hands the gesture to the page
          gestureHandling: 'greedy',
          scrollwheel: true,
          disableDefaultUI: true,
          clickableIcons: false,
          keyboardShortcuts: false
        });

        /* OverlayView keeps the marker as real DOM, so the same
           .bf-pin CSS (hover, active scale, drop shadow) applies. */
        function PinOverlay(pos, node) {
          this.pos = pos; this.node = node;
        }
        PinOverlay.prototype = new google.maps.OverlayView();
        PinOverlay.prototype.onAdd = function () {
          this.node.style.position = 'absolute';
          this.getPanes().floatPane.appendChild(this.node);
        };
        PinOverlay.prototype.draw = function () {
          var p = this.getProjection().fromLatLngToDivPixel(this.pos);
          if (!p) return;
          this.node.style.left = p.x + 'px';
          this.node.style.top = p.y + 'px';
          this.node.style.transformOrigin = '50% 100%';
          this.node.style.marginLeft = (-this.node.offsetWidth / 2) + 'px';
          this.node.style.marginTop = (-this.node.offsetHeight) + 'px';
        };
        PinOverlay.prototype.onRemove = function () {
          if (this.node.parentNode) this.node.parentNode.removeChild(this.node);
        };

        return {
          driver: 'google',
          map: map,
          addMarker: function (store, onClick) {
            var node = makePin();
            node.addEventListener('click', function (e) { e.stopPropagation(); onClick(store); });
            var ov = new PinOverlay(new google.maps.LatLng(store.lat, store.lng), node);
            ov.setMap(map);
            return { el: node, overlay: ov, store: store };
          },
          panTo: function (lat, lng, zoom) {
            map.panTo({ lat: lat, lng: lng });
            if (zoom && map.getZoom() < zoom) map.setZoom(zoom);
          },
          fitBounds: function (list, pad) {
            if (!list.length) return;
            var b = new google.maps.LatLngBounds();
            list.forEach(function (s) { b.extend({ lat: s.lat, lng: s.lng }); });
            if (list.length === 1) { map.setCenter(b.getCenter()); map.setZoom(13); return; }
            map.fitBounds(b, pad);
          },
          zoomBy: function (d) { map.setZoom(map.getZoom() + d); },
          resize: function () { google.maps.event.trigger(map, 'resize'); },
          onClick: function (cb) { map.addListener('click', cb); }
        };
      });
  }

  /* ═══════════════════════ MAPLIBRE DRIVER ═══════════════════════ */
  function createMapLibre(el, opts) {
    loadCss('https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css');
    return loadScript('https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js')
      .then(function () {
        var map = new maplibregl.Map({
          container: el,
          style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
          center: [opts.center.lng, opts.center.lat],
          zoom: opts.zoom,
          minZoom: opts.minZoom,
          maxZoom: opts.maxZoom,
          attributionControl: { compact: true }
        });
        map.scrollZoom.enable();                 // wheel = zoom, never page scroll
        map.dragRotate.disable();
        map.touchZoomRotate.disableRotation();

        return new Promise(function (res) {
          /* 'style.load' — not 'load' — because 'load' also waits on the
             first rendered frame, which never arrives in a backgrounded
             tab. The style is all we need to recolour and place pins. */
          map.once('style.load', function () {
            recolour(map);
            res({
              driver: 'maplibre',
              map: map,
              addMarker: function (store, onClick) {
                var node = makePin();
                node.addEventListener('click', function (e) { e.stopPropagation(); onClick(store); });
                var mk = new maplibregl.Marker({ element: node, anchor: 'bottom' })
                  .setLngLat([store.lng, store.lat]).addTo(map);
                return { el: node, marker: mk, store: store };
              },
              panTo: function (lat, lng, zoom) {
                map.easeTo({
                  center: [lng, lat],
                  zoom: (zoom && map.getZoom() < zoom) ? zoom : map.getZoom(),
                  duration: 700
                });
              },
              fitBounds: function (list, pad) {
                if (!list.length) return;
                if (list.length === 1) {
                  map.easeTo({ center: [list[0].lng, list[0].lat], zoom: 13, duration: 700 });
                  return;
                }
                var b = new maplibregl.LngLatBounds();
                list.forEach(function (s) { b.extend([s.lng, s.lat]); });
                map.fitBounds(b, { padding: pad, duration: 700, maxZoom: 14 });
              },
              zoomBy: function (d) { map.zoomTo(map.getZoom() + d, { duration: 250 }); },
              resize: function () { map.resize(); },
              onClick: function (cb) { map.on('click', cb); }
            });
          });
        });
      });
  }

  /* Repaint CARTO Positron into the same greyscale skin as the Google style */
  function recolour(map) {
    var layers = map.getStyle().layers || [];
    function set(id, prop, val) {
      try { map.setPaintProperty(id, prop, val); } catch (e) { /* layer lacks prop */ }
    }
    layers.forEach(function (l) {
      var id = l.id, type = l.type;
      if (type === 'background') { set(id, 'background-color', SKIN.land); return; }

      if (type === 'fill') {
        if (/water|ocean|sea|river|bay/i.test(id))      set(id, 'fill-color', SKIN.water);
        else if (/park|green|wood|forest|grass|pitch/i.test(id)) set(id, 'fill-color', SKIN.park);
        else if (/building/i.test(id))                  { set(id, 'fill-color', '#e2e2e6'); set(id, 'fill-opacity', 0.9); }
        else if (/landuse|landcover|sand|beach/i.test(id)) set(id, 'fill-color', SKIN.poi);
        else                                            set(id, 'fill-color', SKIN.land);
        return;
      }

      if (type === 'line') {
        if (/water|river|stream|canal/i.test(id))       set(id, 'line-color', SKIN.water);
        else if (/boundary|admin/i.test(id))            set(id, 'line-color', SKIN.boundary);
        else if (/motorway|trunk|highway/i.test(id))    set(id, 'line-color', /case|casing|outline/i.test(id) ? SKIN.roadCasing : SKIN.motorway);
        else if (/case|casing|outline/i.test(id))       set(id, 'line-color', SKIN.roadCasing);
        else                                            set(id, 'line-color', SKIN.road);
        return;
      }

      if (type === 'symbol') {
        if (/water|ocean|sea|marine/i.test(id)) {
          set(id, 'text-color', SKIN.waterLabel);
          set(id, 'text-halo-color', 'rgba(0,0,0,0)');
        } else {
          set(id, 'text-color', /place|city|town|country|state/i.test(id) ? '#2c2e35' : SKIN.label);
          set(id, 'text-halo-color', SKIN.labelHalo);
          set(id, 'text-halo-width', 1.6);
        }
        if (/poi|shop|amenity/i.test(id)) {
          try { map.setLayoutProperty(id, 'visibility', 'none'); } catch (e) {}
        }
      }
    });
  }

  /* ════════════════════════ PUBLIC ════════════════════════ */
  w.BFMap = {
    create: function (el, opts) {
      if (opts.googleMapsApiKey) {
        return createGoogle(el, opts).catch(function (err) {
          console.warn('[BFMap] Google Maps unavailable, falling back.', err);
          el.innerHTML = '';
          return createMapLibre(el, opts);
        });
      }
      return createMapLibre(el, opts);
    }
  };
})(window);
