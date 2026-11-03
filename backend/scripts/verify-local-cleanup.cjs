/** Verifica que la limpieza local no dejo catalogo, compras ni pedidos. */
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const seedImageDir = path.resolve(__dirname, '../../frontend/public/images/misky-catalog');
const mustBeEmpty = [
  'categories', 'products', 'product_variants', 'cake_product_profiles', 'recipes', 'recipe_items',
  'customization_groups', 'customization_options', 'product_customization_groups',
  'product_allergens', 'product_nutrition', 'product_dietary_tags',
  'suppliers', 'purchase_orders', 'purchase_order_items', 'inventory_lots', 'inventory_movements',
  'orders', 'order_items', 'payments', 'payment_attempts', 'refunds', 'kitchen_tickets',
];
async function query(db, sql, values = []) { return (await db.execute(sql, values))[0]; }
function fail(message) { throw new Error(message); }
function assertLocal() {
  if (process.env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST) || process.env.DB_NAME !== 'DulceFlow' || process.env.SEED_DEMO_DATA !== 'false') throw new Error('Solo se verifica la base local');
}
async function main() {
  assertLocal();
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  try {
    const emptyCounts = {};
    for (const table of mustBeEmpty) {
      const [[row]] = await db.query(`SELECT COUNT(*) AS total FROM \`${table}\``);
      emptyCounts[table] = Number(row.total);
      if (Number(row.total) !== 0) fail(`La tabla ${table} no esta vacia`);
    }
    const inventory = await query(db, 'SELECT id, code, name, image_url FROM inventory_items ORDER BY id');
    if (inventory.length !== 16) fail(`Se esperaban 16 insumos conservados y hay ${inventory.length}`);
    if (inventory.some((item) => item.code === 'INS-E458B06F9E7D4A7B' || /harina prueba/i.test(item.name))) fail('Quedo Harina PRUEBA');
    const stock = await query(db, 'SELECT COUNT(*) AS total, SUM(reserved) AS reserved FROM branch_inventory');
    if (Number(stock[0].total) !== 16 || Number(stock[0].reserved || 0) !== 0) fail('El inventario conservado no coincide');
    const media = await query(db, 'SELECT id, filename, url FROM media_assets WHERE deleted_at IS NULL');
    const keptUrls = new Set(inventory.map((item) => item.image_url).filter(Boolean));
    if (media.some((asset) => !keptUrls.has(asset.url))) fail('Hay una imagen sin insumo conservado');
    const missingFiles = media.filter((asset) => !fs.existsSync(path.resolve(__dirname, '../uploads/media', path.basename(asset.filename))));
    if (missingFiles.length) fail('Faltan archivos de imagen de insumos');
    const [[users]] = await db.query('SELECT COUNT(*) AS total FROM users');
    const [[branches]] = await db.query('SELECT COUNT(*) AS total FROM branches');
    if (Number(users.total) < 1 || Number(branches.total) < 1) fail('Se perdio la configuracion basica de acceso');
    console.log(JSON.stringify({ ok: true, emptyCounts, inventoryItems: inventory.length, stockRows: Number(stock[0].total), mediaAssets: media.length, users: Number(users.total), branches: Number(branches.total), seedImageDirectoryPresent: fs.existsSync(seedImageDir) }, null, 2));
  } finally { await db.end(); }
}
main().catch((error) => { console.error(`Verificacion de limpieza fallo: ${error.message}`); process.exitCode = 1; });
