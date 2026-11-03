/** Respaldo previo a la migración de alérgenos; solo para la base local de desarrollo. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

if (process.env.NODE_ENV !== 'development'
  || !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST)
  || process.env.DB_NAME !== 'DulceFlow'
  || process.env.SEED_DEMO_DATA !== 'false'
  || process.env.MERCADOPAGO_MODE === 'live') {
  throw new Error('Solo se permite respaldar la base DulceFlow local de desarrollo');
}

const backupDir = path.resolve(__dirname, '../../backups');
fs.mkdirSync(backupDir, { recursive: true });
const file = path.join(backupDir, `DulceFlow-before-allergens-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`);
const candidates = [process.env.MYSQLDUMP_PATH, 'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe', 'mysqldump'].filter(Boolean);
const executable = candidates.find((candidate) => candidate === 'mysqldump' || fs.existsSync(candidate));
if (!executable) throw new Error('No se encontró mysqldump');
const result = spawnSync(executable, [
  `--host=${process.env.DB_HOST}`, `--port=${process.env.DB_PORT}`, `--user=${process.env.DB_USER}`,
  '--single-transaction', '--quick', '--routines', '--triggers', '--events', '--set-gtid-purged=OFF',
  '--no-tablespaces', '--hex-blob', `--result-file=${file}`, process.env.DB_NAME,
], { env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD }, encoding: 'utf8', maxBuffer: 1024 * 1024 });
if (result.status !== 0 || !fs.existsSync(file) || fs.statSync(file).size === 0) {
  if (fs.existsSync(file)) fs.rmSync(file);
  throw new Error(`No se pudo crear el respaldo: ${result.stderr || 'archivo vacío'}`);
}
console.log(JSON.stringify({ backup: file, bytes: fs.statSync(file).size }));
