// Generates simplified GHS pictograms (red diamond, white fill, black symbol) into public/ghs/
// Run: node scripts/gen-ghs-svg.js
const fs = require('fs');
const path = require('path');

const frame = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
<polygon points="50,2 98,50 50,98 2,50" fill="#fff" stroke="#e0202a" stroke-width="7" stroke-linejoin="miter"/>
<g fill="#111" stroke="#111" stroke-linecap="round" stroke-linejoin="round">
${inner}
</g>
</svg>`;

const symbols = {
  // exploding bomb
  GHS01: `<circle cx="48" cy="60" r="13" stroke="none"/>
<path d="M56 50 l5-8 M60 56 l9-4 M61 64 l10 2 M58 70 l8 6 M36 52 l-7-6 M34 60 l-10-1 M35 68 l-9 5 M46 46 l-2-9" stroke-width="3" fill="none"/>
<path d="M62 44 l10-11 M70 40 l8-3 M66 36 l4-8" stroke-width="3" fill="none"/>`,
  // flame
  GHS02: `<path d="M50 24 c6 10 18 16 18 34 c0 12-8 20-18 20 c-10 0-18-8-18-20 c0-8 4-13 8-17 c-1 6 2 9 5 9 c3 0 5-3 5-7 c0-8-4-12-0-19z" stroke="none"/>
<path d="M50 60 c-5 0-8 4-8 8 c0 4 4 7 8 7 c4 0 8-3 8-7 c0-5-4-5-8-8z" fill="#fff" stroke="none"/>
<rect x="30" y="80" width="40" height="4" stroke="none"/>`,
  // flame over circle
  GHS03: `<path d="M50 20 c5 8 15 13 15 27 c0 9-7 16-15 16 c-8 0-15-7-15-16 c0-6 3-10 6-13 c-1 5 2 7 4 7 c3 0 4-2 4-5 c0-6-3-9 1-16z" stroke="none"/>
<circle cx="50" cy="70" r="13" stroke-width="6" fill="none"/>
<rect x="28" y="84" width="44" height="4" stroke="none"/>`,
  // gas cylinder
  GHS04: `<rect x="40" y="36" width="20" height="40" rx="6" stroke="none"/>
<rect x="45" y="26" width="10" height="10" stroke="none"/>
<rect x="38" y="22" width="24" height="5" stroke="none"/>
<path d="M40 70 h20 l-4 8 h-12z" stroke="none"/>`,
  // corrosion: test tubes dripping on hand and bar
  GHS05: `<path d="M26 28 h10 v16 l6 8 h-22 l6-8z" stroke="none"/>
<path d="M60 28 h10 v16 l6 8 h-22 l6-8z" stroke="none"/>
<path d="M30 56 l-3 6 M33 58 l-2 6" stroke-width="3" fill="none"/>
<path d="M64 56 l-3 6 M67 58 l-2 6" stroke-width="3" fill="none"/>
<rect x="18" y="70" width="26" height="6" stroke="none"/>
<path d="M56 72 c4-6 12-8 18-6 c4 2 6 6 4 10 c-6 2-14 2-20 0 c-3-1-3-3-2-4z" stroke="none"/>
<path d="M60 68 l-3-7 M66 66 l-1-7 M72 67 l2-6" stroke-width="3" fill="none"/>`,
  // skull and crossbones
  GHS06: `<circle cx="50" cy="42" r="16" stroke="none"/>
<rect x="43" y="52" width="14" height="8" stroke="none"/>
<circle cx="44" cy="40" r="4" fill="#fff" stroke="none"/>
<circle cx="56" cy="40" r="4" fill="#fff" stroke="none"/>
<path d="M50 46 l-2 5 h4z" fill="#fff" stroke="none"/>
<path d="M30 64 l40 16 M70 64 l-40 16" stroke-width="7" fill="none"/>
<circle cx="30" cy="64" r="4" stroke="none"/><circle cx="70" cy="64" r="4" stroke="none"/>
<circle cx="30" cy="80" r="4" stroke="none"/><circle cx="70" cy="80" r="4" stroke="none"/>`,
  // exclamation mark
  GHS07: `<rect x="45" y="24" width="10" height="36" rx="3" stroke="none"/>
<circle cx="50" cy="72" r="6" stroke="none"/>`,
  // health hazard: torso with star burst
  GHS08: `<path d="M50 20 c6 0 10 4 10 10 c0 5-3 8-6 10 c8 2 14 8 14 16 v22 h-36 v-22 c0-8 6-14 14-16 c-3-2-6-5-6-10 c0-6 4-10 10-10z" stroke="none"/>
<path d="M50 42 l4 10 l10-2 l-7 8 l7 8 l-10-2 l-4 10 l-4-10 l-10 2 l7-8 l-7-8 l10 2z" fill="#fff" stroke="none"/>`,
  // environment: dead tree and fish
  GHS09: `<path d="M30 70 v-30 M30 48 l-10-8 M30 42 l9-8 M30 55 l-8-4 M30 60 l8-6" stroke-width="4" fill="none"/>
<path d="M18 70 h26" stroke-width="4" fill="none"/>
<path d="M50 76 c6-8 16-10 26-4 l6-6 v16 l-6-6 c-10 6-20 4-26 0z" stroke="none"/>
<circle cx="70" cy="72" r="2" fill="#fff" stroke="none"/>
<path d="M44 84 c8-2 14 2 20 0 c6-2 12 2 18 0" stroke-width="3" fill="none"/>`,
};

const out = path.join(__dirname, '..', 'public', 'ghs');
fs.mkdirSync(out, { recursive: true });
for (const [code, inner] of Object.entries(symbols)) {
  fs.writeFileSync(path.join(out, `${code}.svg`), frame(inner));
}
console.log('wrote', Object.keys(symbols).length, 'pictograms to', out);
