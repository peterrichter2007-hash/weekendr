'use strict';
/**
 * Pulls the curated datasets out of public/index.html.
 *
 * Why it reads the HTML instead of importing a module: the data lives
 * inside the one inline <script>, next to ~100 DOM-coupled functions.
 * Moving it out is exactly the big-bang refactor that broke this site
 * once before. So this reads the file, slices out the individual
 * `const X = {...}` declarations by bracket matching, and evaluates
 * only those in a sandbox. index.html is never modified.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'public', 'index.html');

/** Slice one top-level `const NAME = <literal>` out of the script text. */
function sliceLiteral(src, name) {
  const decl = src.indexOf('const ' + name);
  if (decl === -1) throw new Error('declaration not found: ' + name);

  // First bracket after the '=' opens the literal.
  const eq = src.indexOf('=', decl);
  let i = eq + 1;
  while (i < src.length && /\s/.test(src[i])) i++;
  const open = src[i];
  const close = open === '[' ? ']' : open === '{' ? '}' : null;
  if (!close) throw new Error('not an array/object literal: ' + name);

  // Bracket matching that understands strings, template literals,
  // comments and escapes — a naive counter trips over apostrophes in
  // "Côte d'Azur" and over brackets inside descriptions.
  let depth = 0, j = i;
  let inStr = null, inLine = false, inBlock = false;
  for (; j < src.length; j++) {
    const c = src[j], p = src[j - 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '/' && p === '*') inBlock = false; continue; }
    if (inStr) {
      if (c === '\\') { j++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '/' && src[j + 1] === '/') { inLine = true; continue; }
    if (c === '/' && src[j + 1] === '*') { inBlock = true; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) break; }
  }
  if (depth !== 0) throw new Error('unbalanced literal: ' + name);
  return src.slice(i, j + 1);
}

function extract() {
  const html = fs.readFileSync(INDEX, 'utf8');
  const start = html.indexOf('<script>', html.indexOf('<body>'));
  const end = html.lastIndexOf('</script>');
  const js = html.slice(start + 8, end);

  const names = [
    'smartDestinations',
    'cityProfiles',
    'cityEconomy',
    'cityGallery',
    'cityCoords',
    'cityFoodCulture'
  ];

  const sandbox = {};
  vm.createContext(sandbox);
  const out = {};
  for (const n of names) {
    const literal = sliceLiteral(js, n);
    out[n] = vm.runInContext('(' + literal + ')', sandbox, { timeout: 5000 });
  }
  return out;
}

module.exports = { extract };

// Run directly for a sanity report.
if (require.main === module) {
  const d = extract();
  const dest = d.smartDestinations;
  console.log('smartDestinations :', dest.length, 'Städte');
  console.log('cityProfiles      :', Object.keys(d.cityProfiles).length, 'kuratierte Profile');
  console.log('cityEconomy       :', Object.keys(d.cityEconomy).length, 'Preisprofile');
  console.log('cityGallery       :', Object.keys(d.cityGallery).length, 'Galerien');
  console.log('cityCoords        :', Object.keys(d.cityCoords).length, 'Koordinaten');
  console.log('cityFoodCulture   :', Object.keys(d.cityFoodCulture).length, 'Food-Einträge');

  const missingEconomy = dest.filter(c => !d.cityEconomy[c.key]).map(c => c.key);
  const missingCoords = dest.filter(c => !d.cityCoords[c.key]).map(c => c.key);
  console.log('\nZiele ohne Preisprofil :', missingEconomy.length ? missingEconomy.join(', ') : 'keine');
  console.log('Ziele ohne Koordinaten :', missingCoords.length ? missingCoords.join(', ') : 'keine');
  console.log('Ziele mit kuratiertem Profil :',
    dest.filter(c => d.cityProfiles[c.key]).length, 'von', dest.length);

  const sample = dest[0];
  console.log('\nBeispiel:', JSON.stringify({
    key: sample.key, country: sample.country, vibe: sample.vibe, tagline: sample.tagline
  }, null, 1));
}
