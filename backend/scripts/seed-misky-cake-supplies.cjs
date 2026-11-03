/**
 * Carga los insumos de las masas, sabores, rellenos y empaque de Misky Challay.
 *
 * Uso seguro:
 *   node seed-misky-cake-supplies.cjs          # solo muestra el plan
 *   node seed-misky-cake-supplies.cjs --execute # crea/actualiza insumos y stock inicial
 */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');
const { supplies } = require('../../scripts/cake-supply-catalog.cjs');

require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const sourceDir = path.resolve(__dirname, '../../frontend/public/images/ingredients');
const targetDir = path.resolve(__dirname, '../uploads/media');
const backupDir = path.resolve(__dirname, '../../backups');
const execute = process.argv.includes('--execute');

const query = async (db, sql, values = []) => {
  const [result] = await db.execute(sql, values);
  return result;
};

const assetFilename = (code) => {
  const hash = createHash('sha256').update(`misky-cake-supply:${code}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}.png`;
};

const assertLocal = () => {
  const remoteTestSeed = process.env.SEED_MISKY_CATALOG === 'true';
  if (!remoteTestSeed && (process.env.NODE_ENV !== 'development'
    || !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST)
    || process.env.DB_NAME !== 'DulceFlow'
    || process.env.SEED_DEMO_DATA !== 'false'
    || process.env.MERCADOPAGO_MODE === 'live')) {
    throw new Error('Solo se permite en la base DulceFlow local de desarrollo sin pagos reales');
  }
  if (!process.env.ADMIN_EMAIL) throw new Error('Falta ADMIN_EMAIL para verificar al propietario');
};

const createBackup = () => {
  fs.mkdirSync(backupDir, { recursive: true });
  const file = path.join(backupDir, `DulceFlow-before-cake-supplies-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`);
  const candidates = [process.env.MYSQLDUMP_PATH, 'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe', 'mysqldump'].filter(Boolean);
  const executable = candidates.find((candidate) => candidate === 'mysqldump' || fs.existsSync(candidate));
  if (!executable) throw new Error('No se encontró mysqldump para crear el respaldo');
  const args = [
    `--host=${process.env.DB_HOST}`, `--port=${process.env.DB_PORT}`, `--user=${process.env.DB_USER}`,
    '--single-transaction', '--quick', '--routines', '--triggers', '--events', '--set-gtid-purged=OFF',
    '--no-tablespaces', '--hex-blob', `--result-file=${file}`, process.env.DB_NAME,
  ];
  const result = spawnSync(executable, args, {
    env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD },
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024,
  });
  if (result.status !== 0 || !fs.existsSync(file)) {
    if (fs.existsSync(file)) fs.rmSync(file);
    throw new Error(`No se pudo crear el respaldo: ${result.stderr || 'mysqldump terminó con error'}`);
  }
  return file;
};

const copyMedia = async (db, ownerId, supply) => {
  const source = path.join(sourceDir, supply.image);
  if (!fs.existsSync(source)) throw new Error(`Falta la imagen ${source}`);
  fs.mkdirSync(targetDir, { recursive: true });
  const filename = assetFilename(supply.code);
  const destination = path.join(targetDir, filename);
  const sourceBuffer = fs.readFileSync(source);
  const sourceSize = sourceBuffer.length;
  // La versión depende del contenido para evitar que el navegador conserve
  // una ilustración anterior cuando renovamos el archivo con el mismo código.
  const contentVersion = createHash('sha256').update(sourceBuffer).digest('hex').slice(0, 12);
  // Las imágenes pueden renovarse manteniendo el mismo código de insumo.
  // Copiamos la versión nueva al repositorio de medios cuando cambió el archivo.
  if (!fs.existsSync(destination) || fs.statSync(destination).size !== sourceSize) fs.writeFileSync(destination, sourceBuffer);
  const url = `/api/v1/media/files/${filename}?v=${contentVersion}`;
  const sizeBytes = sourceSize;
  const existing = await query(db, 'SELECT id FROM media_assets WHERE filename=? LIMIT 1', [filename]);
  if (existing.length) {
    await query(db, 'UPDATE media_assets SET original_name=?, mime_type=?, size_bytes=?, url=?, alt_text=?, category=?, created_by=?, deleted_at=NULL, updated_at=NOW() WHERE id=?', [
      supply.image, 'image/png', sizeBytes, url, supply.alt, 'ingredients', ownerId, existing[0].id,
    ]);
  } else {
    await query(db,
      'INSERT INTO media_assets (original_name, filename, mime_type, size_bytes, url, alt_text, category, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
      [supply.image, filename, 'image/png', sizeBytes, url, supply.alt, 'ingredients', ownerId]);
  }
  return url;
};

const writeInitialStock = async (db, branchId, item, supply, actorId) => {
  const stockRows = await query(db, 'SELECT id, on_hand, reserved FROM branch_inventory WHERE branch_id=? AND inventory_item_id=? FOR UPDATE', [branchId, item.id]);
  if (stockRows.length) {
    const stock = stockRows[0];
    const history = await query(db, 'SELECT COUNT(*) AS total FROM inventory_movements WHERE branch_id=? AND inventory_item_id=?', [branchId, item.id]);
    if (Number(stock.on_hand) === 0 && Number(stock.reserved) === 0 && Number(history[0].total) === 0 && supply.initialStock > 0) {
      await query(db, 'UPDATE branch_inventory SET on_hand=?, average_unit_cost=?, updated_at=NOW() WHERE id=?', [supply.initialStock, supply.unitCost, stock.id]);
      await query(db,
        `INSERT INTO inventory_movements
          (branch_id, inventory_item_id, type, quantity, on_hand_after, reserved_after, unit_cost, total_cost, actor_id, reason, created_at, updated_at)
         VALUES (?, ?, 'PURCHASE', ?, ?, 0, ?, ?, ?, ?, NOW(), NOW())`,
        [branchId, item.id, supply.initialStock, supply.initialStock, supply.unitCost, supply.initialStock * supply.unitCost, actorId, 'Stock inicial de insumos para tortas']);
      return 'stock-added';
    }
    return 'stock-kept';
  }

  await query(db,
    'INSERT INTO branch_inventory (branch_id, inventory_item_id, on_hand, reserved, average_unit_cost, created_at, updated_at) VALUES (?, ?, ?, 0, ?, NOW(), NOW())',
    [branchId, item.id, supply.initialStock, supply.unitCost]);
  if (supply.initialStock > 0) {
    await query(db,
      `INSERT INTO inventory_movements
        (branch_id, inventory_item_id, type, quantity, on_hand_after, reserved_after, unit_cost, total_cost, actor_id, reason, created_at, updated_at)
       VALUES (?, ?, 'PURCHASE', ?, ?, 0, ?, ?, ?, ?, NOW(), NOW())`,
      [branchId, item.id, supply.initialStock, supply.initialStock, supply.unitCost, supply.initialStock * supply.unitCost, actorId, 'Stock inicial de insumos para tortas']);
  }
  return 'stock-created';
};

async function main() {
  assertLocal();
  console.log(`Plan: ${supplies.length} insumos de tortas, ${supplies.length} imágenes y stock para cada sede activa.`);
  if (!execute) {
    console.log('Ejecuta con --execute para aplicar los cambios.');
    return;
  }

  const backup = process.env.SEED_MISKY_CATALOG_BACKUP === 'true' ? createBackup() : null;
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  try {
    const owners = await query(db, 'SELECT id FROM users WHERE LOWER(email)=LOWER(?) AND is_super_admin=1 AND status=? LIMIT 1', [process.env.ADMIN_EMAIL, 'ACTIVE']);
    if (!owners.length) throw new Error('No se encontró la cuenta propietaria activa');
    const branches = await query(db, 'SELECT id, name FROM branches WHERE is_active=1 ORDER BY id');
    if (!branches.length) throw new Error('No hay sedes activas para habilitar el inventario');
    for (const supply of supplies) {
      if (!fs.existsSync(path.join(sourceDir, supply.image))) throw new Error(`Falta la imagen ${supply.image}`);
    }

    await db.beginTransaction();
    let created = 0;
    let updated = 0;
    let stockCreated = 0;
    let stockKept = 0;
    try {
      for (const supply of supplies) {
        const imageUrl = await copyMedia(db, owners[0].id, supply);
        const existing = await query(db, 'SELECT id FROM inventory_items WHERE code=? LIMIT 1', [supply.code]);
        let itemId;
        if (existing.length) {
          itemId = existing[0].id;
          await query(db,
            'UPDATE inventory_items SET name=?, unit=?, unit_cost=?, min_level=?, image_url=?, is_active=1, updated_at=NOW() WHERE id=?',
            [supply.name, supply.unit, supply.unitCost, supply.minLevel, imageUrl, itemId]);
          updated += 1;
        } else {
          const inserted = await query(db,
            'INSERT INTO inventory_items (code, name, unit, unit_cost, min_level, is_active, image_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, NOW(), NOW())',
            [supply.code, supply.name, supply.unit, supply.unitCost, supply.minLevel, imageUrl]);
          itemId = inserted.insertId;
          created += 1;
        }
        const item = { id: itemId };
        for (const branch of branches) {
          const result = await writeInitialStock(db, branch.id, item, supply, owners[0].id);
          if (result === 'stock-created' || result === 'stock-added') stockCreated += 1;
          else stockKept += 1;
        }
      }
      await db.commit();
    } catch (error) {
      await db.rollback();
      throw error;
    }
    console.log(JSON.stringify({ ok: true, backup, branches: branches.map((branch) => branch.name), created, updated, stockCreated, stockKept }, null, 2));
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(`Carga de insumos falló: ${error.message}`);
  process.exitCode = 1;
});
