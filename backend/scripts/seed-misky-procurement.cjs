/**
 * Carga proveedores y compras recibidas para los insumos MC-* de la torta
 * personalizada Misky Challay. Es una carga demostrativa local y aditiva:
 * nunca borra ni modifica compras historicas.
 *
 * Uso seguro:
 *   node seed-misky-procurement.cjs              # solo muestra el plan
 *   node seed-misky-procurement.cjs --execute    # crea respaldo y ejecuta
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const backupDir = path.resolve(__dirname, '../../backups');
const marker = 'MISKY-PROCUREMENT-SEED-2026-10-22';
const branchName = 'Misky Challay Miraflores';

const suppliers = [
  {
    code: 'MC-PROV-SECO',
    name: 'Distribuidora Dulce Andina',
    paymentTermsDays: 7,
    notes: `${marker} | Proveedor demostrativo de insumos secos y empaque. Sustituir por datos de factura antes de operar en produccion.`,
    orderNumber: 'MC-OC-20261022-SECO',
    lotPrefix: 'MC-20261022-SECO',
  },
  {
    code: 'MC-PROV-FRESCO',
    name: 'Lacteos y Frutas Misky',
    paymentTermsDays: 15,
    notes: `${marker} | Proveedor demostrativo de insumos frescos y preparados. Sustituir por datos de factura antes de operar en produccion.`,
    orderNumber: 'MC-OC-20261022-FRESCO',
    lotPrefix: 'MC-20261022-FRESCO',
  },
];

// Costos en la unidad real del insumo (g, ml o unidad). Son valores de
// demostracion para que el flujo Compras -> Inventario pueda comprobarse.
const items = [
  ['MC-HARINA-TRIGO', 'MC-PROV-SECO', 10000, 0.0035, null, 'Harina para reposteria'],
  ['MC-AZUCAR', 'MC-PROV-SECO', 10000, 0.0025, null, 'Azucar blanca'],
  ['MC-CACAO', 'MC-PROV-SECO', 2000, 0.018, '2026-11-22', 'Cacao puro en polvo'],
  ['MC-POLVO-HORNEAR', 'MC-PROV-SECO', 500, 0.02, '2027-04-22', 'Polvo para hornear'],
  ['MC-VAINILLA', 'MC-PROV-SECO', 500, 0.04, '2027-04-22', 'Extracto de vainilla'],
  ['MC-CAJA-TORTA', 'MC-PROV-SECO', 20, 3.5, null, 'Caja para torta'],
  ['MC-BASE-TORTA', 'MC-PROV-SECO', 20, 1.5, null, 'Base rigida para torta'],
  ['MC-HUEVO', 'MC-PROV-FRESCO', 60, 0.5, '2026-10-29', 'Huevos frescos'],
  ['MC-MANTEQUILLA', 'MC-PROV-FRESCO', 5000, 0.016, '2026-11-05', 'Mantequilla sin sal'],
  ['MC-LECHE', 'MC-PROV-FRESCO', 5000, 0.003, '2026-10-29', 'Leche entera'],
  ['MC-MANJAR', 'MC-PROV-FRESCO', 5000, 0.01, '2026-11-05', 'Manjar blanco'],
  ['MC-RELLENO-FRESA', 'MC-PROV-FRESCO', 5000, 0.012, '2026-11-05', 'Relleno de fresa'],
  ['MC-BUTTERCREAM', 'MC-PROV-FRESCO', 5000, 0.012, '2026-11-05', 'Crema de mantequilla'],
  ['MC-GANACHE', 'MC-PROV-FRESCO', 5000, 0.016, '2026-11-05', 'Ganache de chocolate'],
  ['MC-FRESAS', 'MC-PROV-FRESCO', 3000, 0.012, '2026-10-29', 'Fresas frescas'],
];

function round2(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
function round4(value) { return Math.round((Number(value) + Number.EPSILON) * 10000) / 10000; }

function assertLocal() {
  if (process.env.NODE_ENV !== 'development' ||
      !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST) ||
      process.env.DB_NAME !== 'DulceFlow' ||
      process.env.SEED_DEMO_DATA !== 'false' ||
      process.env.MERCADOPAGO_MODE === 'live') {
    throw new Error('Solo se permite en la base DulceFlow de desarrollo local sin pagos reales');
  }
  if (!process.env.ADMIN_EMAIL) throw new Error('Falta ADMIN_EMAIL para verificar al propietario');
}

async function query(db, sql, values = []) {
  const [result] = await db.execute(sql, values);
  return result;
}

function createBackup() {
  fs.mkdirSync(backupDir, { recursive: true });
  const file = path.join(backupDir, `DulceFlow-before-misky-procurement-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`);
  const candidates = [process.env.MYSQLDUMP_PATH,
    'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe', 'mysqldump'].filter(Boolean);
  const executable = candidates.find((candidate) => candidate === 'mysqldump' || fs.existsSync(candidate));
  if (!executable) throw new Error('No se encontro mysqldump para crear el respaldo');
  const args = ['--host=' + process.env.DB_HOST, '--port=' + process.env.DB_PORT,
    '--user=' + process.env.DB_USER, '--single-transaction', '--quick',
    '--routines', '--triggers', '--events', '--set-gtid-purged=OFF',
    '--no-tablespaces', '--hex-blob', '--result-file=' + file, process.env.DB_NAME];
  const result = spawnSync(executable, args, {
    env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD },
    encoding: 'utf8', maxBuffer: 5 * 1024 * 1024,
  });
  if (result.status !== 0 || !fs.existsSync(file)) {
    if (fs.existsSync(file)) fs.rmSync(file);
    throw new Error('No se pudo crear el respaldo');
  }
  const sql = fs.readFileSync(file, 'utf8');
  const tables = (sql.match(/CREATE TABLE /g) || []).length;
  if (sql.length < 10000 || tables < 90) {
    fs.rmSync(file);
    throw new Error('El respaldo esta incompleto');
  }
  return { file, tables };
}

async function inspect(db) {
  const owners = await query(db,
    'SELECT id FROM users WHERE LOWER(email)=LOWER(?) AND is_super_admin=1 AND status=?',
    [process.env.ADMIN_EMAIL, 'ACTIVE']);
  if (owners.length !== 1) throw new Error('No se pudo verificar la cuenta propietaria');

  const branches = await query(db, 'SELECT id, name FROM branches WHERE is_active=1 ORDER BY id');
  if (!branches.length) throw new Error('No hay una sede activa para recibir la compra');
  const branch = branches.find((row) => row.name === branchName) || branches[0];

  const materialRows = await query(db,
    `SELECT id, code, name, unit, unit_cost FROM inventory_items WHERE code IN (${items.map(() => '?').join(',')}) ORDER BY code`,
    items.map(([code]) => code));
  if (materialRows.length !== items.length) throw new Error('No se encontraron los 15 insumos MC-* esperados');
  const materialByCode = new Map(materialRows.map((row) => [row.code, row]));

  const missingStock = await query(db,
    `SELECT inventory_item_id FROM branch_inventory WHERE branch_id=? AND inventory_item_id IN (${items.map(() => '?').join(',')})`,
    [branch.id, ...materialRows.map((row) => row.id)]);
  if (missingStock.length !== items.length) throw new Error('Faltan filas de inventario en la sede seleccionada');

  const existingSuppliers = await query(db,
    `SELECT id, code FROM suppliers WHERE code IN (${suppliers.map(() => '?').join(',')})`,
    suppliers.map((supplier) => supplier.code));
  if (existingSuppliers.length) throw new Error('Ya existe una carga de proveedores MC; no se duplicara');
  const existingOrders = await query(db, 'SELECT id, order_number FROM purchase_orders WHERE order_number IN (?, ?)', suppliers.map((supplier) => supplier.orderNumber));
  if (existingOrders.length) throw new Error('Ya existe una orden de compra MC; no se duplicara');

  return { ownerId: owners[0].id, branch, materialRows, materialByCode };
}

async function seed(db, context) {
  const supplierIds = new Map();
  const orderIds = new Map();
  const receivedAt = new Date();
  await db.beginTransaction();
  try {
    for (const supplier of suppliers) {
      const result = await query(db,
        `INSERT INTO suppliers
          (code, name, tax_id, contact_name, email, phone, address, payment_terms_days, notes, is_active, created_at, updated_at)
         VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, 1, NOW(), NOW())`,
        [supplier.code, supplier.name, supplier.paymentTermsDays, supplier.notes]);
      supplierIds.set(supplier.code, result.insertId);
    }

    for (const supplier of suppliers) {
      const lines = items.filter((item) => item[1] === supplier.code);
      const subtotal = round2(lines.reduce((sum, [, , quantity, unitCost]) => sum + quantity * unitCost, 0));
      const tax = round2(subtotal * 0.18);
      const total = round2(subtotal + tax);
      const orderResult = await query(db,
        `INSERT INTO purchase_orders
          (order_number, branch_id, supplier_id, status, ordered_at, expected_at, received_at, notes, subtotal, tax, total, created_by, received_by, created_at, updated_at)
         VALUES (?, ?, ?, 'RECEIVED', ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [supplier.orderNumber, context.branch.id, supplierIds.get(supplier.code), receivedAt, receivedAt, receivedAt,
          `${marker} | Compra recibida de demostracion para stock inicial de la torta personalizada. Los costos son referenciales.`,
          subtotal, tax, total, context.ownerId, context.ownerId]);
      const purchaseOrderId = orderResult.insertId;
      orderIds.set(supplier.code, purchaseOrderId);

      let position = 1;
      for (const [code, , quantity, unitCost, expiresAt, label] of lines) {
        const material = context.materialByCode.get(code);
        const lotCode = `${supplier.lotPrefix}-${String(position).padStart(3, '0')}`;
        const itemResult = await query(db,
          `INSERT INTO purchase_order_items
            (purchase_order_id, inventory_item_id, quantity_ordered, quantity_received, unit_cost, lot_code, expires_at, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [purchaseOrderId, material.id, quantity, quantity, unitCost, lotCode, expiresAt,
            `${marker} | ${label}; lote recibido completo.`]);
        const purchaseOrderItemId = itemResult.insertId;
        const stockRows = await query(db,
          'SELECT id, on_hand, reserved, average_unit_cost FROM branch_inventory WHERE branch_id=? AND inventory_item_id=? FOR UPDATE',
          [context.branch.id, material.id]);
        if (stockRows.length !== 1) throw new Error(`No hay stock de sede para ${code}`);
        const stock = stockRows[0];
        const oldOnHand = Number(stock.on_hand);
        const oldReserved = Number(stock.reserved);
        const oldAverage = Number(stock.average_unit_cost);
        const nextOnHand = round2(oldOnHand + quantity);
        const nextAverage = round4(((oldOnHand * oldAverage) + (quantity * unitCost)) / Math.max(nextOnHand, 1));

        const lotResult = await query(db,
          `INSERT INTO inventory_lots
            (branch_id, inventory_item_id, supplier_id, purchase_order_id, purchase_order_item_id, lot_code, received_at, expires_at, quantity_received, quantity_available, unit_cost, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', NOW(), NOW())`,
          [context.branch.id, material.id, supplierIds.get(supplier.code), purchaseOrderId, purchaseOrderItemId,
            lotCode, receivedAt, expiresAt, quantity, quantity, unitCost]);
        await query(db,
          `INSERT INTO inventory_movements
            (branch_id, inventory_item_id, type, quantity, on_hand_after, reserved_after, lot_id, purchase_order_id, unit_cost, total_cost, order_id, actor_id, reason, created_at, updated_at)
           VALUES (?, ?, 'PURCHASE', ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NOW(), NOW())`,
          [context.branch.id, material.id, quantity, nextOnHand, oldReserved, lotResult.insertId, purchaseOrderId,
            unitCost, round2(quantity * unitCost), context.ownerId, `Recepcion de compra ${supplier.orderNumber}`]);
        await query(db,
          'UPDATE branch_inventory SET on_hand=?, average_unit_cost=?, updated_at=NOW() WHERE id=?',
          [nextOnHand, nextAverage, stock.id]);
        await query(db,
          'UPDATE inventory_items SET unit_cost=?, updated_at=NOW() WHERE id=?',
          [unitCost, material.id]);
        position += 1;
      }
    }
    await db.commit();
  } catch (error) {
    await db.rollback();
    throw error;
  }
  return { supplierIds, orderIds };
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
    const plan = suppliers.map((supplier) => {
      const lines = items.filter((item) => item[1] === supplier.code);
      const subtotal = round2(lines.reduce((sum, [, , quantity, unitCost]) => sum + quantity * unitCost, 0));
      return { supplier: supplier.name, code: supplier.code, orderNumber: supplier.orderNumber, lines: lines.length, subtotal, tax: round2(subtotal * 0.18), total: round2(subtotal * 1.18) };
    });
    if (!process.argv.includes('--execute')) {
      console.log(JSON.stringify({ mode: 'dry-run', branch: context.branch, suppliers: plan, totalItems: items.length, note: 'Los costos y cantidades son demostrativos; se reemplazan por factura y conteo real antes de produccion.' }, null, 2));
      return;
    }
    const backup = createBackup();
    const result = await seed(db, context);
    console.log(JSON.stringify({ mode: 'executed', backup, branch: context.branch, suppliers: plan, totalItems: items.length, supplierIds: Object.fromEntries(result.supplierIds), purchaseOrderIds: Object.fromEntries(result.orderIds) }, null, 2));
  } finally {
    await db.end();
  }
}

main().catch((error) => { console.error(`Carga de compras fallo: ${error.message}`); process.exitCode = 1; });
