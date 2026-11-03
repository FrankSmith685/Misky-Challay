/** One-time, guarded update of the local Misky Challay demo cake. */
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const desired = [
  { old: 8, servings: 8, diameterCm: 14, minServings: 6 },
  { old: 12, servings: 14, diameterCm: 18, minServings: 12 },
  { old: 20, servings: 26, diameterCm: 28, minServings: 24 },
];
const scalableStations = new Set(['BAKING', 'COOLING', 'FILLING', 'DECORATING']);
const scaleEffort = (raw, factor) => {
  const source = typeof raw === 'string' ? JSON.parse(raw) : raw || {};
  return Object.fromEntries(Object.entries(source).map(([station, minutes]) => [station, scalableStations.has(station) ? Math.ceil(Number(minutes) * factor) : minutes]));
};

async function main() {
  const mode = process.argv[2];
  if (!['--apply', '--verify'].includes(mode) || process.env.NODE_ENV !== 'development'
    || !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST)
    || process.env.DB_NAME !== 'DulceFlow' || process.env.SEED_DEMO_DATA !== 'false'
    || process.env.MERCADOPAGO_MODE === 'live') {
    throw new Error('Solo se permite --apply o --verify en la base DulceFlow local de desarrollo sin pagos reales');
  }
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  try {
    if (mode === '--verify') {
      const [[product]] = await db.query("SELECT id FROM products WHERE slug='torta-a-tu-gusto'");
      const [variants] = await db.query('SELECT id, serving_size, base_price FROM product_variants WHERE product_id=? AND is_active=1 ORDER BY serving_size', [product?.id]);
      const [[profile]] = await db.query('SELECT custom_servings_json AS rule FROM cake_product_profiles WHERE product_id=?', [product?.id]);
      const rule = typeof profile?.rule === 'string' ? JSON.parse(profile.rule) : profile?.rule;
      if (variants.map((row) => Number(row.serving_size)).join(',') !== '8,14,26'
        || !rule?.enabled || rule.minServings !== 27 || rule.baseVariantId !== variants[2].id
        || rule.sizeGuides?.map((row) => `${row.diameterCm}:${row.minServings}-${row.maxServings}`).join(',') !== '14:6-8,18:12-14,28:24-26') {
        throw new Error('Los tamaños publicados no coinciden con la regla esperada');
      }
      const [recipes] = await db.query('SELECT r.variant_id, COUNT(ri.id) AS ingredients FROM recipes r LEFT JOIN recipe_items ri ON ri.recipe_id=r.id WHERE r.product_id=? AND r.is_active=1 GROUP BY r.variant_id', [product.id]);
      if (recipes.length !== 3 || recipes.some((row) => Number(row.ingredients) === 0)) throw new Error('Faltan ingredientes en alguna presentación');
      console.log(JSON.stringify({ productId: product.id, sizeGuides: rule.sizeGuides, priceFor27: Number(variants[2].base_price) + rule.pricePerExtraServing, recipeCount: recipes.length }, null, 2));
      return;
    }
    await db.beginTransaction();
    const [[product]] = await db.query("SELECT id, status FROM products WHERE slug='torta-a-tu-gusto' AND type='CUSTOMIZABLE' FOR UPDATE");
    if (!product) throw new Error('No existe la torta de demostración');
    const [[{ count: orderCount }]] = await db.query('SELECT COUNT(*) AS count FROM order_items WHERE product_id=?', [product.id]);
    if (Number(orderCount)) throw new Error('Hay pedidos de esta torta; revisa sus recetas antes de cambiar presentaciones');
    const [variants] = await db.query('SELECT * FROM product_variants WHERE product_id=? AND is_active=1 AND serving_unit=? ORDER BY serving_size FOR UPDATE', [product.id, 'porciones']);
    if (variants.length !== 3 || variants.map((variant) => Number(variant.serving_size)).join(',') !== '8,12,20') {
      throw new Error('Las presentaciones ya cambiaron o no coinciden con la demostración original');
    }
    const [recipes] = await db.query('SELECT * FROM recipes WHERE product_id=? AND is_active=1 FOR UPDATE', [product.id]);
    if (recipes.length !== 3 || variants.some((variant) => !recipes.some((recipe) => recipe.variant_id === variant.id))) throw new Error('Faltan recetas activas');
    const [ingredients] = await db.query('SELECT ri.*, i.code FROM recipe_items ri JOIN recipes r ON r.id=ri.recipe_id JOIN inventory_items i ON i.id=ri.inventory_item_id WHERE r.product_id=?', [product.id]);
    const [options] = await db.query('SELECT o.id, o.group_id, o.consumption_quantity, o.production_minutes_json, pcg.variant_id FROM customization_options o JOIN product_customization_groups pcg ON pcg.group_id=o.group_id WHERE pcg.product_id=?', [product.id]);
    const [[profile]] = await db.query("SELECT custom_servings_json FROM cake_product_profiles WHERE product_id=? AND sale_mode='SEMI_CUSTOM' FOR UPDATE", [product.id]);
    if (!profile) throw new Error('Falta el perfil personalizable');

    const backupDir = path.resolve(__dirname, '../../backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `demo-size-ranges-${product.id}-${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({ product, variants, recipes, ingredients, options, profile }, null, 2), { flag: 'wx' });

    for (let index = 1; index < desired.length; index++) {
      const original = variants[index];
      const target = desired[index];
      const factor = target.servings / target.old;
      await db.query('UPDATE product_variants SET name=?, serving_size=?, production_minutes_json=?, updated_at=NOW() WHERE id=?', [
        `${index === 1 ? 'Mediana' : 'Grande'} · ${target.servings} porciones`, target.servings,
        JSON.stringify(scaleEffort(original.production_minutes_json, factor)), original.id,
      ]);
      const recipe = recipes.find((row) => row.variant_id === original.id);
      for (const ingredient of ingredients.filter((row) => row.recipe_id === recipe.id)) {
        const packaging = ingredient.code === 'MC-CAJA-TORTA' || ingredient.code === 'MC-BASE-TORTA';
        await db.query('UPDATE recipe_items SET quantity=?, updated_at=NOW() WHERE id=?', [packaging ? 1 : Math.round(Number(ingredient.quantity) * factor * 100) / 100, ingredient.id]);
      }
      for (const option of options.filter((row) => row.variant_id === original.id)) {
        await db.query('UPDATE customization_options SET consumption_quantity=?, production_minutes_json=?, updated_at=NOW() WHERE id=?', [
          Math.round(Number(option.consumption_quantity || 0) * factor * 100) / 100,
          JSON.stringify(scaleEffort(option.production_minutes_json, factor)), option.id,
        ]);
      }
    }
    const oldRule = typeof profile.custom_servings_json === 'string' ? JSON.parse(profile.custom_servings_json) : profile.custom_servings_json;
    const rule = { ...oldRule, enabled: true, baseVariantId: variants[2].id, minServings: 27, maxServings: Math.max(27, Number(oldRule.maxServings) || 60), sizeGuides: desired.map((size, index) => ({ variantId: variants[index].id, diameterCm: size.diameterCm, minServings: size.minServings, maxServings: size.servings })) };
    if (!(Number(rule.pricePerExtraServing) > 0)) throw new Error('Falta la tarifa adicional; configura el precio antes de actualizar');
    await db.query('UPDATE cake_product_profiles SET custom_servings_json=?, updated_at=NOW() WHERE product_id=?', [JSON.stringify(rule), product.id]);
    await db.commit();
    console.log(JSON.stringify({ productId: product.id, backupPath, ranges: rule.sizeGuides, extraFrom: rule.minServings, extraRate: rule.pricePerExtraServing }, null, 2));
  } catch (error) { await db.rollback(); throw error; }
  finally { await db.end(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
