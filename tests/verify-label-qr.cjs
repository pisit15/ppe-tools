// Run after verify-label-pdfs.py to decode images extracted from the actual PDF files.
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');
const jsQR = require('jsqr');
const root = path.join(__dirname, '..', 'test-results');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'chemical-label-presets.json'), 'utf8'));
for (const [id] of manifest.presets) {
  const png = PNG.sync.read(fs.readFileSync(path.join(root, `embedded-${id}.png`)));
  const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  if (code?.data !== manifest.url) throw new Error(`PDF QR decode failed: ${id}`);
  console.log(`${id}: PDF-embedded QR decoded successfully`);
}
const ppeManifest = path.join(root, 'chemical-label-ppe.json');
if (fs.existsSync(ppeManifest)) for (const {name,url} of JSON.parse(fs.readFileSync(ppeManifest,'utf8'))) {
  const png = PNG.sync.read(fs.readFileSync(path.join(root, `embedded-${name}.png`)));
  const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  if (code?.data !== url) throw new Error(`PPE PDF QR decode failed: ${name}`);
  console.log(`${name}: PDF-embedded QR matches its clickable SDS link`);
}
