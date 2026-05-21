# Maison Voyage — Handover for a Fresh AI Session

**For: any new Claude / Cursor / Copilot session picking this up.**
**Goal: get productive in 90 seconds without reading the whole 15k-line file.**

---

## Briefing prompt — paste this into a fresh chat

> I'm continuing work on **Maison Voyage** — a cheap-European-weekend-trip
> optimiser. The whole frontend lives in **`public/index.html`** (~15,100 lines,
> inline CSS + JS, organised in clearly-commented sections). Backend is a
> tiny Express AI proxy in `server.js`.
>
> Before changing anything, read **`HANDOVER.md`** in the repo root. It has
> the architecture, the eight `MV.*` modules with their public APIs, the
> honesty rules (never say "live" unless it is, prices are estimates, no
> stock hotel photos), and the search-context parameter-persistence system.
>
> Two memory rules from prior sessions:
>  1. **Auto-commit + push to main** after every task. Vercel auto-deploys.
>     Don't ask "soll ich pushen?" — just do it.
>  2. **No big-bang refactors of the inline script.** It has ~100 DOM-coupled
>     functions wired via inline `onclick` handlers. A single-shot module
>     split broke the site once. Ship incremental, verified changes.
>
> Latest commit: `git log -1`. Recent work: `git log --oneline -30`.

---

## Brand & Core Promise

Maison Voyage is a **cheap-European-weekend-trip optimiser**. Target user
is young / friends / couples on a real budget. Every UI decision reinforces
"find the cheapest beautiful weekend" — not luxury aesthetics.

What the site shows today:
- **67 destinations** across 28 European countries (Tirana → Reykjavik)
- Interactive Leaflet **satellite map** with per-origin price ranking
- **AI Concierge** — 4-step mobile wizard + desktop form → ranked results
- **Best Deals** section — top 4 cheapest from current origin, rotating
- **City detail pages** — cinematic Wikipedia gallery hero, transparent
  cost breakdown (flight + stay + activity), hotels, activities,
  restaurants, weather, editor's guides
- **Compare modal** — 2-4 cities side-by-side with live weather
- **Favourites** — saved trips in localStorage
- **Transport modes** — flight / bus (FlixBus) / train, cheapest-first
- **Legal & Trust system** — cookie banner, Impressum, Privacy, Affiliate
  Disclosure, Trust Strip in footer
- **Social-share-ready** — dynamic OG/Twitter meta + URL hash routing

---

## Honesty Rules (NON-NEGOTIABLE)

These are real product decisions, not stylistic preferences. The user has
explicitly removed "fake live" language from this project. Do not regress.

| Rule | Why |
|---|---|
| **NEVER say "live"** unless the data is actually fetched live. The only real-time sources today: Open-Meteo (weather) and Wikipedia REST API (images). | User said "nothing fake". |
| **Prices are estimates**, labelled "approx" or "from €X". Show the **amber `.price-tag.est`** badge so it's visually obvious. | We don't have partner APIs yet. |
| **NO availability claims** like "4 left" or "Limited". The old hashed `availability()` heuristic is gone — replaced by `valueBadge(idx)` that only marks index 0/1 as "Best value"/"Top pick". | Those numbers were invented. |
| **Hotels show typographic placeholders**, NOT stock photos. Real hotel photos require a Booking Partner API we don't have. | Stock photos would imply the photo is the property. |
| **Activities use Wikipedia landmark images** when possible. Else placeholder. | We never substitute a wrong photo. |
| **Restaurants** use the priority chain in `pickRestaurantWiki`: own Wikipedia → must_order dish → cuisine → vibe → country fallback. | Real and verifiable. |
| **Partner integration is "deep-link to"** — never "via" or "powered by". We don't pull inventory; we just open the partner site with pre-filled params. | Affiliate IDs are placeholders today. |
| **Per-image attribution chips are OFF.** Use `.section-attribution` on rotating heroes only. Trust Strip in footer covers global attribution. | Per-image chips flickered on rotation and cluttered grids. |
| **AI-assisted content disclosed** on every detail page below the cost-breakdown. | Some hotel names + activity copy are AI-curated. |

---

## Module Architecture — `MV.*` namespace

All client-side state and renderers attach to `window.MV`. Eight modules
shipped in 2026, all defined inside the inline `<script>` block.

### `MV.cities` — canonical city data accessor (TASK 6)

```js
MV.cities.get('Lisbon')      // → normalised {name, country, vibe,
                             //    coords, images, hotels, activities,
                             //    restaurants, guides, prices, flights,
                             //    estimatedBudget, source}
MV.cities.all()              // → all 67 baseline + any overrides
MV.cities.override(name, p)  // merge partial override (future Hotelbeds /
                             // Skyscanner real-time data). Pass null to
                             // remove. Curated baseline is never mutated.
```

Composes the four curated sources (`cityGallery`, `smartDestinations`,
`cityCoords`, `cityProfiles`) on read. **Future-API injection point** —
when Hotelbeds / Skyscanner / GetYourGuide return real data, call
`MV.cities.override(...)` instead of editing baseline.

### `MV.transport` — flight / bus / train deep-link database (TASK ~ Best Deals)

```js
MV.transport.getOptions(from, to)
  // → sorted [{mode:'flight'|'bus'|'train', provider, price, duration, source}]
MV.transport.cheapest(from, to)          // → cheapest option or null
MV.transport.override(from, to, mode, d) // future API plug-in
MV.transport.modeMeta                    // icons + labels per mode
MV.transport.busRoutes, .trainRoutes     // raw route DBs (read-only)
MV.transport.modes                       // ['flight', 'bus', 'train']
```

~50 FlixBus routes + ~30 high-speed-train routes hand-curated with
realistic averages (Zurich↔Milan €19 bus, Madrid↔Barcelona €35 AVE,
London↔Paris €65 Eurostar, etc.). Route key is alphabetic-sorted so
each pair stored once. Cost-breakdown surfaces bus/train alternative
when it saves €20+ over flying.

### `MV.favorites` — saved trips (TASK 7)

```js
MV.favorites.list() / has(id) / add(id) / remove(id) / toggle(id)
MV.favorites.clear() / on(fn) → unsubscribe
MV.favorites._raw() / _markSynced(ts)    // future backend sync hooks
```

Storage: `localStorage['mv_favs_v1']`. Shape maps 1:1 to a future DB
row `(user_id, trip_id, added_at, source, synced_at)`. UI:
`[data-fav-toggle="<id>"]` buttons toggle via delegated click handler.

### `MV.compare` — comparison list (TASK 7)

```js
MV.compare.list() / has(id) / canAdd() / size() / .MAX (=4)
MV.compare.add(id) / remove(id) / toggle(id) / clear() / on(fn)
```

Same storage shape as favorites at `mv_compare_v1`. Capped at 4. UI:
floating "Compare tray" bottom-center + side-by-side modal with live
Open-Meteo weather per column. `[data-compare-toggle="<id>"]` buttons.

### `MV.consent` — cookie/storage consent (Legal step 1/12)

```js
MV.consent.get()           // → {decided, accepted, prefs, decidedAt}
MV.consent.has('analytics' | 'affiliate')
MV.consent.accept() / decline() / setPrefs({analytics, affiliate})
MV.consent.reopen()        // re-show banner (footer "Cookie Settings")
MV.consent.close()         // dismiss without persisting (ESC)
MV.consent.isOpen()        // bool
```

Storage: `localStorage['mv_consent_v1']`. Banner auto-shows once
700ms after first paint. "Essential storage" toggle is locked-on
(app can't run without localStorage). Analytics + affiliate are off
by default; **future tracking pixels MUST gate** on `.has('...')`.

### `MV.legal` — reusable legal modal (Legal step 3/12)

```js
MV.legal.register(name, { title, sub, html })
MV.legal.open(name)        // 'impressum' | 'privacy' | 'affiliate' | 'cookies'
MV.legal.close()
MV.legal.has(name)         // bool — is route registered
```

Single dark-glass modal with four routes. `cookies` route is special:
bypasses the modal and calls `MV.consent.reopen()` (single source of
truth). Delegated click handler picks up every `[data-legal]`
anchor/button. Content registered in separate blocks at end of inline
script — search for `MV.legal.register('impressum'` etc.

### `MV.seo` — dynamic title / OG meta / hash routing (SEO step 1/3)

```js
MV.seo.applyCity(name, { price, country, vibe, imageUrl })
  // → updates document.title, <meta name="description">, og:title,
  //   og:description, og:image, og:url, og:type='article',
  //   twitter:title, twitter:description, twitter:image,
  //   <link rel="canonical">
MV.seo.restore()           // restore homepage defaults
MV.seo.pushHashForCity(n)  // push #/city/Name without page reload
MV.seo.clearHash()         // remove the hash on detail close
MV.seo.parseHashCity()     // → 'Name' or null from current URL
MV.seo.cityImageSync(n)    // sync read from mv_wiki_v4_* cache
```

Stashes head defaults on init. `openTripDetail` calls `applyCity()` +
`pushHashForCity()`. `closeDetail` calls `restore()` + `clearHash()`.
A `popstate` handler keeps browser back/forward in sync with
detail open/close. URL hash format: `#/city/{name}` (URL-encoded).

### `MV.i18n` — language scaffold (SEO step 3/3)

```js
MV.i18n.lang()             // → 'en' (current default)
MV.i18n.setLang('en' | 'de')  // updates <html lang>, og:locale,
                              // persists to localStorage['mv_lang_v1']
MV.i18n.supported()        // → ['en', 'de']
```

Site ships English-only today. Stub exists so future translation
layer plugs into the same API — add string table + `MV.i18n.t(key)`,
no module-architecture refactor needed.

---

## File map

### `public/index.html` (~15,100 lines)

**HTML body — top-to-bottom:**
- Nav + fullscreen mobile menu
- **Hero** — 5 rotating Wikipedia slides + `.section-attribution` chip
- **AI Concierge form** (desktop) / **Step wizard** target (mobile)
- **Best Deals section** — top 4 cheapest from current origin (rotates
  every 9s through top 8 via `renderBestDeals`)
- **Manifesto** — "Why we built this" + live cheapest-weekend stat
- **Smart map section** — Leaflet satellite, sidebar with ranked cities
- 4 collection rails (Weekends, Villas, Hidden, Beaches)
- **Editorial grid** — 6 cinematic city tiles
- Stories — 3 long-form journal articles
- CTA band
- **Footer** — brand + 5 columns (Discover, Experience, Legal & Trust,
  Newsletter) + **Trust Strip** + copyright + legal bottom-strip
- **Modals**: API key, results drawer, **city detail page**, story reader,
  loading veil, **step wizard**, **legal modal**, **compare modal**,
  **cookie banner**, sticky-bottom-CTA, **compare tray**

**CSS sections (in `<style>`, in order):**
- `:root` design tokens
- Reset + typography
- Nav, full-menu, hero
- Manifesto, editorial grid, rails
- City detail (`.detail-hero`, `.cost-breakdown`, `.cb-row`, listings, guides)
- **Best Deals** (`.deals`, `.deal-card`)
- **Compare modal** (`.compare-modal`, `.cm-*`)
- **Favourites + compare buttons** (heart icon, compare pills)
- **Compare tray** (`.compare-tray`, `.ct-*`)
- **Mobile step wizard** (`.step-wizard`, `.sw-*`)
- **Sticky mobile CTA** (`.sticky-cta`)
- Story reader
- Modal + loading + results drawer
- Glass utilities (`.glass-card`, `.has-placeholder`)
- Map (Leaflet customisation, `.lf-pin`, `.lf-pop`)
- **Price-tag badge system** (`.price-tag.est` amber)
- **Section attribution** (`.section-attribution`)
- **Cookie banner** (`.cookie-banner`, `.cb-*`)
- **Legal modal shell** (`.legal-modal`, `.lm-*`)
- **Trust strip** (`.trust-strip`)
- **External link affordance** (`a[data-external]::after`)
- Section frosted veils, motion, responsive

**JS sections (in `<script>`, top-to-bottom):**
- `DATA` — `collections`, `smartDestinations` (67 cities × prices/flights
  per origin), `cityCoords`, `cityGallery`, **`cityEconomy`** (per-city
  realistic price tiers), `knownCities` (autocomplete with popularity)
- `IMAGE SYSTEM` — Wikipedia REST API + `hydrateWikiImages`,
  `attractionWikiMap`, `restaurantWikiMap`, `dishKeywordWiki`,
  `cityGallery`
- `WEATHER` — Open-Meteo fetch + render
- **`SEARCH CONTEXT`** — `getSearchContext()` reads the form, returns
  origin/adults/rooms/nights/dates/budgetPP
- **`PARTNER LINKS`** — `partnerLinks(city, ctx?)` returns deep-links
  with cheapest-first sort + budget filter on every URL
- `AVAILABILITY` — replaced by `valueBadge(idx)` (returns only
  "Best value" / "Top pick" or null)
- `MV.cities` — canonical structured city accessor
- `MV.transport` — flight/bus/train deep-link database
- `MV.favorites` + `MV.compare` — `_mvStoreFactory()` for both
- `MV.consent` — cookie banner state + DOM wiring
- `MV.legal` — legal modal shell + delegated click handler
- `MV.i18n` — language scaffold
- `MV.seo` — dynamic title / OG / hash routing
- **Legal content registration** — `MV.legal.register('impressum', …)`,
  `register('privacy', …)`, `register('affiliate', …)`
- **External link marker** — `markExternalLinks()` + MutationObserver
- `MAP` — Leaflet lazy init (satellite-only, smooth wheel zoom),
  markers, sidebar
- `CONCIERGE` — form, slider, autocomplete with typo tolerance, AI
  generation
- `RAILS` — collection rendering
- **`BEST DEALS`** — `renderBestDeals()` populates the rotating grid
- `CITY DETAIL` — `openTripDetail`, `populateCityListings`, renderers
- `STORIES` — editorial reading content + reader modal
- `STEP WIZARD` — 4-step mobile flow, swSyncFromForm / swSyncToForm
- `MOTION` — smooth scroll, parallax, magnetic, ambient orbs
- **Hash-routing init + popstate sync**
- **Single ESC keydown chain** — legal → compare → story → detail →
  results → key → stepWizard → consent → fullmenu

### Other files

- `public/robots.txt` — allow all, disallow `/api/*`
- `public/sitemap.xml` — 67 city URLs + homepage
- `server.js` — Express AI proxy for `/api/generate-trips`
- `.claude/launch.json` — preview tool config (runs `node server.js` on :3000)

---

## Live data sources (the only real-time ones)

| Source | Powers | Auth |
|---|---|---|
| **Anthropic Claude** | AI city pages + AI trip results | User's own API key (browser only — `mv_api_key` in localStorage) |
| **Wikipedia REST API** | City heroes, landmarks, dishes, restaurants — all verified | None |
| **Open-Meteo** | Live weather per city + 4-day forecast | None |
| **Esri World Imagery + Carto** | Map tiles | None |

Partner-search URLs (Skyscanner / Booking / GetYourGuide / FlixBus) are
**deep-links** — they open the real partner site with user's exact
dates/adults/budget pre-filled and sorted cheapest first. We don't show
their data inline.

---

## Parameter persistence (the core product feature)

Every Skyscanner / Booking / GetYourGuide / FlixBus URL uses
`getSearchContext()` which reads the live concierge form:

```js
{
  origin: 'Zurich',                  // IATA-resolved via partnerCodes.skyscannerOrigin
  adults: 5,                         // parsed from i-group dropdown
  rooms: 3,                          // auto: ceil(adults/2)
  nights: 3,                         // parsed from i-length dropdown
  dates: {                           // computed from i-when + nights
    checkin: '2026-05-29',
    checkout: '2026-06-01',
    checkinCompact: '260529',        // for Skyscanner /YYMMDD/ paths
    checkoutCompact: '260601',
    checkinShort: 'Fri 29 May',
    checkoutShort: 'Mon 1 Jun',
    nights: 3
  },
  budgetPP: 600                      // €/person, drives Booking price filter
}
```

Test it: open browser console → `getSearchContext()`. Then
`partnerLinks('Lisbon')` returns the four URLs.

---

## Cheapest-first filters per partner

| Partner | URL params |
|---|---|
| **Skyscanner** | `adultsv2={n}&sortby=price&cabinclass=economy` |
| **Booking** | `group_adults={n}&no_rooms={r}&order=price&nflt=price=EUR-0-{maxPerNight}-1` |
| **GetYourGuide** | `q={query}&date_from&date_to&sort=lowest_price` |
| **FlixBus** | `fromCity={origin}&toCity={destination}` |

The Booking `nflt` price filter is **derived from the user's budget**:
`maxPerNight = budgetPP * adults * 0.5 / nights`, clamped to €40–€500.

---

## Things to NEVER touch without asking

- **`getSearchContext()`** — every partner link depends on it. Don't
  change field names without updating every consumer.
- **`pickRestaurantWiki` priority chain** — built carefully for honesty.
- **`pickActivityWiki`** — 130+ landmark→Wikipedia mappings.
- **`cityProfiles`** — 16 original + 17 top-tier curated cities × ~25
  items each. Hand-curated content. The remaining 34 cities use the
  `cityEconomy`-driven `genericHotels/Activities/Restaurants` fallbacks.
- **`cityEconomy`** — 70 entries with research-informed price tiers
  (h_min/h_mid/h_max, a_min/a_mid/a_max, m_lunch, m_dinner). Cost-
  breakdown math relies on this — DON'T return to `cityName.length`
  pseudo-pricing.
- **`partnerLinks` URL structure** — tested.
- **`MV.cities` shape** — published API. Field names are a contract.
- **`MV.transport` route DBs** — adding routes is fine, renaming the
  modes ('flight' | 'bus' | 'train') breaks Best Deals + cost-breakdown.
- **`MV.legal` route names** — `impressum` / `privacy` / `affiliate` /
  `cookies` are referenced from every footer link.
- **`MV.consent` storage shape** — `mv_consent_v1` key, future tracking
  gates on `.has('analytics')` / `.has('affiliate')`.
- **`MV.seo` URL hash format** — `#/city/{name}` is in the sitemap.
- **Per-image attribution chips are deliberately OFF.** Attribution lives
  at: Trust Strip (footer global), `.section-attribution` (3 rotating
  heroes), Privacy/Impressum modals (long-form). Don't re-introduce.
- **The inline `<script>` block** — has ~100 DOM-coupled functions wired
  via inline `onclick` handlers. A single-shot module split broke the
  site once. Edit in-place; relocate one function per commit if needed.

---

## Pending placeholders (operator must fill before public launch)

Search the inline script for `<span class="placeholder">` — currently
**12 occurrences**, **7 unique values**:

| Field | Where | Action |
|---|---|---|
| `YOUR_FULL_NAME` | Impressum, operator card | Real legal name |
| `STREET_AND_NUMBER` | Impressum, operator card | Postal address |
| `POSTCODE` | Impressum, operator card | Swiss postcode |
| `CITY` | Impressum, operator card | Swiss city |
| `OPTIONAL_PHONE` | Impressum, operator card | Phone or leave blank |
| `YOUR_EMAIL` ×4 | Impressum (2×), Privacy, Affiliate | Contact email — replace all 4 with same |
| `YYYY-MM-DD` ×3 | All three legal pages — "Last updated" | Date of legal review |

Also pending operator changes:
- `hello@maisonvoyage.com` in footer `Contact` link → real email
- `aid=304142` Booking affiliate placeholder → real ID when approved
- `weekendr.vercel.app` in `robots.txt` + `sitemap.xml` → custom domain

---

## Roadmap

The user has affiliate-program plans in motion. When any of these land,
swap the corresponding section from deep-links to real API data.

| Status | Task |
|---|---|
| Pending — easy | **Booking Affiliate ID** approval. Replace `aid=304142` everywhere. ~30 min. |
| Pending — depends on access | **Hotelbeds API**: real hotel photos + prices. Add `/api/hotels?city=X` route. Call `MV.cities.override(city, {hotels: ..., source:{hotels:'hotelbeds'}})`. |
| Pending — bigger | **GetYourGuide Partner API**: real activity inventory + booking. |
| Pending — bigger | **Skyscanner Travel API**: real flight prices. Override flight row in cost-breakdown via `MV.transport.override(...)`. |
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

The Anthropic key is **never** in the repo or server. User pastes it in
the browser modal and it's stored in `localStorage['mv_api_key']`. The
Express proxy just forwards the key from the request body to Anthropic.

`.claude/launch.json` exists for Claude Code's preview tool — runs
`node server.js` on port 3000.

---

## Stable identifiers — search these when lost

| Looking for | grep |
|---|---|
| Search context reader | `function getSearchContext` |
| Partner URL builder | `function partnerLinks` |
| Cost breakdown card | `cost-breakdown glass-card` |
| Mobile step wizard | `step-wizard` |
| Sticky mobile CTA | `sticky-cta` |
| Hero CTA | `btn-primary-hero` |
| City data (curated) | `const cityProfiles` |
| City economy (price tiers) | `const cityEconomy` |
| Smart destinations | `const smartDestinations` |
| City Wikipedia slugs | `const cityGallery` |
| Wikipedia attractions | `const attractionWikiMap` |
| Restaurant Wikipedia | `const restaurantWikiMap` |
| Dish keywords | `const dishKeywordWiki` |
| Price helpers | `function priceRange`, `function priceFromRange`, `function getEconomy` |
| Value badge | `function valueBadge` |
| Best deals renderer | `function renderBestDeals` |
| Transport options | `MV.transport.getOptions` |
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
   splits broke the site once (TASK 8 was reverted). The inline script
   has ~100 DOM-coupled functions with inline `onclick` handlers — they
   depend on declaration order and global state. Edit in-place; if a
   refactor is needed, ship one function at a time and verify on Vercel
   between commits.

---

## Recent session highlights (mid-2026)

- **TASK 6** — `MV.cities` canonical structured shape (composes the four
  curated data sources for AI / affiliate overlays)
- **TASK 7** — `MV.favorites` + `MV.compare` (retention layer, DB-ready
  storage shape, side-by-side comparison modal with live weather)
- **Destination expansion** — 17 → 67 cities, 17 top-tier with full
  cityProfiles, 50 basic-tier with cityEconomy-driven fallbacks
- **Search system upgrade** — Levenshtein typo tolerance, popularity
  scoring, country-match, mobile UX
- **`cityEconomy`** — 70 per-city realistic price tiers; killed the
  `cityName.length * 7` pseudo-pricing
- **Best Deals section** — top 4 cheapest from origin, rotates every 9s
- **`MV.transport`** — FlixBus + train route DB, surfaces bus/train
  alternatives in cost-breakdown when €20+ cheaper than flying
- **Legal/Trust system (12 commits)** — Cookie banner, legal modal,
  Impressum (CH), Privacy, Affiliate Disclosure, AI Disclosure on
  detail pages, Trust Strip, external link icons, section-level
  Wikipedia attribution, ESC consolidation, honest newsletter state
- **SEO + Social Sharing (4 commits)** — OG/Twitter meta + dynamic
  city titles + URL hash routing, robots.txt + sitemap.xml, i18n
  scaffold for future `de` / `fr` support
