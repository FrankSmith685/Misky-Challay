/**
 * Limpia los datos de negocio de la base local para empezar una carga nueva.
 *
 * Conserva autenticacion, permisos, sedes, configuracion y los insumos. El
 * insumo de prueba "Harina PRUEBA-001" se elimina junto con sus existencias.
 * El catalogo, compras, proveedores, pedidos, lotes y movimientos se limpian.
 * Nunca debe ejecutarse contra produccion.
 *
 * Uso:
 *   node reset-local-business-data.cjs              # solo muestra el alcance
 *   node reset-local-business-data.cjs --execute    # respaldo + limpieza
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const backupRoot = path.resolve(__dirname, '../../backups');
const seedImageDir = path.resolve(__dirname, '../../frontend/public/images/misky-catalog');
const targetIngredientCode = 'INS-E458B06F9E7D4A7B';

// Tablas del sistema que no son datos de negocio y deben conservarse para que
// el administrador pueda volver a iniciar sesion y crear una carga nueva.
const preserveTables = new Set([
  'migrations',
  'users', 'roles', 'permissions', 'user_roles', 'role_permissions',
  'branches', 'branch_schedules', 'cake_station_capacities',
  'cities', 'districts', 'coverage_zones', 'zone_branches',
  'allergens', 'dietary_tags',
  'business_settings', 'communication_settings', 'local_payment_settings', 'receipt_settings',
  'plans', 'plan_benefits',
  'inventory_items', 'branch_inventory', 'media_assets',
]);

function assertLocal() {
  if (process.env.NODE_ENV !== 'development' ||
      !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST) ||
      process.env.DB_NAME !== 'DulceFlow' ||
      process.env.SEED_DEMO_DATA !== 'false' ||
      process.env.MERCADOPAGO_MODE === 'live') {
    throw new Error('Solo se permite en la base DulceFlow de desarrollo local sin pagos reales');
  }
  if (!process.env.ADMIN_EMAIL) throw new Error('Falta ADMIN_EMAIL para verificar la cuenta propietaria');
}

async function query(db, sql, values = []) {
  const [result] = await db.execute(sql, values);
  return result;
}

function safeFilename(filename) {
  const basename = path.basename(String(filename));
  if (!basename || basename !== String(filename) || basename === '.' || basename === '..') return null;
  return basename;
}

function createBackup() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(backupRoot, `DulceFlow-before-local-cleanup-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  const sqlFile = path.join(dir, 'DulceFlow.sql');
  const candidates = [process.env.MYSQLDUMP_PATH,
    'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe', 'mysqldump'].filter(Boolean);
  const executable = candidates.find((candidate) => candidate === 'mysqldump' || fs.existsSync(candidate));
  if (!executable) throw new Error('No se encontro mysqldump para crear el respaldo');
  const args = ['--host=' + process.env.DB_HOST, '--port=' + process.env.DB_PORT,
    '--user=' + process.env.DB_USER, '--single-transaction', '--quick',
    '--routines', '--triggers', '--events', '--set-gtid-purged=OFF',
    '--no-tablespaces', '--hex-blob', '--result-file=' + sqlFile, process.env.DB_NAME];
  const result = spawnSync(executable, args, {
    env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD },
    encoding: 'utf8', maxBuffer: 5 * 1024 * 1024,
  });
  if (result.status !== 0 || !fs.existsSync(sqlFile)) {
    if (fs.existsSync(sqlFile)) fs.rmSync(sqlFile);
    throw new Error('No se pudo crear el respaldo');
  }
  const sql = fs.readFileSync(sqlFile, 'utf8');
  if (sql.length < 10000 || (sql.match(/CREATE TABLE /g) || []).length < 90) {
    fs.rmSync(sqlFile);
    throw new Error('El respaldo esta incompleto');
  }
  return { dir, sqlFile };
}

async function tableCounts(db, tables) {
  const counts = {};
  for (const table of tables) {
    const [[row]] = await db.query(`SELECT COUNT(*) AS total FROM \`${table}\``);
    counts[table] = Number(row.total);
  }
  return counts;
}

async function inspect(db) {
  const owners = await query(db,
    'SELECT id FROM users WHERE LOWER(email)=LOWER(?) AND is_super_admin=1 AND status=?',
    [process.env.ADMIN_EMAIL, 'ACTIVE']);
  if (owners.length !== 1) throw new Error('No se pudo verificar una cuenta propietaria activa');

  const branches = await query(db, 'SELECT id, name FROM branches ORDER BY id');
  if (!branches.length) throw new Error('No hay sedes configuradas');
  const reserved = await query(db, 'SELECT COUNT(*) AS total FROM branch_inventory WHERE reserved > 0');
  if (Number(reserved[0].total) > 0) throw new Error('Hay stock reservado; primero libera o cancela esos pedidos');

  const targetRows = await query(db,
    'SELECT id, code, name, image_url FROM inventory_items WHERE code=?', [targetIngredientCode]);
  if (targetRows.length > 1) throw new Error('El codigo de Harina PRUEBA esta duplicado');

  const allTables = (await db.query('SHOW FULL TABLES'))[0].map((row) => Object.values(row)[0]);
  const cleanupTables = allTables.filter((table) => !preserveTables.has(table));
  const beforeCounts = await tableCounts(db, allTables);
  const media = await query(db, 'SELECT id, filename, url FROM media_assets WHERE deleted_at IS NULL');
  const inventoryRows = await query(db, 'SELECT id, image_url FROM inventory_items WHERE code<>?', [targetIngredientCode]);
  const keepMediaUrls = new Set(inventoryRows.map((row) => row.image_url).filter(Boolean));
  return {
    ownerId: owners[0].id,
    targetIngredient: targetRows[0] ?? null,
    allTables,
    cleanupTables,
    beforeCounts,
    media,
    keepMediaUrls,
    branchCount: branches.length,
  };
}

function archiveAndRemoveFiles(backupDir, filenames, removeSeedDir) {
  const mediaDir = path.join(backupDir, 'removed-media');
  fs.mkdirSync(mediaDir, { recursive: true });
  const removed = [];
  for (const filename of filenames) {
    const safe = safeFilename(filename);
    if (!safe) continue;
    const source = path.resolve(__dirname, '../uploads/media', safe);
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, path.join(mediaDir, safe));
      fs.rmSync(source);
      removed.push(source);
    }
  }
  let seedArchive = null;
  if (removeSeedDir && fs.existsSync(seedImageDir)) {
    seedArchive = path.join(backupDir, 'removed-misky-catalog');
    fs.cpSync(seedImageDir, seedArchive, { recursive: true });
    fs.rmSync(seedImageDir, { recursive: true, force: true });
  }
  return { removedMediaFiles: removed.length, seedArchive };
}

async function clean(db, context) {
  const removedMedia = context.media
    .filter((asset) => !context.keepMediaUrls.has(asset.url))
    .map((asset) => asset.filename)
    .filter(Boolean);
  const backup = createBackup();
  await db.beginTransaction();
  try {
    await query(db, 'SET FOREIGN_KEY_CHECKS=0');
    for (const table of context.cleanupTables) await query(db, `DELETE FROM \`${table}\``);
    if (context.targetIngredient) {
      await query(db, 'DELETE FROM branch_inventory WHERE inventory_item_id=?', [context.targetIngredient.id]);
      await query(db, 'DELETE FROM inventory_items WHERE id=?', [context.targetIngredient.id]);
    }
    const mediaPlaceholders = context.keepMediaUrls.size ? [...context.keepMediaUrls].map(() => '?').join(',') : '';
    if (mediaPlaceholders) await query(db, `DELETE FROM media_assets WHERE url IS NULL OR url NOT IN (${mediaPlaceholders})`, [...context.keepMediaUrls]);
    else await query(db, 'DELETE FROM media_assets');
    await query(db, 'SET FOREIGN_KEY_CHECKS=1');
    await db.commit();
  } catch (error) {
    await query(db, 'SET FOREIGN_KEY_CHECKS=1').catch(() => {});
    await db.rollback();
    throw error;
  }
  const files = archiveAndRemoveFiles(backup.dir, removedMedia, true);
  return { backup, removedMedia: removedMedia.length, files };
}

async function main() {
  assertLocal();
  const db = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  try {
    const context = await inspect(db);
    const plan = {
      tablesToClean: context.cleanupTables.length,
      preserveTables: [...preserveTables],
      harinaprueba: context.targetIngredient ? { id: context.targetIngredient.id, code: context.targetIngredient.code, name: context.targetIngredient.name } : null,
      mediaToRemove: context.media.filter((asset) => !context.keepMediaUrls.has(asset.url)).length,
      branchesPreserved: context.branchCount,
      before: context.beforeCounts,
      note: 'Se conservan usuarios, permisos, sedes, configuracion e insumos salvo Harina PRUEBA-001.',
    };
    if (!process.argv.includes('--execute')) {
      console.log(JSON.stringify({ mode: 'dry-run', ...plan }, null, 2));
      return;
    }
    const result = await clean(db, context);
    const after = await tableCounts(db, context.allTables);
    console.log(JSON.stringify({ mode: 'executed', ...plan, result, after }, null, 2));
  } finally { await db.end(); }
}

main().catch((error) => { console.error(`Limpieza fallo: ${error.message}`); process.exitCode = 1; });
