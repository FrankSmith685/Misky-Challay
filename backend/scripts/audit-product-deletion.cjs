/** Auditoría de solo lectura para preparar la eliminación definitiva de un producto. */
const path = require('node:path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const productId = Number(process.argv[2]);
if (!Number.isInteger(productId) || productId <= 0) throw new Error('Indica un ID de producto válido');

async function main() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  try {
    const [products] = await db.query('SELECT id, name, slug, status, deleted_at FROM products WHERE id=?', [productId]);
    if (products.length !== 1) throw new Error('Producto no encontrado');
    const [foreignKeys] = await db.query(`
      SELECT DISTINCT k.TABLE_NAME AS tableName, k.COLUMN_NAME AS columnName
      FROM information_schema.KEY_COLUMN_USAGE k
      WHERE k.TABLE_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME='products'
      ORDER BY k.TABLE_NAME, k.COLUMN_NAME
    `);
    const references = [];
    for (const row of foreignKeys) {
      if (!/^[a-z][a-z0-9_]*$/.test(row.tableName) || !/^[a-z][a-z0-9_]*$/.test(row.columnName)) {
        throw new Error('Referencia inesperada en el esquema');
      }
      const [[count]] = await db.query(`SELECT COUNT(*) AS total FROM \`${row.tableName}\` WHERE \`${row.columnName}\`=?`, [productId]);
      if (Number(count.total) > 0) references.push({ ...row, total: Number(count.total) });
    }
    const [[orderItems]] = await db.query('SELECT COUNT(*) AS total FROM order_items WHERE product_id=?', [productId]);
    const [[auditLogs]] = await db.query("SELECT COUNT(*) AS total FROM audit_logs WHERE entity='products' AND entity_id=?", [String(productId)]);
    const [variants] = await db.query('SELECT id, sku FROM product_variants WHERE product_id=? ORDER BY id', [productId]);
    const variantIds = variants.map((row) => row.id);
    const variantReferences = [];
    if (variantIds.length) {
      const [keys] = await db.query(`
        SELECT DISTINCT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME='product_variants'
      `);
      const placeholders = variantIds.map(() => '?').join(',');
      for (const row of keys) {
        if (!/^[a-z][a-z0-9_]*$/.test(row.tableName) || !/^[a-z][a-z0-9_]*$/.test(row.columnName)) {
          throw new Error('Referencia inesperada en el esquema');
        }
        const [[count]] = await db.query(`SELECT COUNT(*) AS total FROM \`${row.tableName}\` WHERE \`${row.columnName}\` IN (${placeholders})`, variantIds);
        if (Number(count.total) > 0) variantReferences.push({ ...row, total: Number(count.total) });
      }
    }
    const [[variantOrderItems]] = variantIds.length
      ? await db.query(`SELECT COUNT(*) AS total FROM order_items WHERE variant_id IN (${variantIds.map(() => '?').join(',')})`, variantIds)
      : [[{ total: 0 }]];
    const [[variantAuditLogs]] = variantIds.length
      ? await db.query(`SELECT COUNT(*) AS total FROM audit_logs WHERE entity='product_variants' AND entity_id IN (${variantIds.map(() => '?').join(',')})`, variantIds.map(String))
      : [[{ total: 0 }]];
    console.log(JSON.stringify({
      product: products[0], references, variants, variantReferences,
      orderItems: Number(orderItems.total), variantOrderItems: Number(variantOrderItems.total),
      directAuditLogs: Number(auditLogs.total), variantAuditLogs: Number(variantAuditLogs.total),
    }, null, 2));
  } finally {
    await db.end();
  }
}

main().catch((error) => { console.error(`Auditoría falló: ${error.message}`); process.exitCode = 1; });
