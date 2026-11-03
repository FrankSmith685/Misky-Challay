/** Verifica el catalogo y Produccion de tortas cargados para Misky Challay. */
const path = require('node:path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const slugs = ['torta-clasica-vainilla', 'torta-a-tu-gusto', 'torta-diseno-especial'];

async function query(db, sql, values = []) {
  const [rows] = await db.execute(sql, values);
  return rows;
}

async function main() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  try {
    const products = await query(db, `
      SELECT p.id, p.name, p.slug, p.type, p.status, p.allergens_reviewed_at,
             c.name AS category, cp.sale_mode, cp.is_active AS profile_active,
             v.id AS variant_id, v.name AS variant, v.base_price,
             r.id AS recipe_id
      FROM products p
      JOIN categories c ON c.id=p.category_id
      JOIN cake_product_profiles cp ON cp.product_id=p.id
      JOIN product_variants v ON v.product_id=p.id AND v.is_active=1
      LEFT JOIN recipes r ON r.variant_id=v.id AND r.is_active=1
      WHERE p.slug IN (?, ?, ?)
      ORDER BY p.id`, slugs);
    if (products.length !== 3 || products.some((product) => product.status !== 'ACTIVE' || !product.allergens_reviewed_at || !product.profile_active || !product.recipe_id)) {
      throw new Error('Las tres tortas no tienen estado, perfil o receta activos');
    }
    const productIds = products.map((product) => product.id);
    const recipeItems = await query(db, `
      SELECT r.product_id, COUNT(*) AS recipe_lines, SUM(CASE WHEN i.id IS NULL THEN 1 ELSE 0 END) AS missing_items
      FROM recipes r
      JOIN recipe_items ri ON ri.recipe_id=r.id
      LEFT JOIN inventory_items i ON i.id=ri.inventory_item_id AND i.is_active=1
      WHERE r.product_id IN (${productIds.map(() => '?').join(',')}) AND r.is_active=1
      GROUP BY r.product_id`, productIds);
    if (recipeItems.length !== 3 || recipeItems.some((row) => Number(row.recipe_lines) < 1 || Number(row.missing_items) > 0)) throw new Error('Hay recetas sin insumos activos');

    const custom = products.find((product) => product.slug === 'torta-a-tu-gusto');
    const groups = await query(db, `
      SELECT g.code, g.name, COUNT(o.id) AS options,
             SUM(CASE WHEN o.inventory_item_id IS NOT NULL AND i.id IS NULL THEN 1 ELSE 0 END) AS broken_links
      FROM product_customization_groups l
      JOIN customization_groups g ON g.id=l.group_id AND g.is_active=1
      JOIN customization_options o ON o.group_id=g.id AND o.status='ACTIVE'
      LEFT JOIN inventory_items i ON i.id=o.inventory_item_id AND i.is_active=1
      WHERE l.product_id=? AND l.is_active=1
      GROUP BY g.id, g.code, g.name
      ORDER BY g.sort_order`, [custom.id]);
    if (groups.length !== 4 || groups.some((group) => Number(group.options) !== 2 || Number(group.broken_links) > 0)) throw new Error('La torta personalizable no tiene sus opciones conectadas al inventario');

    const [availability] = await query(db, `
      SELECT
        (SELECT COUNT(*) FROM branch_product_availability WHERE product_id IN (${productIds.map(() => '?').join(',')})) AS product_rows,
        (SELECT COUNT(*) FROM branch_option_availability WHERE option_id IN (SELECT o.id FROM customization_options o JOIN customization_groups g ON g.id=o.group_id WHERE g.code LIKE 'mc_%')) AS option_rows`, [...productIds]);
    if (Number(availability.product_rows) !== 3 || Number(availability.option_rows) !== 8) throw new Error('Faltan vínculos de disponibilidad por sede');

    console.log(JSON.stringify({
      category: products[0].category,
      products: products.map((product) => ({ id: product.id, slug: product.slug, name: product.name, mode: product.sale_mode, variant: product.variant, price: Number(product.base_price), recipeLines: Number(recipeItems.find((row) => row.product_id === product.id).recipe_lines) })),
      customizableGroups: groups.map((group) => ({ name: group.name, options: Number(group.options) })),
      inventoryConnections: true,
      branchAvailability: true,
      publicSlugs: slugs.map((slug) => `/tortas/${slug}`),
    }, null, 2));
  } finally {
    await db.end();
  }
}

main().catch((error) => { console.error(`Verificacion fallo: ${error.message}`); process.exitCode = 1; });
