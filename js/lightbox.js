/* ------------------------------------------------------------------
   Photo lightbox.

   Grows out of the tapped thumbnail (a FLIP: the full image starts
   scaled and clipped to exactly the thumbnail's box, then relaxes to
   its real size), and shrinks back into whichever thumbnail matches
   the photo you close on.

   Gestures: pinch to zoom (1–4×), drag to pan when zoomed, double-tap
   to zoom in / out, swipe sideways to change photo, swipe down to close.
   Desktop: arrow keys, Esc, and trackpad pinch (ctrl + wheel).

     BFLightbox.open({
       photos:  [src, …],
       index:   0,
       alt:     'BurgerFuel Albany',
       thumb:   function (i) → <img> in the page for photo i (or null),
       onIndex: function (i)     — keep the page's strip in step
     })
   ------------------------------------------------------------------ */
(function (w, d) {
  'use strict';

  var OPEN_MS = 450, CLOSE_MS = 250;   // closing gets out of the way fast
  var EASE_OUT_QUINT = 'cubic-bezier(.22,1,.36,1)';
  var EASE_IN_CUBIC  = 'cubic-bezier(.32,0,.67,0)';
  var MAX_ZOOM = 4;

  var root, stage, track, dots, btnPrev, btnNext;
  var opts = null, index = 0, slides = [];
  var busy = false;
  var reduced = w.matchMedia('(prefers-reduced-motion: reduce)');

  // zoom state for the current slide
  var z = { s: 1, x: 0, y: 0 };

  function $(s) { return root.querySelector(s); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function ms(n) { return reduced.matches ? 1 : n; }

  function init() {
    root = d.querySelector('[data-lightbox]');
    if (!root) return false;
    stage = $('[data-lb-stage]');
    track = $('[data-lb-track]');
    dots = $('[data-lb-dots]');
    btnPrev = $('[data-lb-prev]');
    btnNext = $('[data-lb-next]');

    $('[data-lb-close]').addEventListener('click', close);
    btnPrev.addEventListener('click', function () { go(index - 1); });
    btnNext.addEventListener('click', function () { go(index + 1); });
    d.addEventListener('keydown', function (e) {
      if (root.hidden) return;
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      else if (e.key === 'ArrowLeft') go(index - 1);
      else if (e.key === 'ArrowRight') go(index + 1);
    }, true);
    w.addEventListener('resize', function () { if (!root.hidden) layout(); });
    bindGestures();
    return true;
  }

  /* ── building ─────────────────────────────────────────────── */
  function build() {
    track.innerHTML = '';
    dots.innerHTML = '';
    slides = opts.photos.map(function (src, i) {
      var slide = d.createElement('div');
      slide.className = 'lightbox__slide';
      var img = d.createElement('img');
      img.src = src;
      img.alt = (opts.alt || 'Photo') + ' — ' + (i + 1) + ' of ' + opts.photos.length;
      img.draggable = false;
      img.addEventListener('load', function () { fit(img); });
      slide.appendChild(img);
      track.appendChild(slide);

      var dot = d.createElement('span');
      dot.className = 'lightbox__dot';
      dots.appendChild(dot);
      return img;
    });
    dots.hidden = slides.length < 2;
    root.classList.toggle('is-single', slides.length < 2);
  }

  /* size each image to "contain" inside its slide, so its box is exactly
     the painted pixels — that's what the FLIP measures against */
  function fit(img) {
    // the slide's own width (narrower on desktop, where neighbours peek in);
    // slides can't be stretched by their photo (min-width:0 in the CSS)
    var cs = getComputedStyle(img.parentNode);
    var bw = img.parentNode.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var bh = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    var r = (img.naturalWidth || 3) / (img.naturalHeight || 2);
    var wdt = Math.min(bw, bh * r);
    img.style.width = wdt + 'px';
    img.style.height = (wdt / r) + 'px';
  }

  function layout() {
    slides.forEach(fit);
    setTrack(false);
    applyZoom(false);
  }

  function setTrack(animate, dx) {
    track.style.transition = animate ? 'transform .42s ' + EASE_OUT_QUINT : 'none';
    // lead − index × (slide + gap), in % of the track; all three come from CSS
    track.style.transform = 'translate3d(calc(var(--lead) + (var(--slide) + var(--gap)) * ' + (-index) + ' + ' + (dx || 0) + 'px),0,0)';
  }

  function syncUi() {
    Array.prototype.forEach.call(dots.children, function (dot, i) {
      dot.classList.toggle('is-active', i === index);
    });
    slides.forEach(function (img, i) { img.parentNode.classList.toggle('is-current', i === index); });
    dots.setAttribute('aria-label', 'Photo ' + (index + 1) + ' of ' + slides.length);
    btnPrev.disabled = index === 0;
    btnNext.disabled = index === slides.length - 1;
  }

  function go(i) {
    if (busy || !slides.length) return;
    i = clamp(i, 0, slides.length - 1);
    if (i === index) { setTrack(true); return; }
    resetZoom(true);
    index = i;
    setTrack(true);
    syncUi();
    if (opts.onIndex) opts.onIndex(index);
  }

  /* ── FLIP geometry ────────────────────────────────────────── */
  /* The transform + clip that makes the full image sit exactly over the
     thumbnail's (object-fit:cover) box. */
  function fromThumb(img, thumb) {
    var T = img.getBoundingClientRect();
    var R = thumb.getBoundingClientRect();
    if (!T.width || !R.width) return null;
    var s = Math.max(R.width / T.width, R.height / T.height);
    var ix = Math.max(0, (T.width - R.width / s) / 2);
    var iy = Math.max(0, (T.height - R.height / s) / 2);
    var dx = (R.left + R.width / 2) - (T.left + T.width / 2);
    var dy = (R.top + R.height / 2) - (T.top + T.height / 2);
    return {
      transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + s + ')',
      clipPath: 'inset(' + iy + 'px ' + ix + 'px)'
    };
  }
  // finish handler with a timeout backstop (see app.js whenDone)
  function whenDone(anim, dur, fn) {
    var ran = false;
    var go = function () { if (!ran) { ran = true; fn(); } };
    anim.onfinish = anim.oncancel = go;
    setTimeout(go, dur + 150);
  }
  function inView(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < w.innerHeight && r.right > 0 && r.left < w.innerWidth;
  }

  /* ── open / close ─────────────────────────────────────────── */
  function fadeChrome(from, to, dur, easing) {
    ['[data-lb-bg]', '.lightbox__ui', '[data-lb-close]'].forEach(function (sel) {
      var el = $(sel);
      el.getAnimations().forEach(function (an) { an.cancel(); });
      el.animate([{ opacity: from }, { opacity: to }], { duration: dur, easing: easing, fill: 'forwards' })
        .onfinish = function () { if (to === 1) this.cancel(); };
    });
  }

  var returnFocus = null;
  function open(o) {
    if (!root && !init()) return;
    if (busy) return;
    opts = o;
    returnFocus = o.keyboard ? d.activeElement : null;   // back to the photo that opened it
    index = clamp(o.index || 0, 0, o.photos.length - 1);
    build();
    resetZoom(false);
    root.hidden = false;
    d.documentElement.classList.add('is-lb-open');
    setTrack(false);
    syncUi();

    var img = slides[index];
    var thumb = o.thumb && o.thumb(index);
    var go = function () {
      fit(img);
      var from = inView(thumb) && fromThumb(img, thumb);
      busy = true;
      fadeChrome(0, 1, ms(OPEN_MS * 0.8), 'ease-out');
      $('.lightbox__ui').animate(
        [{ opacity: 0, transform: 'translateY(1rem)' }, { opacity: 1, transform: 'none' }],
        { duration: ms(OPEN_MS), delay: ms(120), easing: EASE_OUT_QUINT, fill: 'backwards' });
      var a;
      if (from) {
        a = img.animate([from, { transform: 'none', clipPath: 'inset(0px 0px)' }],
                        { duration: ms(OPEN_MS), easing: EASE_OUT_QUINT });
      } else {
        a = img.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }],
                        { duration: ms(OPEN_MS), easing: EASE_OUT_QUINT });
      }
      whenDone(a, ms(OPEN_MS), function () { busy = false; });
      if (o.keyboard) $('[data-lb-close]').focus({ preventScroll: true });
    };
    // the image needs its natural size before we can measure where it lands
    if (img.complete && img.naturalWidth) go();
    else { img.addEventListener('load', go, { once: true }); img.addEventListener('error', go, { once: true }); }
  }

  function close() {
    if (!root || root.hidden || busy) return;
    busy = true;
    var img = slides[index];
    var thumb = opts.thumb && opts.thumb(index);
    var finish = function () {
      busy = false;
      root.hidden = true;
      ['[data-lb-bg]', '.lightbox__ui', '[data-lb-close]'].forEach(function (sel) {
        $(sel).getAnimations().forEach(function (an) { an.cancel(); });
      });
      d.documentElement.classList.remove('is-lb-open');
      track.innerHTML = '';
      slides = [];
      if (returnFocus && returnFocus.focus) returnFocus.focus({ preventScroll: true });
      returnFocus = null;
    };
    resetZoom(false);
    var to = inView(thumb) && fromThumb(img, thumb);
    // the backdrop and buttons fade; the travelling photo stays solid
    fadeChrome(1, 0, ms(CLOSE_MS), EASE_IN_CUBIC);
    track.querySelectorAll('img').forEach(function (other) {
      if (other !== img) other.style.visibility = 'hidden';
    });
    var a;
    if (to) {
      a = img.animate([{ transform: 'none', clipPath: 'inset(0px 0px)' }, to],
                      { duration: ms(CLOSE_MS), easing: EASE_IN_CUBIC, fill: 'forwards' });
      whenDone(a, ms(CLOSE_MS), finish);
    } else {
      a = img.animate([{ transform: 'none' }, { transform: 'scale(.94)' }],
                      { duration: ms(CLOSE_MS), easing: EASE_IN_CUBIC, fill: 'forwards' });
      whenDone(a, ms(CLOSE_MS), finish);
    }
  }

  /* ── zoom / pan / swipe ───────────────────────────────────── */
  function cur() { return slides[index]; }

  function bounds() {
    var img = cur();
    var sw = stage.clientWidth, sh = stage.clientHeight;
    return {
      x: Math.max(0, (img.offsetWidth * z.s - sw) / 2),
      y: Math.max(0, (img.offsetHeight * z.s - sh) / 2)
    };
  }
  function applyZoom(animate) {
    var img = cur();
    if (!img) return;
    img.style.transition = animate ? 'transform .3s ' + EASE_OUT_QUINT : 'none';
    img.style.transform = z.s === 1 && !z.x && !z.y ? '' :
      'translate3d(' + z.x + 'px,' + z.y + 'px,0) scale(' + z.s + ')';
    root.classList.toggle('is-zoomed', z.s > 1.01);
  }
  function resetZoom(animate) { z.s = 1; z.x = 0; z.y = 0; applyZoom(animate); }

  // zoom to scale s keeping the screen point (px,py) fixed under the finger
  function zoomAt(s, px, py, animate) {
    var img = cur();
    var r = img.getBoundingClientRect();
    var cx = r.left + r.width / 2 - z.x, cy = r.top + r.height / 2 - z.y;  // untransformed centre
    s = clamp(s, 1, MAX_ZOOM);
    var qx = (px - cx - z.x) / z.s, qy = (py - cy - z.y) / z.s;
    z.x = px - cx - s * qx;
    z.y = py - cy - s * qy;
    z.s = s;
    if (s === 1) { z.x = 0; z.y = 0; }
    var b = bounds();
    z.x = clamp(z.x, -b.x, b.x);
    z.y = clamp(z.y, -b.y, b.y);
    applyZoom(animate);
  }

  function bindGestures() {
    var pts = new Map();
    var start = null;       // snapshot at the start of a gesture
    var lastTap = { t: 0, x: 0, y: 0 };
    var swipe = null;

    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    function mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
    function snapshot() {
      var p = Array.from(pts.values());
      start = { s: z.s, x: z.x, y: z.y, p: p.map(function (q) { return { x: q.x, y: q.y }; }), t: Date.now(), target: start && start.target };
      if (p.length === 2) { start.d = dist(p[0], p[1]); start.m = mid(p[0], p[1]); }
    }

    stage.addEventListener('pointerdown', function (e) {
      if (busy) return;
      var downOn = e.target;               // before capture retargets everything to the stage
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      snapshot();
      if (pts.size === 1) start.target = downOn;
      if (e.pointerType === 'mouse') root.classList.add('is-grabbing');
      swipe = null;
    });

    stage.addEventListener('pointermove', function (e) {
      if (!pts.has(e.pointerId) || busy) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      var p = Array.from(pts.values());

      if (p.length === 2 && start.d) {
        // pinch — anchored on the midpoint where the fingers started
        var m = mid(p[0], p[1]);
        var s = clamp(start.s * dist(p[0], p[1]) / start.d, 1, MAX_ZOOM);
        var img = cur(), r = img.getBoundingClientRect();
        var cx = r.left + r.width / 2 - z.x, cy = r.top + r.height / 2 - z.y;
        var qx = (start.m.x - cx - start.x) / start.s, qy = (start.m.y - cy - start.y) / start.s;
        z.s = s;
        z.x = m.x - cx - s * qx;
        z.y = m.y - cy - s * qy;
        applyZoom(false);
        return;
      }
      if (p.length !== 1) return;
      var dx = p[0].x - start.p[0].x, dy = p[0].y - start.p[0].y;

      if (z.s > 1.01) {
        // pan the zoomed photo, with a little resistance past its edges
        var b = bounds();
        var nx = start.x + dx, ny = start.y + dy;
        z.x = nx > b.x ? b.x + (nx - b.x) / 3 : nx < -b.x ? -b.x + (nx + b.x) / 3 : nx;
        z.y = ny > b.y ? b.y + (ny - b.y) / 3 : ny < -b.y ? -b.y + (ny + b.y) / 3 : ny;
        applyZoom(false);
        return;
      }
      // not zoomed: decide once whether this is a sideways swipe or a pull down
      if (!swipe && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) swipe = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (swipe === 'x') {
        var edge = (index === 0 && dx > 0) || (index === slides.length - 1 && dx < 0);
        setTrack(false, edge ? dx / 3 : dx);
      } else if (swipe === 'y' && dy > 0) {
        cur().style.transition = 'none';
        cur().style.transform = 'translate3d(0,' + dy + 'px,0) scale(' + (1 - Math.min(dy, 400) / 2000) + ')';
        root.style.setProperty('--lb-fade', String(1 - Math.min(dy / 400, 0.6)));
      }
    });

    function end(e) {
      root.classList.remove('is-grabbing');
      if (!pts.has(e.pointerId)) return;
      var p0 = pts.get(e.pointerId);
      pts.delete(e.pointerId);
      if (busy) return;

      if (pts.size === 1) { snapshot(); return; }   // lifted one finger of a pinch
      if (pts.size) return;

      var dx = p0.x - start.p[0].x, dy = p0.y - start.p[0].y;
      var dt = Date.now() - start.t;

      if (swipe === 'x') {
        var v = dx / Math.max(dt, 1);
        if (dx < -60 || v < -0.45) go(index + 1);
        else if (dx > 60 || v > 0.45) go(index - 1);
        else setTrack(true);
      } else if (swipe === 'y') {
        root.style.removeProperty('--lb-fade');
        if (dy > 120 || dy / Math.max(dt, 1) > 0.6) { cur().style.transform = ''; close(); }
        else { cur().style.transition = 'transform .3s ' + EASE_OUT_QUINT; cur().style.transform = ''; }
      } else if (z.s > 1.01) {
        // settle a pan that went past the edges
        var b = bounds();
        z.x = clamp(z.x, -b.x, b.x); z.y = clamp(z.y, -b.y, b.y);
        applyZoom(true);
      } else if (z.s < 1.01 && start.s > 1) {
        resetZoom(true);
      }

      // taps: double-tap toggles zoom; a single tap off the photo closes
      if (!swipe && Math.abs(dx) < 10 && Math.abs(dy) < 10 && dt < 300) {
        var now = Date.now();
        var dbl = now - lastTap.t < 300 && Math.hypot(p0.x - lastTap.x, p0.y - lastTap.y) < 30;
        if (dbl) {
          clearTimeout(lastTap.timer);
          if (z.s > 1.01) resetZoom(true); else zoomAt(2.5, p0.x, p0.y, true);
          lastTap.t = 0;
        } else if (start.target && start.target.closest && start.target.closest('.lightbox__slide:not(.is-current)')) {
          // desktop: a peeking neighbour — go to it
          lastTap.t = 0;
          go(slides.indexOf(start.target.closest('.lightbox__slide').querySelector('img')));
        } else if (start.target !== cur() && z.s <= 1.01) {
          // off the photo: close straight away. (Only taps on the photo
          // need to wait and see if a second tap makes it a double-tap.)
          lastTap.t = 0;
          close();
        } else {
          lastTap = { t: now, x: p0.x, y: p0.y };
        }
      }
      swipe = null;
    }
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);

    // trackpad pinch arrives as ctrl + wheel
    stage.addEventListener('wheel', function (e) {
      e.preventDefault();
      if (!e.ctrlKey || busy) return;
      zoomAt(z.s * Math.exp(-e.deltaY / 120), e.clientX, e.clientY, false);
    }, { passive: false });
  }

  w.BFLightbox = { open: open, close: close, isOpen: function () { return !!root && !root.hidden; } };
})(window, document);
