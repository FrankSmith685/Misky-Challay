/**
 * Catálogo comercial de Misky Challay.
 *
 * Carga:
 *   - 13 sabores clásicos con pequeña, mediana y grande.
 *   - Crea tu torta (constructor con precio automático).
 *   - Diseño especial (constructor dentro de la vista Crea tu torta, con cotización).
 *   - Recetas por variante y consumo de insumos por opción.
 *
 * Los precios son referencias iniciales derivadas de la tabla compartida por el
 * negocio. Se pueden ajustar después desde el panel de catálogo.
 *
 * Uso:
 *   node seed-misky-cake-catalog.cjs          # solo plan
 *   node seed-misky-cake-catalog.cjs --execute
 */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');
const { supplies } = require('./cake-supply-catalog.cjs');

require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const execute = process.argv.includes('--execute');
const backupDir = path.resolve(__dirname, '../../backups');
const branchName = 'Misky Challay Miraflores';
const imageByCode = new Map(supplies.map((row) => {
  const imagePath = path.resolve(__dirname, '../../frontend/public/images/ingredients', row.image);
  const version = fs.existsSync(imagePath)
    ? createHash('sha256').update(fs.readFileSync(imagePath)).digest('hex').slice(0, 12)
    : '1';
  return [row.code, `/images/ingredients/${row.image}?v=${version}`];
}));
const scale = { PEQUENA: 0.75, MEDIANA: 14 / 12, GRANDE: 1.5 * 26 / 20 };
const sizes = [
  { key: 'PEQUENA', name: 'Pequeña · 8 porciones', servings: 8, basePrice: 70, customPrice: 105, advancedPrice: 145, factor: scale.PEQUENA },
  { key: 'MEDIANA', name: 'Mediana · 14 porciones', servings: 14, basePrice: 105, customPrice: 145, advancedPrice: 205, factor: scale.MEDIANA },
  { key: 'GRANDE', name: 'Grande · 26 porciones', servings: 26, basePrice: 155, customPrice: 205, advancedPrice: 285, factor: scale.GRANDE },
];

const classicFlavors = [
  { key: 'vainilla', name: 'Vainilla', slug: 'torta-vainilla', description: 'Bizcocho suave de vainilla, clásico y fácil de compartir.', additions: [['MC-VAINILLA', 20]], surcharge: [0, 0, 0] },
  { key: 'chocolate', name: 'Chocolate', slug: 'torta-chocolate', description: 'Bizcocho húmedo con cacao puro.', additions: [['MC-CACAO', 120]], surcharge: [0, 0, 0] },
  { key: 'zanahoria', name: 'Zanahoria', slug: 'torta-zanahoria', description: 'Bizcocho especiado con zanahoria fresca.', additions: [['MC-ZANAHORIA', 400], ['MC-CANELA', 4]], surcharge: [0, 0, 0] },
  { key: 'red-velvet', name: 'Red velvet', slug: 'torta-red-velvet', description: 'Bizcocho rojo con cacao y un toque ácido.', additions: [['MC-CACAO', 45], ['MC-COLORANTE-ROJO', 6], ['MC-VINAGRE', 8]], builderAddition: ['MC-CACAO', 45], surcharge: [0, 0, 0] },
  { key: 'platano', name: 'Plátano', slug: 'torta-platano', description: 'Bizcocho aromático con plátano maduro.', additions: [['MC-PLATANO', 400]], surcharge: [10, 15, 20] },
  { key: 'chocohips', name: 'Chocohips', slug: 'torta-chocohips', description: 'Bizcocho de vainilla con chispas de chocolate.', additions: [['MC-VAINILLA', 20], ['MC-CHOCOLATE-CHIPS', 150]], builderAddition: ['MC-CHOCOLATE-CHIPS', 150], surcharge: [10, 15, 20] },
  { key: 'arandanos', name: 'Arándanos', slug: 'torta-arandanos', description: 'Bizcocho suave con arándanos seleccionados.', additions: [['MC-VAINILLA', 20], ['MC-ARANDANOS', 150]], builderAddition: ['MC-ARANDANOS', 150], surcharge: [10, 15, 20] },
  { key: 'marmoleado', name: 'Marmoleado', slug: 'torta-marmoleado', description: 'Combinación de vainilla y chocolate en cada corte.', additions: [['MC-VAINILLA', 12], ['MC-CACAO', 50]], builderAddition: ['MC-CACAO', 50], surcharge: [10, 15, 20] },
  { key: 'confetti', name: 'Confetti', slug: 'torta-confetti', description: 'Bizcocho de vainilla con grageas de colores.', additions: [['MC-VAINILLA', 20], ['MC-GRAGEAS', 90]], builderAddition: ['MC-GRAGEAS', 90], surcharge: [10, 15, 20] },
  { key: 'naranja', name: 'Naranja', slug: 'torta-naranja', description: 'Bizcocho fresco con ralladura y jugo de naranja.', additions: [['MC-NARANJA', 300]], surcharge: [10, 15, 20] },
  { key: 'naranja-chispas', name: 'Naranja con chispas', slug: 'torta-naranja-con-chispas', description: 'Naranja fresca con chispas de chocolate.', additions: [['MC-NARANJA', 300], ['MC-CHOCOLATE-CHIPS', 150]], builderAddition: ['MC-NARANJA', 300], surcharge: [15, 20, 25] },
  { key: 'keke-novia', name: 'Keke de novia', slug: 'torta-keke-de-novia', description: 'Keke con frutas confitadas y frutos secos.', additions: [['MC-FRUTAS-CONFITADAS', 250], ['MC-FRUTOS-SECOS', 160]], builderAddition: ['MC-FRUTAS-CONFITADAS', 250], surcharge: [10, 15, 20], nuts: true },
  { key: 'keke-ingles', name: 'Keke inglés', slug: 'torta-keke-ingles', description: 'Keke de celebración con frutas y frutos secos.', additions: [['MC-FRUTAS-CONFITADAS', 350], ['MC-FRUTOS-SECOS', 220]], builderAddition: ['MC-FRUTAS-CONFITADAS', 350], surcharge: [15, 20, 25], nuts: true },
];

const fillings = [
  { name: 'Manjar de olla', code: 'MC-MANJAR', delta: 0 },
  { name: 'Fudge casero', code: 'MC-FUDGE', delta: 0 },
  { name: 'Frosting especial', code: 'MC-FROSTING-ESPECIAL', delta: 0 },
  { name: 'Ganache de café', code: 'MC-GANACHE-CAFE', delta: 0 },
  { name: 'Frosting de Oreo', code: 'MC-FROSTING-OREO', delta: 10, allergens: ['gluten', 'lacteos'] },
  { name: 'Mermelada de fresa', code: 'MC-MERMELADA-FRESA', delta: 10, allergens: [] },
  { name: 'Ganache de maracuyá', code: 'MC-GANACHE-MARACUYA', delta: 10 },
  { name: 'Frosting de chocolate', code: 'MC-FROSTING-CHOCOLATE', delta: 10, allergens: ['lacteos'] },
  { name: 'Mermelada de arándanos', code: 'MC-MERMELADA-ARANDANOS', delta: 10, allergens: [] },
  { name: 'Ganache de pistacho', code: 'MC-GANACHE-PISTACHO', delta: 20, allergens: ['frutos-secos', 'lacteos'] },
  { name: 'Manjar de pistacho', code: 'MC-MANJAR-PISTACHO', delta: 20, allergens: ['frutos-secos', 'lacteos'] },
  { name: 'Nutella', code: 'MC-NUTELLA', delta: 20, allergens: ['frutos-secos', 'lacteos', 'soya'] },
];

const baseIngredients = [
  ['MC-HARINA-TRIGO', 600], ['MC-AZUCAR', 450], ['MC-HUEVO', 6],
  ['MC-MANTEQUILLA', 180], ['MC-LECHE', 300], ['MC-POLVO-HORNEAR', 10],
  ['MC-SAL', 3], ['MC-CAJA-TORTA', 1], ['MC-BASE-TORTA', 1],
];

const effortFor = (size, mode) => {
  const factor = size.factor;
  if (mode === 'STANDARD') return { BAKING: Math.round(48 * factor), COOLING: Math.round(35 * factor), FILLING: Math.round(35 * factor), DECORATING: Math.round(25 * factor), QA: 15, DISPATCH: 10 };
  if (mode === 'ADVANCED') return { DESIGN: 60, BAKING: Math.round(68 * factor), COOLING: Math.round(45 * factor), FILLING: Math.round(50 * factor), DECORATING: Math.round(125 * factor), QA: 25, DISPATCH: 15 };
  return { BAKING: Math.round(55 * factor), COOLING: Math.round(38 * factor), FILLING: Math.round(48 * factor), DECORATING: Math.round(58 * factor), QA: 20, DISPATCH: 10 };
};

function assertLocal() {
  const remoteTestSeed = process.env.SEED_MISKY_CATALOG === 'true';
  if (!remoteTestSeed && (process.env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST)
    || process.env.DB_NAME !== 'DulceFlow' || process.env.SEED_DEMO_DATA !== 'false' || process.env.MERCADOPAGO_MODE === 'live')) {
    throw new Error('Solo se permite en la base DulceFlow local de desarrollo sin pagos reales');
  }
  if (!process.env.ADMIN_EMAIL) throw new Error('Falta ADMIN_EMAIL para verificar el propietario');
}

async function query(db, sql, values = []) {
  const [result] = await db.execute(sql, values);
  return result;
}

function createBackup() {
  fs.mkdirSync(backupDir, { recursive: true });
  const file = path.join(backupDir, `DulceFlow-before-cake-catalog-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`);
  const candidates = [process.env.MYSQLDUMP_PATH, 'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe', 'mysqldump'].filter(Boolean);
  const executable = candidates.find((candidate) => candidate === 'mysqldump' || fs.existsSync(candidate));
  if (!executable) throw new Error('No se encontró mysqldump para crear el respaldo');
  const result = spawnSync(executable, [
    `--host=${process.env.DB_HOST}`, `--port=${process.env.DB_PORT}`, `--user=${process.env.DB_USER}`,
    '--single-transaction', '--quick', '--routines', '--triggers', '--events', '--set-gtid-purged=OFF',
    '--no-tablespaces', '--hex-blob', `--result-file=${file}`, process.env.DB_NAME,
  ], { env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD }, encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
  if (result.status !== 0 || !fs.existsSync(file)) throw new Error(`No se pudo crear el respaldo: ${result.stderr || ''}`);
  return file;
}

const round = (value) => Math.round(value * 100) / 100;
const scaled = (value, factor) => round(value * factor);

async function ensureCategory(db) {
  const rows = await query(db, 'SELECT id FROM categories WHERE slug=? AND deleted_at IS NULL LIMIT 1', ['tortas']);
  if (rows.length) {
    await query(db, 'UPDATE categories SET name=?, description=?, image_url=?, is_active=1, updated_at=NOW() WHERE id=?', ['Tortas', 'Tortas clásicas, personalizables y de diseño especial.', '/images/cakes/custom.png', rows[0].id]);
    return rows[0].id;
  }
  const result = await query(db, 'INSERT INTO categories (name, slug, description, image_url, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1, NOW(), NOW())', ['Tortas', 'tortas', 'Tortas clásicas, personalizables y de diseño especial.', '/images/cakes/custom.png']);
  return result.insertId;
}

async function ensureProduct(db, definition, categoryId) {
  const found = await query(db, 'SELECT id FROM products WHERE slug=? LIMIT 1', [definition.slug]);
  if (found.length) {
    await query(db, `UPDATE products SET category_id=?, type=?, name=?, description=?, image_url=?, image_alt=?, status='ACTIVE', is_featured=?, sort_order=?, allergens_reviewed_at=NULL, deleted_at=NULL, updated_at=NOW() WHERE id=?`, [categoryId, definition.type, definition.name, definition.description, definition.imageUrl, definition.imageAlt, definition.featured ? 1 : 0, definition.sortOrder, found[0].id]);
    return found[0].id;
  }
  const result = await query(db, `INSERT INTO products (category_id, type, name, slug, description, image_url, image_alt, status, is_featured, sort_order, allergens_reviewed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, NULL, NOW(), NOW())`, [categoryId, definition.type, definition.name, definition.slug, definition.description, definition.imageUrl, definition.imageAlt, definition.featured ? 1 : 0, definition.sortOrder]);
  return result.insertId;
}

async function ensureProfile(db, productId, mode, leadHours, effort) {
  const found = await query(db, 'SELECT product_id FROM cake_product_profiles WHERE product_id=? LIMIT 1', [productId]);
  const values = [mode, leadHours, JSON.stringify(effort), JSON.stringify({ DESIGN: 2, BAKING: 1, COOLING: 1, FILLING: 1, DECORATING: 0, QA: 0, DISPATCH: 0 }), productId];
  if (found.length) return query(db, 'UPDATE cake_product_profiles SET sale_mode=?, min_lead_hours=?, base_effort_json=?, station_offsets_json=?, is_active=1, updated_at=NOW() WHERE product_id=?', values);
  return query(db, 'INSERT INTO cake_product_profiles (product_id, sale_mode, min_lead_hours, base_effort_json, station_offsets_json, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())', [productId, ...values.slice(0, 4)]);
}

async function ensureVariant(db, productId, variant, sku, effort) {
  const found = await query(db, 'SELECT id FROM product_variants WHERE sku=? LIMIT 1', [sku]);
  const values = [productId, variant.name, sku, variant.price, variant.servings, JSON.stringify(effort), variant.sortOrder];
  if (found.length) {
    await query(db, 'UPDATE product_variants SET product_id=?, name=?, base_price=?, serving_size=?, serving_unit=\'porciones\', production_minutes_json=?, is_default=?, is_active=1, sort_order=?, deleted_at=NULL, updated_at=NOW() WHERE id=?', [...values.slice(0, 6), variant.sortOrder === 0 ? 1 : 0, variant.sortOrder, found[0].id]);
    return found[0].id;
  }
  const result = await query(db, 'INSERT INTO product_variants (product_id, name, sku, base_price, serving_size, serving_unit, production_minutes_json, is_default, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, \'porciones\', ?, ?, 1, ?, NOW(), NOW())', [productId, variant.name, sku, variant.price, variant.servings, JSON.stringify(effort), variant.sortOrder === 0 ? 1 : 0, variant.sortOrder]);
  return result.insertId;
}

async function writeRecipe(db, productId, variantId, ingredients) {
  const existing = await query(db, 'SELECT id FROM recipes WHERE variant_id=? LIMIT 1', [variantId]);
  let recipeId;
  if (existing.length) {
    recipeId = existing[0].id;
    await query(db, 'UPDATE recipes SET product_id=?, yield_quantity=1, is_active=1, updated_at=NOW() WHERE id=?', [productId, recipeId]);
    await query(db, 'DELETE FROM recipe_items WHERE recipe_id=?', [recipeId]);
  } else {
    const result = await query(db, 'INSERT INTO recipes (product_id, variant_id, yield_quantity, is_active, created_at, updated_at) VALUES (?, ?, 1, 1, NOW(), NOW())', [productId, variantId]);
    recipeId = result.insertId;
  }
  for (const [code, quantity, wastePercent = 3] of ingredients) {
    const item = await query(db, 'SELECT id FROM inventory_items WHERE code=? AND is_active=1 LIMIT 1', [code]);
    if (!item.length) throw new Error(`Falta el insumo activo ${code}`);
    await query(db, 'INSERT INTO recipe_items (recipe_id, inventory_item_id, quantity, waste_percent, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())', [recipeId, item[0].id, quantity, wastePercent]);
  }
}

async function writeAllergens(db, productId, codes) {
  await query(db, 'DELETE FROM product_allergens WHERE product_id=?', [productId]);
  for (const code of codes) {
    const allergen = await query(db, 'SELECT id FROM allergens WHERE code=? LIMIT 1', [code]);
    if (allergen.length) await query(db, `INSERT INTO product_allergens (product_id, allergen_id, level, created_at, updated_at) VALUES (?, ?, 'CONTAINS', NOW(), NOW())`, [productId, allergen[0].id]);
  }
}

async function writeBranchProductAvailability(db, productId, branches) {
  for (const branch of branches) await query(db, `INSERT INTO branch_product_availability (branch_id, product_id, is_available, unavailable_reason, created_at, updated_at) VALUES (?, ?, 1, NULL, NOW(), NOW()) ON DUPLICATE KEY UPDATE is_available=1, unavailable_reason=NULL, updated_at=NOW()`, [branch.id, productId]);
}

async function ensureGroup(db, definition) {
  const found = await query(db, 'SELECT id FROM customization_groups WHERE code=? LIMIT 1', [definition.code]);
  let groupId;
  if (found.length) {
    groupId = found[0].id;
    await query(db, 'UPDATE customization_groups SET name=?, description=?, selection_type=?, min_selection=?, max_selection=?, free_quantity=?, sort_order=?, is_active=1, updated_at=NOW() WHERE id=?', [definition.name, definition.description, definition.selectionType, definition.minSelection, definition.maxSelection, definition.freeQuantity, definition.sortOrder, groupId]);
    await query(db, 'DELETE FROM customization_options WHERE group_id=?', [groupId]);
  } else {
    const result = await query(db, 'INSERT INTO customization_groups (code, name, description, selection_type, min_selection, max_selection, free_quantity, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())', [definition.code, definition.name, definition.description, definition.selectionType, definition.minSelection, definition.maxSelection, definition.freeQuantity, definition.sortOrder]);
    groupId = result.insertId;
  }
  const optionIds = [];
  for (const [index, option] of definition.options.entries()) {
    const material = option.code ? await query(db, 'SELECT id FROM inventory_items WHERE code=? AND is_active=1 LIMIT 1', [option.code]) : [];
    if (option.code && !material.length) throw new Error(`Falta el insumo activo ${option.code}`);
    const optionResult = await query(db, `INSERT INTO customization_options (group_id, name, description, image_url, image_alt, dietary_tags, allergens, price_delta, charge_always, cake_scale_with_servings, max_per_item, inventory_item_id, consumption_quantity, production_minutes_json, status, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, NOW(), NOW())`, [groupId, option.name, option.description || null, option.imageUrl || (option.code ? imageByCode.get(option.code) : '/images/cakes/custom.png'), option.imageAlt || `${option.name} para torta`, JSON.stringify(option.allergens || []), option.delta, option.delta > 0 ? 1 : 0, option.cakeScaleWithServings === false ? 0 : 1, option.maxPerItem || 1, material.length ? material[0].id : null, option.quantity || 0, JSON.stringify(option.effort || {}), index]);
    optionIds.push(optionResult.insertId);
  }
  return { id: groupId, optionIds };
}

async function linkGroup(db, productId, groupId, variantId, sortOrder) {
  await query(db, 'INSERT INTO product_customization_groups (product_id, group_id, variant_id, min_selection_override, max_selection_override, free_quantity_override, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, NULL, ?, 1, NOW(), NOW()) ON DUPLICATE KEY UPDATE variant_id=VALUES(variant_id), sort_order=VALUES(sort_order), is_active=1, updated_at=NOW()', [productId, groupId, variantId, sortOrder]);
}

function recipeIngredients(size, additions = []) {
  const merged = new Map();
  for (const [code, quantity] of baseIngredients.concat(additions)) {
    merged.set(code, (merged.get(code) || 0) + quantity);
  }
  return [...merged.entries()].map(([code, quantity]) => [code, scaled(quantity, size.factor), code === 'MC-HUEVO' ? 5 : 3]);
}

function optionGroupsForSize(size) {
  const flavorOptions = classicFlavors.map((flavor) => ({
    name: flavor.name,
    code: (flavor.builderAddition || flavor.additions[0])[0],
    delta: flavor.surcharge[sizes.findIndex((entry) => entry.key === size.key)],
    quantity: scaled((flavor.builderAddition || flavor.additions[0])[1], size.factor),
    description: `Sabor ${flavor.name.toLowerCase()}.`,
    allergens: flavor.nuts ? ['frutos-secos'] : [],
    effort: flavor.key === 'chocolate' ? { BAKING: 8 } : {},
  }));
  // Los sabores con dos insumos usan el principal como material de la opción;
  // el resto queda declarado en la receta de los productos clásicos.
  const fillingOptions = fillings.map((entry) => ({
    name: entry.name,
    code: entry.code,
    delta: entry.delta,
    quantity: scaled(450, size.factor),
    description: `Relleno de ${entry.name.toLowerCase()}.`,
    allergens: entry.allergens || ['lacteos'],
    effort: { FILLING: entry.delta >= 20 ? 10 : 5 },
  }));
  const coverOptions = [
    { name: 'Crema de mantequilla', code: 'MC-BUTTERCREAM', delta: 0, quantity: scaled(550, size.factor), description: 'Acabado clásico y firme.', allergens: ['lacteos'], effort: {} },
    { name: 'Crema de leche', code: 'MC-CREMA-LECHE', delta: 10, quantity: scaled(600, size.factor), description: 'Acabado ligero y suave.', allergens: ['lacteos'], effort: { DECORATING: 8 } },
    { name: 'Fondant', code: 'MC-FONDANT', delta: 20, quantity: scaled(650, size.factor), description: 'Acabado liso para una decoración más precisa.', allergens: [], effort: { DECORATING: 25 } },
  ];
  const decorationOptions = [
    { name: 'Acabado clásico', code: null, delta: 0, quantity: 0, description: 'Sin decoración adicional.', allergens: [], effort: {} },
    { name: 'Grageas de colores', code: 'MC-GRAGEAS', delta: 5, quantity: scaled(90, size.factor), description: 'Un toque alegre para celebrar.', allergens: [], effort: { DECORATING: 5 } },
    { name: 'Detalles de fondant', code: 'MC-FONDANT', delta: 20, quantity: scaled(180, size.factor), description: 'Formas y detalles sencillos en fondant.', allergens: [], effort: { DECORATING: 20 } },
    { name: 'Color a medida', code: 'MC-COLORANTES', delta: 15, quantity: scaled(8, size.factor), description: 'Color personalizado para la cobertura.', allergens: [], effort: { DECORATING: 12 } },
  ];
  return [
    { code: `misky_catalog_sabor_${size.key.toLowerCase()}`, name: 'Sabor del bizcocho', description: 'Elige un sabor. Los recargos siguen la tabla de tamaños.', selectionType: 'SINGLE', minSelection: 1, maxSelection: 1, freeQuantity: 1, sortOrder: 1, options: flavorOptions },
    { code: `misky_catalog_relleno_${size.key.toLowerCase()}`, name: 'Relleno', description: 'Elige un relleno para las capas de tu torta.', selectionType: 'SINGLE', minSelection: 1, maxSelection: 1, freeQuantity: 1, sortOrder: 2, options: fillingOptions },
    { code: `misky_catalog_cobertura_${size.key.toLowerCase()}`, name: 'Cobertura', description: 'Define el acabado exterior.', selectionType: 'SINGLE', minSelection: 1, maxSelection: 1, freeQuantity: 1, sortOrder: 3, options: coverOptions },
    { code: `misky_catalog_decoracion_${size.key.toLowerCase()}`, name: 'Decoración', description: 'Agrega un detalle final si quieres.', selectionType: 'SINGLE', minSelection: 1, maxSelection: 1, freeQuantity: 1, sortOrder: 4, options: decorationOptions },
  ];
}

async function seed(db) {
  const branches = await query(db, 'SELECT id, name FROM branches WHERE is_active=1 ORDER BY id');
  if (!branches.length) throw new Error('No hay sedes activas');
  const categoryId = await ensureCategory(db);
  const targets = [
    ...classicFlavors.map((flavor, index) => ({ slug: flavor.slug, type: 'FIXED', name: flavor.key.startsWith('keke-') ? flavor.name : `Torta de ${flavor.name.toLowerCase()}`, description: flavor.description, imageUrl: index === 0 ? '/images/cakes/vanilla.png' : '/images/cakes/custom.png', imageAlt: flavor.name, featured: index < 3, sortOrder: index + 1, mode: 'STANDARD' })),
    { slug: 'torta-a-tu-gusto', type: 'CUSTOMIZABLE', name: 'Crea tu torta', description: 'Elige tamaño, sabor y relleno; si quieres, agrega dulces para acompañarla. El precio se actualiza mientras personalizas.', imageUrl: '/images/cakes/custom.png', imageAlt: 'Torta personalizable', featured: true, sortOrder: 20, mode: 'SEMI_CUSTOM' },
    { slug: 'torta-diseno-especial', type: 'CUSTOMIZABLE', name: 'Diseño especial', description: 'Comparte tu referencia y recibe una propuesta personalizada de precio y fecha.', imageUrl: '/images/cakes/special.png', imageAlt: 'Torta de diseño especial', featured: false, sortOrder: 21, mode: 'ADVANCED' },
  ];
  const productIds = [];
  const variantByProduct = new Map();
  for (const definition of targets) {
    const productId = await ensureProduct(db, definition, categoryId);
    productIds.push(productId);
    const variants = [];
    for (const [index, size] of sizes.entries()) {
      const price = definition.mode === 'STANDARD'
        ? size.basePrice + classicFlavors.find((flavor) => definition.slug === flavor.slug).surcharge[index]
        : definition.mode === 'SEMI_CUSTOM' ? size.customPrice : size.advancedPrice;
      const variant = { ...size, price, sortOrder: index };
      const variantId = await ensureVariant(db, productId, variant, `MC-${definition.mode}-${definition.slug.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}-${size.key}`, effortFor(size, definition.mode));
      variants.push({ ...size, id: variantId });
      const flavor = classicFlavors.find((entry) => definition.slug === entry.slug);
      const ingredients = definition.mode === 'STANDARD'
        ? recipeIngredients(size, [...(flavor?.additions || []), ['MC-VAINILLA', 20], ['MC-MANJAR', 450], ['MC-BUTTERCREAM', 550]])
        : recipeIngredients(size);
      await writeRecipe(db, productId, variantId, ingredients);
      await query(db, 'DELETE FROM product_nutrition WHERE variant_id=?', [variantId]);
    }
    variantByProduct.set(productId, variants);
    await ensureProfile(db, productId, definition.mode, definition.mode === 'STANDARD' ? 48 : definition.mode === 'SEMI_CUSTOM' ? 72 : 96, effortFor(sizes[1], definition.mode));
    const allergenCodes = definition.mode === 'STANDARD'
      ? ['gluten', 'lacteos', 'huevo', ...(classicFlavors.find((entry) => entry.slug === definition.slug)?.nuts ? ['frutos-secos'] : [])]
      : ['gluten', 'lacteos', 'huevo', 'frutos-secos'];
    await writeAllergens(db, productId, allergenCodes);
    // En la carga remota de pruebas usamos la misma revisión de alérgenos que
    // ya tiene el catálogo local; sin esta marca el menú público lo filtra.
    if (process.env.SEED_MISKY_CATALOG === 'true') {
      await query(db, 'UPDATE products SET allergens_reviewed_at=NOW(), updated_at=NOW() WHERE id=?', [productId]);
    }
    await writeBranchProductAvailability(db, productId, branches);
    await query(db, 'DELETE FROM product_customization_groups WHERE product_id=?', [productId]);
  }

  const customProductId = productIds[productIds.length - 2];
  const advancedProductId = productIds[productIds.length - 1];
  const groupMap = new Map();
  for (const size of sizes) {
    const definitions = optionGroupsForSize(size);
    const links = [];
    for (const definition of definitions) {
      const group = await ensureGroup(db, definition);
      groupMap.set(`${size.key}:${definition.name}`, group);
      links.push(group);
    }
    for (const productId of [customProductId, advancedProductId]) {
      const variants = variantByProduct.get(productId);
      for (const [index, group] of links.entries()) {
        if (productId === customProductId && index > 1) continue;
        await linkGroup(db, productId, group.id, variants[sizes.findIndex((entry) => entry.key === size.key)].id, index + 1);
      }
    }
    for (const group of links) for (const optionId of group.optionIds) {
      for (const branch of branches) await query(db, 'INSERT INTO branch_option_availability (branch_id, option_id, is_available, price_override, created_at, updated_at) VALUES (?, ?, 1, NULL, NOW(), NOW()) ON DUPLICATE KEY UPDATE is_available=1, price_override=NULL, updated_at=NOW()', [branch.id, optionId]);
    }
  }
  const { cakeAddons } = require('./demo-cake-addons.cjs');
  const addonsGroup = await ensureGroup(db, {
    ...cakeAddons,
    options: cakeAddons.options.map((option) => ({ ...option, cakeScaleWithServings: false, maxPerItem: 12 })),
  });
  await linkGroup(db, customProductId, addonsGroup.id, null, cakeAddons.sortOrder);
  for (const optionId of addonsGroup.optionIds) {
    for (const branch of branches) await query(db, 'INSERT INTO branch_option_availability (branch_id, option_id, is_available, price_override, created_at, updated_at) VALUES (?, ?, 1, NULL, NOW(), NOW()) ON DUPLICATE KEY UPDATE is_available=1, price_override=NULL, updated_at=NOW()', [branch.id, optionId]);
  }
  return { categoryId, products: productIds.length, classicProducts: classicFlavors.length, customProducts: 2, variants: productIds.length * sizes.length, groups: groupMap.size, branches: branches.length };
}

async function main() {
  assertLocal();
  const plan = { classicProducts: classicFlavors.length, customProducts: 2, variantsPerProduct: sizes.length, classicFlavorTable: classicFlavors.map((entry) => ({ name: entry.name, surcharge: entry.surcharge })), fillingOptions: fillings.map((entry) => ({ name: entry.name, surcharge: entry.delta })), note: 'Precios base de referencia: confirmar en el panel antes de vender en producción.' };
  if (!execute) { console.log(JSON.stringify({ mode: 'dry-run', plan }, null, 2)); return; }
  const backup = process.env.SEED_MISKY_CATALOG_BACKUP === 'true' ? createBackup() : null;
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  try {
    await db.beginTransaction();
    try { const result = await seed(db); await db.commit(); console.log(JSON.stringify({ mode: 'executed', backup, result }, null, 2)); }
    catch (error) { await db.rollback(); throw error; }
  } finally { await db.end(); }
}

main().catch((error) => { console.error(`Carga de catálogo de tortas falló: ${error.message}`); process.exitCode = 1; });
