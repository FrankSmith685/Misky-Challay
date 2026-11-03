/** Configura una cuarta presentación en Crea tu torta sin recargar el catálogo. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const SKU = 'MC-SEMI_CUSTOM-TORTA-A-TU-GUSTO-EXTRAGRANDE';
const TARGET_SERVINGS = 35;
const round = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const scaledEffort = (effort, factor) => Object.fromEntries(
  Object.entries(effort || {}).map(([station, minutes]) => [station, Math.ceil(Number(minutes) * factor)]),
);
const query = async (db, sql, values = []) => (await db.execute(sql, values))[0];
const jsonValue = (value) => value !== null && typeof value === 'object' && !(value instanceof Date)
  ? JSON.stringify(value) : value;

// Copy existing catalog attributes, including dietary labels and branch schedules.
async function insertCopy(db, table, source, overrides = {}) {
  const { id, created_at, updated_at, ...attributes } = source;
  const record = { ...attributes, ...overrides };
  const columns = Object.keys(record);
  assert(columns.every((column) => /^[a-z_]+$/.test(column)));
  const row = await query(db,
    `INSERT INTO ${table} (${columns.map((column) => '`' + column + '`').join(',')},created_at,updated_at) VALUES (${columns.map(() => '?').join(',')},NOW(),NOW())`,
    Object.values(record).map(jsonValue));
  return row.insertId;
}

async function inspect(db, lock = false) {
  const suffix = lock ? ' FOR UPDATE' : '';
  const [product] = await query(db, "SELECT id,slug,status,preparation_mode,allergens_reviewed_at FROM products WHERE slug='torta-a-tu-gusto' AND deleted_at IS NULL" + suffix);
  assert(product, 'No existe Crea tu torta');
  const [profile] = await query(db, 'SELECT * FROM cake_product_profiles WHERE product_id=?' + suffix, [product.id]);
  const variants = await query(db, 'SELECT * FROM product_variants WHERE product_id=? AND deleted_at IS NULL ORDER BY sort_order,id' + suffix, [product.id]);
  const recipes = await query(db, 'SELECT * FROM recipes WHERE product_id=?' + suffix, [product.id]);
  const recipeItems = await query(db, 'SELECT ri.* FROM recipe_items ri JOIN recipes r ON r.id=ri.recipe_id WHERE r.product_id=?' + suffix, [product.id]);
  const links = await query(db, 'SELECT * FROM product_customization_groups WHERE product_id=?' + suffix, [product.id]);
  const groups = await query(db, 'SELECT DISTINCT g.* FROM customization_groups g JOIN product_customization_groups pcg ON pcg.group_id=g.id WHERE pcg.product_id=?' + suffix, [product.id]);
  const options = await query(db, 'SELECT DISTINCT o.* FROM customization_options o JOIN product_customization_groups pcg ON pcg.group_id=o.group_id WHERE pcg.product_id=?' + suffix, [product.id]);
  const availability = await query(db, 'SELECT DISTINCT b.* FROM branch_option_availability b JOIN customization_options o ON o.id=b.option_id JOIN product_customization_groups pcg ON pcg.group_id=o.group_id WHERE pcg.product_id=?' + suffix, [product.id]);
  return { product, profile, variants, recipes, recipeItems, links, groups, options, availability };
}

function planFor(before) {
  assert.equal(before.product.status, 'ACTIVE');
  assert.equal(before.product.preparation_mode, 'MADE_TO_ORDER');
  assert(before.product.allergens_reviewed_at, 'Falta la revisión de alérgenos del producto base');
  assert.equal(before.profile.sale_mode, 'SEMI_CUSTOM');
  assert.equal(Number(before.profile.is_active), 1);
  const rule = before.profile.custom_servings_json;
  assert(rule?.enabled && rule.maxServings === 60, 'La regla actual cambió; revisa antes de aplicar');
  const source = before.variants.find((variant) => variant.id === rule.baseVariantId);
  assert(source && Number(source.serving_size) === 26 && source.serving_unit === 'porciones');
  assert(before.variants.length === 3 && before.variants.every((variant) => variant.is_active));
  const guide = rule.sizeGuides.find((row) => row.variantId === source.id);
  assert(guide && guide.minServings === 24 && guide.maxServings === 26 && guide.diameterCm === 28);
  assert.equal(rule.minServings, 27);
  assert(Number.isFinite(rule.pricePerExtraServing) && rule.pricePerExtraServing > 0);
  const recipe = before.recipes.find((row) => row.variant_id === source.id && row.is_active);
  assert(recipe && before.recipeItems.some((line) => line.recipe_id === recipe.id), 'Falta la receta base');
  const links = before.links.filter((link) => link.variant_id === source.id && link.is_active);
  assert.equal(links.length, 2, 'Se esperan los grupos de sabores y relleno de la presentación base');
  assert(links.every((link) => before.groups.some((group) => group.id === link.group_id && group.is_active)));
  const factor = TARGET_SERVINGS / Number(source.serving_size);
  return {
    source, recipe, links, factor,
    basePrice: round(Number(source.base_price) + (TARGET_SERVINGS - Number(source.serving_size)) * rule.pricePerExtraServing),
    // Same height and portion size: diameter changes with the square root of yield.
    diameterCm: Math.round(guide.diameterCm * Math.sqrt(factor) * 2) / 2,
    oldRule: rule,
  };
}

async function verify(db, state) {
  const fourth = state.variants.find((variant) => variant.sku === SKU);
  assert(fourth?.is_active && Number(fourth.serving_size) === TARGET_SERVINGS, 'Falta activar la cuarta presentación');
  assert.equal(state.variants.filter((variant) => variant.is_active).length, 4);
  const rule = state.profile.custom_servings_json;
  const { validateCakeSizeGuides } = require('../dist/modules/cakes/cakeSizeGuides');
  validateCakeSizeGuides(rule.sizeGuides, state.variants.filter((variant) => variant.is_active).map((variant) => ({
    id: variant.id, servingSize: Number(variant.serving_size), servingUnit: variant.serving_unit,
  })), rule.baseVariantId, rule.enabled, rule.minServings);
  assert.equal(rule.baseVariantId, fourth.id);
  assert.equal(rule.minServings, 36);
  assert.equal(rule.maxServings, 60);
  const guide = rule.sizeGuides.find((row) => row.variantId === fourth.id);
  assert.equal(guide.minServings, 26);
  const recipe = state.recipes.find((row) => row.variant_id === fourth.id && row.is_active);
  assert(recipe && state.recipeItems.filter((row) => row.recipe_id === recipe.id).length > 0);
  const links = state.links.filter((row) => row.variant_id === fourth.id && row.is_active);
  assert.equal(links.length, 2);
  const options = state.options.filter((row) => links.some((link) => link.group_id === row.group_id));
  assert(links.every((link) => options.some((row) => row.group_id === link.group_id && row.status === 'ACTIVE')));
  assert(state.links.some((row) => row.variant_id === null && row.is_active), 'Faltan los complementos compartidos');
  const [invalid] = await query(db, 'SELECT COUNT(*) AS n FROM recipe_items ri JOIN recipes r ON r.id=ri.recipe_id LEFT JOIN inventory_items i ON i.id=ri.inventory_item_id WHERE r.variant_id=? AND (i.id IS NULL OR i.is_active=0)', [fourth.id]);
  assert.equal(Number(invalid.n), 0, 'Hay insumos no disponibles en la nueva receta');
  return {
    productId: state.product.id, variantId: fourth.id, diameterCm: guide.diameterCm,
    portions: [guide.minServings, guide.maxServings], basePrice: Number(fourth.base_price),
    customPortions: [rule.minServings, rule.maxServings], recipeItems: state.recipeItems.filter((row) => row.recipe_id === recipe.id).length,
    groups: links.length, options: options.length,
  };
}

async function apply(db, before, plan) {
  // A changed yield must never alter consumption calculations for an open order.
  const [openOrders] = await query(db, "SELECT COUNT(*) AS n FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.variant_id=? AND o.status NOT IN ('CANCELLED','DELIVERED')", [plan.source.id]);
  assert.equal(Number(openOrders.n), 0, 'La presentación anterior tiene pedidos abiertos; completa esos pedidos antes de cambiar su rango');
  const sourceOptionIds = before.options.filter((option) => plan.links.some((link) => link.group_id === option.group_id)).map((option) => option.id);
  const markers = sourceOptionIds.map(() => '?').join(',');
  const incompatible = await query(db, `SELECT * FROM option_incompatibilities WHERE option_id IN (${markers}) OR incompatible_option_id IN (${markers}) FOR UPDATE`, [...sourceOptionIds, ...sourceOptionIds]);
  const backupDir = path.resolve(__dirname, '../../backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, 'cake-fourth-size-before-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
  fs.writeFileSync(backupFile, JSON.stringify({ ...before, incompatible }, null, 2), { flag: 'wx' });

  const fourthId = await insertCopy(db, 'product_variants', plan.source, {
    sku: SKU, name: 'Extra grande · 35 porciones', base_price: plan.basePrice,
    serving_size: TARGET_SERVINGS, sort_order: 3, is_default: 0,
    production_minutes_json: scaledEffort(plan.source.production_minutes_json, plan.factor),
  });
  const recipeId = await insertCopy(db, 'recipes', plan.recipe, { variant_id: fourthId });
  for (const line of before.recipeItems.filter((row) => row.recipe_id === plan.recipe.id)) {
    const [item] = await query(db, 'SELECT code FROM inventory_items WHERE id=?', [line.inventory_item_id]);
    // One box and one cake board per cake; food ingredients scale by yield.
    const packaging = ['MC-CAJA-TORTA', 'MC-BASE-TORTA'].includes(item.code);
    await insertCopy(db, 'recipe_items', line, { recipe_id: recipeId, quantity: packaging ? line.quantity : round(Number(line.quantity) * plan.factor) });
  }
  const optionMap = new Map();
  for (const link of plan.links) {
    const group = before.groups.find((row) => row.id === link.group_id);
    const code = group.code.replace(/_grande$/, '_extra_grande');
    assert(code !== group.code && code.length <= 40, 'El código del grupo no corresponde a la presentación original');
    const groupId = await insertCopy(db, 'customization_groups', group, { code });
    await insertCopy(db, 'product_customization_groups', link, { group_id: groupId, variant_id: fourthId });
    for (const option of before.options.filter((row) => row.group_id === group.id)) {
      const factor = option.cake_scale_with_servings ? plan.factor : 1;
      const optionId = await insertCopy(db, 'customization_options', option, {
        group_id: groupId, price_delta: round(Number(option.price_delta) * factor),
        consumption_quantity: round(Number(option.consumption_quantity) * factor),
        production_minutes_json: scaledEffort(option.production_minutes_json, factor),
      });
      optionMap.set(option.id, optionId);
      for (const availability of before.availability.filter((row) => row.option_id === option.id)) {
        await insertCopy(db, 'branch_option_availability', availability, {
          option_id: optionId,
          price_override: availability.price_override === null ? null : round(Number(availability.price_override) * factor),
        });
      }
    }
  }
  for (const relation of incompatible) {
    await insertCopy(db, 'option_incompatibilities', relation, {
      option_id: optionMap.get(relation.option_id) ?? relation.option_id,
      incompatible_option_id: optionMap.get(relation.incompatible_option_id) ?? relation.incompatible_option_id,
    });
  }
  // The 28 cm cake keeps its complete recipe; only its advertised cutting range changes.
  await query(db, 'UPDATE product_variants SET name=?,serving_size=25,updated_at=NOW() WHERE id=?', ['Grande · 25 porciones', plan.source.id]);
  const rule = {
    ...plan.oldRule, baseVariantId: fourthId, minServings: 36,
    sizeGuides: [
      ...plan.oldRule.sizeGuides.map((guide) => guide.variantId === plan.source.id ? { ...guide, maxServings: 25 } : guide),
      { variantId: fourthId, diameterCm: plan.diameterCm, minServings: 26, maxServings: TARGET_SERVINGS },
    ],
  };
  await query(db, 'UPDATE cake_product_profiles SET custom_servings_json=?,updated_at=NOW() WHERE product_id=?', [JSON.stringify(rule), before.product.id]);
  const after = await verify(db, await inspect(db));
  await query(db, 'INSERT INTO audit_logs (actor_id,action,entity,entity_id,before_json,after_json,user_agent,created_at,updated_at) VALUES (NULL,?,?,?,?,?,?,NOW(),NOW())', [
    'cake.fourth_size.configure', 'Product', String(before.product.id),
    JSON.stringify({ rule: plan.oldRule, variant: plan.source }),
    JSON.stringify({ ...after, priceFormula: `${plan.source.base_price} + (35 - 26) * ${plan.oldRule.pricePerExtraServing}`, recipeScale: plan.factor, diameterIsEstimate: true }),
    'configure-fourth-cake-size.cjs',
  ]);
  return { ...after, backupFile };
}

async function main() {
  const mode = process.argv[2] || '--dry-run';
  assert(['--dry-run', '--apply', '--verify'].includes(mode), 'Usa --dry-run, --apply o --verify');
  assert(process.env.NODE_ENV === 'development' && ['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST)
    && process.env.DB_NAME === 'DulceFlow', 'Este ajuste es solo para el catálogo local de desarrollo');
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  try {
    if (mode === '--apply') await db.beginTransaction();
    const before = await inspect(db, mode === '--apply');
    let result;
    if (before.variants.some((variant) => variant.sku === SKU)) {
      result = { alreadyConfigured: true, ...await verify(db, before) };
    } else {
      assert.notEqual(mode, '--verify', 'La cuarta presentación aún no está configurada');
      const plan = planFor(before);
      result = mode === '--apply' ? await apply(db, before, plan) : {
        mode, productId: before.product.id, portions: [26, 35], basePrice: plan.basePrice,
        diameterCm: plan.diameterCm, customPortions: [36, 60], recipeScale: plan.factor,
      };
    }
    if (mode === '--apply') await db.commit();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (mode === '--apply') await db.rollback();
    throw error;
  } finally { await db.end(); }
}
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
