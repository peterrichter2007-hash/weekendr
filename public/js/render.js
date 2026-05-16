// ============================================================
// render.js — UI rendering boundary (migration target)
//
// This file is intentionally small today. It exists so future
// renderer code has a clear destination, and so the architecture
// in HANDOVER.md is honest about where things live.
//
// MIGRATION TARGETS (still inline in index.html, prefixed by the
// inline-script section they live in):
//
//   RAILS           renderRail, renderAllRails
//   RESULTS         renderResults, closeResults
//   CITY DETAIL     openTripDetail, populateCityListings,
//                   renderHotels, renderActivities, renderRestaurants,
//                   renderGuides
//   COMPARE         renderCompareTray, openCompareModal,
//                   closeCompareModal, buildCompareColumn (TASK 7)
//   MAP             renderMap (sidebar, stats, concierge sync),
//                   renderLeafletMarkers, buildMarker
//   STORIES         openStory, closeStory
//   STEP WIZARD     openStepWizard, closeStepWizard, sw* helpers
//
// What this file owns today:
//   • A documented namespace MV.render
//   • A helper for hydrating wiki images on dynamic DOM (delegates
//     to the inline hydrateWikiImages while it lives there).
//
// Architectural rule: renderers consume MV.cities / MV.favorites /
// MV.compare / MV.api — they never reach into the global data
// structures (cityProfiles etc.) directly. That gives the future
// API + AI overlay a single seam to inject through.
// ============================================================
(function () {
  'use strict';
  window.MV = window.MV || {};
  const R = (MV.render = MV.render || {});

  // Delegating helper — current owner is the inline script's
  // `function hydrateWikiImages(root)`. New renderers should call
  // MV.render.hydrate(node) instead of reaching for the inline name.
  R.hydrate = function (root) {
    if (typeof window.hydrateWikiImages === 'function') {
      window.hydrateWikiImages(root || document);
    }
  };
})();
