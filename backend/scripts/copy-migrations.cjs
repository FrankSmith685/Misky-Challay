#!/usr/bin/env node
/**
 * Copia las migraciones .sql al build.
 *
 * `tsc` solo emite JavaScript: los archivos .sql se quedarian fuera de dist/ y el
 * despliegue arrancaria sin baseline, con `npm run db:migrate` diciendo que no hay
 * nada que aplicar sobre una base vacia.
 */
const fs = require('node:fs');
const path = require('node:path');

const from = path.resolve(__dirname, '..', 'src', 'database', 'migrations');
const to = path.resolve(__dirname, '..', 'dist', 'database', 'migrations');

fs.mkdirSync(to, { recursive: true });

const copied = fs
  .readdirSync(from)
  .filter((file) => file.endsWith('.sql'))
  .map((file) => {
    fs.copyFileSync(path.join(from, file), path.join(to, file));
    return file;
  });

console.log(`Migraciones SQL copiadas a dist: ${copied.length ? copied.join(', ') : 'ninguna'}`);

const geoDataFrom = path.resolve(__dirname, '..', 'src', 'modules', 'geo', 'data');
const geoDataTo = path.resolve(__dirname, '..', 'dist', 'modules', 'geo', 'data');
fs.mkdirSync(geoDataTo, { recursive: true });
for (const file of fs.readdirSync(geoDataFrom).filter((name) => name.endsWith('.json'))) {
  fs.copyFileSync(path.join(geoDataFrom, file), path.join(geoDataTo, file));
}
