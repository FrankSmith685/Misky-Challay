/** Demo-only rule. Uses the slope between the last two published sizes. */
const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('node:path').resolve(__dirname, '../.env'), quiet: true });

async function main() {
  if (process.env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST)) {
    throw new Error('Solo se permite configurar la demostracion en MySQL local de desarrollo');
  }
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  try {
    const [[product]] = await db.query("SELECT id, name FROM products WHERE slug = 'torta-a-tu-gusto' AND type = 'CUSTOMIZABLE'");
    if (!product) throw new Error('No existe la torta de demostracion');
    const [variants] = await db.query('SELECT id, serving_size AS servings, base_price AS price FROM product_variants WHERE product_id = ? AND is_active = 1 AND serving_unit = ? ORDER BY serving_size', [product.id, 'porciones']);
    if (variants.length !== 3 || variants.map((row) => Number(row.servings)).join(',') !== '8,14,26') throw new Error('Se requieren presentaciones activas de 8, 14 y 26 porciones');
    const [small, medium, large] = variants;
    const [[profile]] = await db.query('SELECT custom_servings_json AS rule FROM cake_product_profiles WHERE product_id=?', [product.id]);
    const previousRate = Number(profile?.rule?.pricePerExtraServing);
    const rate = previousRate > 0 ? previousRate : Math.round(((Number(large.price) - Number(medium.price)) / (Number(large.servings) - Number(medium.servings))) * 100) / 100;
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('Los precios no permiten derivar una tarifa positiva');
    const [recipes] = await db.query('SELECT id FROM recipes WHERE variant_id = ? AND is_active = 1 LIMIT 1', [large.id]);
    if (!recipes.length) throw new Error('Falta la receta de la presentacion grande');
    const rule = { enabled: true, baseVariantId: large.id, minServings: 27, maxServings: Math.max(27, Number(profile?.rule?.maxServings) || 60), pricePerExtraServing: rate, sizeGuides: [
      { variantId: small.id, diameterCm: 14, minServings: 6, maxServings: 8 },
      { variantId: medium.id, diameterCm: 18, minServings: 12, maxServings: 14 },
      { variantId: large.id, diameterCm: 28, minServings: 24, maxServings: 26 },
    ] };
    await db.query("UPDATE cake_product_profiles SET custom_servings_json = ?, updated_at = NOW() WHERE product_id = ? AND sale_mode = 'SEMI_CUSTOM'", [JSON.stringify(rule), product.id]);
    console.log(JSON.stringify({ productId: product.id, productName: product.name, rule }));
  } finally { await db.end(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
