/** Agrega complementos al constructor de la torta de demostración local. */
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { cakeAddons } = require('./demo-cake-addons.cjs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const localHosts = new Set(['localhost', '127.0.0.1', '::1']);

async function inspect(db) {
  const [[product]] = await db.query("SELECT id, name, status FROM products WHERE slug='torta-a-tu-gusto' AND type='CUSTOMIZABLE' LIMIT 1");
  if (!product) throw new Error('Falta el producto Crea tu torta');
  const [[group]] = await db.query('SELECT * FROM customization_groups WHERE code=? LIMIT 1', [cakeAddons.code]);
  const [links] = group ? await db.query('SELECT * FROM product_customization_groups WHERE product_id=? AND group_id=?', [product.id, group.id]) : [[]];
  const [options] = group ? await db.query('SELECT * FROM customization_options WHERE group_id=? ORDER BY sort_order,id', [group.id]) : [[]];
  return { product, group, links, options };
}

async function main() {
  const mode = process.argv[2];
  if (!['--apply', '--verify'].includes(mode) || process.env.NODE_ENV !== 'development'
    || !localHosts.has(process.env.DB_HOST) || process.env.DB_NAME !== 'DulceFlow'
    || process.env.SEED_DEMO_DATA !== 'false' || process.env.MERCADOPAGO_MODE === 'live') {
    throw new Error('Solo se permite --apply o --verify en DulceFlow local de desarrollo, sin pagos reales');
  }
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  try {
    const before = await inspect(db);
    if (mode === '--apply') {
      if (before.group && (before.links.length !== 1 || before.links[0].variant_id !== null || before.options.length !== cakeAddons.options.length)) throw new Error('El grupo de complementos ya existe con una configuración diferente');
      const backupDir = path.resolve(__dirname, '../../backups');
      fs.mkdirSync(backupDir, { recursive: true });
      const backupPath = path.join(backupDir, `demo-cake-addons-${before.product.id}-${Date.now()}.json`);
      fs.writeFileSync(backupPath, JSON.stringify(before, null, 2), { flag: 'wx' });
      await db.beginTransaction();
      try {
        if (!before.group) {
          const [created] = await db.query('INSERT INTO customization_groups (code, name, description, selection_type, min_selection, max_selection, free_quantity, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())', [cakeAddons.code, cakeAddons.name, cakeAddons.description, cakeAddons.selectionType, cakeAddons.minSelection, cakeAddons.maxSelection, cakeAddons.freeQuantity, cakeAddons.sortOrder]);
          const groupId = created.insertId;
          await db.query('INSERT INTO product_customization_groups (product_id, group_id, variant_id, min_selection_override, max_selection_override, free_quantity_override, sort_order, is_active, created_at, updated_at) VALUES (?, ?, NULL, NULL, NULL, NULL, ?, 1, NOW(), NOW())', [before.product.id, groupId, cakeAddons.sortOrder]);
          const [branches] = await db.query('SELECT id FROM branches WHERE is_active=1');
          for (const [index, option] of cakeAddons.options.entries()) {
            const [createdOption] = await db.query("INSERT INTO customization_options (group_id, name, description, image_url, image_alt, dietary_tags, allergens, price_delta, charge_always, cake_scale_with_servings, max_per_item, inventory_item_id, consumption_quantity, production_minutes_json, status, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '[]', ?, ?, 1, 0, 12, NULL, 0, '{}', 'ACTIVE', ?, NOW(), NOW())", [groupId, option.name, option.description, option.imageUrl, option.name, JSON.stringify(option.allergens), option.delta, index]);
            for (const branch of branches) await db.query('INSERT INTO branch_option_availability (branch_id, option_id, is_available, price_override, created_at, updated_at) VALUES (?, ?, 1, NULL, NOW(), NOW())', [branch.id, createdOption.insertId]);
          }
        }
        await db.commit();
        console.log(JSON.stringify({ applied: true, backupPath, productId: before.product.id }, null, 2));
      } catch (error) { await db.rollback(); throw error; }
    }
    const current = await inspect(db);
    if (!current.group || current.group.name !== cakeAddons.name
      || current.group.selection_type !== 'MULTIPLE' || Number(current.group.min_selection) !== 0
      || Number(current.group.free_quantity) !== 0 || current.links.length !== 1
      || current.links[0].variant_id !== null || current.options.length !== cakeAddons.options.length
      || current.options.some((option) => Number(option.cake_scale_with_servings) !== 0 || Number(option.charge_always) !== 1 || Number(option.max_per_item) < 2)) {
      throw new Error('No se verificó la configuración completa de los complementos');
    }
    console.log(JSON.stringify({ verified: true, productId: current.product.id, groupId: current.group.id, options: current.options.map((option) => ({ name: option.name, price: Number(option.price_delta), maxPerItem: option.max_per_item })) }, null, 2));
  } finally { await db.end(); }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
