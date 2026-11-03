/**
 * Corrige los nombres de las imágenes cargadas por seed-misky-custom-cake.cjs.
 * El servidor solo acepta nombres hexadecimales/UUID en /media/files.
 * Conserva las imágenes y las referencias; requiere desarrollo local.
 */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const keys = ['hero', 'category', 'overview', 'harina', 'huevos', 'azucar',
  'mantequilla', 'leche', 'polvo-hornear', 'vainilla', 'cacao', 'manjar',
  'relleno-fresa', 'buttercream', 'ganache', 'fresas', 'empaque',
  'bizcocho-vainilla', 'bizcocho-chocolate'];
const directory = path.resolve(__dirname, '../uploads/media');
const root = path.resolve(__dirname, '..');
function filename(key) {
  const hash = createHash('sha256').update('misky-catalog-seed:' + key).digest('hex');
  return [hash.slice(0, 8), hash.slice(8, 12), hash.slice(12, 16),
    hash.slice(16, 20), hash.slice(20, 32)].join('-') + '.png';
}
function assertLocal() {
  if (process.env.NODE_ENV !== 'development' ||
      !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST) ||
      process.env.DB_NAME !== 'DulceFlow' ||
      process.env.MERCADOPAGO_MODE === 'live' ||
      !directory.startsWith(root + path.sep)) {
    throw new Error('La reparación solo se permite en la base y carpeta local de desarrollo');
  }
}
async function query(db, sql, values = []) {
  const [rows] = await db.execute(sql, values);
  return rows;
}
function backup() {
  const backupDir = path.resolve(__dirname, '../../backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const file = path.join(backupDir, 'DulceFlow-before-misky-media-repair-' +
    new Date().toISOString().replace(/[:.]/g, '-') + '.sql');
  const executable = 'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe';
  if (!fs.existsSync(executable)) throw new Error('No se encontró mysqldump');
  const args = ['--host=' + process.env.DB_HOST, '--port=' + process.env.DB_PORT,
    '--user=' + process.env.DB_USER, '--single-transaction', '--quick',
    '--routines', '--triggers', '--events', '--set-gtid-purged=OFF',
    '--no-tablespaces', '--hex-blob', '--result-file=' + file, process.env.DB_NAME];
  const result = spawnSync(executable, args, {
    env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD },
    encoding: 'utf8', maxBuffer: 5 * 1024 * 1024,
  });
  if (result.status !== 0) {
    if (fs.existsSync(file)) fs.rmSync(file);
    throw new Error('No se pudo respaldar la base');
  }
  const sql = fs.readFileSync(file, 'utf8');
  if (sql.length < 10000 || (sql.match(/CREATE TABLE /g) || []).length < 90) {
    fs.rmSync(file);
    throw new Error('Respaldo incompleto');
  }
  return file;
}
async function main() {
  assertLocal();
  const db = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const moved = [];
  try {
    const [cake] = await query(db, "SELECT id, status FROM products WHERE slug='torta-personalizada-misky-challay'");
    if (!cake || cake.status !== 'DRAFT') throw new Error('La torta no coincide con la carga');
    for (const key of keys) {
      const oldName = 'misky-catalog-seed-' + key + '.png';
      const newName = filename(key);
      const rows = await query(db, 'SELECT id FROM media_assets WHERE filename=?', [oldName]);
      if (rows.length !== 1 || !fs.existsSync(path.join(directory, oldName)) ||
          fs.existsSync(path.join(directory, newName))) {
        throw new Error('Estado inesperado para imagen ' + key);
      }
    }
    if (!process.argv.includes('--execute')) {
      console.log(JSON.stringify({ mode: 'dry-run', imagesToRepair: keys.length }));
      return;
    }
    const backupFile = backup();
    for (const key of keys) {
      const oldPath = path.join(directory, 'misky-catalog-seed-' + key + '.png');
      const newPath = path.join(directory, filename(key));
      fs.renameSync(oldPath, newPath);
      moved.push([oldPath, newPath]);
    }
    await db.beginTransaction();
    try {
      const fields = [
        ['products', 'image_url'], ['categories', 'image_url'],
        ['inventory_items', 'image_url'], ['customization_options', 'image_url'],
        ['builder_presets', 'image_url'],
      ];
      for (const key of keys) {
        const oldName = 'misky-catalog-seed-' + key + '.png';
        const oldUrl = '/api/v1/media/files/' + oldName;
        const newName = filename(key);
        const newUrl = '/api/v1/media/files/' + newName;
        await query(db, 'UPDATE media_assets SET filename=?, url=?, updated_at=NOW() WHERE filename=?',
          [newName, newUrl, oldName]);
        for (const [table, field] of fields) {
          await query(db, 'UPDATE ' + table + ' SET ' + field + '=? WHERE ' + field + '=?',
            [newUrl, oldUrl]);
        }
      }
      const [oldAssets] = await query(db, "SELECT COUNT(*) AS n FROM media_assets WHERE filename LIKE 'misky-catalog-seed-%'");
      const [newAssets] = await query(db,
        'SELECT COUNT(*) AS n FROM media_assets WHERE filename IN (' + keys.map(() => '?').join(',') + ')',
        keys.map(filename));
      if (Number(oldAssets.n) !== 0 || Number(newAssets.n) !== keys.length) {
        throw new Error('Verificación de imágenes fallida');
      }
      await db.commit();
      console.log(JSON.stringify({ repairedImages: keys.length, backup: backupFile }));
    } catch (error) {
      await db.rollback();
      throw error;
    }
  } catch (error) {
    for (const [oldPath, newPath] of moved.reverse()) {
      if (fs.existsSync(newPath) && !fs.existsSync(oldPath)) fs.renameSync(newPath, oldPath);
    }
    throw error;
  } finally { await db.end(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
