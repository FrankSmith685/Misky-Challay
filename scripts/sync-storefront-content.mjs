import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The server owns this public contract. Ship its validated fallback in the web
// bundle too, so the introduction remains usable while the API is unavailable.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'frontend/src/features/home/content');
mkdirSync(target, { recursive: true });
for (const name of ['storefront.defaults.json', 'storefront.schema.ts']) {
  const source = readFileSync(path.join(root, 'backend/src/modules/settings', name), 'utf8');
  const output = path.join(target, name);
  if (process.argv.includes('--check')) {
    if (readFileSync(output, 'utf8') !== source)
      throw new Error(`Run node scripts/sync-storefront-content.mjs (${name})`);
  } else writeFileSync(output, source, 'utf8');
}
