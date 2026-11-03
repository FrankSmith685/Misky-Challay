/** Auditoría de solo lectura: insumos usados por tortas y estado de clasificación. */
const path = require('node:path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

async function main() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  try {
    const [columns] = await db.query("SHOW COLUMNS FROM inventory_items LIKE 'allergens'");
    const hasAllergens = columns.length > 0;
    const [profiles] = await db.query(`
      SELECT p.id, p.name, p.status, p.allergens_reviewed_at, cpp.sale_mode
      FROM cake_product_profiles cpp JOIN products p ON p.id = cpp.product_id
      ORDER BY p.id
    `);
    const [items] = await db.query(`
      SELECT i.id, i.code, i.name, ${hasAllergens ? 'i.allergens' : 'NULL AS allergens'},
        COUNT(DISTINCT r.product_id) AS recipe_products,
        COUNT(DISTINCT pcg.product_id) AS option_products
      FROM inventory_items i
      LEFT JOIN recipe_items ri ON ri.inventory_item_id = i.id
      LEFT JOIN recipes r ON r.id = ri.recipe_id AND r.is_active = 1
      LEFT JOIN customization_options co ON co.inventory_item_id = i.id AND co.status = 'ACTIVE'
      LEFT JOIN product_customization_groups pcg ON pcg.group_id = co.group_id AND pcg.is_active = 1
      WHERE r.product_id IN (SELECT product_id FROM cake_product_profiles)
        OR pcg.product_id IN (SELECT product_id FROM cake_product_profiles)
      GROUP BY i.id
      ORDER BY i.code
    `);
    const [unclassifiedItems] = hasAllergens ? await db.query(`
      SELECT code, name FROM inventory_items WHERE allergens IS NULL ORDER BY code
    `) : [[]];
    const [options] = await db.query(`
      SELECT co.id, co.name, co.inventory_item_id, co.allergens, co.status
      FROM customization_options co
      JOIN product_customization_groups pcg ON pcg.group_id = co.group_id AND pcg.is_active = 1
      JOIN cake_product_profiles cpp ON cpp.product_id = pcg.product_id
      WHERE co.status = 'ACTIVE'
      GROUP BY co.id
      ORDER BY co.id
    `);
    const optionAllergensByItem = {};
    for (const option of options) {
      if (option.inventory_item_id === null) continue;
      const current = new Set(optionAllergensByItem[option.inventory_item_id] ?? []);
      for (const code of Array.isArray(option.allergens) ? option.allergens : []) current.add(code);
      optionAllergensByItem[option.inventory_item_id] = [...current].sort();
    }
    console.log(JSON.stringify({
      environment: { nodeEnv: process.env.NODE_ENV, host: process.env.DB_HOST, database: process.env.DB_NAME, hasAllergens },
      profiles,
      items: items.map((item) => ({ ...item, optionAllergens: optionAllergensByItem[item.id] ?? [] })),
      unclassifiedItems,
      optionsWithoutInventory: options.filter((option) => option.inventory_item_id === null),
      optionCount: options.length,
    }, null, 2));
  } finally {
    await db.end();
  }
}

main().catch((error) => { console.error(`Auditoría falló: ${error.message}`); process.exitCode = 1; });
