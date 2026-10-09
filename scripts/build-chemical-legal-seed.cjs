// Rebuild the embedded, immutable first release. Never edits the original Excel workbook.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/chemical-legal/catalog-2026-10-09.json'), 'utf8'));
const migration = path.join(root, 'supabase/migrations/20261009081023_chemical_legal_catalog.sql');
const marker = '-- BEGIN GENERATED REFERENCE RELEASE';
const quote = value => "'" + value.replaceAll("'", "''") + "'";
const literal = value => value === null ? 'null' : typeof value === 'boolean' || typeof value === 'number' ? String(value) : Array.isArray(value) ? 'array[' + value.map(quote).join(',') + ']::text[]' : typeof value === 'object' ? quote(JSON.stringify(value)) + '::jsonb' : quote(value);
const insert = (table, rows, jsonKeys = []) => rows.map(row => {
  const keys = Object.keys(row);
  return `insert into public.${table} (${keys.join(',')}) values (${keys.map(key => jsonKeys.includes(key) ? quote(JSON.stringify(row[key])) + '::jsonb' : literal(row[key])).join(',')});`;
}).join('\n');
if (catalog.release.entry_count !== catalog.entries.length) throw new Error('Release count does not match entries');
if (new Set(catalog.entries.map(e => e.id)).size !== catalog.entries.length) throw new Error('Duplicate legal entry');
const sql = [
  marker,
  insert('chem_legal_releases', [catalog.release], ['coverage', 'gaps']),
  insert('chem_legal_sources', catalog.sources.map(s => ({ release_id: catalog.release.id, ...s }))),
  insert('chem_legal_entries', catalog.entries),
].join('\n');
fs.writeFileSync(migration, fs.readFileSync(migration, 'utf8').split(marker)[0].trimEnd() + '\n\n' + sql + '\n');
console.log(`Generated ${catalog.entries.length} reference entries; ${catalog.entries.filter(e => e.review_state === 'verified').length} source-verified.`);
