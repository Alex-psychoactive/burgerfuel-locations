/* ------------------------------------------------------------------
   Opening hours: parsing, grouping and open/closed state.
   Source strings look like "10 am–11 pm", "10 am–12 am", "Closed".
   All comparisons are made in Pacific/Auckland regardless of the
   viewer's own timezone.
   ------------------------------------------------------------------ */
(function (w) {
  'use strict';

  // Week starts Sunday, matching the grouping in the design
  var WEEK  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var SHORT = { Sunday:'Sun', Monday:'Mon', Tuesday:'Tue', Wednesday:'Wed',
                Thursday:'Thu', Friday:'Fri', Saturday:'Sat' };

  /* "10 am" / "12:30 pm" → minutes from midnight, or null */
  function toMinutes(s) {
    var m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i.exec(String(s || ''));
    if (!m) return null;
    var h = parseInt(m[1], 10) % 12;
    if (/pm/i.test(m[3])) h += 12;
    return h * 60 + (m[2] ? parseInt(m[2], 10) : 0);
  }

  /* "10 am–11 pm" → { open, close } in minutes; close may exceed 1440
     when the store trades past midnight ("10 am–3 am" → 1620). */
  function parseRange(str) {
    if (!str || /closed/i.test(str)) return null;
    var parts = String(str).split(/[–—-]/);
    if (parts.length < 2) return null;
    var open = toMinutes(parts[0]);
    var close = toMinutes(parts[1]);
    if (open === null || close === null) return null;
    if (close <= open) close += 1440;           // wraps past midnight
    return { open: open, close: close };
  }

  /* "10 am" style label for the status line */
  function label(mins) {
    var m = ((mins % 1440) + 1440) % 1440;
    var h = Math.floor(m / 60), mm = m % 60;
    var ap = h >= 12 ? 'pm' : 'am';
    var h12 = h % 12 || 12;
    return h12 + (mm ? ':' + String(mm).padStart(2, '0') : '') + ap;
  }

  /* Current wall-clock time in Auckland */
  function aucklandNow() {
    var parts = new Intl.DateTimeFormat('en-NZ', {
      timeZone: 'Pacific/Auckland', weekday: 'long',
      hour: 'numeric', minute: 'numeric', hour12: false
    }).formatToParts(new Date());
    var out = {};
    parts.forEach(function (p) { out[p.type] = p.value; });
    var hour = parseInt(out.hour, 10) % 24;
    return {
      dayIndex: WEEK.indexOf(out.weekday),
      minutes: hour * 60 + parseInt(out.minute, 10)
    };
  }

  /* → { open:Boolean, next:String } e.g. { open:true, next:'Closes at 9pm' } */
  function status(hours) {
    if (!hours) return { open: false, next: '' };
    var now = aucklandNow();
    if (now.dayIndex < 0) return { open: false, next: '' };

    var today = parseRange(hours[WEEK[now.dayIndex]]);
    if (today && now.minutes >= today.open && now.minutes < today.close) {
      return { open: true, next: 'Closes at ' + label(today.close) };
    }

    // Still inside yesterday's post-midnight session?
    var yIdx = (now.dayIndex + 6) % 7;
    var y = parseRange(hours[WEEK[yIdx]]);
    if (y && y.close > 1440 && now.minutes < y.close - 1440) {
      return { open: true, next: 'Closes at ' + label(y.close) };
    }

    // Closed — find the next opening within the coming week
    if (today && now.minutes < today.open) {
      return { open: false, next: 'Opens at ' + label(today.open) };
    }
    for (var i = 1; i <= 7; i++) {
      var d = (now.dayIndex + i) % 7;
      var r = parseRange(hours[WEEK[d]]);
      if (r) {
        return {
          open: false,
          next: 'Opens ' + (i === 1 ? 'tomorrow' : SHORT[WEEK[d]]) + ' at ' + label(r.open)
        };
      }
    }
    return { open: false, next: '' };
  }

  /* Collapse consecutive days with identical hours:
     [{ days:'Sun – Wed', time:'10:00 am - 9:00 pm' }, …] */
  function group(hours) {
    if (!hours) return [];
    var runs = [], i;
    for (i = 0; i < WEEK.length; i++) {
      var day = WEEK[i], val = (hours[day] || 'Closed').trim();
      var last = runs[runs.length - 1];
      if (last && last.value === val) last.end = day;
      else runs.push({ start: day, end: day, value: val });
    }
    return runs.map(function (r) {
      return {
        days: r.start === r.end ? SHORT[r.start] : SHORT[r.start] + ' – ' + SHORT[r.end],
        time: prettyRange(r.value)
      };
    });
  }

  /* "10 am–11 pm" → "10:00 am - 11:00 pm" (matches the design) */
  function prettyRange(str) {
    var r = parseRange(str);
    if (!r) return 'Closed';
    return pretty(r.open) + ' - ' + pretty(r.close);
  }
  function pretty(mins) {
    var m = ((mins % 1440) + 1440) % 1440;
    var h = Math.floor(m / 60), mm = m % 60;
    var ap = h >= 12 ? 'pm' : 'am';
    return (h % 12 || 12) + ':' + String(mm).padStart(2, '0') + ' ' + ap;
  }

  w.BFHours = { status: status, group: group, parseRange: parseRange };
})(window);
