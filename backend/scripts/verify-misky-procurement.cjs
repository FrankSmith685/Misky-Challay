/** Verificacion de solo lectura del flujo Proveedores -> Compras -> Inventario. */
const path = require('node:path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const supplierCodes = ['MC-PROV-SECO', 'MC-PROV-FRESCO'];
const orderNumbers = ['MC-OC-20261022-SECO', 'MC-OC-20261022-FRESCO'];

function assertLocal() {
  if (process.env.NODE_ENV !== 'development' ||
      !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST) ||
      process.env.DB_NAME !== 'DulceFlow' || process.env.SEED_DEMO_DATA !== 'false') {
    throw new Error('La verificacion solo permite la base local de desarrollo');
  }
}
async function query(db, sql, values = []) { return (await db.execute(sql, values))[0]; }
function fail(message) { throw new Error(message); }

async function main() {
  assertLocal();
  const db = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  try {
    const suppliers = await query(db,
      `SELECT id, code, name, payment_terms_days FROM suppliers WHERE code IN (?, ?) ORDER BY code`, supplierCodes);
    if (suppliers.length !== 2) fail('No estan los dos proveedores sembrados');
    const orders = await query(db,
      `SELECT id, order_number, supplier_id, status, subtotal, tax, total FROM purchase_orders WHERE order_number IN (?, ?) ORDER BY order_number`, orderNumbers);
    if (orders.length !== 2 || orders.some((order) => order.status !== 'RECEIVED')) fail('Las dos compras deben estar recibidas');
    const orderIds = orders.map((order) => order.id);
    const placeholders = orderIds.map(() => '?').join(',');
    const lines = await query(db,
      `SELECT poi.id, poi.purchase_order_id, poi.inventory_item_id, i.code, i.name, i.unit,
              poi.quantity_ordered, poi.quantity_received, poi.unit_cost, poi.lot_code
         FROM purchase_order_items poi
         JOIN inventory_items i ON i.id=poi.inventory_item_id
        WHERE poi.purchase_order_id IN (${placeholders}) ORDER BY i.code`, orderIds);
    if (lines.length !== 15 || lines.some((line) => !String(line.code).startsWith('MC-') || Number(line.quantity_received) !== Number(line.quantity_ordered) || Number(line.quantity_received) <= 0)) {
      fail('Las compras no tienen los 15 insumos MC recibidos completamente');
    }
    const lineIds = lines.map((line) => line.id);
    const linePlaceholders = lineIds.map(() => '?').join(',');
    const lots = await query(db,
      `SELECT il.id, il.inventory_item_id, il.purchase_order_id, il.purchase_order_item_id,
              il.quantity_received, il.quantity_available, il.unit_cost, il.status, il.expires_at
         FROM inventory_lots il WHERE il.purchase_order_item_id IN (${linePlaceholders}) ORDER BY il.id`, lineIds);
    if (lots.length !== 15 || lots.some((lot) => lot.status !== 'ACTIVE' || Number(lot.quantity_available) !== Number(lot.quantity_received))) {
      fail('Cada linea recibida debe tener un lote activo con stock disponible');
    }
    const itemIds = lines.map((line) => line.inventory_item_id);
    const itemPlaceholders = itemIds.map(() => '?').join(',');
    const stock = await query(db,
      `SELECT bi.inventory_item_id, i.code, bi.on_hand, bi.reserved, bi.average_unit_cost
         FROM branch_inventory bi JOIN inventory_items i ON i.id=bi.inventory_item_id
        WHERE i.id IN (${itemPlaceholders}) ORDER BY i.code`, itemIds);
    if (stock.length !== 15 || stock.some((row) => Number(row.on_hand) <= 0 || Number(row.average_unit_cost) <= 0)) {
      fail('El stock recibido no se reflejo en las 15 filas de inventario');
    }
    const movements = await query(db,
      `SELECT inventory_item_id, purchase_order_id, lot_id, quantity, unit_cost, total_cost
         FROM inventory_movements WHERE purchase_order_id IN (${placeholders}) AND type='PURCHASE'`, orderIds);
    if (movements.length !== 15 || movements.some((movement) => Number(movement.quantity) <= 0 || !movement.lot_id)) {
      fail('Faltan movimientos PURCHASE vinculados a las compras');
    }
    const [[counts]] = await db.query(`SELECT
      (SELECT COUNT(*) FROM suppliers) AS suppliers_total,
      (SELECT COUNT(*) FROM purchase_orders) AS purchase_orders_total,
      (SELECT COUNT(*) FROM purchase_order_items) AS purchase_order_items_total,
      (SELECT COUNT(*) FROM inventory_lots) AS inventory_lots_total,
      (SELECT COUNT(*) FROM inventory_movements WHERE type='PURCHASE') AS purchase_movements_total`);
    console.log(JSON.stringify({
      ok: true,
      suppliers,
      orders,
      receivedLines: lines.length,
      activeLots: lots.length,
      stockedItems: stock.length,
      purchaseMovements: movements.length,
      totals: counts,
    }, null, 2));
  } finally { await db.end(); }
}
main().catch((error) => { console.error(`Verificacion fallo: ${error.message}`); process.exitCode = 1; });
