// ============================================================
// api.js — all network I/O lives here
//
// Every fetch the app does, in one file. Pure functions that take
// inputs and return Promises — no DOM, no MV.state reads. Callers
// own the data they pass in (e.g. coords, slug, prompt).
//
// localStorage is used for memoising successful results (Wikipedia
// URLs in particular) so the same URL is never re-fetched twice
// for the same user.
//
// Future affiliate APIs (Hotelbeds, Skyscanner) get their own
// MV.api.* functions here. Renderers consume them via MV.cities
// .override(...) so the UI stays decoupled from the data source.
// ============================================================
(function () {
  'use strict';
  window.MV = window.MV || {};
  const A = (MV.api = MV.api || {});
  const U = (MV.utils = MV.utils || {});

  // -------------------- WIKIPEDIA --------------------
  // Cache: same key shape the inline script uses (mv_wiki_v4_<slug>)
  // so this co-exists with the existing cache. `__NONE__` sentinel
  // means "we asked and there was nothing" — don't try again.
  const wikiInFlight = new Map();

  async function fetchWikiSummary(slug) {
    if (!slug) return null;
    const cacheKey = 'mv_wiki_summary_v1_' + slug;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached === '__NONE__') return null;
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    try {
      const res = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(slug), {
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) {
        try { localStorage.setItem(cacheKey, '__NONE__'); } catch (e) {}
        return null;
      }
      const data = await res.json();
      try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch (e) {}
      return data;
    } catch (e) {
      return null;
    }
  }

  async function wikiImage(place) {
    if (!place) return null;
    const slug = U.wikiSlug ? U.wikiSlug(place) : String(place).trim().replace(/\s+/g, '_');
    const cacheKey = 'mv_wiki_v4_' + slug;
    let cached = null;
    try { cached = localStorage.getItem(cacheKey); } catch (e) {}
    if (cached === '__NONE__') return null;
    if (cached) return cached;

    if (wikiInFlight.has(slug)) return wikiInFlight.get(slug);

    const promise = (async () => {
      try {
        const res = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(slug), {
          headers: { 'Accept': 'application/json' }
        });
        if (!res.ok) {
          try { localStorage.setItem(cacheKey, '__NONE__'); } catch (e) {}
          return null;
        }
        const data = await res.json();
        let url = (data.originalimage && data.originalimage.source) || (data.thumbnail && data.thumbnail.source);
        if (!url) {
          try { localStorage.setItem(cacheKey, '__NONE__'); } catch (e) {}
          return null;
        }
        url = url.replace(/\/(\d+)px-/, (_, w) => parseInt(w) < 1600 ? '/1600px-' : '/' + w + 'px-');
        try { localStorage.setItem(cacheKey, url); } catch (e) {}
        return url;
      } catch (e) {
        return null;
      }
    })();
    wikiInFlight.set(slug, promise);
    return promise;
  }

  // -------------------- OPEN-METEO (free, no key) --------------------
  async function fetchWeather(lat, lng) {
    if (lat == null || lng == null) return null;
    const url = 'https://api.open-meteo.com/v1/forecast' +
      '?latitude=' + lat + '&longitude=' + lng +
      '&current=temperature_2m,weather_code,wind_speed_10m' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
      '&timezone=auto&forecast_days=4';
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  // -------------------- ANTHROPIC (via /api proxy) --------------------
  // The proxy lives in server.js. The browser never sees the user's API
  // key in transit beyond the request body — it's never stored server-side.
  async function generateTrips(payload, signal) {
    const res = await fetch('/api/generate-trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: signal
    });
    return res;
  }

  // -------------------- LEAFLET LAZY LOADER --------------------
  // Injects leaflet CSS + JS on demand. Resolves once `window.L` is
  // global. Caller is responsible for waiting on the returned promise
  // before calling L.map() / L.tileLayer() / etc.
  let leafletAssetsPromise = null;
  function ensureLeafletAssets() {
    if (typeof window.L !== 'undefined') return Promise.resolve();
    if (leafletAssetsPromise) return leafletAssetsPromise;
    leafletAssetsPromise = new Promise(function (resolve, reject) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      css.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
      css.crossOrigin = '';
      document.head.appendChild(css);

      const js = document.createElement('script');
      js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      js.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
      js.crossOrigin = '';
      js.async = true;
      js.onload = function () { resolve(); };
      js.onerror = function () { reject(new Error('Leaflet failed to load')); };
      document.head.appendChild(js);
    });
    return leafletAssetsPromise;
  }

  // Export
  A.wikiImage = wikiImage;
  A.fetchWikiSummary = fetchWikiSummary;
  A.fetchWeather = fetchWeather;
  A.generateTrips = generateTrips;
  A.ensureLeafletAssets = ensureLeafletAssets;
})();
