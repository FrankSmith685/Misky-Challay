/** Corrige la precision del costo promedio de la carga MC (DECIMAL(12,4)). */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const backupDir = path.resolve(__dirname, '../../backups');
function assertLocal() {
  if (process.env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST) || process.env.DB_NAME !== 'DulceFlow' || process.env.SEED_DEMO_DATA !== 'false') throw new Error('Solo se permite en la base local de desarrollo');
}
async function query(db, sql, values = []) { return (await db.execute(sql, values))[0]; }
function backup() {
  fs.mkdirSync(backupDir, { recursive: true });
  const file = path.join(backupDir, `DulceFlow-before-misky-procurement-cost-repair-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`);
  const executable = [process.env.MYSQLDUMP_PATH, 'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe', 'mysqldump'].filter(Boolean).find((candidate) => candidate === 'mysqldump' || fs.existsSync(candidate));
  if (!executable) throw new Error('No se encontro mysqldump');
  const result = spawnSync(executable, ['--host=' + process.env.DB_HOST, '--port=' + process.env.DB_PORT, '--user=' + process.env.DB_USER, '--single-transaction', '--quick', '--routines', '--triggers', '--events', '--set-gtid-purged=OFF', '--no-tablespaces', '--hex-blob', '--result-file=' + file, process.env.DB_NAME], { env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD }, encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
  if (result.status !== 0 || !fs.existsSync(file)) throw new Error('No se pudo crear el respaldo');
  return file;
}
async function main() {
  assertLocal();
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  try {
    const rows = await query(db, `SELECT bi.id, bi.inventory_item_id, i.code,
      COALESCE(SUM(il.quantity_available), 0) AS quantity,
      COALESCE(SUM(il.quantity_available * il.unit_cost) / NULLIF(SUM(il.quantity_available), 0), 0) AS weighted_cost
      FROM branch_inventory bi JOIN inventory_items i ON i.id=bi.inventory_item_id
      LEFT JOIN inventory_lots il ON il.branch_id=bi.branch_id AND il.inventory_item_id=bi.inventory_item_id AND il.status='ACTIVE'
      WHERE bi.branch_id=1 AND i.code LIKE 'MC-%'
      GROUP BY bi.id, bi.inventory_item_id, i.code ORDER BY i.code`);
    if (rows.length !== 15 || rows.some((row) => Number(row.quantity) <= 0)) throw new Error('No se encontraron los 15 lotes activos MC');
    const file = backup();
    await db.beginTransaction();
    try {
      for (const row of rows) {
        const cost = Math.round(Number(row.weighted_cost) * 10000) / 10000;
        await query(db, 'UPDATE branch_inventory SET average_unit_cost=?, updated_at=NOW() WHERE id=?', [cost, row.id]);
      }
      await db.commit();
    } catch (error) { await db.rollback(); throw error; }
    console.log(JSON.stringify({ ok: true, backup: file, repaired: rows.map((row) => ({ code: row.code, averageUnitCost: Math.round(Number(row.weighted_cost) * 10000) / 10000 })) }, null, 2));
  } finally { await db.end(); }
}
main().catch((error) => { console.error(`Reparacion fallo: ${error.message}`); process.exitCode = 1; });
