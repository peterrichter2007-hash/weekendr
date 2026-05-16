// ============================================================
// utils.js — pure helpers, no DOM, no state, no side effects
//
// Single source of truth for price formatting, flight format,
// debounce / rAF throttle, slug helpers, HTML escaping. The
// inline script in index.html keeps thin one-line shims that
// delegate here, so existing call sites don't have to change.
//
// Adding a new util: it MUST be pure (no DOM, no MV.state, no
// localStorage). Anything with side effects belongs in api.js
// or render.js.
// ============================================================
(function () {
  'use strict';
  window.MV = window.MV || {};
  const U = (MV.utils = MV.utils || {});

  // ----- Price formatting -----
  // Underlying data is research averages, never partner-quoted —
  // displaying it as a +/- range tells the user honestly: this is
  // an estimate, not a guaranteed price.
  function priceRange(n, opts) {
    opts = opts || {};
    if (n == null || n === 0 || n === '0') return opts.zero || 'Free';
    const num = typeof n === 'number' ? n : parseFloat(String(n).replace(/[^\d.]/g, ''));
    if (!num || isNaN(num)) return String(n);
    const spread = num < 50 ? 0.22 : num < 200 ? 0.16 : num < 500 ? 0.13 : 0.10;
    const low = Math.max(1, Math.floor(num * (1 - spread) / 5) * 5);
    const high = Math.ceil(num * (1 + spread) / 5) * 5;
    if (low === high) return '€' + low + (opts.suffix ? ' ' + opts.suffix : '');
    return '€' + low + '–' + high + (opts.suffix ? ' ' + opts.suffix : '');
  }

  function priceFromRange(n, opts) {
    opts = opts || {};
    if (n == null || n === 0) return opts.zero || 'Free';
    const num = typeof n === 'number' ? n : parseFloat(String(n).replace(/[^\d.]/g, ''));
    if (!num || isNaN(num)) return String(n);
    const spread = num < 50 ? 0.22 : num < 200 ? 0.16 : num < 500 ? 0.13 : 0.10;
    const low = Math.max(1, Math.floor(num * (1 - spread) / 5) * 5);
    return 'from €' + low;
  }

  // Extract a comparable number from a string price like "from €89 return"
  function priceNum(s) {
    const m = String(s || '').match(/(\d[\d,.]*)/);
    return m ? parseFloat(m[1].replace(/[,.]/g, '')) : 9999;
  }

  // Decimal hours → "2h 45m" / "1h"
  function fmtFlight(h) {
    const hours = Math.floor(h);
    const mins = Math.round((h - hours) * 60);
    return mins > 0 ? hours + 'h ' + mins + 'm' : hours + 'h';
  }

  // ----- Wikipedia slug -----
  function wikiSlug(place) {
    if (!place) return '';
    return String(place).trim().replace(/\s+/g, '_');
  }

  // ----- HTML escape (for user-supplied strings only — we don't
  //       want our editorial copy escaped) -----
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ----- Clamp -----
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  // ----- Debounce — last-call-wins, ms delay -----
  function debounce(fn, ms) {
    let t = null;
    return function () {
      const args = arguments;
      const self = this;
      if (t) clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  // ----- requestAnimationFrame throttle — coalesces calls to the
  //       next paint frame. Right for scroll / input handlers. -----
  function rafThrottle(fn) {
    let queued = false;
    let lastArgs = null;
    let self = null;
    return function () {
      lastArgs = arguments;
      self = this;
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        fn.apply(self, lastArgs);
      });
    };
  }

  // Export
  U.priceRange = priceRange;
  U.priceFromRange = priceFromRange;
  U.priceNum = priceNum;
  U.fmtFlight = fmtFlight;
  U.wikiSlug = wikiSlug;
  U.escapeHtml = escapeHtml;
  U.clamp = clamp;
  U.debounce = debounce;
  U.rafThrottle = rafThrottle;
})();
