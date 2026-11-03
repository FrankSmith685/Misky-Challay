/** Inspección de solo lectura; nunca imprime credenciales. */
const path = require('node:path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const tables = [
  'categories', 'products', 'product_variants', 'cake_product_profiles',
  'recipes', 'recipe_items', 'customization_groups', 'customization_options',
  'product_customization_groups', 'inventory_items', 'branch_inventory',
  'branches', 'orders', 'order_items', 'media_assets', 'cake_station_capacities',
];

async function main() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  try {
    const [rows] = await db.query('SHOW FULL TABLES');
    const existing = new Set(rows.map((row) => Object.values(row)[0]));
    const counts = {};
    for (const table of tables) {
      if (existing.has(table)) {
        const [[row]] = await db.query(`SELECT COUNT(*) AS total FROM \`${table}\``);
        counts[table] = Number(row.total);
      }
    }
    const select = async (sql) => (await db.query(sql))[0];
    const categories = await select('SELECT id, name, slug, is_active FROM categories ORDER BY id LIMIT 50');
    const products = await select('SELECT id, name, slug, type, status, category_id, image_url FROM products ORDER BY id LIMIT 50');
    const ingredients = await select('SELECT id, code, name, unit, is_active, image_url FROM inventory_items ORDER BY id LIMIT 100');
    const relations = await select(`SELECT DISTINCT table_name, column_name, referenced_table_name FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND referenced_table_name IN ('products','categories','product_variants','customization_groups','customization_options','inventory_items','recipes') ORDER BY referenced_table_name, table_name`);
    const orderItems = await select('SELECT id, order_id, product_id, variant_id FROM order_items ORDER BY id LIMIT 20');
    const orders = await select('SELECT id, order_number, status, scheduled_at FROM orders ORDER BY id LIMIT 20');
    const oldProfiles = await select('SELECT product_id, sale_mode, is_active FROM cake_product_profiles ORDER BY product_id');
    const oldRecipes = await select('SELECT r.product_id, r.variant_id, ri.inventory_item_id, ri.quantity FROM recipes r JOIN recipe_items ri ON ri.recipe_id = r.id ORDER BY r.product_id, ri.id');
    const oldOptions = await select('SELECT id, group_id, name, inventory_item_id, status FROM customization_options ORDER BY id');
    const branches = await select('SELECT id, name FROM branches ORDER BY id');
    const allergens = existing.has('allergens') ? await select('SELECT id, code, name FROM allergens ORDER BY id') : [];
    const historyCounts = {};
    for (const table of ['inventory_movements', 'inventory_lots', 'purchase_order_items', 'builder_events', 'builder_presets', 'cake_design_requests', 'product_reviews', 'product_favorites']) {
      if (existing.has(table)) {
        const [[row]] = await db.query(`SELECT COUNT(*) AS total FROM \`${table}\``);
        historyCounts[table] = Number(row.total);
      }
    }
    const tablesToDescribe = [...tables, 'product_allergens', 'product_nutrition', 'allergens'];
    const columns = {};
    for (const table of tablesToDescribe) {
      if (existing.has(table)) columns[table] = (await db.query(`SHOW COLUMNS FROM \`${table}\``))[0].map(({ Field, Type, Null, Default }) => ({ Field, Type, Null, Default }));
    }
    console.log(JSON.stringify({
      safeToReset: process.env.NODE_ENV === 'development' && ['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST) && process.env.SEED_DEMO_DATA === 'false',
      counts, historyCounts, categories, products, ingredients, relations, orders, orderItems,
      oldProfiles, oldRecipes, oldOptions, branches, allergens, columns,
    }, null, 2));
  } finally { await db.end(); }
}
main().catch((error) => { console.error(`Inspección falló: ${error.message}`); process.exitCode = 1; });
