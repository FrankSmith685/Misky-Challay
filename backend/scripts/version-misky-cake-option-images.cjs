/**
 * Actualiza las URLs de las opciones del constructor con una versión basada
 * en el contenido de cada ilustración. Esto invalida la caché del navegador
 * cuando se reemplaza una imagen sin cambiar su nombre.
 *
 * Uso:
 *   node version-misky-cake-option-images.cjs          # solo muestra el plan
 *   node version-misky-cake-option-images.cjs --execute
 */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');
const { supplies } = require('../../scripts/cake-supply-catalog.cjs');

require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const execute = process.argv.includes('--execute');
const sourceDir = path.resolve(__dirname, '../../frontend/public/images/ingredients');
const backupDir = path.resolve(__dirname, '../../backups');

const query = async (db, sql, values = []) => {
  const [result] = await db.execute(sql, values);
  return result;
};

const assertLocal = () => {
  if (process.env.NODE_ENV !== 'development'
    || !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST)
    || process.env.DB_NAME !== 'DulceFlow'
    || process.env.SEED_DEMO_DATA !== 'false'
    || process.env.MERCADOPAGO_MODE === 'live') {
    throw new Error('Solo se permite en la base DulceFlow local de desarrollo sin pagos reales');
  }
  if (!process.env.ADMIN_EMAIL) throw new Error('Falta ADMIN_EMAIL para verificar el propietario');
};

const createBackup = () => {
  fs.mkdirSync(backupDir, { recursive: true });
  const file = path.join(backupDir, `DulceFlow-before-cake-image-versions-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`);
  const candidates = [process.env.MYSQLDUMP_PATH, 'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe', 'mysqldump'].filter(Boolean);
  const executable = candidates.find((candidate) => candidate === 'mysqldump' || fs.existsSync(candidate));
  if (!executable) throw new Error('No se encontró mysqldump para crear el respaldo');
  const result = spawnSync(executable, [
    `--host=${process.env.DB_HOST}`, `--port=${process.env.DB_PORT}`, `--user=${process.env.DB_USER}`,
    '--single-transaction', '--quick', '--routines', '--triggers', '--events', '--set-gtid-purged=OFF',
    '--no-tablespaces', '--hex-blob', `--result-file=${file}`, process.env.DB_NAME,
  ], { env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD }, encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
  if (result.status !== 0 || !fs.existsSync(file)) throw new Error(`No se pudo crear el respaldo: ${result.stderr || ''}`);
  return file;
};

const versionsByImage = new Map(supplies.map((supply) => {
  const imagePath = path.join(sourceDir, supply.image);
  if (!fs.existsSync(imagePath)) throw new Error(`Falta la imagen ${imagePath}`);
  const version = createHash('sha256').update(fs.readFileSync(imagePath)).digest('hex').slice(0, 12);
  return [`/images/ingredients/${supply.image}`, version];
}));

async function main() {
  assertLocal();
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  try {
    const rows = await query(db, "SELECT id, image_url FROM customization_options WHERE image_url LIKE '/images/ingredients/%'");
    const changes = rows.map((row) => {
      const base = String(row.image_url).split('?')[0];
      const version = versionsByImage.get(base);
      if (!version) return null;
      const imageUrl = `${base}?v=${version}`;
      return imageUrl === row.image_url ? null : { id: row.id, imageUrl };
    }).filter(Boolean);
    console.log(`Plan: ${rows.length} opciones con imagen; ${changes.length} URLs para versionar.`);
    if (!execute || !changes.length) return;

    const backup = createBackup();
    await db.beginTransaction();
    try {
      for (const change of changes) {
        await query(db, 'UPDATE customization_options SET image_url=?, updated_at=NOW() WHERE id=?', [change.imageUrl, change.id]);
      }
      await db.commit();
    } catch (error) {
      await db.rollback();
      throw error;
    }
    console.log(JSON.stringify({ ok: true, backup, updated: changes.length }, null, 2));
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(`Versionado de imágenes falló: ${error.message}`);
  process.exitCode = 1;
});
