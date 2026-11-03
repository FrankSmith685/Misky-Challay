/**
 * Elimina definitivamente UNA ficha archivada de la base local de demostración.
 * Por seguridad rechaza productos con pedidos o relaciones ajenas a sus variantes.
 * Uso: node scripts/purge-demo-product.cjs 28 crear-tortas [--execute]
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const productId = Number(process.argv[2]);
const expectedSlug = process.argv[3];
const execute = process.argv.includes('--execute');

const assertLocal = () => {
  if (process.env.NODE_ENV !== 'development'
    || !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST)
    || process.env.DB_NAME !== 'DulceFlow'
    || process.env.SEED_DEMO_DATA !== 'false'
    || process.env.MERCADOPAGO_MODE === 'live') {
    throw new Error('Solo se permite en la base DulceFlow local de desarrollo sin pagos reales');
  }
  if (!Number.isInteger(productId) || productId <= 0 || !/^[a-z0-9-]+$/.test(expectedSlug || '')) {
    throw new Error('Indica el ID numérico y el slug exacto del producto');
  }
};

const query = async (db, sql, values = []) => (await db.query(sql, values))[0];
const count = async (db, sql, values) => Number((await query(db, sql, values))[0].total);

async function inspect(db, lock = false) {
  const products = await query(db,
    `SELECT id, name, slug, status, deleted_at FROM products WHERE id=?${lock ? ' FOR UPDATE' : ''}`,
    [productId]);
  if (products.length !== 1 || products[0].slug !== expectedSlug) throw new Error('ID y slug no corresponden al mismo producto');
  if (products[0].status !== 'INACTIVE' || !products[0].deleted_at) {
    throw new Error('Solo se puede purgar una ficha retirada y archivada');
  }
  const variants = await query(db, 'SELECT id, sku FROM product_variants WHERE product_id=? ORDER BY id', [productId]);
  const variantIds = variants.map((row) => row.id);
  const orderItems = await count(db, 'SELECT COUNT(*) AS total FROM order_items WHERE product_id=?', [productId]);
  const variantOrderItems = variantIds.length
    ? await count(db, `SELECT COUNT(*) AS total FROM order_items WHERE variant_id IN (${variantIds.map(() => '?').join(',')})`, variantIds)
    : 0;
  if (orderItems || variantOrderItems) throw new Error('Hay pedidos asociados: esta purga de demostración no elimina ventas');

  const directKeys = await query(db, `
    SELECT DISTINCT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME='products'
  `);
  const directReferences = [];
  for (const { tableName, columnName } of directKeys) {
    if (!/^[a-z][a-z0-9_]*$/.test(tableName) || !/^[a-z][a-z0-9_]*$/.test(columnName)) {
      throw new Error('Referencia inesperada en el esquema');
    }
    const total = await count(db, `SELECT COUNT(*) AS total FROM \`${tableName}\` WHERE \`${columnName}\`=?`, [productId]);
    if (total) directReferences.push({ tableName, columnName, total });
  }
  if (directReferences.some((row) => row.tableName !== 'product_variants')) {
    throw new Error(`El producto tiene relaciones adicionales: ${directReferences.filter((row) => row.tableName !== 'product_variants').map((row) => row.tableName).join(', ')}`);
  }

  const variantKeys = await query(db, `
    SELECT DISTINCT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME='product_variants'
  `);
  const variantReferences = [];
  if (variantIds.length) for (const { tableName, columnName } of variantKeys) {
    if (!/^[a-z][a-z0-9_]*$/.test(tableName) || !/^[a-z][a-z0-9_]*$/.test(columnName)) {
      throw new Error('Referencia inesperada en el esquema');
    }
    const total = await count(db,
      `SELECT COUNT(*) AS total FROM \`${tableName}\` WHERE \`${columnName}\` IN (${variantIds.map(() => '?').join(',')})`, variantIds);
    if (total) variantReferences.push({ tableName, columnName, total });
  }
  if (variantReferences.length) throw new Error(`Las presentaciones tienen relaciones: ${variantReferences.map((row) => row.tableName).join(', ')}`);

  const productAuditLogs = await count(db,
    "SELECT COUNT(*) AS total FROM audit_logs WHERE entity='products' AND entity_id=?", [String(productId)]);
  const variantAuditLogs = variantIds.length
    ? await count(db, `SELECT COUNT(*) AS total FROM audit_logs WHERE entity='product_variants' AND entity_id IN (${variantIds.map(() => '?').join(',')})`, variantIds.map(String))
    : 0;
  return { product: products[0], variants, directReferences, orderItems, variantOrderItems, productAuditLogs, variantAuditLogs };
}

function backupDatabase() {
  const directory = path.resolve(__dirname, '../../backups');
  fs.mkdirSync(directory, { recursive: true });
  const filename = `DulceFlow-before-purge-product-${productId}-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
  const file = path.join(directory, filename);
  const candidates = [process.env.MYSQLDUMP_PATH, 'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe', 'mysqldump'].filter(Boolean);
  const executable = candidates.find((candidate) => candidate === 'mysqldump' || fs.existsSync(candidate));
  if (!executable) throw new Error('No se encontró mysqldump para el respaldo');
  const args = [
    `--host=${process.env.DB_HOST}`, `--port=${process.env.DB_PORT}`, `--user=${process.env.DB_USER}`,
    '--single-transaction', '--quick', '--routines', '--triggers', '--events', '--set-gtid-purged=OFF',
    '--no-tablespaces', '--hex-blob', `--result-file=${file}`, process.env.DB_NAME,
  ];
  const result = spawnSync(executable, args, { env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD }, encoding: 'utf8' });
  if (result.status !== 0 || !fs.existsSync(file) || fs.statSync(file).size === 0) {
    if (fs.existsSync(file)) fs.rmSync(file);
    throw new Error('No se pudo crear el respaldo completo');
  }
  return file;
}

async function main() {
  assertLocal();
  const db = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  try {
    const plan = await inspect(db);
    if (!execute) {
      console.log(JSON.stringify({ mode: 'dry-run', plan }, null, 2));
      return;
    }
    const backup = backupDatabase();
    await db.beginTransaction();
    try {
      const locked = await inspect(db, true);
      const variantIds = locked.variants.map((row) => row.id);
      if (variantIds.length) await query(db,
        `DELETE FROM audit_logs WHERE entity='product_variants' AND entity_id IN (${variantIds.map(() => '?').join(',')})`,
        variantIds.map(String));
      await query(db, "DELETE FROM audit_logs WHERE entity='products' AND entity_id=?", [String(productId)]);
      const deleted = await query(db, 'DELETE FROM products WHERE id=? AND slug=? AND deleted_at IS NOT NULL', [productId, expectedSlug]);
      if (deleted.affectedRows !== 1) throw new Error('El producto cambió antes de la eliminación');
      if (await count(db, 'SELECT COUNT(*) AS total FROM product_variants WHERE product_id=?', [productId])) {
        throw new Error('Quedaron presentaciones tras la eliminación');
      }
      await db.commit();
      console.log(JSON.stringify({ mode: 'execute', plan: locked, purgedProductId: productId, backup, productAuditLogsRemoved: locked.productAuditLogs, variantAuditLogsRemoved: locked.variantAuditLogs }, null, 2));
    } catch (error) {
      await db.rollback();
      throw error;
    }
  } finally {
    await db.end();
  }
}

main().catch((error) => { console.error(`Purga falló: ${error.message}`); process.exitCode = 1; });
