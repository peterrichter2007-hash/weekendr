// ============================================================
// app.js — boot orchestrator
//
// MV.app.init(opts) is the documented entry point. It's CALLED
// from the inline script (last thing in the inline boot block)
// after the data + DOM are ready. It doesn't replace the inline
// boot today — it wraps the parts that already had to wait for
// page-ready and provides a single seam for future migration.
//
// Boot order (current, end-to-end):
//
//   1. <head> parses
//      → js/state.js, utils.js, api.js, map.js, render.js, app.js
//        all execute in order (classic <script> tags, no defer).
//        They only DEFINE — no DOM access, no fetches.
//   2. <body> parses
//      → inline script runs at end of body
//        - declares cityProfiles, smartDestinations, cityGallery,
//          cityCoords, mapState (DATA section)
//        - defines all renderers + MV.cities / MV.favorites /
//          MV.compare / MV.utils shims
//        - runs first paint: renderAllRails(), renderMap(),
//          bindMapControls(), bindBudgetSlider() etc.
//        - calls MV.app.init() at the end
//   3. MV.app.init()
//      → schedules the lazy Leaflet boot via MV.map.scheduleInit
//      → wires final state-change listeners
//      → fires any one-shot initial-paint refresh
//
// Why this shape: the inline script owns 100+ DOM-binding render
// functions that future migrations will move into render.js. Once
// they all live in render.js, this app.js becomes the only entry
// point and the inline script disappears entirely.
// ============================================================
(function () {
  'use strict';
  window.MV = window.MV || {};
  const APP = (MV.app = MV.app || {});

  // Idempotent — multiple init() calls are no-ops after the first.
  let booted = false;
  let bootSequence = [];

  function init(opts) {
    if (booted) return;
    booted = true;
    opts = opts || {};

    // 1. Schedule map (lazy — only boots when host enters viewport)
    if (MV.map && typeof MV.map.scheduleInit === 'function'
        && typeof opts.initLeaflet === 'function') {
      MV.map.scheduleInit(opts.mapHostId || 'leafletMap', opts.initLeaflet);
      bootSequence.push('map.scheduleInit');
    }

    // 2. Initial state-paint refresh for any UI built from MV stores
    if (MV.favorites && typeof opts.refreshFavouriteUI === 'function') {
      opts.refreshFavouriteUI();
      bootSequence.push('refreshFavouriteUI');
    }
    if (MV.compare && typeof opts.refreshCompareUI === 'function') {
      opts.refreshCompareUI();
      bootSequence.push('refreshCompareUI');
    }

    // 3. Health/diag — surfaces a quick boot summary at devtools level.
    //    Not visible to users; helps if a fresh AI session has to debug.
    if (window.console && console.info) {
      console.info('[Maison Voyage] booted', {
        version: MV.version,
        modules: {
          state:   !!MV.state,
          utils:   !!MV.utils,
          api:     !!MV.api,
          map:     !!MV.map,
          render:  !!MV.render
        },
        stores: {
          cities:    !!(MV.cities && MV.cities.all),
          favorites: !!(MV.favorites && MV.favorites.list),
          compare:   !!(MV.compare && MV.compare.list)
        },
        sequence: bootSequence
      });
    }
  }

  APP.init = init;
  APP.booted = function () { return booted; };
  APP.sequence = function () { return bootSequence.slice(); };
})();
