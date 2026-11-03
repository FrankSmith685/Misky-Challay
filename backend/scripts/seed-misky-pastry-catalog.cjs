/**
 * Catálogo base de pastelería Misky Challay.
 *
 * Son valores iniciales editables desde el panel. Las recetas, costos y
 * alérgenos pueden completarse después con la ficha técnica real del negocio.
 * El seeder solo crea lo que falta y deja intactos los cambios posteriores.
 */
const mysql = require('mysql2/promise');
const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const slugify = (value) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const query = async (db, sql, values = []) => (await db.execute(sql, values))[0];

const categories = [
  { slug: 'turrones', name: 'Turrones', sortOrder: 30, description: 'Turrones para compartir y regalar.' },
  { slug: 'kekes', name: 'Kekes', sortOrder: 35, description: 'Kekes caseros para cada ocasión.' },
  { slug: 'fatias', name: 'Fatias', sortOrder: 40, description: 'Porciones individuales listas para disfrutar.' },
  { slug: 'bocaditos', name: 'Bocaditos', sortOrder: 45, description: 'Cajas y combos para compartir.' },
];

const products = [
  { category: 'turrones', name: 'Turrón tradicional', family: 'NOUGAT', preparationMode: 'MADE_TO_ORDER', variant: 'Caja', price: 32, description: 'Turrón tradicional con miel y grageas.', allergens: ['gluten', 'huevo'] },
  { category: 'turrones', name: 'Turrón sin grageas', family: 'NOUGAT', preparationMode: 'MADE_TO_ORDER', variant: 'Caja', price: 32, description: 'Turrón tradicional sin grageas de colores.', allergens: ['gluten', 'huevo'] },
  { category: 'turrones', name: 'Turrón de ajonjolí', family: 'NOUGAT', preparationMode: 'MADE_TO_ORDER', variant: 'Caja', price: 35, description: 'Turrón con ajonjolí tostado.', allergens: ['gluten', 'huevo', 'sesamo'] },
  { category: 'turrones', name: 'Turrón premium', family: 'NOUGAT', preparationMode: 'MADE_TO_ORDER', variant: 'Caja', price: 38, description: 'Turrón premium para ocasiones especiales.', allergens: ['gluten', 'huevo', 'frutos-secos'] },
  { category: 'kekes', name: 'Keke de plátano crumble', family: 'CAKE', preparationMode: 'MADE_TO_ORDER', variant: 'Keke entero', price: 105, description: 'Keke de plátano con crumble crocante.', allergens: ['gluten', 'lacteos', 'huevo'] },
  { category: 'kekes', name: 'Keke de zanahoria', family: 'CAKE', preparationMode: 'MADE_TO_ORDER', variant: 'Keke entero', price: 95, description: 'Keke suave de zanahoria y especias.', allergens: ['gluten', 'lacteos', 'huevo'] },
  { category: 'kekes', name: 'Keke de frambuesa con arándanos', family: 'CAKE', preparationMode: 'MADE_TO_ORDER', variant: 'Keke entero', price: 120, description: 'Keke frutal con frambuesas y arándanos.', allergens: ['gluten', 'lacteos', 'huevo'] },
  { category: 'kekes', name: 'Keke de chocolate con ganache', family: 'CAKE', preparationMode: 'MADE_TO_ORDER', variant: 'Keke entero', price: 120, description: 'Keke de chocolate terminado con ganache.', allergens: ['gluten', 'lacteos', 'huevo'] },
  { category: 'kekes', name: 'Keke volteado de piña', family: 'CAKE', preparationMode: 'MADE_TO_ORDER', variant: 'Keke entero', price: 100, description: 'Keke húmedo con piña caramelizada.', allergens: ['gluten', 'lacteos', 'huevo'] },
  { category: 'kekes', name: 'Keke de naranja glaseada', family: 'CAKE', preparationMode: 'MADE_TO_ORDER', variant: 'Keke entero', price: 90, description: 'Keke de naranja con glaseado cítrico.', allergens: ['gluten', 'lacteos', 'huevo'] },
  { category: 'fatias', name: 'Fatia de chocolate con fresas y crema', family: 'DESSERT', preparationMode: 'READY_STOCK', variant: 'Porción individual', price: 20, description: 'Chocolate, fresas y crema en una porción individual.', allergens: ['gluten', 'lacteos', 'huevo'] },
  { category: 'fatias', name: 'Fatia red velvet con queso crema', family: 'DESSERT', preparationMode: 'READY_STOCK', variant: 'Porción individual', price: 20, description: 'Red velvet con cobertura de queso crema.', allergens: ['gluten', 'lacteos', 'huevo'] },
  { category: 'fatias', name: 'Fatia de arándanos', family: 'DESSERT', preparationMode: 'READY_STOCK', variant: 'Porción individual', price: 18, description: 'Porción suave con arándanos.', allergens: ['gluten', 'lacteos', 'huevo'] },
  { category: 'fatias', name: 'Fatia de vainilla con pudín', family: 'DESSERT', preparationMode: 'READY_STOCK', variant: 'Porción individual', price: 18, description: 'Vainilla suave con pudín cremoso.', allergens: ['gluten', 'lacteos', 'huevo'] },
  { category: 'fatias', name: 'Fatia con ganache', family: 'DESSERT', preparationMode: 'READY_STOCK', variant: 'Porción individual', price: 20, description: 'Porción terminada con ganache de chocolate.', allergens: ['gluten', 'lacteos', 'huevo'] },
  { category: 'bocaditos', name: 'Caja de bocaditos S/30', family: 'BITES', preparationMode: 'READY_STOCK', variant: 'Caja S/30', price: 30, description: '5 sánguchitos, 5 pies de manzana, 5 piononos y 5 enrolladitos de hot dog.', allergens: ['gluten', 'lacteos', 'huevo'] },
  { category: 'bocaditos', name: 'Caja de bocaditos S/25', family: 'BITES', preparationMode: 'READY_STOCK', variant: 'Caja S/25', price: 25, description: '5 empanadas, 5 alfajores, 5 brownies y 5 enrolladitos de hot dog.', allergens: ['gluten', 'lacteos', 'huevo'] },
];

const defaultServings = JSON.stringify({ enabled: false, baseVariantId: null, minServings: 1, maxServings: 1, pricePerExtraServing: 0 });

const assertRemoteSeed = () => {
  if (process.env.SEED_MISKY_CATALOG !== 'true') throw new Error('SEED_MISKY_CATALOG debe estar activo');
};

async function ensureCategory(db, definition) {
  const found = await query(db, 'SELECT id FROM categories WHERE slug=? AND deleted_at IS NULL LIMIT 1', [definition.slug]);
  if (found.length) return found[0].id;
  const result = await query(db, 'INSERT INTO categories (name, slug, description, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, NOW(), NOW())', [definition.name, definition.slug, definition.description, definition.sortOrder]);
  return result.insertId;
}

async function ensureProduct(db, definition, categoryId, branches, allergenIds) {
  const slug = slugify(definition.name);
  const existing = await query(db, 'SELECT id FROM products WHERE slug=? LIMIT 1', [slug]);
  const createdProduct = existing.length === 0;
  let productId;
  if (existing.length) {
    productId = existing[0].id;
  } else {
    const product = await query(db, `INSERT INTO products (category_id, type, family, preparation_mode, name, slug, description, status, is_featured, sort_order, allergens_reviewed_at, created_at, updated_at) VALUES (?, 'FIXED', ?, ?, ?, ?, ?, 'ACTIVE', 0, 0, NOW(), NOW(), NOW())`, [categoryId, definition.family, definition.preparationMode, definition.name, slug, definition.description]);
    productId = product.insertId;
  }

  const sku = `MC-CATALOG-${slug.toUpperCase().slice(0, 42)}`;
  const existingVariant = await query(db, 'SELECT id FROM product_variants WHERE sku=? LIMIT 1', [sku]);
  let variantId;
  if (existingVariant.length) {
    variantId = existingVariant[0].id;
  } else {
    const variant = await query(db, `INSERT INTO product_variants (product_id, name, sku, base_price, serving_size, serving_unit, production_minutes_json, is_default, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NULL, '{}', 1, 1, 0, NOW(), NOW())`, [productId, definition.variant, sku, definition.price]);
    variantId = variant.insertId;
  }

  const profile = await query(db, 'SELECT product_id FROM cake_product_profiles WHERE product_id=? LIMIT 1', [productId]);
  if (!profile.length) {
    await query(db, `INSERT INTO cake_product_profiles (product_id, sale_mode, min_lead_hours, base_effort_json, station_offsets_json, custom_servings_json, is_active, created_at, updated_at) VALUES (?, 'STANDARD', ?, '{}', '{}', ?, 1, NOW(), NOW())`, [productId, definition.preparationMode === 'READY_STOCK' ? 2 : 24, defaultServings]);
  }

  if (createdProduct) {
    for (const code of definition.allergens) {
      const allergen = allergenIds.get(code);
      if (allergen) await query(db, `INSERT INTO product_allergens (product_id, allergen_id, level, created_at, updated_at) VALUES (?, ?, 'CONTAINS', NOW(), NOW())`, [productId, allergen]);
    }
  }
  if (createdProduct) for (const branch of branches) await query(db, `INSERT INTO branch_product_availability (branch_id, product_id, is_available, created_at, updated_at) VALUES (?, ?, 1, NOW(), NOW()) ON DUPLICATE KEY UPDATE is_available=1, updated_at=NOW()`, [branch.id, productId]);
  return { productId, variantId, slug };
}

async function main() {
  assertRemoteSeed();
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  try {
    const branches = await query(db, 'SELECT id, name FROM branches WHERE is_active=1 ORDER BY id');
    if (!branches.length) throw new Error('No hay sedes activas');
    const allergens = await query(db, 'SELECT id, code FROM allergens');
    const allergenIds = new Map(allergens.map((row) => [row.code, row.id]));
    await db.beginTransaction();
    try {
      const categoryIds = new Map();
      for (const category of categories) categoryIds.set(category.slug, await ensureCategory(db, category));
      const created = [];
      for (const product of products) created.push(await ensureProduct(db, product, categoryIds.get(product.category), branches, allergenIds));
      await db.commit();
      console.log(JSON.stringify({ ok: true, categories: categories.length, products: created.length, branches: branches.map((branch) => branch.name) }, null, 2));
    } catch (error) {
      await db.rollback();
      throw error;
    }
  } finally {
    await db.end();
  }
}

main().catch((error) => { console.error(`Carga del catálogo de pastelería falló: ${error.message}`); process.exitCode = 1; });
