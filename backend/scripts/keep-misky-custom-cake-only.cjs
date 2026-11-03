/**
 * Deja el catalogo local de tortas con una sola ficha: Crea tu torta.
 *
 * Conserva usuarios, sedes, insumos, inventario, configuracion y la ficha
 * personalizable completa (variantes, recetas, opciones y precios).
 * Elimina las demas tortas de la categoria de tortas. Solo se permite en la
 * base local de desarrollo y crea un respaldo antes de modificar datos.
 *
 * Uso:
 *   node keep-misky-custom-cake-only.cjs          # inspecciona el alcance
 *   node keep-misky-custom-cake-only.cjs --execute # respaldo + limpieza
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const TARGET_SLUG = 'torta-a-tu-gusto';
const backupDir = path.resolve(__dirname, '../../backups');

function assertLocal() {
  if (process.env.NODE_ENV !== 'development'
    || !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST)
    || process.env.DB_NAME !== 'DulceFlow'
    || process.env.SEED_DEMO_DATA !== 'false'
    || process.env.MERCADOPAGO_MODE === 'live') {
    throw new Error('Solo se permite en la base DulceFlow local de desarrollo sin pagos reales');
  }
  if (!process.env.ADMIN_EMAIL) throw new Error('Falta ADMIN_EMAIL para verificar la cuenta propietaria');
}

async function query(db, sql, values = []) {
  const [result] = await db.execute(sql, values);
  return result;
}

function placeholders(values) {
  return values.map(() => '?').join(',');
}

function backupDatabase() {
  fs.mkdirSync(backupDir, { recursive: true });
  const file = path.join(backupDir, `DulceFlow-before-custom-only-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`);
  const candidates = [
    process.env.MYSQLDUMP_PATH,
    'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe',
    'mysqldump',
  ].filter(Boolean);
  const executable = candidates.find((candidate) => candidate === 'mysqldump' || fs.existsSync(candidate));
  if (!executable) throw new Error('No se encontro mysqldump para crear el respaldo');
  const result = spawnSync(executable, [
    `--host=${process.env.DB_HOST}`, `--port=${process.env.DB_PORT}`, `--user=${process.env.DB_USER}`,
    '--single-transaction', '--quick', '--routines', '--triggers', '--events',
    '--set-gtid-purged=OFF', '--no-tablespaces', '--hex-blob', `--result-file=${file}`,
    process.env.DB_NAME,
  ], { env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD }, encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
  if (result.status !== 0 || !fs.existsSync(file)) {
    if (fs.existsSync(file)) fs.rmSync(file);
    throw new Error(`No se pudo crear el respaldo: ${(result.stderr || '').trim()}`);
  }
  const sql = fs.readFileSync(file, 'utf8');
  const tables = (sql.match(/CREATE TABLE /g) || []).length;
  if (sql.length < 10000 || tables < 90) {
    fs.rmSync(file);
    throw new Error(`El respaldo esta incompleto: ${tables} tablas`);
  }
  return { file, tables, bytes: fs.statSync(file).size };
}

async function inspect(db) {
  const owners = await query(db,
    'SELECT id FROM users WHERE LOWER(email)=LOWER(?) AND is_super_admin=1 AND status=?',
    [process.env.ADMIN_EMAIL, 'ACTIVE'],
  );
  if (owners.length !== 1) throw new Error('No se pudo verificar la cuenta propietaria activa');

  const targets = await query(db,
    'SELECT p.id, p.category_id, p.type, p.status, p.deleted_at, c.slug AS category_slug '
    + 'FROM products p JOIN categories c ON c.id=p.category_id WHERE p.slug=? LIMIT 2',
    [TARGET_SLUG],
  );
  if (targets.length !== 1) throw new Error(`Debe existir exactamente una ficha ${TARGET_SLUG}`);
  const target = targets[0];
  if (target.type !== 'CUSTOMIZABLE') throw new Error('La ficha Crea tu torta no es personalizable');

  const profiles = await query(db, 'SELECT product_id, sale_mode, is_active FROM cake_product_profiles WHERE product_id=?', [target.id]);
  if (profiles.length !== 1 || profiles[0].sale_mode !== 'SEMI_CUSTOM' || !profiles[0].is_active) {
    throw new Error('La ficha Crea tu torta no tiene un perfil personalizable activo');
  }

  const [[orderCount]] = await db.query('SELECT COUNT(*) AS total FROM orders');
  const [[itemCount]] = await db.query('SELECT COUNT(*) AS total FROM order_items');
  if (Number(orderCount.total) !== 0 || Number(itemCount.total) !== 0) {
    throw new Error('Hay pedidos registrados; se requiere conservar sus productos y no se puede hacer esta limpieza automatica');
  }

  const products = await query(db,
    'SELECT id, name, slug, type, status FROM products WHERE category_id=? AND deleted_at IS NULL ORDER BY id',
    [target.category_id],
  );
  const remove = products.filter((product) => product.id !== target.id);
  const [[userCount]] = await db.query('SELECT COUNT(*) AS total FROM users');
  const [[inventoryCount]] = await db.query('SELECT COUNT(*) AS total FROM inventory_items');
  const [[variantCount]] = await db.query('SELECT COUNT(*) AS total FROM product_variants WHERE product_id=?', [target.id]);
  const [[groupCount]] = await db.query(`SELECT COUNT(DISTINCT group_id) AS total FROM product_customization_groups WHERE product_id=?`, [target.id]);
  return {
    ownerId: owners[0].id,
    target,
    products,
    remove,
    preserved: {
      users: Number(userCount.total),
      inventoryItems: Number(inventoryCount.total),
      variants: Number(variantCount.total),
      customizationGroups: Number(groupCount.total),
    },
  };
}

async function tables(db) {
  const rows = await query(db, 'SHOW TABLES');
  return new Set(rows.map((row) => Object.values(row)[0]));
}

async function deleteProductRows(db, tableNames, productIds, variantIds) {
  if (!productIds.length) return;
  const p = placeholders(productIds);
  const v = placeholders(variantIds);
  const productTables = [
    'branch_product_availability', 'product_allergens', 'product_dietary_tags',
    'product_nutrition', 'product_customization_groups', 'cake_product_profiles',
    'dining_offerings', 'product_availability_subscriptions', 'product_favorites',
    'product_reviews', 'saved_bowls', 'builder_events', 'builder_presets',
    'cake_design_requests',
  ];
  for (const table of productTables) {
    if (!tableNames.has(table)) continue;
    const columns = await query(db, `SHOW COLUMNS FROM \`${table}\``);
    const hasProduct = columns.some((column) => column.Field === 'product_id');
    const hasVariant = columns.some((column) => column.Field === 'variant_id');
    if (hasProduct && hasVariant && variantIds.length) {
      await query(db, `DELETE FROM \`${table}\` WHERE product_id IN (${p}) OR variant_id IN (${v})`, [...productIds, ...variantIds]);
    } else if (hasProduct) {
      await query(db, `DELETE FROM \`${table}\` WHERE product_id IN (${p})`, productIds);
    } else if (hasVariant && variantIds.length) {
      await query(db, `DELETE FROM \`${table}\` WHERE variant_id IN (${v})`, variantIds);
    }
  }

  if (tableNames.has('recipes')) {
    const recipes = await query(db, `SELECT id FROM recipes WHERE product_id IN (${p})`, productIds);
    const recipeIds = recipes.map((row) => row.id);
    if (recipeIds.length && tableNames.has('recipe_items')) {
      await query(db, `DELETE FROM recipe_items WHERE recipe_id IN (${placeholders(recipeIds)})`, recipeIds);
    }
    await query(db, `DELETE FROM recipes WHERE product_id IN (${p})`, productIds);
  }
  if (tableNames.has('product_variants') && variantIds.length) {
    await query(db, `DELETE FROM product_variants WHERE id IN (${v})`, variantIds);
  }
  await query(db, `DELETE FROM products WHERE id IN (${p})`, productIds);
}

async function deleteUnusedGroups(db, tableNames, preservedProductId) {
  const unused = await query(db,
    'SELECT g.id FROM customization_groups g LEFT JOIN product_customization_groups link ON link.group_id=g.id '
    + 'GROUP BY g.id HAVING COUNT(link.id)=0',
  );
  const groupIds = unused.map((row) => row.id);
  if (!groupIds.length) return 0;
  const g = placeholders(groupIds);
  const options = await query(db, `SELECT id FROM customization_options WHERE group_id IN (${g})`, groupIds);
  const optionIds = options.map((row) => row.id);
  if (optionIds.length) {
    const o = placeholders(optionIds);
    for (const table of ['branch_option_availability', 'builder_events', 'builder_preset_items', 'option_incompatibilities']) {
      if (!tableNames.has(table)) continue;
      const columns = await query(db, `SHOW COLUMNS FROM \`${table}\``);
      if (columns.some((column) => column.Field === 'option_id')) await query(db, `DELETE FROM \`${table}\` WHERE option_id IN (${o})`, optionIds);
    }
    await query(db, `DELETE FROM customization_options WHERE id IN (${o})`, optionIds);
  }
  await query(db, `DELETE FROM customization_groups WHERE id IN (${g})`, groupIds);
  return groupIds.length;
}

async function execute(db, context) {
  const removeIds = context.remove.map((product) => product.id);
  if (!removeIds.length) return { removedProducts: 0, removedGroups: 0 };
  const p = placeholders(removeIds);
  const variants = await query(db, `SELECT id FROM product_variants WHERE product_id IN (${p})`, removeIds);
  const variantIds = variants.map((row) => row.id);
  const tableNames = await tables(db);

  await db.beginTransaction();
  try {
    await deleteProductRows(db, tableNames, removeIds, variantIds);
    const removedGroups = await deleteUnusedGroups(db, tableNames, context.target.id);
    await query(db,
      'UPDATE categories SET name=?, description=?, image_url=?, is_active=1, updated_at=NOW() WHERE id=?',
      ['Tortas personalizadas', 'Elige el tamaño, sabor, relleno, cobertura y decoración de tu torta.', '/images/cakes/custom.png', context.target.category_id],
    );
    await db.commit();
    return { removedProducts: removeIds.length, removedGroups };
  } catch (error) {
    await db.rollback();
    throw error;
  }
}

async function main() {
  assertLocal();
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  try {
    const context = await inspect(db);
    console.log(JSON.stringify({
      mode: process.argv.includes('--execute') ? 'execute' : 'dry-run',
      target: context.target,
      productsInCakeCategory: context.products,
      toRemove: context.remove,
      preserved: context.preserved,
    }, null, 2));
    if (!process.argv.includes('--execute')) return;
    const backup = backupDatabase();
    console.log(`Respaldo verificado: ${backup.file} (${backup.tables} tablas, ${backup.bytes} bytes)`);
    const result = await execute(db, context);
    const after = await inspect(db);
    console.log(JSON.stringify({ result, after: { products: after.products, preserved: after.preserved }, backup: backup.file }, null, 2));
  } finally {
    await db.end();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
