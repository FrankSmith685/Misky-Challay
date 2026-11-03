import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routerPath = path.join(root, 'frontend', 'src', 'router', 'index.tsx');
const navPath = path.join(root, 'frontend', 'src', 'constants', 'adminNav.ts');
const router = fs.readFileSync(routerPath, 'utf8');
const nav = fs.readFileSync(navPath, 'utf8');

const routeKeys = [...router.matchAll(/navAnyOf\(ROUTES\.([A-Za-z0-9_]+)\)/g)].map((match) => match[1]);
const navKeys = [...nav.matchAll(/to:\s*ROUTES\.([A-Za-z0-9_]+)/g)].map((match) => match[1]);
const auditAlias = nav.match(/ADMIN_AUDIT_PATH\s*=\s*ROUTES\.([A-Za-z0-9_]+)/)?.[1];
if (auditAlias) navKeys.push(auditAlias);

const missing = [...new Set(routeKeys)].filter((key) => !navKeys.includes(key));
const duplicated = [...new Set(navKeys.filter((key, index) => navKeys.indexOf(key) !== index))];

if (missing.length || duplicated.length) {
  if (missing.length) console.error(`Rutas del panel sin fila en ADMIN_NAV: ${missing.join(', ')}`);
  if (duplicated.length) console.error(`Rutas duplicadas en ADMIN_NAV: ${duplicated.join(', ')}`);
  process.exit(1);
}

console.log(`ADMIN_NAV OK: ${new Set(routeKeys).size} rutas protegidas verificadas`);
