# Maison Voyage — Handover for a Fresh AI Session

**For: any new Claude / Cursor / Copilot session picking this up.**
**Goal: get productive in 60 seconds without reading the whole 9500-line file.**

---

## Brand & Core Promise

Maison Voyage is a **cheap-European-weekend-trip optimiser**. The user is
young / friends / couples on a real budget. Every UI decision should reinforce
"find the cheapest beautiful weekend" — not luxury aesthetics.

The site shows:
- Curated cities (16) with realistic per-departure flight prices
- Interactive Leaflet satellite map
- AI Concierge (4-step mobile wizard + desktop form) → ranked results
- Per-city detail pages with: gallery hero, transparent cost breakdown,
  hotels, activities, restaurants, weather, editor's guides, full story

---

## Honesty Rules (NON-NEGOTIABLE)

These are real product decisions, not stylistic preferences. The user has
explicitly removed "fake live" language from this project. Do not regress.

| Rule | Why |
|---|---|
| **NEVER say "live"** unless the data is actually fetched live. The only live data sources we have today: Open-Meteo (weather) and Wikipedia REST API (images). | User said "nothing fake". |
| **Prices are estimates**, labelled "approx" or "from €X". Show the **amber `.price-tag.est`** badge to make this visually obvious. | We don't have partner APIs. |
| **NO availability claims** like "4 left" or "Limited". The old hashed `availability()` heuristic is gone — replaced by `valueBadge(idx)` that only marks index 0/1 as "Best value"/"Top pick". | Those numbers were invented. |
| **Hotels show typographic placeholders**, NOT stock photos. Real hotel photos require a Booking Partner API we don't have. | Stock photos would imply the photo is the property. |
| **Activities use Wikipedia landmark images** when possible. Else placeholder. | We never substitute a wrong photo. |
| **Restaurants** use the priority chain in `pickRestaurantWiki`: own Wikipedia → must_order dish → cuisine → vibe → country fallback. | Real and verifiable. |

---

## Module architecture (TASK 8)

The frontend is now split across **`public/index.html`** + **`public/js/`**.
Plain `<script>` tags load the modules in order BEFORE the inline script
at the end of `<body>` — no bundler, no `type="module"`, no defer. Each
module attaches to `window.MV.<name>`.

```
public/
├── index.html                # All HTML + CSS + the wild-west renderers
└── js/
    ├── state.js              # MV namespace setup + state docs
    ├── utils.js              # MV.utils — pure helpers (price/flight/slug/debounce)
    ├── api.js                # MV.api  — wikiImage, fetchWeather, generateTrips,
    │                                     ensureLeafletAssets
    ├── map.js                # MV.map  — scheduleInit (lazy Leaflet boot)
    ├── render.js             # MV.render — scaffold + hydrate helper.
    │                           Migration target for renderRail / renderResults /
    │                           openTripDetail / populateCityListings / etc.
    └── app.js                # MV.app.init({ initLeaflet, refresh… }) orchestrator
```

**No circular deps.** Load order is enforced: state → utils → api → map →
render → app → inline. Each module only references things loaded earlier.

**No global pollution.** Everything lives under `window.MV`. The inline
script still declares local `const`s (mapState, cityProfiles…) but those
are block-scoped to the script tag — they don't pollute window.

**The inline `<script>` is not gone yet.** It still owns the renderers
that are tightly DOM-bound (rails, results drawer, detail page, compare
modal, step wizard, stories). Migration target is `render.js`. The inline
duplicates of `priceRange / priceFromRange / priceNum / fmtFlight` are
now one-line shims that delegate to `MV.utils.*` — single source of truth.

## Where Things Live (file map)

Inline CSS is in one `<style>` block, inline JS in one `<script>` block.

### HTML body — top-to-bottom
- Nav + fullscreen mobile menu
- Hero (single CTA "Find your cheapest weekend trip" → opens step wizard)
- Manifesto
- AI Concierge form (desktop) / Step wizard target (mobile)
- Featured editorial grid (6 cinematic tiles)
- Smart map section (Leaflet satellite, sidebar with ranked cities)
- 4 collection rails (Weekends, Villas, Hidden, Beaches)
- Stories (3 long-form readable journal articles)
- CTA band, footer
- Modals: API key, results drawer, **city detail page**, story reader,
  loading veil, **step wizard**, sticky-bottom-CTA

### CSS sections (in `<style>`, in order)
- `:root` tokens — colour, glass, type, motion (search `MAISON VOYAGE — Design System`)
- Reset + typography
- Nav, full-menu, hero
- Manifesto, featured editorial grid, rails
- City detail (`.detail-hero`, `.cost-breakdown`, `.cb-row`, listings, guides)
- **Mobile step wizard** (`.step-wizard`, `.sw-*`)
- **Sticky mobile CTA** (`.sticky-cta`)
- Story reader
- Modal + loading + results drawer
- Glass utilities (`.glass-card`, `.has-placeholder`)
- Map (Leaflet customisation, `.lf-pin`, `.lf-pop`)
- **Price-tag badge system** (`.price-tag.est` amber / `.price-tag.live` green-pulse)
- Section frosted veils, motion, responsive

### JS sections (in `<script>`, in order)
- `DATA` — collections, smartDestinations, cityCoords, knownCities (autocomplete)
- `IMAGE SYSTEM` — Wikipedia REST API fetcher, hydrateWikiImages,
  attractionWikiMap, restaurantWikiMap, dishKeywordWiki, cityGallery
- `WEATHER` — Open-Meteo fetch + render
- **`SEARCH CONTEXT`** — `getSearchContext()` reads the form, returns
  origin/adults/rooms/nights/dates/budgetPP
- **`PARTNER LINKS`** — `partnerLinks(city, ctx?)` returns deep-links with
  cheapest-first sort + budget filter on every URL
- `AVAILABILITY` — replaced by `valueBadge(idx)` (returns only "Best value" / "Top pick" or null)
- `MAP` — Leaflet init (satellite-only, smooth wheel zoom), markers, sidebar
- `CONCIERGE` — form, slider, autocomplete, AI generation
- `RAILS` — collection rendering
- `CITY DETAIL` — `openTripDetail`, `populateCityListings`, renderers
- `STORIES` — editorial reading content + reader modal
- `STEP WIZARD` — 4-step mobile flow, swSyncFromForm / swSyncToForm
- `MOTION` — smooth scroll, parallax, magnetic, ambient orbs

---

## Live Data Sources (the only real ones)

| Source | Powers | Auth |
|---|---|---|
| **Anthropic Claude** | AI city pages + AI trip results | User's own API key (browser only — `mv_api_key` in localStorage) |
| **Wikipedia REST API** | City heroes, landmarks, dishes, restaurants — all verified | None |
| **Open-Meteo** | Live weather per city + 4-day forecast | None |
| **Carto basemaps + Esri World Imagery** | Map tiles | None |

Partner-search URLs (Skyscanner / Booking / GetYourGuide) are **deep-links** —
they open the real partner site with user's exact dates/adults/budget
pre-filled and sorted cheapest first. We don't show their data inline.

---

## Parameter Persistence (the core product feature)

Every single Skyscanner/Booking/GetYourGuide URL on the site uses
`getSearchContext()` which reads the live concierge form:

```js
{
  origin: 'Zurich',           // IATA-resolved via partnerCodes.skyscannerOrigin
  adults: 5,                  // parsed from i-group dropdown
  rooms: 3,                   // auto: ceil(adults/2)
  nights: 3,                  // parsed from i-length dropdown
  dates: {                    // computed from i-when + nights
    checkin: '2026-05-29',
    checkout: '2026-06-01',
    checkinCompact: '260529', // for Skyscanner /YYMMDD/ paths
    checkoutCompact: '260601',
    checkinShort: 'Fri 29 May',
    checkoutShort: 'Mon 1 Jun',
    nights: 3
  },
  budgetPP: 600               // €/person, drives Booking price filter
}
```

Test it: open browser console, type `getSearchContext()` → returns live state.
Type `partnerLinks('Lisbon')` → returns the four URLs.

---

## Cheapest-First Filters Per Partner

| Partner | URL params |
|---|---|
| **Skyscanner** | `adultsv2={n}&sortby=price&cabinclass=economy` |
| **Booking** | `group_adults={n}&no_rooms={r}&order=price&nflt=price=EUR-0-{maxPerNight}-1` |
| **GetYourGuide** | `q={query}&date_from&date_to&sort=lowest_price` |

The Booking `nflt` price filter is **derived from the user's budget**:
`maxPerNight = budgetPP * adults * 0.5 / nights`, clamped to €40–€500.

---

## Things to NEVER Touch Without Asking

- **`getSearchContext()`** — every partner link depends on it. Don't change the field names without updating every consumer.
- **`pickRestaurantWiki` priority chain** — built carefully to be honest.
- **`pickActivityWiki`** — 130+ landmark→Wikipedia mappings.
- **`cityProfiles`** — 16 cities × ~25 items each = 400+ curated entries.
- **`partnerLinks` URL structure** — tested live.
- **`MV.cities` shape** — published API for AI / affiliate overlays. Field
  names are a contract; adding fields is fine, renaming is not.

## City Data Model — `MV.cities`

Canonical structured shape for AI + affiliate consumers. Composes the four
curated sources (`cityGallery`, `smartDestinations`, `cityCoords`,
`cityProfiles`) into one normalised City object on read. Defined right
after `cityCoords` in the script block.

```js
MV.cities.get('Lisbon')
// → { name, country, vibe, tagline, tags, coords,
//     images:[{slug,source}], hotels[], activities[], restaurants[],
//     guides[], prices:{Berlin:79,...}, flights:{Berlin:3.5,...},
//     estimatedBudget:{flight_min, hotel_per_night_min, weekend_2night_min,
//                      currency:'EUR'},
//     source:{hotels:'curated', images:'wikipedia', prices:'estimate', ...} }

MV.cities.all()              // → 16 baseline + any overrides
MV.cities.override(name, p)  // merge a partial override (e.g. real Hotelbeds
                             // hotels, real Skyscanner prices). Pass null
                             // to remove. The renderer never mutates curated
                             // data — overrides layer cleanly on top.
```

**Future-API injection point.** When Hotelbeds / Skyscanner / GetYourGuide
returns real data, call `MV.cities.override(...)` instead of editing the
baseline. The `source` map on each field lets callers see what's real and
what's still an estimate.

---

## Things That Need Doing (Roadmap)

The user has affiliate-program plans in motion. When any of these land,
swap the corresponding section from deep-links to real API data.

| Status | Task |
|---|---|
| Pending — easy | **Booking Affiliate ID**: replace `aid=304142` everywhere with the user's real ID. ~30 min. |
| Pending — depends on access | **Hotelbeds API** (easier than Booking Demand): real hotel photos, real prices, real availability. Swap `renderHotels` to fetch from a new `/api/hotels?city=X` server route. |
| Pending — bigger | **GetYourGuide Partner API**: real activity inventory + booking. Swap `renderActivities`. |
| Pending — bigger | **Skyscanner Travel API**: real flight prices. Swap the map sidebar and the cost-breakdown flight row. |
| Optional | **User accounts + saved trips**: needs a real backend (currently just an Express AI proxy). |

---

## Running it Locally

```bash
git clone https://github.com/peterrichter2007-hash/weekendr.git
cd weekendr
npm install
npm start
# → http://localhost:3000/
```

The Anthropic key is **never** in the repo or server. User pastes it in the
browser modal and it's stored in `localStorage['mv_api_key']`. The Express
proxy just forwards the key from the request body to Anthropic.

`.claude/launch.json` exists for Claude Code's preview tool — runs
`node server.js` on port 3000.

---

## How to Brief a New AI Session

Paste this prompt at the start of a fresh Claude / Cursor / Copilot
conversation:

> I'm continuing work on **Maison Voyage** — a cheap-European-weekend-trip
> optimiser. The whole frontend is in **`public/index.html`** (~9500 lines,
> inline CSS + JS, organised in clearly-commented sections). Backend is a
> tiny Express AI proxy in `server.js`.
>
> Before changing anything, read **`HANDOVER.md`** in the repo root — it has
> the architecture map, honesty rules (never say "live" for non-live data,
> no fake availability claims, no stock hotel photos), and the search-context
> parameter-persistence system.
>
> Latest commit: see `git log -1`. Open issues: see the Roadmap section
> of HANDOVER.md.

That alone gets a new session productive without re-explaining the project.

---

## Stable Identifiers — Search These When Lost

| Looking for | grep |
|---|---|
| Search context reader | `function getSearchContext` |
| Partner URL builder | `function partnerLinks` |
| Cost breakdown card | `cost-breakdown glass-card` |
| Mobile step wizard | `step-wizard` |
| Sticky mobile CTA | `sticky-cta` |
| Hero CTA | `btn-primary-hero` |
| City data | `const cityProfiles` |
| Wikipedia attractions | `const attractionWikiMap` |
| Restaurant Wikipedia | `const restaurantWikiMap` |
| Dish keywords | `const dishKeywordWiki` |
| Price range helper | `function priceRange` |
| Value badge | `function valueBadge` |

---

## Commit Hygiene

We commit + push directly to `main` so Vercel auto-deploys. Pattern:

```bash
git add public/index.html
git commit -m "feat: short summary

Longer body explaining what + why.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin HEAD:main
```
