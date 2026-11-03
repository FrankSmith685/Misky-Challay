/** Catálogo local de una torta personalizable; conserva pedidos e historial. */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const sourceDir = path.resolve(__dirname, '../../frontend/public/images/misky-catalog');
const targetDir = path.resolve(__dirname, '../uploads/media');
const backupDir = path.resolve(__dirname, '../../backups');
const oldSlugs = ['torta-de-prueba-personalizable', 'torta-de-prueba-clasica'];
const slug = 'torta-personalizada-misky-challay';
const pictures = [
  ['hero', 'torta-personalizada.png', 'products', 'Torta con crema y fresas; imagen ilustrativa generada por IA'],
  ['category', 'torta-personalizada.png', 'categories', 'Ejemplo ilustrativo de torta personalizada'],
  ['overview', 'insumos-reposteria.png', 'ingredients', 'Ingredientes de repostería; imagen ilustrativa'],
  ['harina', 'harina.png', 'ingredients', 'Harina de trigo para repostería'],
  ['huevos', 'huevos.png', 'ingredients', 'Huevos frescos'],
  ['azucar', 'azucar.png', 'ingredients', 'Azúcar blanca granulada'],
  ['mantequilla', 'mantequilla.png', 'ingredients', 'Mantequilla sin sal'],
  ['leche', 'leche.png', 'ingredients', 'Leche entera'],
  ['polvo-hornear', 'polvo-hornear.png', 'ingredients', 'Polvo para hornear'],
  ['vainilla', 'vainilla.png', 'ingredients', 'Extracto de vainilla'],
  ['cacao', 'cacao.png', 'ingredients', 'Cacao puro en polvo'],
  ['manjar', 'relleno-manjar.png', 'ingredients', 'Manjar blanco para relleno'],
  ['relleno-fresa', 'relleno-fresa.png', 'ingredients', 'Relleno preparado de fresa'],
  ['buttercream', 'cobertura-vainilla.png', 'ingredients', 'Crema de mantequilla para cobertura'],
  ['ganache', 'cobertura-ganache.png', 'ingredients', 'Ganache de chocolate'],
  ['fresas', 'decoracion-fresas.png', 'ingredients', 'Fresas frescas para decorar'],
  ['empaque', 'empaque.png', 'ingredients', 'Caja y base para torta'],
  ['bizcocho-vainilla', 'bizcocho-vainilla.png', 'builder-presets', 'Bizcocho de vainilla; imagen ilustrativa'],
  ['bizcocho-chocolate', 'bizcocho-chocolate.png', 'builder-presets', 'Bizcocho de chocolate; imagen ilustrativa'],
];
function pictureFilename(key) {
  const hash = createHash('sha256').update('misky-catalog-seed:' + key).digest('hex');
  return [hash.slice(0, 8), hash.slice(8, 12), hash.slice(12, 16),
    hash.slice(16, 20), hash.slice(20, 32)].join('-') + '.png';
}
// El costo y stock comienzan en cero porque no hay facturas ni conteo físico.
// Los componentes preparados se compran o elaboran aparte y requieren su ficha técnica.
const materials = [
  ['MC-HARINA-TRIGO', 'Harina de trigo para repostería', 'g', 'harina', 300],
  ['MC-HUEVO', 'Huevos frescos', 'und', 'huevos', 4],
  ['MC-AZUCAR', 'Azúcar blanca', 'g', 'azucar', 220],
  ['MC-MANTEQUILLA', 'Mantequilla sin sal', 'g', 'mantequilla', 180],
  ['MC-LECHE', 'Leche entera', 'ml', 'leche', 150],
  ['MC-POLVO-HORNEAR', 'Polvo para hornear', 'g', 'polvo-hornear', 10],
  ['MC-VAINILLA', 'Extracto de vainilla', 'ml', 'vainilla', 10],
  ['MC-CAJA-TORTA', 'Caja para torta de 25 cm', 'und', 'empaque', 1],
  ['MC-BASE-TORTA', 'Base rígida para torta de 25 cm', 'und', 'empaque', 1],
  ['MC-CACAO', 'Cacao puro en polvo', 'g', 'cacao', 0],
  ['MC-MANJAR', 'Manjar blanco para relleno', 'g', 'manjar', 0],
  ['MC-RELLENO-FRESA', 'Relleno preparado de fresa', 'g', 'relleno-fresa', 0],
  ['MC-BUTTERCREAM', 'Crema de mantequilla preparada', 'g', 'buttercream', 0],
  ['MC-GANACHE', 'Ganache de chocolate preparado', 'g', 'ganache', 0],
  ['MC-FRESAS', 'Fresas frescas para decorar', 'g', 'fresas', 0],
];
const groups = [
  ['mc_bizcocho', 'Bizcocho', 'Elige el sabor de la masa para 12 porciones.', [
    ['Vainilla', 'Bizcocho suave de vainilla.', 'bizcocho-vainilla', 0, null, 0, {}],
    ['Chocolate', 'Añade cacao puro a la masa.', 'bizcocho-chocolate', 12, 'MC-CACAO', 35, { BAKING: 5 }],
  ]],
  ['mc_relleno', 'Relleno', 'Elige un relleno entre las capas.', [
    ['Manjar blanco', 'Relleno cremoso de manjar blanco.', 'manjar', 0, 'MC-MANJAR', 400, {}],
    ['Fresa', 'Relleno preparado de fresa.', 'relleno-fresa', 10, 'MC-RELLENO-FRESA', 400, {}],
  ]],
  ['mc_cobertura', 'Cobertura', 'Elige el acabado exterior.', [
    ['Crema de mantequilla', 'Acabado liso de crema de mantequilla.', 'buttercream', 0, 'MC-BUTTERCREAM', 550, {}],
    ['Ganache de chocolate', 'Acabado de chocolate.', 'ganache', 15, 'MC-GANACHE', 550, { DECORATING: 10 }],
  ]],
  ['mc_decoracion', 'Decoración', 'Decide si agregas fruta fresca encima.', [
    ['Sin decoración adicional', 'Acabado liso sin fruta encima.', 'buttercream', 0, null, 0, {}],
    ['Fresas frescas', 'Fresas frescas sobre la cobertura.', 'fresas', 12, 'MC-FRESAS', 180, { DECORATING: 10 }],
  ]],
];

function assertLocal() {
  if (process.env.NODE_ENV !== 'development' ||
      !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST) ||
      process.env.DB_NAME !== 'DulceFlow' ||
      process.env.SEED_DEMO_DATA !== 'false' ||
      process.env.MERCADOPAGO_MODE === 'live') {
    throw new Error('Solo se permite en la base DulceFlow de desarrollo local sin pagos reales');
  }
  if (!process.env.ADMIN_EMAIL) throw new Error('Falta ADMIN_EMAIL para verificar al propietario');
}
async function query(db, sql, values = []) {
  const [result] = await db.execute(sql, values);
  return result;
}
async function inspect(db) {
  const owners = await query(db, 'SELECT id FROM users WHERE LOWER(email)=LOWER(?) AND is_super_admin=1 AND status=?', [process.env.ADMIN_EMAIL, 'ACTIVE']);
  if (owners.length !== 1) throw new Error('No se pudo verificar la cuenta propietaria');
  const products = await query(db, 'SELECT id, slug FROM products WHERE deleted_at IS NULL ORDER BY id');
  if (products.length !== 2 || products.some((item) => !oldSlugs.includes(item.slug))) {
    throw new Error('El catálogo cambió: no se hará una limpieza automática');
  }
  const categories = await query(db, 'SELECT id, slug FROM categories WHERE deleted_at IS NULL');
  if (categories.length !== 1 || categories[0].slug !== 'pasteleria') throw new Error('La categoría actual cambió');
  const orders = await query(db, 'SELECT id, product_id, variant_id FROM order_items ORDER BY id');
  if (orders.some((item) => !products.some((product) => product.id === item.product_id))) {
    throw new Error('Hay referencias de pedidos imprevistas');
  }
  const branchRows = await query(db, 'SELECT id FROM branches ORDER BY id');
  if (!branchRows.length) throw new Error('No hay una sede para inventario');
  const allergens = await query(db, "SELECT id, code FROM allergens WHERE code IN ('gluten','lacteos','huevo')");
  if (allergens.length !== 3) throw new Error('Faltan opciones de alérgenos');
  const existingMaterials = await query(db, 'SELECT id FROM inventory_items WHERE code LIKE ?', ['MC-%']);
  if (existingMaterials.length) throw new Error('Los insumos nuevos ya existen');
  const existingMedia = await query(db,
    'SELECT id FROM media_assets WHERE filename IN (' + pictures.map(() => '?').join(',') + ')',
    pictures.map(([key]) => pictureFilename(key)));
  if (existingMedia.length) throw new Error('Las imágenes nuevas ya existen');
  for (const [, filename] of pictures) {
    if (!fs.existsSync(path.join(sourceDir, filename))) throw new Error('Falta la imagen ' + filename);
  }
  return { ownerId: owners[0].id, products, categoryId: categories[0].id,
    orders, branchIds: branchRows.map((item) => item.id), allergens };
}

function backup() {
  fs.mkdirSync(backupDir, { recursive: true });
  const file = path.join(backupDir, 'DulceFlow-before-misky-catalog-' + new Date().toISOString().replace(/[:.]/g, '-') + '.sql');
  const candidates = [process.env.MYSQLDUMP_PATH,
    'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe', 'mysqldump'].filter(Boolean);
  const executable = candidates.find((candidate) => candidate === 'mysqldump' || fs.existsSync(candidate));
  if (!executable) throw new Error('No se encontró mysqldump');
  const args = ['--host=' + process.env.DB_HOST, '--port=' + process.env.DB_PORT,
    '--user=' + process.env.DB_USER, '--single-transaction', '--quick',
    '--routines', '--triggers', '--events', '--set-gtid-purged=OFF',
    '--no-tablespaces', '--hex-blob', '--result-file=' + file, process.env.DB_NAME];
  const result = spawnSync(executable, args, {
    env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD },
    encoding: 'utf8', maxBuffer: 5 * 1024 * 1024,
  });
  if (result.status !== 0) {
    if (fs.existsSync(file)) fs.rmSync(file);
    throw new Error('No se pudo crear el respaldo');
  }
  const sql = fs.readFileSync(file, 'utf8');
  const tables = (sql.match(/CREATE TABLE /g) || []).length;
  if (sql.length < 10000 || tables < 90) {
    fs.rmSync(file);
    throw new Error('El respaldo está incompleto');
  }
  return { file, tables };
}
function copyPictures() {
  fs.mkdirSync(targetDir, { recursive: true });
  const copied = [];
  try {
    for (const [key, source] of pictures) {
      const destination = path.join(targetDir, pictureFilename(key));
      fs.copyFileSync(path.join(sourceDir, source), destination, fs.constants.COPYFILE_EXCL);
      copied.push(destination);
    }
    return copied;
  } catch (error) {
    for (const filename of copied) fs.rmSync(filename);
    throw error;
  }
}

async function seed(db, before) {
  const urls = new Map();
  await db.beginTransaction();
  try {
    for (const [key, source, category, alt] of pictures) {
      const filename = pictureFilename(key);
      const url = '/api/v1/media/files/' + filename;
      const size = fs.statSync(path.join(targetDir, filename)).size;
      await query(db,
        'INSERT INTO media_assets (original_name, filename, mime_type, size_bytes, url, alt_text, category, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [source, filename, 'image/png', size, url, alt, category, before.ownerId]);
      urls.set(key, url);
    }

    // El producto clásico forma parte de un pedido confirmado. Solo se oculta.
    const demo = before.products.find((item) => item.slug === oldSlugs[0]);
    if (before.orders.some((item) => item.product_id === demo.id)) {
      throw new Error('La torta de prueba personalizable ahora tiene pedidos; revisa antes de ocultarla');
    }
    for (const item of before.products) {
      await query(db, "UPDATE products SET status='INACTIVE', updated_at=NOW() WHERE id=?", [item.id]);
    }
    await query(db, 'UPDATE products SET deleted_at=NOW(), updated_at=NOW() WHERE id=?', [demo.id]);
    const oldLinks = await query(db, 'SELECT group_id FROM product_customization_groups WHERE product_id=?', [demo.id]);
    for (const link of oldLinks) {
      await query(db, 'UPDATE customization_groups SET is_active=0, updated_at=NOW() WHERE id=?', [link.group_id]);
      await query(db, "UPDATE customization_options SET status='INACTIVE', updated_at=NOW() WHERE group_id=?", [link.group_id]);
    }

    await query(db,
      'UPDATE categories SET name=?, slug=?, description=?, image_url=?, is_active=1, updated_at=NOW() WHERE id=?',
      ['Tortas personalizadas', 'tortas-personalizadas',
        'Tortas por encargo: elige bizcocho, relleno, cobertura y decoración.',
        urls.get('category'), before.categoryId]);

    const materialIds = new Map();
    for (const [code, name, unit, image] of materials) {
      const inserted = await query(db,
        'INSERT INTO inventory_items (code, name, unit, unit_cost, min_level, is_active, image_url, created_at, updated_at) VALUES (?, ?, ?, 0, 0, 1, ?, NOW(), NOW())',
        [code, name, unit, urls.get(image)]);
      materialIds.set(code, inserted.insertId);
      for (const branchId of before.branchIds) {
        await query(db,
          'INSERT INTO branch_inventory (branch_id, inventory_item_id, on_hand, reserved, average_unit_cost, created_at, updated_at) VALUES (?, ?, 0, 0, 0, NOW(), NOW())',
          [branchId, inserted.insertId]);
      }
    }

    const product = await query(db,
      "INSERT INTO products (category_id, type, name, slug, description, image_url, image_alt, status, is_featured, sort_order, allergens_reviewed_at, created_at, updated_at) VALUES (?, 'CUSTOMIZABLE', ?, ?, ?, ?, ?, 'DRAFT', 1, 1, NULL, NOW(), NOW())",
      [before.categoryId, 'Torta personalizada Misky Challay', slug,
        'Torta de 12 porciones para elegir bizcocho, relleno, cobertura y decoración. Imagen ilustrativa generada por IA; el aspecto final depende de las elecciones. Precio de prueba pendiente de confirmación.',
        urls.get('hero'), 'Torta con cobertura clara y fresas; imagen ilustrativa']);
    const variant = await query(db,
      'INSERT INTO product_variants (product_id, name, sku, base_price, serving_size, serving_unit, production_minutes_json, is_default, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 1, NOW(), NOW())',
      [product.insertId, '12 porciones', 'MC-TORTA-PERSONAL-12', 150, 12, 'porciones', JSON.stringify({})]);
    const effort = { DESIGN: 15, BAKING: 55, COOLING: 45, FILLING: 35, DECORATING: 50, QA: 15, DISPATCH: 10 };
    const offsets = { DESIGN: 2, BAKING: 1, COOLING: 1, FILLING: 1, DECORATING: 0, QA: 0, DISPATCH: 0 };
    await query(db,
      "INSERT INTO cake_product_profiles (product_id, sale_mode, min_lead_hours, base_effort_json, station_offsets_json, is_active, created_at, updated_at) VALUES (?, 'SEMI_CUSTOM', 48, ?, ?, 1, NOW(), NOW())",
      [product.insertId, JSON.stringify(effort), JSON.stringify(offsets)]);
    const recipe = await query(db,
      'INSERT INTO recipes (product_id, variant_id, yield_quantity, is_active, created_at, updated_at) VALUES (?, ?, 1, 1, NOW(), NOW())',
      [product.insertId, variant.insertId]);
    for (const [code, , , , quantity] of materials.filter((item) => item[4] > 0)) {
      await query(db,
        'INSERT INTO recipe_items (recipe_id, inventory_item_id, quantity, waste_percent, created_at, updated_at) VALUES (?, ?, ?, 0, NOW(), NOW())',
        [recipe.insertId, materialIds.get(code), quantity]);
    }
    // Son alérgenos evidentes de la receta base, pero la revisión formal sigue pendiente.
    for (const allergen of before.allergens) {
      await query(db,
        "INSERT INTO product_allergens (product_id, allergen_id, level, created_at, updated_at) VALUES (?, ?, 'CONTAINS', NOW(), NOW())",
        [product.insertId, allergen.id]);
    }

    for (const [index, [code, name, description, options]] of groups.entries()) {
      const group = await query(db,
        "INSERT INTO customization_groups (code, name, description, selection_type, min_selection, max_selection, free_quantity, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, 'SINGLE', 1, 1, 0, ?, 1, NOW(), NOW())",
        [code, name, description, index + 1]);
      await query(db,
        'INSERT INTO product_customization_groups (product_id, group_id, variant_id, sort_order, is_active, created_at, updated_at) VALUES (?, ?, NULL, ?, 1, NOW(), NOW())',
        [product.insertId, group.insertId, index + 1]);
      for (const [sort, [optionName, optionDescription, picture, price, materialCode, quantity, extraEffort]] of options.entries()) {
        const image = pictures.find((item) => item[0] === picture);
        await query(db,
          "INSERT INTO customization_options (group_id, name, description, image_url, image_alt, dietary_tags, allergens, price_delta, inventory_item_id, consumption_quantity, production_minutes_json, status, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, NOW(), NOW())",
          [group.insertId, optionName, optionDescription, urls.get(picture), image[3],
            JSON.stringify([]), JSON.stringify([]), price,
            materialCode ? materialIds.get(materialCode) : null, quantity,
            JSON.stringify(extraEffort), sort]);
      }
    }

    const checks = {};
    const conditions = {
      variants: ['SELECT COUNT(*) AS n FROM product_variants WHERE product_id=?', product.insertId, 1],
      recipes: ['SELECT COUNT(*) AS n FROM recipes WHERE product_id=?', product.insertId, 1],
      recipeItems: ['SELECT COUNT(*) AS n FROM recipe_items WHERE recipe_id=?', recipe.insertId, 9],
      groups: ['SELECT COUNT(*) AS n FROM product_customization_groups WHERE product_id=?', product.insertId, 4],
      allergens: ['SELECT COUNT(*) AS n FROM product_allergens WHERE product_id=?', product.insertId, 3],
    };
    for (const [key, [sql, id, expected]] of Object.entries(conditions)) {
      const [row] = await query(db, sql, [id]);
      checks[key] = Number(row.n);
      if (checks[key] !== expected) throw new Error('Verificación fallida: ' + key);
    }
    const [optionCount] = await query(db,
      "SELECT COUNT(*) AS n FROM customization_options WHERE group_id IN (SELECT id FROM customization_groups WHERE code LIKE 'mc_%')");
    if (Number(optionCount.n) !== 8) throw new Error('Faltan opciones');
    const [draft] = await query(db,
      'SELECT status, allergens_reviewed_at FROM products WHERE id=?', [product.insertId]);
    if (draft.status !== 'DRAFT' || draft.allergens_reviewed_at !== null) throw new Error('El producto no quedó pendiente de revisión');
    const orderItemsAfter = await query(db, 'SELECT id, product_id, variant_id FROM order_items ORDER BY id');
    if (JSON.stringify(orderItemsAfter) !== JSON.stringify(before.orders)) throw new Error('Cambió un pedido protegido');
    await db.commit();
    return { productId: product.insertId, variantId: variant.insertId, categoryId: before.categoryId,
      materials: materialIds.size, groups: checks.groups, options: Number(optionCount.n),
      recipeItems: checks.recipeItems, imageAssets: pictures.length, status: draft.status };
  } catch (error) {
    await db.rollback();
    throw error;
  }
}

async function main() {
  assertLocal();
  const db = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  try {
    const before = await inspect(db);
    console.log(JSON.stringify({
      mode: process.argv.includes('--execute') ? 'execute' : 'dry-run',
      previousProducts: before.products,
      protectedOrderItems: before.orders.length,
      newMaterials: materials.length, newGroups: groups.length,
      newOptions: groups.reduce((n, group) => n + group[3].length, 0),
      newImages: pictures.length,
    }, null, 2));
    if (!process.argv.includes('--execute')) return;
    const saved = backup();
    console.log('Respaldo verificado: ' + saved.file + ' (' + saved.tables + ' tablas)');
    const copied = copyPictures();
    try {
      const result = await seed(db, before);
      console.log(JSON.stringify({ result, backup: saved.file }, null, 2));
    } catch (error) {
      for (const filename of copied) fs.rmSync(filename);
      throw error;
    }
  } finally { await db.end(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
