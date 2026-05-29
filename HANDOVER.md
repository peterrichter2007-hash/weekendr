# Maison Voyage — Handover for a Fresh AI Session

**For: any new Claude / Cursor / Copilot session picking this up.**
**Goal: get productive in 90 seconds without reading the whole 15k-line file.**

---

## Briefing prompt — paste this into a fresh chat

> I'm continuing work on **Maison Voyage** — a cheap-European-weekend-trip
> optimiser. The whole frontend lives in **`public/index.html`** (inline CSS +
> JS, organised in clearly-commented sections). Backend is a tiny static
> Express server in `server.js` — no AI proxy, no external content API.
> Search + city detail render entirely client-side from a curated dataset.
>
> Before changing anything, read **`HANDOVER.md`** in the repo root. It has
> the architecture, the `MV.*` modules with their public APIs, the honesty
> rules (no fake hotels, prices are estimates shown as ranges, never say
> "live" unless it is), the budget system + transport intelligence, and
> the parameter-persistence system that flows form values through every
> partner deep-link.
>
> Two memory rules from prior sessions:
>  1. **Auto-commit + push to main** after every task. Vercel auto-deploys.
>     Don't ask "soll ich pushen?" — just do it.
>  2. **No big-bang refactors of the inline script.** It has ~100 DOM-coupled
>     functions wired via inline `onclick` handlers. A single-shot module
>     split broke the site once. Ship incremental, verified changes.
>
> Latest commit: `git log -1`. Recent work: `git log --oneline -40`.

---

## Brand & Core Promise

Maison Voyage is a **cheap-European-weekend-trip optimiser**. Target user
is young / friends / couples on a real budget. Every UI decision reinforces
"find the cheapest beautiful weekend" — not luxury aesthetics.

What the site shows today:
- **67 destinations** across 28 European countries (Tirana → Reykjavik)
- Interactive Leaflet **satellite map** — empty default, ambient hover-reveal
  surfaces ~3–10 nearby cities, click enters a single-city "scene mode"
- **Concierge** — desktop form / 4-step mobile wizard with a redesigned
  4-tier budget panel (Budget Escape / Smart Weekend / Premium Escape /
  Luxury Weekend) and a live transport+stay+activity+total breakdown.
  Search is 100% deterministic, client-side, no external API call.
- **Best Deals** section — top 4 cheapest from current origin, rotating,
  shows all-in per-person + the chosen transport mode with savings vs flight
- **City detail pages** — cinematic Wikipedia gallery hero, transparent
  cost breakdown (transport + accommodation budget + activity), activities,
  restaurants, weather, editor's guides — **NO hotels section** (removed)
- **Compare modal** — 2–4 cities side-by-side with live weather
- **Favourites** — saved trips in localStorage
- **Transport modes** — flight / FlixBus / train, cheapest-mode-wins with
  alternative chips, prices shown as RANGES (€30–€70) not exact numbers
- **Legal & Trust system** — cookie banner, Impressum, Privacy Policy,
  Trust Strip in footer (no affiliate disclosure today — no programs
  are active; bring it back when real affiliate IDs are wired)
- **Social-share-ready** — dynamic OG/Twitter meta + URL hash routing

---

## Honesty Rules (NON-NEGOTIABLE)

These are real product decisions, not stylistic preferences.

| Rule | Why |
|---|---|
| **NEVER say "live"** unless the data is actually fetched live. The only real-time sources today: Open-Meteo (weather) and Wikipedia REST API (images). | User said "nothing fake". |
| **Prices are estimates shown as ranges** (e.g. "€30–€70 flight · est") via `priceRangeTransport(n, mode)` for transport, `priceRange(n)` for general. Single exact numbers killed trust on click-through. | Real partner prices vary too much for "€49" to read as a promise. |
| **NO availability claims** like "4 left" or "Limited". `valueBadge(idx)` only marks index 0/1 as "Best value" / "Top pick" — labels on our internal sort, not user metrics. | Inventory data we don't have. |
| **NO hotel recommendations** at all. The "Where to stay" section is removed. We don't have a Booking Partner API and won't pretend to recommend specific properties. | "Fake hotel names destroy trust." |
| **Accommodation = budget estimate** via `cityEconomy[city]` blend `(h_min + h_mid) / 2`, biased toward cheapest realistic stays. Cost-breakdown shows nightly RANGE ("~€20–€60/night · hostel to mid-range · est"). | Honest budget signal without specific inventory. |
| **Activities use Wikipedia landmark images** when possible. Else placeholder. | Real and verifiable. |
| **Restaurants** use the 8-step priority chain in `pickRestaurantWiki`: own Wikipedia → must_order dish → atmosphere keyword (rooftop, market hall, brown café…) → cuisine descriptor (Catalan, Neapolitan, New Nordic…) → cityFoodCulture (Spaccanapoli, Naschmarkt…) → cuisine field dish → vibe/desc dish → country fallback. | Real and verifiable. |
| **Partner integration is "deep-link to"** — never "via" or "powered by". Affiliate IDs are placeholders today (`aid=304142`). | We don't pull inventory; we just open the partner site with pre-filled params. |
| **Per-image attribution chips are OFF.** Use `.section-attribution` on rotating heroes only. Trust Strip in footer covers global attribution. | Per-image chips flickered on rotation and cluttered grids. |
| **No AI in search or city detail.** Everything renders from curated `cityProfiles` + `cityEconomy` + `smartDestinations`. The cost-breakdown pill says "Estimates", not "AI-assisted". | No external content-generation API is called. |
| **No fake social proof.** No star ratings, no testimonials, no engagement counters, no fabricated avatars. | Removed in commit `feaf941` — entire `cg-trust` block + all hotel `rating:` data deleted. |

---

## Module Architecture — `MV.*` namespace

All client-side state and renderers attach to `window.MV`. Modules
defined inside the inline `<script>` block.

### `MV.cities` — canonical city data accessor

```js
MV.cities.get('Lisbon')      // → normalised city object — see SHAPE below
MV.cities.all()              // → all 67 baseline + any overrides
MV.cities.override(name, p)  // merge partial override (future Hotelbeds /
                             // Skyscanner real-time data). Pass null to remove.
```

**Shape returned by `get()`** (current as of trust-cleanup commit):
```js
{
  name, country, vibe, tagline, tags,
  coords: [lat, lng],
  images: [{ slug, source }],                      // wikipedia by default
  activities: [{ name, category, vibe, description, price_per_person, duration }],
  restaurants: [{ name, cuisine, vibe, price_range, description, must_order }],
  guides: [{ title, category, summary, highlights }],
  prices: { Berlin: 89, ... },                     // origin → €cheapest
  flights: { Berlin: 2.5, ... },                   // origin → hours
  estimatedBudget: {
    flight_min, accommodation_per_night_min,
    activity_min, weekend_2night_min,
    currency: 'EUR'
  },
  source: { accommodation:'cityEconomy-research', images:'wikipedia',
            prices:'estimate', activities:'curated', ... }
}
```

**NOTE — `hotels: []` was REMOVED** from this shape. The platform
doesn't recommend specific properties without a Booking Partner API.
The `accommodation_per_night_min` derives from `cityEconomy[city].h_min`.

### `MV.transport` — flight / bus / train deep-link database

```js
MV.transport.getOptions(from, to)
  // → sorted [{mode:'flight'|'bus'|'train', provider, price, duration, source}]
MV.transport.cheapest(from, to)          // → cheapest option or null
MV.transport.override(from, to, mode, d) // future API plug-in
MV.transport.modeMeta                    // icons + labels per mode
MV.transport.busRoutes, .trainRoutes     // raw route DBs (read-only)
MV.transport.modes                       // ['flight', 'bus', 'train']
```

Internal `_normalizeRouteDb` at module init alphabetically sorts every
route key so narrative-ordered entries like `'Vienna↔Bratislava'` work
the same as `'Bratislava↔Vienna'`. **DO NOT** look up busRoutes /
trainRoutes directly with `[from, to].sort().join('↔')` — go through
`getOptions()` or `canBus()` / `canTrain()` (the validation helpers
now route through `getOptions` for normalisation).

50 FlixBus + 30 high-speed-train routes hand-curated. Realistic
averages (Zurich↔Milan €19 bus / €35 SBB, Berlin↔Prague €16 FlixBus,
Madrid↔Barcelona €35 AVE, London↔Paris €65 Eurostar). UI shows these
as RANGES via `priceRangeTransport(n, mode)` so exact numbers never
read as promises.

### `MV.favorites` — saved trips

```js
MV.favorites.list() / has(id) / add(id) / remove(id) / toggle(id)
MV.favorites.clear() / on(fn) → unsubscribe
MV.favorites._raw() / _markSynced(ts)    // future backend sync hooks
```

Storage: `localStorage['mv_favs_v1']`.

### `MV.compare` — comparison list

```js
MV.compare.list() / has(id) / canAdd() / size() / .MAX (=4)
MV.compare.add(id) / remove(id) / toggle(id) / clear() / on(fn)
```

Storage: `mv_compare_v1`. Capped at 4. Side-by-side modal with live
Open-Meteo weather per column.

### `MV.consent` — cookie/storage consent

```js
MV.consent.get() / .has('analytics'|'affiliate')
MV.consent.accept() / decline() / setPrefs(...)
MV.consent.reopen() / close() / isOpen()
```

Storage: `mv_consent_v1`. Banner auto-shows 700ms after first paint.

### `MV.legal` — reusable legal modal

```js
MV.legal.register(name, { title, sub, html })
MV.legal.open(name)        // 'impressum' | 'privacy' | 'affiliate' | 'cookies'
MV.legal.close() / has(name)
```

`cookies` route bypasses the modal and calls `MV.consent.reopen()`.

### `MV.seo` — dynamic title / OG meta / hash routing

```js
MV.seo.applyCity(name, { price, country, vibe, imageUrl })
MV.seo.restore() / .pushHashForCity(n) / .clearHash() / .parseHashCity()
MV.seo.cityImageSync(n)
```

`popstate` handler keeps browser back/forward in sync. Hash format:
`#/city/{name}`.

### `MV.i18n` — language scaffold

```js
MV.i18n.lang() / .setLang('en'|'de') / .supported()
```

English-only today. Stub for future translation layer.

---

## Core helpers (NOT under `MV.*` but central)

### `weekendEstimate(city, ctx)` — single source of truth for trip pricing

Every "from €X" surface routes through this. Coherent by construction:
`totalPP = transport.pp + stay.pp + activity.pp`.

```js
weekendEstimate('Lisbon', { origin: 'Berlin', adults: 2, nights: 2 })
// → {
//     city, origin, adults, nights, rooms,
//     transport: { mode, pp, provider, duration, source },
//     stay:      { total, pp, nightly, nightlyLow, nightlyMid },
//     activity:  { pp, source },
//     totalPP, tier
//   }
```

`stay.nightly = (h_min + h_mid) / 2` — budget-leaning blend (was just
`h_mid` until commit `b36c9e0`; over-estimated vs real Booking-cheapest
results). `stay.nightlyLow` + `stay.nightlyMid` expose the range so the
UI can show "~€20–€60/night".

### `transportSummary(from, to, ctx)` — multi-modal picker

```js
transportSummary('Berlin', 'Prague', ctx)
// → {
//     chosen:           { mode:'bus', price:16, duration:4.5, provider:'FlixBus' },
//     alternatives:     [{ mode, price, duration, provider, savesVsChosen }],
//     hasFlight, flight,
//     savingsVsFlight,  // chosen vs flight (positive = cheaper than flying)
//     isOverlandWin     // cheapest is bus/train, not flight
//   }
```

Used by the cost-breakdown's unified Transport row (chosen mode as
hero + alternative chips below) and the Best Deals card mode chip.

### `budgetTier(v)` + `BUDGET_TIERS`

Four-tier model on the budget slider (€100–1500 range):

| Tier | Cap | Cities at this budget (typical) |
|---|---|---|
| **Budget Escape** | €250 | Krakow, Sofia, Tirana, Belgrade, Riga, Sarajevo, Skopje |
| **Smart Weekend** | €450 | Lisbon, Porto, Athens, Naples, Valencia, Granada |
| **Premium Escape** | €800 | Barcelona, Rome, Vienna, Madrid, Berlin, Florence |
| **Luxury Weekend** | >€800 | Reykjavik, Zurich, Santorini, Mykonos, Amalfi, Monaco |

`budgetBreakdown(v, ctx)` computes typical transport / stay / activity
across all in-budget destinations → drives the live breakdown pill row
on the slider. `countDestinationsInRange(v, ctx)` returns
`{count, total, samples}` for the sub-line counter.

### Partner URL builders

```js
buildSkyscannerUrl(origin, dest, ctx)
// → { url, valid, label, note }
// Three-tier fallback:
//   1. Both IATAs + dates → /transport/flights/{from}/{to}/{depart}/{return}/
//   2. Dest IATA only    → /transport/flights-to/{iata}/ with date params
//   3. Neither           → Google Flights free-text URL

buildFlixBusUrl(origin, dest, ctx)
// → { url, valid, label, note }
// Confidence-tiered:
//   • canBus true:  /search?fromCity=X&toCity=Y&rideDate=...&returnDate=...&adult=N
//   • canBus false: /bus-routes/{dest-slug} (city listing)
//   • no dest:      homepage
```

Comprehensive `cityAirports` map covers every one of 67 destinations
+ 19 common origins with real IATAs. Cities without their own airport
(Cannes, Monaco, Annecy, Amalfi, Lake Como, Hallstatt, Interlaken,
Lucerne, Albufeira, Benidorm) map to nearest airport via `via` +
`viaCity` flag so the UI can show "Closest airport · Nice" etc.

### `partnerLinks(city, ctx)` — public API

Returns `{ skyscanner, booking, bookingHotel, getyourguide,
getyourguideAct, googleFlights, flixbus, trainline, skyscannerInfo,
flixbusInfo, canFly, canBus, canTrain, dates, ctx }`. Every URL
includes the user's exact dates / adults / rooms and is sorted
ASCENDING by price wherever the partner supports it.

### `getSearchContext()` — form-state reader

Returns `{ origin, adults, rooms, nights, dates, budgetPP, whenStr,
groupStr }`. **Every partner link depends on this.** Field names are
a contract.

```js
{
  origin: 'Zurich',
  adults: 5,                         // parsed from i-group dropdown
  rooms: 3,                          // auto: ceil(adults/2)
  nights: 3,                         // parsed from i-length dropdown
  dates: {
    checkin: '2026-05-29',
    checkout: '2026-06-01',
    checkinCompact: '260529',        // Skyscanner /YYMMDD/ paths
    checkoutCompact: '260601',
    checkinShort: 'Fri 29 May',
    checkoutShort: 'Mon 1 Jun',
    nights: 3
  },
  budgetPP: 600                      // €/person
}
```

---

## Map experience — three-state hierarchy

The map sits in three states (commit `144a1a3` for the latest refinement):

```
idle  ←→  ambient        (mouse enter / leave map)
idle  → scene            (click anything that opens a city)
ambient → scene          (click an ambient chip)
scene → idle             (Overview button)
```

### IDLE
Default. Empty satellite canvas. Only the home anchor (departure
city) + bottom hint pill: "Hover anywhere to discover · click to enter".

### AMBIENT
Cursor drifts over the map → up to N cities physically nearest to the
cursor fade in as glass chips. Pool is **all of `smartDestinations`**
(NOT the ranked-from-origin slice — that hid ~75% of cities). Zoom-
adaptive params:

| Zoom | Radius | Max | Filter |
|---|---|---|---|
| ≤ 4.5 (continent) | 220px | 3 | popular-only (25-city set) |
| ≤ 6.0 | 280px | 5 | all |
| ≤ 7.5 | 340px | 7 | all |
| > 7.5 (region) | 420px | 10 | all |

`_POPULAR_CITIES` set at low zoom: Paris/London/Rome/Barcelona/
Amsterdam/Berlin/Madrid/Vienna/Prague/Lisbon/Munich/Athens/Budapest/
Florence/Milan/Venice/Copenhagen/Dublin/Stockholm/Brussels/Reykjavik/
Krakow/Naples/Porto/Nice. Fallback: if zero in radius, show 2 nearest
unfiltered. rAF-coalesced.

### CITY SCENE
Triggered by explicit click (sidebar / rail / deal card / ambient
chip / hash share / detail page open). `enterCityScene(name)`:
1. `flyTo(coords, zoom 8.5, duration 1.4s)` — tiles auto-blur via
   the host's `.map-blurring` class
2. `moveend` → stagger-add markers with `@keyframes lfSceneIn`:
   - `t=0`: Hero pin (large gold-ring chip with city name + vibe)
   - `t=200ms`: 🍴 Where to eat satellite (small offset NW)
   - `t=360ms`: 🎟 Things to do satellite (small offset E)
3. Hint switches to "Now exploring {city}" + ← Overview button.

**Stays satellite was REMOVED** (commit `6fee888`) — we don't
recommend specific hotels so the map shouldn't tease a category we
don't surface.

---

## File map

### `public/index.html` (~15,500 lines)

**HTML body — top-to-bottom:**
- Nav + fullscreen mobile menu (7 items, no Villas)
- **Hero** — 5 rotating Wikipedia slides + `.section-attribution`
- **Concierge form** with redesigned **bp-panel** (4-tier budget
  + live breakdown pills) / **Step wizard** target for mobile
- **Best Deals section** — top 4 cheapest from current origin, all-in
  per-person + transport-mode chip with savings vs flight, rotates 9s
- **Manifesto** — "Why we built this" + live cheapest-weekend stat
- **Smart map section** — Leaflet satellite, sidebar with ranked
  cities, ambient/scene reveal layers
- 3 collection rails (Weekends, Hidden, Beaches) — Villas removed
- **Editorial grid** — 6 cinematic city tiles
- Stories — 3 long-form journal articles
- CTA band
- **Footer** — brand + 5 columns (Discover, Experience, Legal & Trust,
  Newsletter) + **Trust Strip** + copyright + legal bottom-strip
- **Modals**: results drawer, **city detail page** (no hotels
  section), story reader, **step wizard**, **legal modal**,
  **compare modal**, **cookie banner**, sticky-bottom-CTA,
  **compare tray**. (API-key modal + loading veil removed when AI
  was deprecated.)

**CSS sections (in `<style>`, in order):**
- `:root` design tokens — `--muted-2: #6E665C` (WCAG AA), `--accent-2:
  #B8945E` (decorative only, not for body text)
- Reset + typography
- Nav, full-menu, hero (scrim strengthened, text-shadow safety nets)
- Manifesto, editorial grid, rails (Villa-specific CSS gone)
- City detail (`.detail-hero`, `.cost-breakdown`, `.cb-row`,
  `.cb-alt-row`, `.cb-alt-chip`, listings, guides)
- **Best Deals** (`.deals`, `.deal-card`) — stronger top scrim
- **Compare modal** (`.compare-modal`, `.cm-*`)
- **Favourites + compare buttons**
- **Compare tray**
- **Mobile step wizard** + **sw-budget-mini** (compact breakdown)
- **Sticky mobile CTA**
- Story reader
- Modal + loading + results drawer
- Glass utilities (`.glass-card`, `.has-placeholder`)
- Map (Leaflet customisation, `.lf-pin`, `.lf-pop`, `.lf-scene-hero`,
  `.lf-scene-chip`, `.lf-ambient`, `.map-hint`)
- **Price-tag badge system** (`.price-tag.est`)
- **Section attribution** (stronger bg + 85% opacity)
- **Cookie banner**, **Legal modal shell**, **Trust strip**
- **External link affordance**
- Section frosted veils, motion, responsive
- **bp-panel + bp-breakdown + bp-tier-tag** (4-tier slider)
- **Performance block at bottom**: `content-visibility: auto`,
  mobile blur reduction, `prefers-reduced-motion`, `will-change`

**JS sections (in `<script>`, top-to-bottom):**
- `DATA` — `collections` (3 rails), `smartDestinations` (67 cities ×
  prices/flights per origin), `cityCoords`, `cityGallery`,
  **`cityEconomy`** (70 entries, drives all accommodation budgets),
  `knownCities` (autocomplete)
- `IMAGE SYSTEM` — Wikipedia REST API + `hydrateWikiImages`,
  `attractionWikiMap`, **`restaurantWikiMap`** (170+ entries),
  `dishKeywordWiki`, **`cuisineWikiMap`** (65 cuisines),
  `atmosphereKeywords` (58 keywords)
- **`pickRestaurantWiki(r, city)`** — 8-step priority chain
- `WEATHER` — Open-Meteo fetch + render
- **`SEARCH CONTEXT`** — `getSearchContext()` reads the form
- **`PARTNER LINKS`** — `buildSkyscannerUrl`, `buildFlixBusUrl`,
  `partnerLinks(city, ctx)` — full param-pass, validated URLs
- `cityAirports` — comprehensive IATA map for every destination
- `valueBadge` — "Best value" / "Top pick" on indexes 0/1
- `MV.cities` — canonical structured city accessor (no hotels)
- `MV.transport` — flight/bus/train, normalized route DBs
- **`weekendEstimate(city, ctx)`** — single source of truth
- **`transportSummary(from, to, ctx)`** — multi-modal picker
- **`BUDGET_TIERS` + `budgetTier` + `budgetBreakdown` +
  `countDestinationsInRange`** — 4-tier model + live breakdown
- **`priceRangeTransport(n, mode)`** — wider mode-specific ranges
- `MV.favorites` + `MV.compare`
- `MV.consent`, `MV.legal`, `MV.i18n`, `MV.seo`
- **Legal content registration**
- **External link marker** (`markExternalLinks` + MutationObserver)
- `MAP` — Leaflet lazy init (satellite-only, smooth wheel zoom)
- **City Scene mode** — `enterCityScene`, `exitCityScene`,
  `_buildSceneHero`, `_addSceneChip` (only eats + activities)
- **Ambient hover-reveal** — `_updateAmbientReveal`,
  `_ambientParamsForZoom`, `_POPULAR_CITIES`, fallback to 2-nearest
- **Map hint pill** — idle / ambient / scene / transitioning modes
- `CONCIERGE` — form, slider, autocomplete with typo tolerance,
  **deterministic search**: `synthesizeInstantTrips` renders <50ms
  from `smartDestinations` + `cityProfiles` + `weekendEstimate`.
  No AI, no network.
- `RAILS` — collection rendering (Villas array gone)
- **`BEST DEALS`** — `computeBestDeals`, `renderBestDeals` (rotates 9s)
- `CITY DETAIL` — `openTripDetail`, `populateCityListings`
  (activities + restaurants + guides only, NO hotels), renderers
- `STORIES` — editorial reading content + reader modal
- `STEP WIZARD` — 4-step mobile flow, sw-budget-mini compact breakdown
- `MOTION` — smooth scroll, parallax, magnetic, ambient orbs
- **Hash-routing init + popstate sync**
- **Single ESC keydown chain** — legal → compare → story → detail →
  results → key → stepWizard → consent → fullmenu

### Other files

- `public/robots.txt` — allow all, disallow `/api/*`
- `public/sitemap.xml` — 67 city URLs + homepage
- `server.js` — tiny static Express server (serves `public/` + `/api/health`)
- `.claude/launch.json` — preview tool config (`node server.js` on :3000)

---

## Live data sources (the only real-time ones)

| Source | Powers | Auth |
|---|---|---|
| **Wikipedia REST API** | City heroes, landmarks, dishes, restaurants — all verified | None |
| **Open-Meteo** | Live weather per city + 4-day forecast | None |
| **Esri World Imagery + Carto** | Map tiles | None |

Partner-search URLs (Skyscanner / Booking / GetYourGuide / FlixBus /
Trainline) are **deep-links** — they open the real partner site with
user's exact dates/adults/budget pre-filled and sorted cheapest first.
We don't show their data inline.

---

## Search flow — deterministic, no AI

Search is 100% client-side, no external API call.

`synthesizeInstantTrips({ from, adults, nights, budgetPP, vibes })`
picks 5 best matches from `smartDestinations`:
- `weekendEstimate(city, ctx).totalPP` filter (1.15× budget tolerance)
- vibeTag overlap score (×28 weighting)
- short flights slightly favoured (×6)
- tier bonus (budget −22, luxury +18)

Renders the drawer immediately with curated copy from `cityProfiles`
(activities, restaurants, guides) — or economy-aware generated copy
from `cityEconomy` for cities without an explicit profile. Total time
to render: <50ms.

The previous two-stage flow (instant synth → AI enrichment) was
removed in the AI-removal pass: AI added no data the user couldn't
already trust (pricing was always ours), only text polish on top of
already-rendered cards. Removing the AI layer simplifies the data
model and makes the platform's claim of "no fake data, no
fabricated content" verifiable by inspection.

---

## Things to NEVER touch without asking

- **`getSearchContext()`** field names — every partner link depends on it.
- **`weekendEstimate()` shape** — published API. transport/stay/activity
  fields are a contract. Breaking them breaks every cost surface.
- **`MV.cities.get()` shape** — published API (hotels field already
  removed in `feaf941`).
- **`MV.transport` route DB keys** — _normalizeRouteDb handles narrative
  ordering but the renames could still surprise callers.
- **`cityEconomy`** — 70 entries with research-informed h_min/h_mid/
  h_max/a_min/a_mid/a_max/m_lunch/m_dinner. Every accommodation +
  activity estimate routes through this.
- **`pickRestaurantWiki` 8-step chain** — engineered for honesty.
- **`pickActivityWiki`** — 130+ landmark→Wikipedia mappings.
- **`cityAirports` map** — 67 destinations + 19 origins, every IATA
  hand-verified. `via` + `viaCity` for cities without airports.
- **The inline `<script>` block** — ~100 DOM-coupled functions. Edit
  in-place; relocate one function per commit if needed. No big-bang.
- **`valueBadge(idx)` semantics** — "Best value"/"Top pick" are
  editorial labels on our internal sort, NOT review-derived. Don't
  reintroduce a real rating system without real review data.
- **No hotel reintroductions without real partner data.** If the user
  asks for a hotels feature back, require Hotelbeds/Booking Partner
  API connection first. Don't fabricate.
- **No AI reintroductions in search or city detail.** Search and the
  city-detail page render entirely from `smartDestinations` /
  `cityProfiles` / `cityEconomy`. If a future task asks for AI text
  polish, it must be opt-in, additive, render AFTER the deterministic
  baseline is on screen, and never affect pricing or recommendations.

---

## Pending placeholders (operator must fill before public launch)

Impressum operator data is filled in (Peter Vitus Richter, Usterstrasse
141, 8620 Wetzikon ZH, peter.richter2007@gmail.com, +41 77 500 05 47).
Privacy + Impressum "Last updated" set to 2026-05-28. Footer `Contact`
+ fullscreen-menu email updated to the real address.

Still pending operator changes:
- `aid=304142` Booking affiliate placeholder → real ID when approved
  (only the URL parameter — no user-facing claim of an active affiliate
  program; see Privacy Policy "no affiliate programs are currently
  active")
- `weekendr.vercel.app` in `robots.txt` + `sitemap.xml` → custom domain

---

## Roadmap

| Status | Task |
|---|---|
| Pending — depends on access | **Booking Affiliate ID** approval. Replace `aid=304142` everywhere. |
| **Re-introduce hotels** only when **Hotelbeds API** or **Booking Partner API** lands. Currently the platform deliberately doesn't recommend specific properties — bring back the hotel section + `cityProfiles[*].hotels` only with real inventory. Add `/api/hotels?city=X` route, call `MV.cities.override(city, {hotels: ..., source:{hotels:'hotelbeds'}})`. |
| Pending — bigger | **GetYourGuide Partner API**: real activity inventory + booking. |
| Pending — bigger | **Skyscanner Travel API**: real flight prices via `MV.transport.override(...)`. |
| Pending — bigger | **FlixBus / Trainline affiliate**: real bus + train deep-links with attribution. |
| Optional | **User accounts + saved trips**: needs real backend. Sync schema for favorites + compare already DB-ready. |
| Optional | **Translations** (`de`, `fr`, `es`, `it`): plug into `MV.i18n.t(key)`. |
| Optional | **Server-side rendering per city** (`/city/Lisbon` real path): for SEO indexing. Today's hash routes work for shares but not for SERP. |

---

## Running it locally

```bash
git clone https://github.com/peterrichter2007-hash/weekendr.git
cd weekendr
npm install
npm start
# → http://localhost:3000/
```

No API keys needed — search and city detail render entirely from the
curated dataset. The Express server just serves `public/` and a
`/api/health` ping for Vercel.

---

## Stable identifiers — search these when lost

| Looking for | grep |
|---|---|
| Search context reader | `function getSearchContext` |
| Partner URL builders | `function buildSkyscannerUrl`, `function buildFlixBusUrl`, `function partnerLinks` |
| Cost breakdown card | `cost-breakdown glass-card` |
| Unified transport row | `UNIFIED TRANSPORT SECTION` |
| Mobile step wizard | `step-wizard` |
| Hero CTA | `btn-primary-hero` |
| Budget panel | `bp-panel`, `bp-breakdown`, `BUDGET_TIERS` |
| City data (curated) | `const cityProfiles` (NO hotels arrays inside) |
| City economy (price tiers) | `const cityEconomy` |
| Smart destinations | `const smartDestinations` |
| City airports | `const cityAirports` |
| City Wikipedia slugs | `const cityGallery` |
| City food culture | `const cityFoodCulture` |
| Wikipedia attractions | `const attractionWikiMap` |
| Restaurant Wikipedia | `const restaurantWikiMap` |
| Cuisine descriptors | `const cuisineWikiMap` |
| Atmosphere keywords | `const atmosphereKeywords` |
| Dish keywords | `const dishKeywordWiki` |
| Price helpers | `function priceRange`, `function priceFromRange`, `function priceRangeTransport`, `function getEconomy` |
| Trip pricing core | `function weekendEstimate`, `function transportSummary` |
| Budget breakdown | `function budgetBreakdown`, `function budgetTier`, `function countDestinationsInRange` |
| Instant search synthesis | `function synthesizeInstantTrips` |
| Best deals renderer | `function renderBestDeals`, `function computeBestDeals` |
| Map scene mode | `function enterCityScene`, `function exitCityScene`, `function _addSceneChip` |
| Ambient reveal | `function _updateAmbientReveal`, `_ambientParamsForZoom`, `_POPULAR_CITIES` |
| Transport options | `MV.transport.getOptions`, `canFly`, `canBus`, `canTrain` |
| Legal modal | `MV.legal.register` |
| Cookie banner | `MV.consent = (function` |
| SEO + hash routing | `MV.seo = (function` |
| External link marker | `function markExternalLinks` |

---

## Commit hygiene

We commit + push directly to `main` so Vercel auto-deploys. Pattern:

```bash
git add public/index.html
git commit -m "feat: short summary

Longer body explaining what + why.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push origin HEAD:main
```

**Two memory rules from prior sessions** (saved in `~/.claude/.../memory/`):

1. **Auto-commit + push** at end of every task. Don't ask permission.
   Vercel auto-deploys; the user expects the live site to update.

2. **No big-bang refactors of inline script.** Even careful module
   splits broke the site once. Edit in-place; if a refactor is needed,
   ship one function at a time and verify on Vercel between commits.

---

## Recent session highlights (latest work, chronological — mid-2026)

**AI-removal pass** (latest, three staged commits):
- **Search-AI enrichment removed.** `_mergeAiIntoTrips`, `_tripCache*`,
  `parseTrips`, `resetBtn`, `loadingMessages`, and the entire Stage-2
  AI block in `generate()` are gone. Search renders entirely from
  `synthesizeInstantTrips()` — deterministic ranking over
  `smartDestinations`, no network call.
- **City-detail AI removed.** `fetchCityData`, `cityCacheKey`, and the
  AI-enhance block in `populateCityListings()` deleted. Detail page
  renders from `cityProfiles` + `cityEconomy`. Cost-breakdown pill
  changed from "AI-assisted · estimates" to just "Estimates".
- **Server + modal + branding cleanup.** `/api/generate-trips`
  endpoint removed from `server.js` (now just static + `/api/health`).
  API-key modal HTML + `KEY_STORAGE` / `getKey` / `openKey` / `closeKey`
  / `saveKey` JS deleted. Loading veil HTML deleted. "AI Concierge"
  renamed to "Concierge" in nav + footer. Privacy Policy lost its
  `mv_api_key` entry + "External APIs for content generation" section.
  README + HANDOVER + package.json description updated. Anthropic
  removed from the live-data-sources table — only Wikipedia,
  Open-Meteo, Esri, Carto remain.

Old session highlights (the trust + pricing refactor that preceded
the AI-removal pass):

- **Realistic price engine** — `weekendEstimate(city, ctx)` as the
  single source of truth. Coherent total = transport + stay + activity,
  all per-person.
- **Smart Skyscanner + FlixBus** — comprehensive `cityAirports`, layered
  fallback chain in `buildSkyscannerUrl`, FlixBus URL became full-param
  search when route confirmed (`canBus`), city-listing fallback otherwise.
- **Cinematic restaurant imagery** — `cityFoodCulture` (70 cities × 2–5
  atmospheric slugs), 58 atmosphere keywords, 65 cuisine descriptors,
  170+ famous-restaurant Wikipedia map entries, 8-step priority chain.
- **Smart multi-modal transport** — `transportSummary()` exposes chosen
  + alternatives, cost-breakdown row labelled by actual mode (bus/train
  win surfaces visibly). **Route-key normalisation bug** fixed at
  module init (was hiding ~30 of ~80 routes).
- **Villa collection removed** — pulled the homepage off the cheap-
  weekend identity.
- **On-demand city scene** — map default is empty + home anchor only.
  Click any city → scene mode (hero + 2 satellite chips at small
  geographic offsets). Stays chip later removed too.
- **Ambient hover-reveal** — drift cursor over map, ~3–10 nearby cities
  fade in. Pool is ALL `smartDestinations` (was top-22 ranked; broke
  for non-major origins). Zoom-adaptive radius + max-count. Safety
  fallback to 2-nearest if zero in radius.
- **Instant-first search** — synthesise 5 results from `smartDestinations`
  in <200ms, AI enriches in background, 30min cache. Search felt
  broken before (8–25s veil); now feels almost instant.
- **CSS perf pass** — `content-visibility: auto` on below-fold,
  mobile blur reduction (48px → 18px), reduced-motion guards.
- **Contrast audit** — hero scrim strengthened, `--muted-2` darkened to
  WCAG AA, text-shadow safety nets on display type, mobile label floor.
- **Hotels REMOVED platform-wide** — "Where to stay" section gone,
  `renderHotels` deleted, `genericHotels` + `fallbackHotels` deleted,
  AI prompt no longer requests hotel JSON, Stays satellite chip gone
  from city scene. Booking budget = `cityEconomy[city].h_min/h_mid`
  blend, displayed as range.
- **Redesigned budget slider** — 4 tiers (Budget/Smart/Premium/Luxury
  Escape), live breakdown panel below the track showing transport /
  stay / activity / total cells. Mobile step-wizard parallel compact
  row.
- **Map destination discovery fix** — `rankedDestinations(origin)`
  filter was hiding ~75% of cities for non-metropolis origins (Sofia
  user saw zero ambient markers). Pool switched to all destinations.
- **Transport prices as RANGES** — `priceRangeTransport(n, mode)` with
  mode-specific spreads (flight ±40%, bus ±30%, train ±22%).
- **FlixBus full-param URLs** — when `canBus`: full search URL with
  fromCity / toCity / rideDate / returnDate / adult. canBus/canTrain
  routed through `getOptions` for normalised lookup.
- **All fake reviews + invented social proof REMOVED** — `cg-trust`
  block (fake star rating + fake trip-count + gradient avatars) gone,
  `cityProfiles[*].hotels` arrays with `rating: 9.0` style fake scores
  deleted (33 arrays, 64KB).

Earlier highlights (prior to this session):

- TASK 6 — `MV.cities` canonical structured shape (composes the four
  curated data sources for AI / affiliate overlays)
- TASK 7 — `MV.favorites` + `MV.compare` (retention layer, DB-ready
  storage shape, side-by-side comparison modal with live weather)
- **Destination expansion** — 17 → 67 cities
- **Search system upgrade** — Levenshtein typo tolerance, popularity
  scoring, country-match, mobile UX
- **Best Deals section** — top 4 cheapest from origin, rotates every 9s
- **Legal/Trust system (12 commits)** — Cookie banner, legal modal,
  Impressum (CH), Privacy, Affiliate Disclosure, AI Disclosure on
  detail pages, Trust Strip, external link icons, section-level
  Wikipedia attribution
- **SEO + Social Sharing (4 commits)** — OG/Twitter meta + dynamic
  city titles + URL hash routing, robots.txt + sitemap.xml, i18n
  scaffold for future `de` / `fr` support
