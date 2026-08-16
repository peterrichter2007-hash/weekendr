'use strict';
/**
 * Generates one real, indexable page per destination.
 *
 * The problem this solves: every path on the site returned the same
 * 875 KB homepage with a 200. City "pages" were hash routes, which
 * search engines do not index, so 64 cities of curated research sat
 * behind exactly one URL.
 *
 * Design rules, inherited from the rest of the project:
 *
 *  - No thin doorway pages. Each page carries real, city-specific
 *    content: what a weekend actually costs there, what to do, where
 *    to eat. If a city had nothing to say, it would be better to
 *    generate nothing than to generate filler.
 *  - Prices are RANGES and labelled as estimates. Never an exact
 *    figure, never a promise.
 *  - Cost shown is deliberately transport-free. A static page has no
 *    departure city, and inventing one would produce a number that is
 *    wrong for nearly every reader. Stay, food and activity come from
 *    the curated cityEconomy and are true regardless of origin; the
 *    interactive planner adds transport once the reader says where
 *    they fly from.
 *  - No absolute host anywhere. Same reason as the canonical: this
 *    repo shipped a hardcoded domain once and it pointed at somebody
 *    else's website.
 */

const fs = require('fs');
const path = require('path');
const { extract } = require('./extract-data');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'city');
const INDEX_FILE = path.join(ROOT, 'public', 'index.html');
const CACHE = path.join(__dirname, '.image-cache.json');

const WIKI_WIDTHS = [120, 250, 330, 500, 960, 1280, 1920, 3840];

/* ---------- helpers ---------- */

function stripDiacritics(s) {
  return String(s).normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ø/g, 'o').replace(/Ø/g, 'O')
    .replace(/æ/g, 'ae').replace(/Æ/g, 'AE')
    .replace(/å/g, 'a').replace(/Å/g, 'A')
    .replace(/ł/g, 'l').replace(/Ł/g, 'L')
    .replace(/ß/g, 'ss');
}

function slugify(name) {
  return stripDiacritics(name).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Round to a friendly step so ranges never look falsely precise. */
function round5(n) { return Math.round(n / 5) * 5; }

// Zero has to survive rounding. Every one of the 70 city economies sets
// a_min to 0 because free things to do exist everywhere, and an earlier
// Math.max(5, …) floor quietly turned that into "€5" — charging the
// reader for something the dataset says is free.
function money(n) { return round5(n) < 1 ? 'Free' : '€' + round5(n); }
function range(lo, hi) {
  const a = money(lo), b = money(hi);
  return a === b ? a : a + ' – ' + b;
}

/** Wikimedia only serves this fixed ladder; anything else is HTTP 400. */
function wikiSized(url, want) {
  if (!url || url.indexOf('upload.wikimedia.org') === -1) return url;
  let w = WIKI_WIDTHS.find(x => x >= want) || WIKI_WIDTHS[WIKI_WIDTHS.length - 1];
  const asThumb = url.match(/^(.*\/thumb\/.+?\/)\d+px-(.+)$/);
  if (asThumb) return asThumb[1] + w + 'px-' + asThumb[2];
  const asOriginal = url.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/[^/]+)\/([0-9a-f])\/([0-9a-f]{2})\/(.+)$/);
  if (!asOriginal) return url;
  const [, base, d1, d2, file] = asOriginal;
  const thumbName = /\.svg$/i.test(file) ? file + '.png' : file;
  return `${base}/thumb/${d1}/${d2}/${file}/${w}px-${thumbName}`;
}

/* ---------- Wikipedia lead images, fetched once and cached ---------- */

let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (e) { cache = {}; }
// Only successful lookups are ever cached. A first attempt at this
// fired 64 requests back to back, Wikipedia throttled a dozen of them,
// and caching those failures would have baked "this city has no photo"
// into the build permanently — Warsaw, Monaco and Bergen all have one.
Object.keys(cache).forEach(k => { if (!cache[k]) delete cache[k]; });

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Wikipedia's lead image for a place is sometimes its flag, arms or a
 * locator map rather than a photograph — Ibiza returned Ibiza_flag.svg
 * and Monaco Flag_of_Monaco.svg. As the hero of a travel page that is
 * worse than no image. Detected by filename so the next city with the
 * same problem is handled without another hardcoded exception.
 */
function looksLikeEmblem(url) {
  if (!url) return false;
  const file = decodeURIComponent(url.split('/').pop());
  return /flag|coat[_-]?of[_-]?arms|wappen|blason|escudo|bandera|\bseal\b|locator|location[_-]map|_map_|map[_-]of/i.test(file)
    || /\.svg(\.png)?$/i.test(file);
}

async function leadImage(slugName, attempt = 0) {
  if (cache[slugName]) return cache[slugName];
  const url = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(slugName);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      if (attempt < 3) { await sleep(800 * (attempt + 1)); return leadImage(slugName, attempt + 1); }
      return null;
    }
    const data = await res.json();
    let src = (data.originalimage && data.originalimage.source)
      || (data.thumbnail && data.thumbnail.source) || null;
    // Called from Node, the REST API appends utm_source/utm_campaign to
    // image URLs (it does not when called from a browser). Harmless but
    // noisy, and it would end up baked into 64 pages and every og:image.
    if (src) src = src.split('?')[0];
    if (src) cache[slugName] = src;
    return src;
  } catch (e) {
    if (attempt < 3) { await sleep(800 * (attempt + 1)); return leadImage(slugName, attempt + 1); }
    return null;
  }
}

/* ---------- what a weekend costs, from curated data ---------- */

function costModel(econ) {
  const nights = 2, adults = 2;
  // Shared room, budget-leaning blend — the same bias the app uses.
  const stay = [econ.h_min * nights / adults, econ.h_mid * nights / adults];
  const food = [(econ.m_lunch + econ.m_dinner) * nights * 0.8,
                (econ.m_lunch + econ.m_dinner) * nights * 1.2];
  const activity = [econ.a_min, econ.a_mid];

  // Sum the ROUNDED components, not the raw ones. Rounding each row to
  // the nearest 5 and the total separately produced a table whose own
  // figures did not add up — Lisbon read 20 + 50 + Free and then
  // claimed 75. The whole point of this project's pricing rules is
  // that the numbers on screen are coherent with each other.
  const r = n => round5(n);
  const total = [r(stay[0]) + r(food[0]) + r(activity[0]),
                 r(stay[1]) + r(food[1]) + r(activity[1])];

  return { stay, food, activity, total, nightly: [econ.h_min, econ.h_mid] };
}

/* ---------- page ---------- */

const CSS = `
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:#F6F5F2;color:#12110F;
font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
line-height:1.6;-webkit-font-smoothing:antialiased}
img{max-width:100%;display:block}
a{color:#7E6230}
.wrap{max-width:820px;margin:0 auto;padding:0 1.25rem}
.serif{font-family:Fraunces,Georgia,"Times New Roman",serif;font-weight:400;letter-spacing:-.02em}
header.top{border-bottom:1px solid rgba(18,17,15,.10);background:#F6F5F2}
header.top .wrap{display:flex;align-items:center;gap:.6rem;padding-top:1rem;padding-bottom:1rem}
.brand{font-family:Fraunces,Georgia,serif;font-size:1.05rem;text-decoration:none;color:#12110F}
.brand em{font-style:italic;color:#7E6230}
.hero{position:relative;isolation:isolate;background:#E4E2DB}
.hero img{width:100%;height:min(52vh,420px);object-fit:cover}
.hero .veil{position:absolute;inset:0;pointer-events:none;
background:linear-gradient(180deg,rgba(0,0,0,0) 26%,rgba(0,0,0,.82) 100%)}
.hero .cap{position:absolute;left:0;right:0;bottom:0;padding:1.5rem 0}
.hero .cap .wrap{color:#FFFFFE}
.eyebrow{font-size:.7rem;letter-spacing:.22em;text-transform:uppercase;opacity:.9;margin:0 0 .35rem;
text-shadow:0 1px 2px rgba(18,17,15,.75),0 0 10px rgba(18,17,15,.55)}
.hero h1{margin:0;font-size:clamp(2rem,7vw,3.2rem);color:#FFFFFE;
text-shadow:0 1px 2px rgba(18,17,15,.75),0 0 10px rgba(18,17,15,.55)}
.hero p.tag{margin:.5rem 0 0;max-width:34rem;
text-shadow:0 1px 2px rgba(18,17,15,.75),0 0 10px rgba(18,17,15,.55)}
section{padding:2.75rem 0}
h2{font-family:Fraunces,Georgia,serif;font-weight:400;letter-spacing:-.02em;
font-size:clamp(1.4rem,3.4vw,1.9rem);margin:0 0 .4rem}
.lede{color:#4A443C;margin:0 0 1.5rem}
.cost{border:1px solid rgba(18,17,15,.12);border-radius:16px;background:#fff;overflow:hidden}
.cost .row{display:flex;justify-content:space-between;gap:1rem;padding:.85rem 1.1rem;
border-bottom:1px solid rgba(18,17,15,.08)}
.cost .row:last-child{border-bottom:0;background:#FBFAF7;font-weight:600}
.cost .k{color:#4A443C}
.cost .k small{display:block;font-size:.72rem;color:#6E665C;letter-spacing:.02em}
.cost .v{white-space:nowrap;font-variant-numeric:tabular-nums}
.note{font-size:.8rem;color:#6E665C;margin:.75rem 0 0}
.cards{display:grid;gap:.75rem;grid-template-columns:1fr}
@media(min-width:620px){.cards{grid-template-columns:1fr 1fr}}
.card{border:1px solid rgba(18,17,15,.12);border-radius:14px;padding:1rem 1.1rem;background:#fff}
.card h3{margin:0 0 .3rem;font-size:1rem}
.card p{margin:0;font-size:.9rem;color:#4A443C}
.card .meta{margin-top:.5rem;font-size:.75rem;color:#6E665C;letter-spacing:.02em}
.cta{display:inline-block;margin-top:.4rem;background:#12110F;color:#FFFFFE;text-decoration:none;
padding:.85rem 1.4rem;border-radius:100px;font-size:.92rem}
.cta:focus-visible,a:focus-visible{outline:2px solid #7E6230;outline-offset:3px;border-radius:4px}
.others{display:flex;flex-wrap:wrap;gap:.45rem}
.others a{display:inline-block;border:1px solid rgba(18,17,15,.14);border-radius:100px;
padding:.4rem .8rem;font-size:.85rem;text-decoration:none;color:#12110F;background:#fff}
footer{border-top:1px solid rgba(18,17,15,.10);padding:2rem 0 3rem;color:#4A443C;font-size:.85rem}
footer a{color:#7E6230}
`.replace(/\n\s*/g, '\n').trim();

function activityCards(list) {
  return list.slice(0, 4).map(a => `
      <div class="card">
        <h3>${esc(a.name)}</h3>
        <p>${esc(a.description || '')}</p>
        <div class="meta">${esc([a.category, a.duration].filter(Boolean).join(' · '))}</div>
      </div>`).join('');
}

function restaurantCards(list) {
  return list.slice(0, 4).map(r => `
      <div class="card">
        <h3>${esc(r.name)}</h3>
        <p>${esc(r.description || '')}</p>
        <div class="meta">${esc([r.cuisine, r.price_range].filter(Boolean).join(' · '))}</div>
      </div>`).join('');
}

function buildPage(city, data, img, neighbours) {
  const { cityProfiles, cityEconomy } = data;
  const profile = cityProfiles[city.key];
  const econ = cityEconomy[city.key];
  const c = costModel(econ);
  const slug = slugify(city.key);

  const title = `${city.key} on a Budget — What a Weekend Really Costs | Maison Voyage`;
  const desc = `A weekend in ${city.key}, ${city.country} costs about `
    + `${range(c.total[0], c.total[1])} per person before transport — `
    + `${range(c.nightly[0], c.nightly[1])} a night to sleep, plus food and one thing worth doing. `
    + `Honest estimates, no fake prices.`;

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'TouristDestination',
    name: city.key,
    description: city.tagline || '',
    address: { '@type': 'PostalAddress', addressCountry: city.country }
  };
  if (img) ld.image = wikiSized(img, 1280);

  const acts = profile && profile.activities && profile.activities.length ? profile.activities : null;
  const rests = profile && profile.restaurants && profile.restaurants.length ? profile.restaurants : null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#F6F5F2" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Maison Voyage" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
${img ? `<meta property="og:image" content="${esc(wikiSized(img, 1280))}" />` : ''}
<meta name="twitter:card" content="summary_large_image" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;1,9..144,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>${CSS}</style>
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>

<header class="top">
  <div class="wrap"><a class="brand" href="/">Maison<em>Voyage</em></a></div>
</header>

<div class="hero">
  ${img
    ? `<img src="${esc(wikiSized(img, 1280))}" alt="${esc(city.key)}, ${esc(city.country)}" width="1280" height="720" />`
    : `<div style="height:min(52vh,420px)"></div>`}
  <div class="veil"></div>
  <div class="cap"><div class="wrap">
    <p class="eyebrow">${esc(city.country)}${city.vibe ? ' · ' + esc(city.vibe) : ''}</p>
    <h1 class="serif">${esc(city.key)}</h1>
    ${city.tagline ? `<p class="tag">${esc(city.tagline)}</p>` : ''}
  </div></div>
</div>

<main>
<section>
  <div class="wrap">
    <h2>What a weekend in ${esc(city.key)} costs</h2>
    <p class="lede">Two nights, two people sharing a room, before transport.
      These are researched estimates shown as ranges — never a quote.</p>
    <div class="cost">
      <div class="row"><span class="k">Somewhere to sleep<small>Room ${esc(range(c.nightly[0], c.nightly[1]))} a night, split two ways · hostel to mid-range</small></span><span class="v">${esc(range(c.stay[0], c.stay[1]))}</span></div>
      <div class="row"><span class="k">Eating<small>Lunch ~${esc(money(econ.m_lunch))} · dinner ~${esc(money(econ.m_dinner))}</small></span><span class="v">${esc(range(c.food[0], c.food[1]))}</span></div>
      <div class="row"><span class="k">One thing worth doing<small>Free options upward</small></span><span class="v">${esc(range(c.activity[0], c.activity[1]))}</span></div>
      <div class="row"><span class="k">Per person, before transport</span><span class="v">${esc(range(c.total[0], c.total[1]))}</span></div>
    </div>
    <p class="note">Transport is left out on purpose — what it costs depends
      entirely on where you leave from. The planner adds it once you say.</p>
    <a class="cta" href="/#/city/${encodeURIComponent(city.key)}">Plan this weekend from your city →</a>
  </div>
</section>

${acts ? `<section>
  <div class="wrap">
    <h2>What to do</h2>
    <p class="lede">Picked for ${esc(city.key)} specifically. No two cities here share a list.</p>
    <div class="cards">${activityCards(acts)}</div>
  </div>
</section>` : ''}

${rests ? `<section>
  <div class="wrap">
    <h2>Where to eat</h2>
    <p class="lede">Real places, with what they are known for.</p>
    <div class="cards">${restaurantCards(rests)}</div>
  </div>
</section>` : ''}

<section>
  <div class="wrap">
    <h2>Other cheap weekends</h2>
    <p class="lede">Nearby on the map, or similar in price.</p>
    <div class="others">
      ${neighbours.map(n => `<a href="/city/${slugify(n.key)}">${esc(n.key)}</a>`).join('\n      ')}
    </div>
  </div>
</section>
</main>

<footer>
  <div class="wrap">
    <p>Prices are estimates based on researched accommodation, food and activity
      ranges — not live partner inventory. Final prices vary on the partner site.</p>
    <p>Imagery from Wikipedia under open licences. <a href="/">Back to Maison Voyage</a></p>
  </div>
</footer>

</body>
</html>
`;
}

/* ---------- run ---------- */

async function main() {
  const data = extract();
  const dest = data.smartDestinations;

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const wikiSlugFor = { Amalfi: 'Amalfi_Coast', Split: 'Split,_Croatia', Faro: 'Faro,_Portugal' };
  const results = [];

  for (const city of dest) {
    // Try the overrides, then each gallery slug in turn, then the bare
    // city name — stopping at the first result that is an actual
    // photograph rather than a flag or a map.
    const gallery = data.cityGallery[city.key] || [];
    const candidates = [
      wikiSlugFor[city.key],
      ...gallery,
      city.key.replace(/\s+/g, '_')
    ].filter(Boolean);

    let img = null;
    for (const cand of candidates) {
      const found = await leadImage(cand);
      // Be a polite client: this is a free API, and 64 requests back to
      // back is what got the first run throttled.
      await sleep(250);
      if (found && !looksLikeEmblem(found)) { img = found; break; }
      if (found && !img) img = found; // keep an emblem only as last resort
    }

    // Neighbours: nearest by coordinates, so the links are useful to a
    // reader and give crawlers a real path between pages.
    const here = data.cityCoords[city.key];
    const neighbours = dest
      .filter(o => o.key !== city.key && data.cityCoords[o.key])
      .map(o => {
        const t = data.cityCoords[o.key];
        return { key: o.key, d: Math.hypot(here[0] - t[0], here[1] - t[1]) };
      })
      .sort((a, b) => a.d - b.d)
      .slice(0, 8);

    const html = buildPage(city, data, img, neighbours);
    const dir = path.join(OUT_DIR, slugify(city.key));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
    results.push({ city: city.key, slug: slugify(city.key), bytes: html.length, img: !!img });
  }

  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1), 'utf8');

  // Write the crawlable index into the homepage footer. Without a real
  // <a href> pointing at them these 64 pages are orphans — a crawler
  // has no route to any of them and the whole exercise is wasted.
  // Rewritten from the dataset on every build so it cannot drift.
  const START = '<!-- CITY-INDEX:START -->';
  const END = '<!-- CITY-INDEX:END -->';
  const indexHtml = fs.readFileSync(INDEX_FILE, 'utf8');
  const a = indexHtml.indexOf(START);
  const b = indexHtml.indexOf(END);
  if (a === -1 || b === -1) {
    console.warn('WARNUNG: CITY-INDEX-Marker fehlen in public/index.html — Links nicht geschrieben');
  } else {
    const links = [...dest]
      .sort((x, y) => x.key.localeCompare(y.key, 'en'))
      .map(c => `<a href="/city/${slugify(c.key)}">${esc(c.key)}</a>`)
      .join('\n          ');
    const next = indexHtml.slice(0, a + START.length)
      + '\n          ' + links + '\n          '
      + indexHtml.slice(b);
    if (next !== indexHtml) fs.writeFileSync(INDEX_FILE, next, 'utf8');
    console.log(`Footer-Index: ${dest.length} Links geschrieben`);
  }

  const noImg = results.filter(r => !r.img);
  const avg = Math.round(results.reduce((s, r) => s + r.bytes, 0) / results.length / 1024);
  console.log(`${results.length} Seiten erzeugt, Ø ${avg} KB`);
  console.log('ohne Bild:', noImg.length ? noImg.map(r => r.city).join(', ') : 'keine');
  return results;
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { main, slugify };
