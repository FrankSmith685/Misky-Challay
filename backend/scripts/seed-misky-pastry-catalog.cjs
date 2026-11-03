/**
 * Catalogo inicial de pasteleria Misky Challay.
 *
 * Esta carga es idempotente: crea solo registros que no existen y deja los
 * cambios posteriores hechos desde el panel administrativo.
 */
const mysql = require('mysql2/promise');
const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const slugify = (value) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const query = async (db, sql, values = []) => (await db.execute(sql, values))[0];
const defaultServings = JSON.stringify({ enabled: false, baseVariantId: null, minServings: 1, maxServings: 1, pricePerExtraServing: 0 });

const categories = [
  { slug: 'turrones', name: 'Turrones', sortOrder: 30, description: 'Turrones para compartir y regalar.', imageUrl: '/images/pastry/turron-dona-pepa.svg' },
  { slug: 'kekes', name: 'Kekes', sortOrder: 35, description: 'Kekes caseros para cada ocasion.', imageUrl: '/images/cakes/vanilla.svg' },
  { slug: 'fatias', name: 'Fatias', sortOrder: 40, description: 'Porciones individuales listas para disfrutar.', imageUrl: '/images/pastry/fatia-chocolate.svg' },
  { slug: 'bocaditos', name: 'Bocaditos', sortOrder: 45, description: 'Cajas y combos para compartir.', imageUrl: '/images/pastry/mini-alfajores.svg' },
  // Categorias que ya existian en la carta local anterior.
  { slug: 'postres', name: 'Postres', sortOrder: 20, description: 'Postres y porciones listas para disfrutar.', imageUrl: '/images/pastry/fatia-tiramisu.svg' },
  { slug: 'tortas-24-horas', name: 'Tortas 24 horas', sortOrder: 10, description: 'Tortas listas para reservar con anticipacion.', imageUrl: '/images/pastry/torta-chocolate.svg' },
];

const product = (category, name, family, preparationMode, variant, price, description, allergens, imageUrl = null, sku = null) => ({ category, name, family, preparationMode, variant, price, description, allergens, imageUrl, sku });

const products = [
  product('turrones', 'Turr\u00f3n tradicional', 'NOUGAT', 'MADE_TO_ORDER', 'Caja', 32, 'Turr\u00f3n tradicional con miel y grageas.', ['gluten', 'huevo'], '/images/pastry/turron-dona-pepa.svg'),
  product('turrones', 'Turr\u00f3n sin grageas', 'NOUGAT', 'MADE_TO_ORDER', 'Caja', 32, 'Turr\u00f3n tradicional sin grageas de colores.', ['gluten', 'huevo'], '/images/pastry/turron-dona-pepa.svg'),
  product('turrones', 'Turr\u00f3n de ajonjol\u00ed', 'NOUGAT', 'MADE_TO_ORDER', 'Caja', 35, 'Turr\u00f3n con ajonjol\u00ed tostado.', ['gluten', 'huevo', 'sesamo'], '/images/pastry/turron-dona-pepa.svg'),
  product('turrones', 'Turr\u00f3n premium', 'NOUGAT', 'MADE_TO_ORDER', 'Caja', 38, 'Turr\u00f3n premium para ocasiones especiales.', ['gluten', 'huevo', 'frutos-secos'], '/images/pastry/turron-almendras.svg'),
  product('kekes', 'Keke de pl\u00e1tano crumble', 'CAKE', 'MADE_TO_ORDER', 'Keke entero', 105, 'Keke de pl\u00e1tano con crumble crocante.', ['gluten', 'lacteos', 'huevo']),
  product('kekes', 'Keke de zanahoria', 'CAKE', 'MADE_TO_ORDER', 'Keke entero', 95, 'Keke suave de zanahoria y especias.', ['gluten', 'lacteos', 'huevo']),
  product('kekes', 'Keke de frambuesa con ar\u00e1ndanos', 'CAKE', 'MADE_TO_ORDER', 'Keke entero', 120, 'Keke frutal con frambuesas y ar\u00e1ndanos.', ['gluten', 'lacteos', 'huevo']),
  product('kekes', 'Keke de chocolate con ganache', 'CAKE', 'MADE_TO_ORDER', 'Keke entero', 120, 'Keke de chocolate terminado con ganache.', ['gluten', 'lacteos', 'huevo']),
  product('kekes', 'Keke volteado de pi\u00f1a', 'CAKE', 'MADE_TO_ORDER', 'Keke entero', 100, 'Keke humedo con pi\u00f1a caramelizada.', ['gluten', 'lacteos', 'huevo']),
  product('kekes', 'Keke de naranja glaseada', 'CAKE', 'MADE_TO_ORDER', 'Keke entero', 90, 'Keke de naranja con glaseado citrico.', ['gluten', 'lacteos', 'huevo']),
  product('fatias', 'Fatia de chocolate con fresas y crema', 'DESSERT', 'READY_STOCK', 'Porcion individual', 20, 'Chocolate, fresas y crema en una porcion individual.', ['gluten', 'lacteos', 'huevo']),
  product('fatias', 'Fatia red velvet con queso crema', 'DESSERT', 'READY_STOCK', 'Porcion individual', 20, 'Red velvet con cobertura de queso crema.', ['gluten', 'lacteos', 'huevo']),
  product('fatias', 'Fatia de ar\u00e1ndanos', 'DESSERT', 'READY_STOCK', 'Porcion individual', 18, 'Porcion suave con arandanos.', ['gluten', 'lacteos', 'huevo']),
  product('fatias', 'Fatia de vainilla con pud\u00edn', 'DESSERT', 'READY_STOCK', 'Porcion individual', 18, 'Vainilla suave con pudin.', ['gluten', 'lacteos', 'huevo']),
  product('fatias', 'Fatia con ganache', 'DESSERT', 'READY_STOCK', 'Porcion individual', 20, 'Porcion terminada con ganache de chocolate.', ['gluten', 'lacteos', 'huevo']),
  product('bocaditos', 'Caja de bocaditos S/30', 'BITES', 'READY_STOCK', 'Caja S/30', 30, '5 sanguchitos, 5 pies de manzana, 5 piononos y 5 enrolladitos de hot dog.', ['gluten', 'lacteos', 'huevo']),
  product('bocaditos', 'Caja de bocaditos S/25', 'BITES', 'READY_STOCK', 'Caja S/25', 25, '5 empanadas, 5 alfajores, 5 brownies y 5 enrolladitos de hot dog.', ['gluten', 'lacteos', 'huevo']),
  // Productos presentes en el respaldo de la carta local.
  product('tortas-24-horas', 'Torta de chocolate y fudge', 'CAKE', 'MADE_TO_ORDER', 'Clasica - 8 porciones', 95, 'Bizcocho de cacao, relleno de fudge y cobertura de chocolate.', ['gluten', 'lacteos', 'huevo'], '/images/pastry/torta-chocolate.svg'),
  product('tortas-24-horas', 'Torta de vainilla y fresas', 'CAKE', 'MADE_TO_ORDER', 'Clasica - 8 porciones', 99, 'Bizcocho de vainilla, crema y fresas frescas.', ['gluten', 'lacteos', 'huevo'], '/images/pastry/torta-fresas.svg'),
  product('postres', 'Fatia de tiramis\u00fa', 'DESSERT', 'READY_STOCK', 'Fatia individual', 18, 'Capas de bizcocho al cafe, crema y cacao.', ['gluten', 'lacteos', 'huevo'], '/images/pastry/fatia-tiramisu.svg'),
  product('postres', 'Fatia de chocolate intenso', 'DESSERT', 'READY_STOCK', 'Fatia individual', 20, 'Bizcocho de cacao y ganache de chocolate.', ['gluten', 'lacteos', 'huevo'], '/images/pastry/fatia-chocolate.svg', 'FATIA-DE-CHOCOLATE-I-44'),
  product('turrones', 'Turr\u00f3n de Do\u00f1a Pepa', 'NOUGAT', 'MADE_TO_ORDER', 'Caja de 500 g', 32, 'Palitos de anis, miel y grageas de colores.', ['gluten', 'huevo'], '/images/pastry/turron-dona-pepa.svg', 'TURRON-DE-DONA-PEPA-45'),
  product('turrones', 'Turr\u00f3n de almendras y miel', 'NOUGAT', 'MADE_TO_ORDER', 'Caja de 300 g', 38, 'Almendras tostadas y miel en un turron suave.', ['gluten', 'huevo', 'frutos-secos'], '/images/pastry/turron-almendras.svg', 'TURRON-DE-ALMENDRAS--46'),
  product('bocaditos', 'Mini alfajores de manjar', 'BITES', 'READY_STOCK', 'Caja de 12 unidades', 32, 'Alfajores rellenos de manjar para compartir.', ['gluten', 'lacteos', 'huevo'], '/images/pastry/mini-alfajores.svg', 'MINI-ALFAJORES-DE-MA-47'),
  product('bocaditos', 'Trufas de cacao', 'BITES', 'READY_STOCK', 'Caja de 12 unidades', 36, 'Bocados de chocolate y crema terminados con cacao.', ['gluten', 'lacteos'], null, 'TRUFAS-DE-CACAO-48'),
  product('postres', 'Cheesecake de maracuy\u00e1 sin az\u00facar', 'DESSERT', 'READY_STOCK', 'Fatia individual', 22, 'Cheesecake de maracuya endulzado sin azucar.', ['gluten', 'lacteos'], '/images/pastry/cheesecake-maracuya.svg'),
  product('bocaditos', 'Brownies de almendras sin az\u00facar', 'BITES', 'READY_STOCK', 'Caja de 4 unidades', 28, 'Brownies de cacao y almendras sin azucar.', ['gluten', 'lacteos', 'frutos-secos'], '/images/pastry/brownie-almendras.svg', 'BROWNIES-DE-ALMENDRA-50'),
];

const assertRemoteSeed = () => {
  if (process.env.SEED_MISKY_CATALOG !== 'true') throw new Error('SEED_MISKY_CATALOG debe estar activo');
};

async function ensureCategory(db, definition) {
  const found = await query(db, 'SELECT id FROM categories WHERE slug=? AND deleted_at IS NULL LIMIT 1', [definition.slug]);
  if (found.length) {
    await query(db, 'UPDATE categories SET image_url=COALESCE(image_url, ?), updated_at=NOW() WHERE id=?', [definition.imageUrl || null, found[0].id]);
    return found[0].id;
  }
  const result = await query(db, 'INSERT INTO categories (name, slug, description, image_url, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())', [definition.name, definition.slug, definition.description, definition.imageUrl || null, definition.sortOrder]);
  return result.insertId;
}

async function ensureProduct(db, definition, categoryId, branches, allergenIds) {
  const slug = slugify(definition.name);
  const existing = await query(db, 'SELECT id FROM products WHERE slug=? LIMIT 1', [slug]);
  let productId;
  if (existing.length) {
    productId = existing[0].id;
    if (definition.imageUrl) await query(db, 'UPDATE products SET image_url=COALESCE(image_url, ?), image_alt=COALESCE(image_alt, ?), updated_at=NOW() WHERE id=?', [definition.imageUrl, definition.name, productId]);
  } else {
    const productResult = await query(db, `INSERT INTO products (category_id, type, family, preparation_mode, name, slug, description, image_url, image_alt, status, is_featured, sort_order, allergens_reviewed_at, created_at, updated_at) VALUES (?, 'FIXED', ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 0, 0, NOW(), NOW(), NOW())`, [categoryId, definition.family, definition.preparationMode, definition.name, slug, definition.description, definition.imageUrl || null, definition.imageUrl ? definition.name : null]);
    productId = productResult.insertId;
  }

  const sku = definition.sku || `MC-CATALOG-${slug.toUpperCase().slice(0, 42)}`;
  const existingVariant = await query(db, 'SELECT id FROM product_variants WHERE sku=? LIMIT 1', [sku]);
  if (!existingVariant.length) {
    const legacyVariant = definition.sku
      ? await query(db, 'SELECT id FROM product_variants WHERE product_id=? AND name=? AND deleted_at IS NULL ORDER BY id LIMIT 1', [productId, definition.variant])
      : [];
    if (legacyVariant.length) await query(db, 'UPDATE product_variants SET sku=?, base_price=?, is_active=1, deleted_at=NULL, updated_at=NOW() WHERE id=?', [sku, definition.price, legacyVariant[0].id]);
    else await query(db, `INSERT INTO product_variants (product_id, name, sku, base_price, serving_size, serving_unit, production_minutes_json, is_default, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NULL, '{}', 1, 1, 0, NOW(), NOW())`, [productId, definition.variant, sku, definition.price]);
  }

  const profile = await query(db, 'SELECT product_id FROM cake_product_profiles WHERE product_id=? LIMIT 1', [productId]);
  if (!profile.length) await query(db, `INSERT INTO cake_product_profiles (product_id, sale_mode, min_lead_hours, base_effort_json, station_offsets_json, custom_servings_json, is_active, created_at, updated_at) VALUES (?, 'STANDARD', ?, '{}', '{}', ?, 1, NOW(), NOW())`, [productId, definition.preparationMode === 'READY_STOCK' ? 2 : 24, defaultServings]);

  for (const code of definition.allergens) {
    const allergen = allergenIds.get(code);
    if (allergen) await query(db, `INSERT INTO product_allergens (product_id, allergen_id, level, created_at, updated_at) VALUES (?, ?, 'CONTAINS', NOW(), NOW()) ON DUPLICATE KEY UPDATE id=id`, [productId, allergen]);
  }
  // Crea la disponibilidad que falte, pero conserva una desactivacion manual.
  for (const branch of branches) await query(db, `INSERT INTO branch_product_availability (branch_id, product_id, is_available, created_at, updated_at) VALUES (?, ?, 1, NOW(), NOW()) ON DUPLICATE KEY UPDATE id=id`, [branch.id, productId]);
  return { productId, slug };
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
      for (const definition of products) await ensureProduct(db, definition, categoryIds.get(definition.category), branches, allergenIds);
      await db.commit();
    } catch (error) {
      await db.rollback();
      throw error;
    }
    console.log(JSON.stringify({ ok: true, categories: categories.length, products: products.length, branches: branches.map((branch) => branch.name) }, null, 2));
  } finally {
    await db.end();
  }
}

main().catch((error) => { console.error(`Carga del catalogo de pasteleria fallo: ${error.message}`); process.exitCode = 1; });
