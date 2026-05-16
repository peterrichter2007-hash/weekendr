// ============================================================
// state.js — MV namespace + state coordination
//
// Loaded FIRST, before any other module. Just sets up the
// `window.MV` namespace so utils / api / map / render / app can
// attach to it without re-declaring.
//
// State stores currently living inside the inline <script> in
// index.html (these are the canonical sources of truth — moving
// them here is the next refactor step, not this one):
//
//   mapState                 — { from, sort, view }   (concierge / map)
//   cityProfiles             — 16 cities × ~25 items   (curated baseline)
//   smartDestinations        — 16 cities with prices  (per-origin matrix)
//   cityCoords               — { name: [lat, lng] }
//   cityGallery              — { name: [wiki_slug…] }
//
// State stores ALREADY exposed on MV (defined inside the inline
// script — this file just documents the contract):
//
//   MV.cities      — canonical structured city accessor (TASK 6)
//   MV.favorites   — saved trips, localStorage-backed (TASK 7)
//   MV.compare     — comparison list, max 4 (TASK 7)
//
// Architectural rule: no module should ever read `window.X` for
// app state. Always go through MV.* — that's the public contract
// future API + AI overlays consume.
// ============================================================
window.MV = window.MV || {};
MV.state = MV.state || {};

// Build metadata — useful for future cache-busting and debugging
MV.version = '0.8.0';
MV.build = { module: 'split', loadedAt: Date.now() };
