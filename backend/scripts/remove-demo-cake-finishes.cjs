/** Quita Cobertura y Decoración solo de Crea tu torta en la base local. */
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const oldDescription = 'Elige tamaño, sabor, relleno, cobertura y decoración. El precio se actualiza mientras personalizas.';
const newDescription = 'Elige tamaño, sabor y relleno; si quieres, agrega dulces para acompañarla. El precio se actualiza mientras personalizas.';
const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
const list = (value) => Array.isArray(value) ? value : typeof value === 'string' ? JSON.parse(value) : [];

async function inspect(db) {
  const [[product]] = await db.query("SELECT * FROM products WHERE slug='torta-a-tu-gusto' AND type='CUSTOMIZABLE' LIMIT 1");
  if (!product) throw new Error('No existe Crea tu torta');
  const [variants] = await db.query('SELECT id FROM product_variants WHERE product_id=? AND is_active=1', [product.id]);
  const [links] = await db.query('SELECT pcg.*, cg.code, cg.name, cg.sort_order AS group_sort_order FROM product_customization_groups pcg JOIN customization_groups cg ON cg.id=pcg.group_id WHERE pcg.product_id=? ORDER BY pcg.variant_id,pcg.sort_order', [product.id]);
  const obsolete = links.filter((link) => /^misky_catalog_(cobertura|decoracion)_/.test(link.code));
  const addons = links.find((link) => link.code === 'misky_catalog_complementos');
  const remaining = links.filter((link) => !obsolete.includes(link));
  if (!addons || addons.variant_id !== null || variants.some((variant) =>
    !['misky_catalog_sabor_', 'misky_catalog_relleno_'].every((prefix) =>
      remaining.some((link) => link.variant_id === variant.id && link.code.startsWith(prefix))))) {
    throw new Error('Faltan Sabor, Relleno o Adicionales; no se modificó el producto');
  }
  const groupIds = [...new Set(obsolete.map((link) => link.group_id))];
  const [groups] = groupIds.length ? await db.query('SELECT * FROM customization_groups WHERE id IN (?)', [groupIds]) : [[]];
  const [options] = groupIds.length ? await db.query('SELECT * FROM customization_options WHERE group_id IN (?)', [groupIds]) : [[]];
  const [presets] = await db.query('SELECT id FROM builder_presets WHERE product_id=?', [product.id]);
  const [presetItems] = presets.length && options.length ? await db.query('SELECT * FROM builder_preset_items WHERE preset_id IN (?) AND option_id IN (?)', [presets.map((row) => row.id), options.map((row) => row.id)]) : [[]];
  const [otherLinks] = groupIds.length ? await db.query('SELECT product_id, group_id FROM product_customization_groups WHERE group_id IN (?) AND product_id<>?', [groupIds, product.id]) : [[]];
  const [allergens] = await db.query('SELECT * FROM product_allergens WHERE product_id=?', [product.id]);
  return { product, variants, links, obsolete, addons, remaining, groups, options, presetItems, otherLinks, allergens };
}

async function refreshAllergens(db, productId) {
  const [variants] = await db.query('SELECT id FROM product_variants WHERE product_id=? AND is_active=1', [productId]);
  const [recipes] = variants.length ? await db.query('SELECT id, variant_id FROM recipes WHERE variant_id IN (?) AND is_active=1', [variants.map((row) => row.id)]) : [[]];
  const [recipeItems] = recipes.length ? await db.query('SELECT recipe_id, inventory_item_id FROM recipe_items WHERE recipe_id IN (?)', [recipes.map((row) => row.id)]) : [[]];
  const [links] = await db.query('SELECT pcg.group_id, COALESCE(pcg.min_selection_override,cg.min_selection) AS min_selection FROM product_customization_groups pcg JOIN customization_groups cg ON cg.id=pcg.group_id AND cg.is_active=1 WHERE pcg.product_id=? AND pcg.is_active=1', [productId]);
  const [options] = links.length ? await db.query("SELECT group_id, inventory_item_id, allergens FROM customization_options WHERE group_id IN (?) AND status='ACTIVE'", [links.map((row) => row.group_id)]) : [[]];
  const inventoryIds = [...new Set([...recipeItems.map((row) => row.inventory_item_id), ...options.map((row) => row.inventory_item_id).filter((id) => id !== null)])];
  const [inventory] = inventoryIds.length ? await db.query('SELECT id, name, allergens FROM inventory_items WHERE id IN (?)', [inventoryIds]) : [[]];
  const inventoryById = new Map(inventory.map((row) => [row.id, row]));
  const [master] = await db.query('SELECT id, code FROM allergens');
  const codes = new Set([...inventory.flatMap((row) => list(row.allergens)), ...options.flatMap((row) => list(row.allergens))]);
  const known = new Set(master.map((row) => row.code));
  const complete = variants.length > 0 && recipes.length === variants.length
    && recipes.every((recipe) => recipeItems.some((item) => item.recipe_id === recipe.id))
    && links.length > 0 && links.every((link) => options.filter((option) => option.group_id === link.group_id).length >= Math.max(1, Number(link.min_selection)))
    && inventoryIds.every((id) => inventoryById.has(id) && Array.isArray(list(inventoryById.get(id).allergens)))
    && [...codes].every((code) => known.has(code)) && master.length > 0;
  if (!complete) throw new Error('La revisión de alérgenos quedó incompleta; se revirtieron los cambios');
  const nextIds = master.filter((row) => codes.has(row.code)).map((row) => row.id).sort((a, b) => a - b);
  const [previous] = await db.query('SELECT allergen_id FROM product_allergens WHERE product_id=?', [productId]);
  const oldIds = previous.map((row) => row.allergen_id).sort((a, b) => a - b);
  if (nextIds.join(',') !== oldIds.join(',')) {
    await db.query('DELETE FROM product_allergens WHERE product_id=?', [productId]);
    for (const allergenId of nextIds) await db.query("INSERT INTO product_allergens (product_id, allergen_id, level, created_at, updated_at) VALUES (?, ?, 'CONTAINS', NOW(), NOW())", [productId, allergenId]);
    await db.query('DELETE FROM product_dietary_tags WHERE product_id=?', [productId]);
  }
  await db.query('UPDATE products SET allergens_reviewed_at=NOW(), updated_at=NOW() WHERE id=?', [productId]);
}

async function main() {
  const mode = process.argv[2];
  if (!['--plan', '--apply', '--verify'].includes(mode) || process.env.NODE_ENV !== 'development'
    || !localHosts.has(process.env.DB_HOST) || process.env.DB_NAME !== 'DulceFlow'
    || process.env.SEED_DEMO_DATA !== 'false' || process.env.MERCADOPAGO_MODE === 'live') {
    throw new Error('Solo se permite --plan, --apply o --verify en DulceFlow local de desarrollo, sin pagos reales');
  }
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  try {
    const before = await inspect(db);
    const details = {
      productId: before.product.id,
      remove: before.obsolete.map((row) => ({ name: row.name, variantId: row.variant_id })),
      preservedForOtherProducts: before.otherLinks.length,
      presetItemsToRemove: before.presetItems.length,
      resultingGroupsPerVariant: before.variants.map((variant) => ({ variantId: variant.id, names: before.remaining.filter((link) => link.variant_id === variant.id || link.variant_id === null).map((link) => link.name) })),
    };
    if (mode === '--plan') { console.log(JSON.stringify(details, null, 2)); return; }
    if (mode === '--verify') {
      if (before.obsolete.length || Number(before.addons.sort_order) !== 3 || Number(before.addons.group_sort_order) !== 3 || !before.product.allergens_reviewed_at) throw new Error('Los pasos siguen presentes o faltó revisar los alérgenos');
      console.log(JSON.stringify({ verified: true, ...details }, null, 2));
      return;
    }
    const backupDir = path.resolve(__dirname, '../../backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `demo-cake-finishes-${before.product.id}-${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({ product: before.product, links: before.obsolete, groups: before.groups, options: before.options, presetItems: before.presetItems, allergens: before.allergens }, null, 2), { flag: 'wx' });
    await db.beginTransaction();
    try {
      if (before.presetItems.length) await db.query('DELETE FROM builder_preset_items WHERE id IN (?)', [before.presetItems.map((row) => row.id)]);
      if (before.obsolete.length) await db.query('DELETE FROM product_customization_groups WHERE id IN (?)', [before.obsolete.map((row) => row.id)]);
      await db.query('UPDATE product_customization_groups SET sort_order=3, updated_at=NOW() WHERE id=?', [before.addons.id]);
      await db.query('UPDATE customization_groups SET sort_order=3, updated_at=NOW() WHERE id=?', [before.addons.group_id]);
      if (before.product.description === oldDescription) await db.query('UPDATE products SET description=?, updated_at=NOW() WHERE id=?', [newDescription, before.product.id]);
      await refreshAllergens(db, before.product.id);
      await db.commit();
    } catch (error) { await db.rollback(); throw error; }
    console.log(JSON.stringify({ applied: true, backupPath, ...details }, null, 2));
  } finally { await db.end(); }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
