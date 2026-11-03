/** Disenos iniciales de tortas vinculados a "Crea tu torta". */
const mysql = require('mysql2/promise');
const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const query = async (db, sql, values = []) => (await db.execute(sql, values))[0];
const themes = [
  { slug: 'futbol', name: 'F\u00fatbol', theme: 'F\u00fatbol', description: 'Diseno deportivo para celebrar a los grandes hinchas.', image: '/images/cakes/special.svg', saleMode: 'CONFIGURED', minLeadHours: 72, minServings: 1, maxServings: 500, priceDelta: [35, 45, 65] },
  { slug: 'flores', name: 'Flores', theme: 'Flores y celebraciones', description: 'Acabado delicado con flores para cumpleanos y celebraciones.', image: '/images/cake-themes/flores-delicadas.svg', saleMode: 'CONFIGURED', minLeadHours: 72, minServings: 1, maxServings: 500, priceDelta: [35, 45, 65] },
  { slug: 'infantiles', name: 'Infantiles', theme: 'Infantiles', description: 'Diseno alegre para celebrar a los mas pequenos.', image: '/images/cake-themes/dinosaurio-3d.svg', saleMode: 'QUOTE', minLeadHours: 96, minServings: 15, maxServings: 100, priceDelta: [0, 0, 0] },
];

async function main() {
  if (process.env.SEED_MISKY_CATALOG !== 'true') throw new Error('SEED_MISKY_CATALOG debe estar activo');
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  try {
    const products = await query(db, "SELECT id FROM products WHERE slug='torta-a-tu-gusto' AND status='ACTIVE' AND deleted_at IS NULL LIMIT 1");
    if (!products.length) throw new Error('No existe la torta personalizable para vincular los disenos');
    const productId = products[0].id;
    const variants = await query(db, 'SELECT id, serving_size FROM product_variants WHERE product_id=? AND is_active=1 AND deleted_at IS NULL ORDER BY sort_order, id', [productId]);
    if (!variants.length) throw new Error('La torta personalizable no tiene variantes activas');
    const materials = await query(db, "SELECT id, code FROM inventory_items WHERE code IN ('MC-FONDANT','MC-BUTTERCREAM') AND is_active=1");
    const fondant = materials.find((item) => item.code === 'MC-FONDANT')?.id;
    const buttercream = materials.find((item) => item.code === 'MC-BUTTERCREAM')?.id;
    let created = 0;
    await db.beginTransaction();
    try {
      for (const [themeIndex, definition] of themes.entries()) {
        const existing = await query(db, 'SELECT id FROM cake_themes WHERE product_id=? AND (slug=? OR LOWER(theme)=LOWER(?)) LIMIT 1', [productId, definition.slug, definition.theme]);
        if (existing.length) continue;
        const rules = definition.saleMode === 'QUOTE' ? [] : variants.map((variant, index) => ({
          variantId: variant.id,
          priceDelta: definition.priceDelta[Math.min(index, definition.priceDelta.length - 1)],
          materials: [{ inventoryItemId: definition.slug === 'futbol' ? (fondant || buttercream) : (buttercream || fondant), quantity: Math.max(Number(variant.serving_size || 8) * 6, 48) }].filter((item) => item.inventoryItemId),
          effort: { DESIGN: 5, DECORATING: index === 0 ? 20 : index === 1 ? 30 : 45 },
          excludedOptionIds: [],
          hiddenGroupIds: [],
        }));
        await query(db, `INSERT INTO cake_themes (product_id, name, slug, theme, description, image_urls_json, sale_mode, min_lead_hours, min_servings, max_servings, variant_rules_json, is_active, sort_order, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1, NOW(), NOW())`, [productId, definition.name, definition.slug, definition.theme, definition.description, JSON.stringify([definition.image]), definition.saleMode, definition.minLeadHours, definition.minServings, definition.maxServings, JSON.stringify(rules), themeIndex]);
        created += 1;
      }
      await db.commit();
    } catch (error) {
      await db.rollback();
      throw error;
    }
    console.log(JSON.stringify({ ok: true, created, total: themes.length, productId }, null, 2));
  } finally {
    await db.end();
  }
}

main().catch((error) => { console.error(`Carga de disenos de tortas fallo: ${error.message}`); process.exitCode = 1; });
