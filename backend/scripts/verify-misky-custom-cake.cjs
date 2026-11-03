/** Verifica la carga sin modificar datos ni imprimir variables privadas. */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const imageKeys = ['hero', 'category', 'overview', 'harina', 'huevos', 'azucar',
  'mantequilla', 'leche', 'polvo-hornear', 'vainilla', 'cacao', 'manjar',
  'relleno-fresa', 'buttercream', 'ganache', 'fresas', 'empaque',
  'bizcocho-vainilla', 'bizcocho-chocolate'];
function pictureFilename(key) {
  const hash = createHash('sha256').update('misky-catalog-seed:' + key).digest('hex');
  return [hash.slice(0, 8), hash.slice(8, 12), hash.slice(12, 16),
    hash.slice(16, 20), hash.slice(20, 32)].join('-') + '.png';
}

async function query(db, sql, values = []) {
  const [rows] = await db.execute(sql, values);
  return rows;
}
async function main() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  try {
    const [cake] = await query(db,
      "SELECT id, category_id, status, allergens_reviewed_at, image_url FROM products WHERE slug='torta-personalizada-misky-challay' AND deleted_at IS NULL");
    if (!cake || cake.status !== 'DRAFT' || cake.allergens_reviewed_at !== null) throw new Error('La torta nueva no está en revisión');
    const [category] = await query(db, 'SELECT name, is_active, image_url FROM categories WHERE id=?', [cake.category_id]);
    if (!category || !category.is_active || category.name !== 'Tortas personalizadas') throw new Error('La categoría no está lista');
    const [variant] = await query(db, 'SELECT id, base_price, serving_size, serving_unit FROM product_variants WHERE product_id=?', [cake.id]);
    const [recipe] = await query(db, 'SELECT id FROM recipes WHERE product_id=? AND variant_id=? AND is_active=1', [cake.id, variant.id]);
    const [recipeCount] = await query(db, 'SELECT COUNT(*) AS n FROM recipe_items WHERE recipe_id=?', [recipe.id]);
    const groups = await query(db,
      'SELECT g.id, g.name, g.min_selection, g.max_selection FROM customization_groups g JOIN product_customization_groups l ON l.group_id=g.id WHERE l.product_id=? AND l.is_active=1 AND g.is_active=1 ORDER BY g.sort_order',
      [cake.id]);
    if (groups.length !== 4 || Number(recipeCount.n) !== 9) throw new Error('Receta o grupos incompletos');
    const options = await query(db,
      'SELECT o.group_id, o.name, o.inventory_item_id, o.consumption_quantity, o.image_url FROM customization_options o WHERE o.group_id IN (' +
      groups.map(() => '?').join(',') + ') AND o.status=?', [...groups.map((group) => group.id), 'ACTIVE']);
    if (options.length !== 8 || options.some((item) => Number(item.consumption_quantity) > 0 && !item.inventory_item_id)) {
      throw new Error('Opciones incompletas o sin insumo');
    }
    for (const group of groups) {
      if (group.min_selection !== 1 || group.max_selection !== 1 ||
          options.filter((item) => item.group_id === group.id).length !== 2) {
        throw new Error('Regla de selección incompleta: ' + group.name);
      }
    }
    const [ingredients] = await query(db, "SELECT COUNT(*) AS n FROM inventory_items WHERE code LIKE 'MC-%' AND is_active=1 AND image_url IS NOT NULL");
    const [stock] = await query(db, "SELECT COUNT(*) AS n FROM branch_inventory bi JOIN inventory_items i ON i.id=bi.inventory_item_id WHERE i.code LIKE 'MC-%' AND bi.on_hand>0 AND bi.average_unit_cost>0");
    if (Number(ingredients.n) !== 15 || Number(stock.n) !== 15) throw new Error('Insumos o stock recibido incompletos');
    const assets = await query(db,
      'SELECT filename, url FROM media_assets WHERE filename IN (' + imageKeys.map(() => '?').join(',') + ') AND deleted_at IS NULL',
      imageKeys.map(pictureFilename));
    if (assets.length !== 19 || assets.some((asset) => !fs.existsSync(path.resolve(__dirname, '../uploads/media', asset.filename)))) {
      throw new Error('Las imágenes guardadas no están completas');
    }
    const [old] = await query(db, "SELECT status FROM products WHERE slug='torta-de-prueba-clasica'");
    const [orderCount] = await query(db, "SELECT COUNT(*) AS n FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE p.slug='torta-de-prueba-clasica'");
    if (old.status !== 'INACTIVE' || Number(orderCount.n) !== 1) throw new Error('El pedido histórico perdió su referencia');
    console.log(JSON.stringify({ productId: cake.id, status: cake.status, category: category.name,
      servings: Number(variant.serving_size), priceToReview: Number(variant.base_price),
      baseIngredients: Number(recipeCount.n), ingredientRecords: Number(ingredients.n), stockedIngredientRecords: Number(stock.n),
      groups: groups.map((group) => group.name), options: options.length,
      images: assets.length, historicalOrderIntact: true }, null, 2));
    if (process.argv.includes('--http')) {
      const base = 'http://127.0.0.1:' + (process.env.PORT || 4000);
      for (const [route, expectedType] of [
        [cake.image_url, 'image/png'],
        ['/api/v1/catalog/products', 'application/json'],
      ]) {
        const response = await fetch(base + route, { signal: AbortSignal.timeout(5000) });
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || !contentType.includes(expectedType)) {
          throw new Error('Falló la ruta HTTP local ' + route + ': ' + response.status);
        }
        if (route === '/api/v1/catalog/products') {
          const body = await response.json();
          const publicProducts = Array.isArray(body?.data) ? body.data : [];
          if (publicProducts.some((item) => item.slug === 'torta-personalizada-misky-challay')) {
            throw new Error('La torta en borrador apareció en el catálogo público');
          }
        }
        console.log(JSON.stringify({ route, status: response.status, contentType }));
      }
    }
  } finally { await db.end(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
