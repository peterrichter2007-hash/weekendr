# Maison Voyage — Cheap, Beautiful Weekends in Europe

A premium travel-discovery platform for cheap European weekend trips. The whole frontend is a single self-contained HTML file (`public/index.html`); the backend is a tiny static server.

> **Live data sources**: Wikipedia REST API (city + landmark imagery), Open-Meteo (weather), Esri / Carto (map tiles). Skyscanner / Booking.com / FlixBus / GetYourGuide are linked out to via deep-link search URLs only. No affiliate programs are active today.

---

## Quick start

```bash
git clone https://github.com/peterrichter2007-hash/weekendr.git
cd weekendr
npm install
npm start
```

Then open <http://localhost:3000/>.

---

## What's in the box

```
weekendr/
├── public/
│   └── index.html      # The whole frontend — HTML + CSS + JS inline.
│                       # Organised in clearly-commented sections.
├── server.js           # Tiny static server (express + /api/health).
├── package.json        # Node deps (express, dotenv)
├── vercel.json         # Vercel deploy config
└── .env.example        # Local env reference (no secrets in repo)
```

### Why everything in one file
The frontend is a single, self-contained HTML file. It's deliberate: drag it into any browser, drop it into any AI for analysis, host it anywhere. No build step. The CSS is in one `<style>` block, the JS in one `<script>` block, each split into clearly-labelled sections.

### How the file is organised inside

See [HANDOVER.md](./HANDOVER.md) for the full architecture overview — modules (`MV.*`), core helpers (`weekendEstimate`, `transportSummary`, `partnerLinks`, `getSearchContext`), map state machine, budget tiers, file map. That document is the canonical reference; this README is the short version.

---

## How search works

Search is **fully deterministic and client-side**. There is no external API call in the search flow.

1. The user fills out the concierge form (origin, dates, group, budget, vibes).
2. `synthesizeInstantTrips()` filters and ranks `smartDestinations` (67 European cities) by:
   - `weekendEstimate(city, ctx).totalPP` must fit budget (with a small tolerance)
   - vibe-tag overlap with the selected vibes (heavily weighted)
   - shorter flights slightly favoured
   - budget tier preferred over luxury (brand promise)
3. Top 5 results render in the drawer in <50ms.

No prompt, no waiting, no network call.

---

## How city detail works

Same principle. When the user opens a city:

- `cityProfiles[city]` provides curated activities, restaurants and guides (with Wikipedia-verified images).
- For cities without an explicit profile, `fallbackActivities` / `fallbackRestaurants` / `fallbackGuides` generate economy-aware copy from `cityEconomy[city]` (research-informed price tiers per city).
- Prices are shown as ranges via `priceRange()` / `priceRangeTransport()`.
- Partner search links (Skyscanner / Booking / FlixBus / GetYourGuide) open in a new tab with the user's exact dates and adults pre-filled.

No external content-generation API is called.

---

## Deployment

Configured for Vercel via `vercel.json`. Push to `main` and Vercel rebuilds. The static server runs as a serverless function.

```bash
git push origin main
```

---

## Live data sources

| Source | What it powers | Auth |
|---|---|---|
| **Wikipedia REST API** | Every city / landmark / dish photo (verified) | None |
| **Open-Meteo** | Live weather + 4-day forecast per city | None |
| **Carto basemaps** | Map standard view (CARTO Voyager tiles) | None |
| **Esri World Imagery** | Map satellite view | None |
| **Skyscanner / Booking / GetYourGuide / FlixBus / Trainline** | Deep-link search URLs (real prices on the partner site) | None — no affiliate programs active today |

---

## Things that are intentional, not bugs

- **No hotel cards.** We don't have a Booking partner API, so we don't recommend specific properties. The cost-breakdown shows an honest accommodation budget range; clicking through opens Booking.com with the user's dates pre-filled.
- **All images come from Wikipedia.** If Wikipedia doesn't have an article, a typographic placeholder kicks in. No stock photos.
- **Prices are estimates shown as ranges.** Real partner inventory varies too much for a single number to read as a promise.
- **Smooth-scroll wheel inertia is enabled.** Trackpad scroll uses native behaviour; only mouse wheel is intercepted.
- **The map only wheel-zooms once you've clicked into it.** Stops the map hijacking the page scroll.

---

## Roadmap candidates

- **Real flight prices**: requires Skyscanner Travel API partner access. `MV.transport.override(...)` is the integration point.
- **Real hotel inventory**: requires Hotelbeds or Booking Partner API. `MV.cities.override(city, { hotels: [...] })` is the integration point.
- **Affiliate IDs**: Booking / Skyscanner / GetYourGuide / FlixBus approvals. No affiliate params are sent today; add the Booking `aid` param to `bookingURL()` once a real approved ID exists.
- **Authentication + saved trips**: needs a backend. Current storage is `localStorage` only.
- **Translations** (`de`, `fr`, `es`, `it`): plug into `MV.i18n.t(key)`.
- **Server-side rendering per city** (`/city/Lisbon` real path): for SEO indexing.

---

## License

Private project. All rights reserved.
