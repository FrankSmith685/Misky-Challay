/**
 * Crea un ejemplo minimo y coherente de Proveedor -> Compra -> Inventario.
 * Conserva el stock existente y solo agrega una recepcion demostrativa.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const backupRoot = path.resolve(__dirname, '../../backups');
const branchName = 'Misky Challay Miraflores';
const itemCode = 'MC-HARINA-TRIGO';
const supplierCode = 'DEMO-PROV-001';
const orderNumber = 'OC-DEMO-20261022-001';
const lotCode = 'LOTE-DEMO-20261022-HARINA';
const quantity = 5000;
const unitCost = 0.004;
const marker = 'DEMO-FLUJO-COMPRAS-INVENTARIO-2026-10-22';

function assertLocal() {
  if (process.env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST) || process.env.DB_NAME !== 'DulceFlow' || process.env.SEED_DEMO_DATA !== 'false' || process.env.MERCADOPAGO_MODE === 'live') {
    throw new Error('Solo se permite en la base DulceFlow de desarrollo local sin pagos reales');
  }
  if (!process.env.ADMIN_EMAIL) throw new Error('Falta ADMIN_EMAIL');
}
async function query(db, sql, values = []) { return (await db.execute(sql, values))[0]; }
function round4(value) { return Math.round((Number(value) + Number.EPSILON) * 10000) / 10000; }
function round2(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }

function createBackup() {
  fs.mkdirSync(backupRoot, { recursive: true });
  const file = path.join(backupRoot, `DulceFlow-before-demo-procurement-link-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`);
  const executable = [process.env.MYSQLDUMP_PATH, 'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe', 'mysqldump'].filter(Boolean).find((candidate) => candidate === 'mysqldump' || fs.existsSync(candidate));
  if (!executable) throw new Error('No se encontro mysqldump');
  const result = spawnSync(executable, ['--host=' + process.env.DB_HOST, '--port=' + process.env.DB_PORT, '--user=' + process.env.DB_USER, '--single-transaction', '--quick', '--routines', '--triggers', '--events', '--set-gtid-purged=OFF', '--no-tablespaces', '--hex-blob', '--result-file=' + file, process.env.DB_NAME], { env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD }, encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
  if (result.status !== 0 || !fs.existsSync(file)) throw new Error('No se pudo crear el respaldo');
  const sql = fs.readFileSync(file, 'utf8');
  if (sql.length < 10000 || (sql.match(/CREATE TABLE /g) || []).length < 90) throw new Error('El respaldo esta incompleto');
  return file;
}

async function inspect(db) {
  const owners = await query(db, 'SELECT id FROM users WHERE LOWER(email)=LOWER(?) AND is_super_admin=1 AND status=?', [process.env.ADMIN_EMAIL, 'ACTIVE']);
  if (owners.length !== 1) throw new Error('No se pudo verificar la cuenta propietaria');
  const [branch] = await query(db, 'SELECT id, name FROM branches WHERE name=? AND is_active=1 LIMIT 1', [branchName]);
  if (!branch) throw new Error('No se encontro la sede Misky Challay Miraflores');
  const [item] = await query(db, 'SELECT id, code, name, unit FROM inventory_items WHERE code=? AND is_active=1', [itemCode]);
  if (!item) throw new Error(`No se encontro el insumo ${itemCode}`);
  const [stock] = await query(db, 'SELECT id, on_hand, reserved, average_unit_cost FROM branch_inventory WHERE branch_id=? AND inventory_item_id=?', [branch.id, item.id]);
  if (!stock) throw new Error('El insumo no tiene fila de inventario en la sede');
  if (Number(stock.reserved) > 0) throw new Error('El insumo tiene stock reservado');
  const existingSupplier = await query(db, 'SELECT id FROM suppliers WHERE code=?', [supplierCode]);
  const existingOrder = await query(db, 'SELECT id FROM purchase_orders WHERE order_number=?', [orderNumber]);
  const existingLot = await query(db, 'SELECT id FROM inventory_lots WHERE branch_id=? AND inventory_item_id=? AND lot_code=?', [branch.id, item.id, lotCode]);
  if (existingSupplier.length || existingOrder.length || existingLot.length) throw new Error('El ejemplo demostrativo ya existe; no se duplicara');
  return { ownerId: owners[0].id, branch, item, stock };
}

async function seed(db, context) {
  const subtotal = round2(quantity * unitCost);
  const tax = round2(subtotal * 0.18);
  const total = round2(subtotal + tax);
  const oldOnHand = Number(context.stock.on_hand);
  const oldAverage = Number(context.stock.average_unit_cost);
  const nextOnHand = round2(oldOnHand + quantity);
  const nextAverage = round4(((oldOnHand * oldAverage) + (quantity * unitCost)) / Math.max(nextOnHand, 1));
  await db.beginTransaction();
  try {
    const supplierResult = await query(db, `INSERT INTO suppliers
      (code,name,tax_id,contact_name,email,phone,address,payment_terms_days,notes,is_active,created_at,updated_at)
      VALUES (?,?,NULL,NULL,NULL,NULL,NULL,?,?,1,NOW(),NOW())`, [supplierCode, 'Proveedor demostrativo de insumos base', 7, `${marker} | Sirve para mostrar la relacion entre proveedor, compra e inventario. Reemplazar por datos reales antes de produccion.`]);
    const supplierId = supplierResult.insertId;
    const orderResult = await query(db, `INSERT INTO purchase_orders
      (order_number,branch_id,supplier_id,status,ordered_at,expected_at,received_at,notes,subtotal,tax,total,created_by,received_by,created_at,updated_at)
      VALUES (?,?,?,'RECEIVED',NOW(),NOW(),NOW(),?,?,?,?,?,?,NOW(),NOW())`, [orderNumber, context.branch.id, supplierId, `${marker} | Compra recibida para explicar el flujo. Cantidad y costo son de demostracion.`, subtotal, tax, total, context.ownerId, context.ownerId]);
    const purchaseOrderId = orderResult.insertId;
    const lineResult = await query(db, `INSERT INTO purchase_order_items
      (purchase_order_id,inventory_item_id,quantity_ordered,quantity_received,unit_cost,lot_code,expires_at,notes,created_at,updated_at)
      VALUES (?,?,?,?,?,?,NULL,?,NOW(),NOW())`, [purchaseOrderId, context.item.id, quantity, quantity, unitCost, lotCode, `${marker} | Recepcion completa.`]);
    const lotResult = await query(db, `INSERT INTO inventory_lots
      (branch_id,inventory_item_id,supplier_id,purchase_order_id,purchase_order_item_id,lot_code,received_at,expires_at,quantity_received,quantity_available,unit_cost,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,NOW(),NULL,?,?,?,'ACTIVE',NOW(),NOW())`, [context.branch.id, context.item.id, supplierId, purchaseOrderId, lineResult.insertId, lotCode, quantity, quantity, unitCost]);
    await query(db, `INSERT INTO inventory_movements
      (branch_id,inventory_item_id,type,quantity,on_hand_after,reserved_after,lot_id,purchase_order_id,unit_cost,total_cost,order_id,actor_id,reason,created_at,updated_at)
      VALUES (?,?, 'PURCHASE', ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NOW(), NOW())`, [context.branch.id, context.item.id, quantity, nextOnHand, Number(context.stock.reserved), lotResult.insertId, purchaseOrderId, unitCost, subtotal, context.ownerId, `Recepcion de compra ${orderNumber}`]);
    await query(db, 'UPDATE branch_inventory SET on_hand=?, average_unit_cost=?, updated_at=NOW() WHERE id=?', [nextOnHand, nextAverage, context.stock.id]);
    await query(db, 'UPDATE inventory_items SET unit_cost=?, updated_at=NOW() WHERE id=?', [unitCost, context.item.id]);
    await db.commit();
    return { supplierId, purchaseOrderId, purchaseOrderItemId: lineResult.insertId, lotId: lotResult.insertId, beforeOnHand: oldOnHand, afterOnHand: nextOnHand, averageUnitCost: nextAverage, subtotal, tax, total };
  } catch (error) { await db.rollback(); throw error; }
}

async function main() {
  assertLocal();
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  try {
    const context = await inspect(db);
    const plan = { supplier: 'Proveedor demostrativo de insumos base', orderNumber, item: context.item, quantity, unitCost, currentStock: Number(context.stock.on_hand), note: 'El registro queda visible en Proveedores, Compras y lotes de Inventario.' };
    if (!process.argv.includes('--execute')) { console.log(JSON.stringify({ mode: 'dry-run', branch: context.branch, plan }, null, 2)); return; }
    const backup = createBackup();
    const result = await seed(db, context);
    console.log(JSON.stringify({ mode: 'executed', backup, branch: context.branch, plan, result }, null, 2));
  } finally { await db.end(); }
}
main().catch((error) => { console.error(`Carga demostrativa fallo: ${error.message}`); process.exitCode = 1; });
