/**
 * Carga demostrativa del catalogo y Produccion de tortas para Misky Challay.
 *
 * Crea una torta de cada modalidad publica:
 * - torta-clasica-vainilla (STANDARD / FIXED)
 * - torta-a-tu-gusto (SEMI_CUSTOM / CUSTOMIZABLE)
 * - torta-diseno-especial (ADVANCED / CUSTOMIZABLE)
 *
 * Las tres usan los insumos MC-* que ya existen en Inventario. La personalizable
 * conecta sus opciones con el mismo inventario, y las tres quedan activas para
 * poder probar Catalogo, menu publico y Produccion de tortas.
 *
 * Uso seguro:
 *   node seed-misky-catalog-production.cjs          # solo muestra el plan
 *   node seed-misky-catalog-production.cjs --execute
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const backupDir = path.resolve(__dirname, '../../backups');
const branchName = 'Misky Challay Miraflores';
const category = {
  name: 'Tortas',
  slug: 'tortas',
  description: 'Tortas clásicas, personalizables y de diseño especial para cada celebración.',
  imageUrl: '/images/cakes/custom.png',
};

const products = [
  {
    slug: 'torta-clasica-vainilla',
    name: 'Torta clásica de vainilla',
    type: 'FIXED',
    saleMode: 'STANDARD',
    description: 'Bizcocho de vainilla, relleno de manjar y cobertura de crema. Lista para pedir con 48 horas de anticipación.',
    imageUrl: '/images/cakes/vanilla.svg',
    imageAlt: 'Torta clásica de vainilla con cobertura de crema',
    featured: 1,
    leadHours: 48,
    sku: 'MC-CLASICA-12',
    variantName: '12 porciones',
    price: 120,
    servings: 12,
    effort: { BAKING: 55, COOLING: 35, FILLING: 35, DECORATING: 25, QA: 15, DISPATCH: 10 },
    recipe: [
      ['MC-HARINA-TRIGO', 600, 5], ['MC-HUEVO', 6, 5], ['MC-AZUCAR', 450, 3],
      ['MC-MANTEQUILLA', 180, 3], ['MC-LECHE', 300, 3], ['MC-POLVO-HORNEAR', 10, 3],
      ['MC-VAINILLA', 20, 2], ['MC-MANJAR', 450, 2], ['MC-BUTTERCREAM', 550, 2],
      ['MC-CAJA-TORTA', 1, 0], ['MC-BASE-TORTA', 1, 0],
    ],
  },
  {
    slug: 'torta-a-tu-gusto',
    name: 'Torta a tu gusto',
    type: 'CUSTOMIZABLE',
    saleMode: 'SEMI_CUSTOM',
    description: 'Elige bizcocho, relleno, cobertura y decoración. La imagen es referencial; el resultado se prepara con las opciones seleccionadas.',
    imageUrl: '/images/cakes/custom.png',
    imageAlt: 'Torta personalizable con crema y frutas',
    featured: 1,
    leadHours: 72,
    sku: 'MC-PERSONAL-12',
    variantName: '12 porciones',
    price: 180,
    servings: 12,
    effort: { BAKING: 60, COOLING: 35, FILLING: 45, DECORATING: 55, QA: 20, DISPATCH: 10 },
    recipe: [
      ['MC-HARINA-TRIGO', 600, 5], ['MC-HUEVO', 6, 5], ['MC-AZUCAR', 450, 3],
      ['MC-MANTEQUILLA', 180, 3], ['MC-LECHE', 300, 3], ['MC-POLVO-HORNEAR', 10, 3],
      ['MC-CAJA-TORTA', 1, 0], ['MC-BASE-TORTA', 1, 0],
    ],
  },
  {
    slug: 'torta-diseno-especial',
    name: 'Torta de diseño especial',
    type: 'CUSTOMIZABLE',
    saleMode: 'ADVANCED',
    description: 'Para bodas, figuras y acabados especiales. El cliente envía una referencia y el equipo confirma diseño, precio y fecha.',
    imageUrl: '/images/cakes/special.png',
    imageAlt: 'Torta de diseño especial para celebraciones',
    featured: 0,
    leadHours: 96,
    sku: 'MC-ESPECIAL-24',
    variantName: 'Desde 24 porciones',
    price: 280,
    servings: 24,
    effort: { DESIGN: 60, BAKING: 85, COOLING: 50, FILLING: 70, DECORATING: 150, QA: 30, DISPATCH: 20 },
    recipe: [
      ['MC-HARINA-TRIGO', 1200, 5], ['MC-HUEVO', 12, 5], ['MC-AZUCAR', 900, 3],
      ['MC-MANTEQUILLA', 360, 3], ['MC-LECHE', 600, 3], ['MC-POLVO-HORNEAR', 20, 3],
      ['MC-VAINILLA', 40, 2], ['MC-MANJAR', 900, 2], ['MC-BUTTERCREAM', 900, 2],
      ['MC-CAJA-TORTA', 1, 0], ['MC-BASE-TORTA', 1, 0],
    ],
  },
];

const groups = [
  {
    code: 'mc_bizcocho', name: 'Bizcocho', description: 'Elige el sabor de la masa para tu torta.', order: 1,
    options: [
      ['Vainilla', 'Bizcocho suave de vainilla.', '/images/cakes/vanilla.svg', 0, 'MC-VAINILLA', 20, {}],
      ['Chocolate', 'Bizcocho intenso de chocolate.', '/images/cakes/custom.png', 15, 'MC-CACAO', 160, { BAKING: 10 }],
    ],
  },
  {
    code: 'mc_relleno', name: 'Relleno', description: 'Elige el relleno entre las capas.', order: 2,
    options: [
      ['Manjar blanco', 'Relleno cremoso de manjar blanco.', '/api/v1/media/files/b62ebdd7-a581-7804-3055-5bb30738e42a.png', 0, 'MC-MANJAR', 450, {}],
      ['Fresa', 'Relleno preparado de fresa.', '/api/v1/media/files/f13b572d-1bd3-0ef7-a661-ca0405a2ddcb.png', 10, 'MC-RELLENO-FRESA', 450, {}],
    ],
  },
  {
    code: 'mc_cobertura', name: 'Cobertura', description: 'Decide el acabado exterior.', order: 3,
    options: [
      ['Crema de mantequilla', 'Acabado liso de crema de mantequilla.', '/api/v1/media/files/209d7833-6037-1620-2e2b-e2bd2558a0d7.png', 0, 'MC-BUTTERCREAM', 550, {}],
      ['Ganache de chocolate', 'Acabado brillante de chocolate.', '/api/v1/media/files/23cff18b-c330-1aed-5029-9ccab8a5bdaf.png', 18, 'MC-GANACHE', 550, { DECORATING: 10 }],
    ],
  },
  {
    code: 'mc_decoracion', name: 'Decoración', description: 'Añade fruta fresca al acabado.', order: 4,
    options: [
      ['Sin decoración adicional', 'Acabado liso sin fruta encima.', '/api/v1/media/files/209d7833-6037-1620-2e2b-e2bd2558a0d7.png', 0, null, 0, {}],
      ['Fresas frescas', 'Fresas frescas sobre la cobertura.', '/api/v1/media/files/a63d5c03-80d2-f5a7-f321-527c0a3b4c6b.png', 12, 'MC-FRESAS', 180, { DECORATING: 10 }],
    ],
  },
];

function assertLocal() {
  if (process.env.NODE_ENV !== 'development'
    || !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST)
    || process.env.DB_NAME !== 'DulceFlow'
    || process.env.SEED_DEMO_DATA !== 'false'
    || process.env.MERCADOPAGO_MODE === 'live') {
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
  const file = path.join(backupDir, `DulceFlow-before-catalog-production-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`);
  const candidates = [process.env.MYSQLDUMP_PATH, 'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe', 'mysqldump'].filter(Boolean);
  const executable = candidates.find((candidate) => candidate === 'mysqldump' || fs.existsSync(candidate));
  if (!executable) throw new Error('No se encontro mysqldump para crear el respaldo');
  const args = [
    `--host=${process.env.DB_HOST}`, `--port=${process.env.DB_PORT}`, `--user=${process.env.DB_USER}`,
    '--single-transaction', '--quick', '--routines', '--triggers', '--events', '--set-gtid-purged=OFF',
    '--no-tablespaces', '--hex-blob', `--result-file=${file}`, process.env.DB_NAME,
  ];
  const result = spawnSync(executable, args, { env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD }, encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
  if (result.status !== 0 || !fs.existsSync(file)) {
    if (fs.existsSync(file)) fs.rmSync(file);
    throw new Error('No se pudo crear el respaldo');
  }
  const contents = fs.readFileSync(file, 'utf8');
  const tables = (contents.match(/CREATE TABLE /g) || []).length;
  if (contents.length < 10_000 || tables < 90) {
    fs.rmSync(file);
    throw new Error('El respaldo esta incompleto');
  }
  return { file, tables };
}

async function inspect(db) {
  const owners = await query(db, 'SELECT id FROM users WHERE LOWER(email)=LOWER(?) AND is_super_admin=1 AND status=?', [process.env.ADMIN_EMAIL, 'ACTIVE']);
  if (owners.length !== 1) throw new Error('No se pudo verificar la cuenta propietaria');
  const branches = await query(db, 'SELECT id, name FROM branches WHERE is_active=1 ORDER BY id');
  if (!branches.length) throw new Error('No hay una sede activa');
  const existingCategory = await query(db, 'SELECT id FROM categories WHERE slug=? AND deleted_at IS NULL', [category.slug]);
  if (existingCategory.length) throw new Error('La categoria tortas ya existe; no se duplicara');
  const existingProducts = await query(db, `SELECT slug FROM products WHERE slug IN (${products.map(() => '?').join(',')}) AND deleted_at IS NULL`, products.map((product) => product.slug));
  if (existingProducts.length) throw new Error('Ya existe uno de los productos objetivo; no se duplicara');

  const codes = [...new Set(products.flatMap((product) => product.recipe.map(([code]) => code)).concat(groups.flatMap((group) => group.options.map((option) => option[4]).filter(Boolean))))];
  const inventory = await query(db, `SELECT id, code, name, unit FROM inventory_items WHERE code IN (${codes.map(() => '?').join(',')}) AND is_active=1`, codes);
  if (inventory.length !== codes.length) {
    const found = new Set(inventory.map((item) => item.code));
    throw new Error(`Faltan insumos activos: ${codes.filter((code) => !found.has(code)).join(', ')}`);
  }
  const stock = await query(db, `SELECT inventory_item_id, on_hand, reserved FROM branch_inventory WHERE branch_id=? AND inventory_item_id IN (${inventory.map(() => '?').join(',')})`, [branches[0].id, ...inventory.map((item) => item.id)]);
  if (stock.length !== inventory.length) throw new Error('Faltan existencias habilitadas en la sede');
  const allergens = await query(db, "SELECT id, code FROM allergens WHERE code IN ('gluten','lacteos','huevo')");
  if (allergens.length !== 3) throw new Error('Faltan alergenos base');
  return { ownerId: owners[0].id, branch: branches.find((row) => row.name === branchName) || branches[0], inventory, allergens };
}

async function seed(db, context) {
  const inventoryByCode = new Map(context.inventory.map((item) => [item.code, item]));
  const created = { products: [], groups: [], options: 0, recipes: 0, recipeItems: 0 };
  await db.beginTransaction();
  try {
    const categoryResult = await query(db,
      'INSERT INTO categories (name, slug, description, image_url, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())',
      [category.name, category.slug, category.description, category.imageUrl, 1]);
    const categoryId = categoryResult.insertId;

    for (const [productIndex, definition] of products.entries()) {
      const productResult = await query(db,
        `INSERT INTO products
          (category_id, type, family, preparation_mode, name, slug, description, image_url, image_alt, status, is_featured, sort_order, allergens_reviewed_at, created_at, updated_at)
         VALUES (?, ?, 'CAKE', 'MADE_TO_ORDER', ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, NOW(), NOW(), NOW())`,
        [categoryId, definition.type, definition.name, definition.slug, definition.description, definition.imageUrl, definition.imageAlt, definition.featured, productIndex + 1]);
      const productId = productResult.insertId;
      created.products.push({ id: productId, slug: definition.slug });

      const variantResult = await query(db,
        `INSERT INTO product_variants
          (product_id, name, sku, base_price, serving_size, serving_unit, production_minutes_json, is_default, is_active, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'porciones', ?, 1, 1, 0, NOW(), NOW())`,
        [productId, definition.variantName, definition.sku, definition.price, definition.servings, JSON.stringify(definition.effort)]);
      const variantId = variantResult.insertId;

      await query(db,
        `INSERT INTO cake_product_profiles
          (product_id, sale_mode, min_lead_hours, base_effort_json, station_offsets_json, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())`,
        [productId, definition.saleMode, definition.leadHours, JSON.stringify(definition.effort), JSON.stringify({ DESIGN: 2, BAKING: 1, COOLING: 1, FILLING: 1, DECORATING: 0, QA: 0, DISPATCH: 0 })]);

      const recipeResult = await query(db,
        'INSERT INTO recipes (product_id, variant_id, yield_quantity, is_active, created_at, updated_at) VALUES (?, ?, 1, 1, NOW(), NOW())',
        [productId, variantId]);
      created.recipes += 1;
      for (const [code, amount, wastePercent] of definition.recipe) {
        await query(db,
          'INSERT INTO recipe_items (recipe_id, inventory_item_id, quantity, waste_percent, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
          [recipeResult.insertId, inventoryByCode.get(code).id, amount, wastePercent]);
        created.recipeItems += 1;
      }

      for (const allergen of context.allergens) {
        await query(db,
          "INSERT INTO product_allergens (product_id, allergen_id, level, created_at, updated_at) VALUES (?, ?, 'CONTAINS', NOW(), NOW())",
          [productId, allergen.id]);
      }
      await query(db,
        'INSERT INTO branch_product_availability (branch_id, product_id, is_available, created_at, updated_at) VALUES (?, ?, 1, NOW(), NOW())',
        [context.branch.id, productId]);

      if (definition.saleMode !== 'SEMI_CUSTOM') continue;
      for (const groupDefinition of groups) {
        const groupResult = await query(db,
          `INSERT INTO customization_groups
            (code, name, description, selection_type, min_selection, max_selection, free_quantity, sort_order, is_active, created_at, updated_at)
           VALUES (?, ?, ?, 'SINGLE', 1, 1, 0, ?, 1, NOW(), NOW())`,
          [groupDefinition.code, groupDefinition.name, groupDefinition.description, groupDefinition.order]);
        const groupId = groupResult.insertId;
        created.groups.push(groupDefinition.name);
        await query(db,
          'INSERT INTO product_customization_groups (product_id, group_id, variant_id, sort_order, is_active, created_at, updated_at) VALUES (?, ?, NULL, ?, 1, NOW(), NOW())',
          [productId, groupId, groupDefinition.order]);
        for (const [sortOrder, option] of groupDefinition.options.entries()) {
          const [name, description, imageUrl, priceDelta, materialCode, consumptionQuantity, effort] = option;
          const optionResult = await query(db,
            `INSERT INTO customization_options
              (group_id, name, description, image_url, image_alt, dietary_tags, allergens, price_delta, charge_always, max_per_item, inventory_item_id, consumption_quantity, production_minutes_json, status, sort_order, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, '[]', '[]', ?, ?, 1, ?, ?, ?, 'ACTIVE', ?, NOW(), NOW())`,
            [groupId, name, description, imageUrl, `${name} para torta`, priceDelta, priceDelta > 0 ? 1 : 0,
              materialCode ? inventoryByCode.get(materialCode).id : null, consumptionQuantity, JSON.stringify(effort), sortOrder]);
          created.options += 1;
          await query(db,
            'INSERT INTO branch_option_availability (branch_id, option_id, is_available, price_override, created_at, updated_at) VALUES (?, ?, 1, NULL, NOW(), NOW())',
            [context.branch.id, optionResult.insertId]);
        }
      }
    }

    const checks = await query(db, `
      SELECT
        (SELECT COUNT(*) FROM categories WHERE slug='tortas' AND is_active=1) AS categories,
        (SELECT COUNT(*) FROM products WHERE slug IN (?, ?, ?) AND status='ACTIVE') AS products,
        (SELECT COUNT(*) FROM cake_product_profiles WHERE product_id IN (SELECT id FROM products WHERE slug IN (?, ?, ?)) AND is_active=1) AS profiles,
        (SELECT COUNT(*) FROM recipes WHERE product_id IN (SELECT id FROM products WHERE slug IN (?, ?, ?)) AND is_active=1) AS recipes,
        (SELECT COUNT(*) FROM customization_options WHERE status='ACTIVE' AND group_id IN (SELECT id FROM customization_groups WHERE code LIKE 'mc_%')) AS options`,
      [products[0].slug, products[1].slug, products[2].slug, products[0].slug, products[1].slug, products[2].slug, products[0].slug, products[1].slug, products[2].slug]);
    if (Number(checks[0].categories) !== 1 || Number(checks[0].products) !== 3 || Number(checks[0].profiles) !== 3 || Number(checks[0].recipes) !== 3 || Number(checks[0].options) !== 8) {
      throw new Error('La verificacion del catalogo o produccion no coincide');
    }
    await db.commit();
    return { categoryId, ...created, branchId: context.branch.id, allergenCount: context.allergens.length };
  } catch (error) {
    await db.rollback();
    throw error;
  }
}

async function main() {
  assertLocal();
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  try {
    const context = await inspect(db);
    const plan = products.map((product) => ({ slug: product.slug, mode: product.saleMode, variant: product.variantName, price: product.price, recipeItems: product.recipe.length }));
    if (!process.argv.includes('--execute')) {
      console.log(JSON.stringify({ mode: 'dry-run', branch: context.branch, category, products: plan, optionGroups: groups.length, options: groups.reduce((total, group) => total + group.options.length, 0), note: 'Los precios y recetas son datos demostrativos conectados al inventario local.' }, null, 2));
      return;
    }
    const backup = createBackup();
    const result = await seed(db, context);
    console.log(JSON.stringify({ mode: 'executed', backup, result, publicSlugs: products.map((product) => `/tortas/${product.slug}`) }, null, 2));
  } finally {
    await db.end();
  }
}

main().catch((error) => { console.error(`Carga de catalogo y produccion fallo: ${error.message}`); process.exitCode = 1; });
