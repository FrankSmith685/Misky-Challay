/** Reinicia exclusivamente el catalogo local y deja una torta de demostracion en borrador. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const CLEAR = [
  'product_allergens', 'product_dietary_tags', 'product_nutrition',
  'branch_product_availability', 'branch_option_availability',
  'recipe_items', 'recipes', 'product_customization_groups',
  'customization_options', 'customization_groups', 'cake_product_profiles',
  'product_variants', 'products', 'categories',
];
const TARGETS = new Set([
  'products', 'categories', 'cake_product_profiles', 'product_variants',
  'recipes', 'customization_groups', 'customization_options',
]);
const PRESERVE = ['users', 'orders', 'order_items', 'inventory_items', 'purchase_orders'];

function assertDevelopment() {
  if (process.env.NODE_ENV !== 'development') throw new Error('Solo se permite NODE_ENV=development');
  if (!['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST)) {
    throw new Error('Solo se permite una base de datos local');
  }
  if (process.env.DB_NAME !== 'DulceFlow') throw new Error('La base debe llamarse DulceFlow');
  if (process.env.SEED_DEMO_DATA !== 'false') throw new Error('SEED_DEMO_DATA debe ser false');
  if (process.env.MERCADOPAGO_MODE === 'live') throw new Error('Mercado Pago esta en modo live');
  if (!process.env.ADMIN_EMAIL) throw new Error('Falta ADMIN_EMAIL');
}

async function count(db, table) {
  const [[row]] = await db.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
  return Number(row.n);
}

async function inspect(db) {
  const [tables] = await db.query('SHOW FULL TABLES');
  const names = new Set(tables.map((row) => Object.values(row)[0]));
  if (names.size < 90 || ![...CLEAR, ...PRESERVE].every((name) => names.has(name))) {
    throw new Error('El esquema no coincide con el esperado');
  }
  const [owners] = await db.query(
    'SELECT id FROM users WHERE LOWER(email)=LOWER(?) AND is_super_admin=1 AND status=?',
    [process.env.ADMIN_EMAIL, 'ACTIVE'],
  );
  if (owners.length !== 1) throw new Error('No se pudo verificar la cuenta propietaria');
  const [relations] = await db.query(`
    SELECT DISTINCT table_name FROM information_schema.key_column_usage
    WHERE table_schema = DATABASE()
      AND referenced_table_name IN (${[...TARGETS].map(() => '?').join(',')})
  `, [...TARGETS]);
  const external = [...new Set(relations.map((row) => row.TABLE_NAME))]
    .filter((table) => !CLEAR.includes(table));
  for (const table of external) {
    if (!names.has(table) || !/^[a-z][a-z0-9_]*$/.test(table)) {
      throw new Error('Referencia inesperada en el esquema');
    }
    const rows = await count(db, table);
    if (rows) throw new Error(`No se puede limpiar: ${table} tiene ${rows} referencias fuera del catalogo`);
  }
  const preserved = Object.fromEntries(await Promise.all(PRESERVE.map(async (table) => [table, await count(db, table)])));
  if (preserved.order_items !== 0 || preserved.orders !== 0) {
    throw new Error('Hay pedidos; se requiere revisar sus referencias antes de limpiar');
  }
  const [inventory] = await db.query('SELECT id, name, unit FROM inventory_items WHERE is_active=1 ORDER BY id');
  if (inventory.length < 2) throw new Error('Faltan dos insumos activos para la receta de demostracion');
  const flour = inventory.find((item) => /harina/i.test(item.name) && item.unit === 'g');
  const sugar = inventory.find((item) => /az[uú]car/i.test(item.name) && item.unit === 'kg');
  if (!flour || !sugar) throw new Error('Faltan la harina (g) y el azucar (kg) de prueba');
  const clearing = Object.fromEntries(await Promise.all(CLEAR.map(async (table) => [table, await count(db, table)])));
  return { clearing, preserved, flourId: flour.id, sugarId: sugar.id, externalChecked: external.length };
}

function backupDatabase() {
  const directory = path.resolve(__dirname, '../../backups');
  fs.mkdirSync(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(directory, `DulceFlow-before-catalog-demo-${stamp}.sql`);
  const candidates = [
    process.env.MYSQLDUMP_PATH,
    'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe',
    'mysqldump',
  ].filter(Boolean);
  const executable = candidates.find((candidate) => candidate === 'mysqldump' || fs.existsSync(candidate));
  if (!executable) throw new Error('No se encontro mysqldump');
  const args = [
    `--host=${process.env.DB_HOST}`, `--port=${process.env.DB_PORT}`,
    `--user=${process.env.DB_USER}`, '--single-transaction', '--quick',
    '--routines', '--triggers', '--events', '--set-gtid-purged=OFF',
    '--no-tablespaces', '--hex-blob', `--result-file=${file}`, process.env.DB_NAME,
  ];
  const result = spawnSync(executable, args, {
    env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD },
    encoding: 'utf8', maxBuffer: 5 * 1024 * 1024,
  });
  if (result.status !== 0) {
    if (fs.existsSync(file)) fs.rmSync(file);
    throw new Error(`No se pudo crear el respaldo: ${(result.stderr || result.error?.message || '').trim()}`);
  }
  const contents = fs.readFileSync(file, 'utf8');
  const tables = (contents.match(/CREATE TABLE `/g) || []).length;
  if (contents.length < 10000 || tables < 90) {
    fs.rmSync(file);
    throw new Error(`Respaldo incompleto: ${tables} tablas`);
  }
  return { file, tables, bytes: fs.statSync(file).size };
}

async function resetAndSeed(db, before) {
  await db.beginTransaction();
  try {
    for (const table of CLEAR) await db.query(`DELETE FROM \`${table}\``);
    const [category] = await db.execute(
      `INSERT INTO categories (name, slug, description, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 1, NOW(), NOW())`,
      ['Pastelería', 'pasteleria', 'Tortas y productos de pastelería.'],
    );
    const [product] = await db.execute(
      `INSERT INTO products (category_id, type, name, slug, description, status, allergens_reviewed_at, created_at, updated_at)
       VALUES (?, 'CUSTOMIZABLE', ?, ?, ?, 'DRAFT', NULL, NOW(), NOW())`,
      [category.insertId, 'Torta de prueba personalizable', 'torta-de-prueba-personalizable',
        'Borrador para practicar. Precio, receta y alergenos deben revisarse antes de publicar.'],
    );
    const [variant] = await db.execute(
      `INSERT INTO product_variants (product_id, name, sku, base_price, serving_size, serving_unit,
       production_minutes_json, is_default, is_active, created_at, updated_at)
       VALUES (?, '12 porciones', ?, 120.00, 12, 'porciones', '{}', 1, 1, NOW(), NOW())`,
      [product.insertId, `CAKE-${product.insertId}-1`],
    );
    await db.execute(
      `INSERT INTO cake_product_profiles (product_id, sale_mode, min_lead_hours, base_effort_json,
       station_offsets_json, is_active, created_at, updated_at)
       VALUES (?, 'SEMI_CUSTOM', 48, ?, '{}', 1, NOW(), NOW())`,
      [product.insertId, JSON.stringify({ BAKING: 45, COOLING: 30, DECORATING: 30, QA: 10 })],
    );
    const [recipe] = await db.execute(
      `INSERT INTO recipes (product_id, variant_id, yield_quantity, is_active, created_at, updated_at)
       VALUES (?, ?, 1, 1, NOW(), NOW())`,
      [product.insertId, variant.insertId],
    );
    await db.execute(
      `INSERT INTO recipe_items (recipe_id, inventory_item_id, quantity, waste_percent, created_at, updated_at)
       VALUES (?, ?, 300, 0, NOW(), NOW()), (?, ?, 0.10, 0, NOW(), NOW())`,
      [recipe.insertId, before.flourId, recipe.insertId, before.sugarId],
    );
    const [group] = await db.execute(
      `INSERT INTO customization_groups (code, name, description, selection_type, min_selection,
       max_selection, free_quantity, sort_order, is_active, created_at, updated_at)
       VALUES (?, 'Acabado de prueba', 'Opciones de demostracion; revisa antes de publicar.',
       'SINGLE', 1, 1, 0, 0, 1, NOW(), NOW())`,
      [`cake_${product.insertId}_1`],
    );
    await db.execute(
      `INSERT INTO product_customization_groups (product_id, group_id, variant_id, sort_order,
       is_active, created_at, updated_at) VALUES (?, ?, NULL, 0, 1, NOW(), NOW())`,
      [product.insertId, group.insertId],
    );
    await db.execute(
      `INSERT INTO customization_options (group_id, name, description, dietary_tags, allergens,
       production_minutes_json, price_delta, inventory_item_id, consumption_quantity, sort_order,
       status, created_at, updated_at)
       VALUES (?, 'Sin acabado adicional', 'Opcion de prueba.', '[]', '[]', '{}', 0, NULL, 0, 0,
       'ACTIVE', NOW(), NOW()),
       (?, 'Azucar espolvoreada', 'Opcion de prueba.', '[]', '[]', '{}', 5.00, ?, 0.05, 1,
       'ACTIVE', NOW(), NOW())`,
      [group.insertId, group.insertId, before.sugarId],
    );
    const expected = {
      categories: 1, products: 1, product_variants: 1, cake_product_profiles: 1,
      recipes: 1, recipe_items: 2, customization_groups: 1,
      customization_options: 2, product_customization_groups: 1,
      product_allergens: 0, product_dietary_tags: 0, product_nutrition: 0,
    };
    for (const [table, total] of Object.entries(expected)) {
      if (await count(db, table) !== total) throw new Error(`Verificacion fallida en ${table}`);
    }
    const [[draft]] = await db.query('SELECT status, allergens_reviewed_at FROM products WHERE id=?', [product.insertId]);
    if (draft.status !== 'DRAFT' || draft.allergens_reviewed_at !== null) {
      throw new Error('La torta de prueba no quedo pendiente de revision');
    }
    for (const [table, total] of Object.entries(before.preserved)) {
      if (await count(db, table) !== total) throw new Error(`La tabla protegida ${table} cambio`);
    }
    await db.commit();
    return { categoryId: category.insertId, productId: product.insertId, variantId: variant.insertId };
  } catch (error) {
    await db.rollback();
    throw error;
  }
}

async function main() {
  assertDevelopment();
  const db = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  try {
    const before = await inspect(db);
    console.log(JSON.stringify({ mode: process.argv.includes('--execute') ? 'execute' : 'dry-run',
      clearing: before.clearing, preserved: before.preserved,
      externalReferencesChecked: before.externalChecked }, null, 2));
    if (!process.argv.includes('--execute')) return;
    const backup = backupDatabase();
    console.log(`Respaldo verificado: ${backup.file} (${backup.tables} tablas, ${backup.bytes} bytes)`);
    const result = await resetAndSeed(db, before);
    console.log(JSON.stringify({ result, status: 'DRAFT', backup: backup.file }, null, 2));
  } finally {
    await db.end();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
