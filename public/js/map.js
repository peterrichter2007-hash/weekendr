// ============================================================
// map.js — Leaflet orchestration boundary
//
// Responsibilities owned here:
//   • Schedule lazy boot via IntersectionObserver
//   • Ensure Leaflet assets are loaded (delegates to MV.api)
//   • Call the caller-supplied initFn once the map host is visible
//
// What stays inline in index.html (for now):
//   • initLeaflet()       — creates L.map, adds tile layers
//   • renderLeafletMarkers / buildMarker / flyToCity / flyToTopPick
//   • The mapState global (read by markers + sidebar render)
//
// Why the split is partial: the renderers above read cityCoords,
// smartDestinations, mapState directly — all still inline. Moving
// them here would mean moving all the data structures too. That's
// a separate migration step (TASK 8 follow-up).
// ============================================================
(function () {
  'use strict';
  window.MV = window.MV || {};
  const M = (MV.map = MV.map || {});

  // Lazy boot. Pass in the actual init function (initLeaflet) from
  // wherever it's currently defined (today: inline). Returns nothing.
  // The init function will be called ONCE, after the map host enters
  // the viewport AND Leaflet's assets have loaded.
  //
  //   MV.map.scheduleInit('leafletMap', initLeaflet)
  function scheduleInit(hostId, initFn) {
    const host = document.getElementById(hostId);
    if (!host || typeof initFn !== 'function') return;
    const boot = function () {
      if (!MV.api || typeof MV.api.ensureLeafletAssets !== 'function') {
        // api.js failed to load — fall back to immediate init and let
        // initFn's own typeof L === 'undefined' check handle retries
        try { initFn(); } catch (e) { console.error(e); }
        return;
      }
      MV.api.ensureLeafletAssets()
        .then(initFn)
        .catch(function (err) { console.error('Leaflet asset load failed', err); });
    };
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) {
          io.disconnect();
          boot();
        }
      }, { rootMargin: '200px' });
      io.observe(host);
    } else {
      boot();
    }
  }

  M.scheduleInit = scheduleInit;
})();
