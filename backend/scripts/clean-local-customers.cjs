/**
 * Elimina exclusivamente cuentas con rol customer y sus datos en desarrollo local.
 * Por defecto inspecciona y revierte. --execute crea respaldo y confirma la limpieza.
 * No llama a pasarelas, correo ni WhatsApp. Conserva personal, catálogo y compras.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const execute = process.argv.includes('--execute');
const key = (value) => String(value);
const round = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const phone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 9 ? `51${digits}` : digits;
};
const digest = (rows) => crypto.createHash('sha256').update(JSON.stringify(rows.map((r) => JSON.stringify(r)).sort())).digest('hex');
const identifier = (value) => {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new Error('Identificador SQL inesperado');
  return `\`${value}\``;
};

function assertLocal() {
  if (process.env.NODE_ENV !== 'development' || process.env.DB_NAME !== 'DulceFlow'
    || !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST)
    || process.env.MERCADOPAGO_MODE !== 'test' || process.env.SEED_DEMO_DATA !== 'false') {
    throw new Error('Solo se permite DulceFlow local de desarrollo, sin semillas ni pagos reales');
  }
}

function backup(expectedTables) {
  const dir = path.resolve(__dirname, '../../backups', `customers-cleanup-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'DulceFlow.sql');
  const executable = [process.env.MYSQLDUMP_PATH,
    'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe', 'mysqldump']
    .filter(Boolean).find((candidate) => candidate === 'mysqldump' || fs.existsSync(candidate));
  if (!executable) throw new Error('No se encontró mysqldump; no se eliminó ningún dato');
  const result = spawnSync(executable, [
    `--host=${process.env.DB_HOST}`, `--port=${process.env.DB_PORT || 3306}`, `--user=${process.env.DB_USER}`,
    '--single-transaction', '--quick', '--skip-lock-tables', '--routines', '--triggers', '--events',
    '--set-gtid-purged=OFF', '--no-tablespaces', '--hex-blob', `--result-file=${file}`, process.env.DB_NAME,
  ], { env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD }, encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 });
  if (result.status !== 0 || !fs.existsSync(file)) throw new Error('Falló el respaldo; no se eliminó ningún dato');
  const bytes = fs.readFileSync(file);
  const tableCount = (bytes.toString('utf8').match(/CREATE TABLE `/g) || []).length;
  assert.equal(tableCount, expectedTables, 'El respaldo debe contener todas las tablas');
  assert.ok(bytes.length > 10000, 'Respaldo incompleto');
  return { dir, file, tableCount, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

async function main() {
  assertLocal();
  const db = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    supportBigNumbers: true, bigNumberStrings: true,
  });
  const q = async (sql, values = []) => (await db.execute(sql, values))[0];
  let transaction = false;
  try {
    await q('SET SESSION innodb_lock_wait_timeout=15');
    const tables = await q("SELECT TABLE_NAME AS name,ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME");
    assert.ok(tables.length > 90 && tables.every((t) => t.engine === 'InnoDB'), 'Se requieren tablas transaccionales');
    const columns = await q('SELECT TABLE_NAME AS tab,COLUMN_NAME AS col,COLUMN_KEY AS columnKey,IS_NULLABLE AS nullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()');
    const fks = await q('SELECT DISTINCT TABLE_NAME AS child,COLUMN_NAME AS col,REFERENCED_TABLE_NAME AS parent,REFERENCED_COLUMN_NAME AS parentCol FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL');
    const pk = (table) => {
      const keys = columns.filter((c) => c.tab === table && c.columnKey === 'PRI');
      assert.equal(keys.length, 1, `Se requiere clave simple en ${table}`);
      return keys[0].col;
    };
    for (const table of tables) pk(table.name);
    await db.beginTransaction(); transaction = true;
    const rows = new Map();
    // Bloqueos transaccionales: ninguna tarea puede modificar las filas mientras se limpia.
    for (const table of [...tables].sort((a, b) => (a.name === 'users' ? -1 : b.name === 'users' ? 1 : a.name.localeCompare(b.name)))) {
      rows.set(table.name, await q(`SELECT * FROM ${identifier(table.name)} FOR UPDATE`));
    }
    const original = new Map([...rows].map(([table, data]) => [table, data.map((r) => ({ ...r }))]));
    const data = (table) => { assert.ok(rows.has(table), `Falta la tabla ${table}`); return rows.get(table); };
    const roles = new Map(data('roles').map((r) => [key(r.id), r.code]));
    const customers = data('users').filter((u) => {
      if (u.is_super_admin) return false;
      const assigned = data('user_roles').filter((r) => key(r.user_id) === key(u.id)).map((r) => roles.get(key(r.role_id)));
      return assigned.length > 0 && assigned.every((r) => r === 'customer');
    });
    const customerIds = new Set(customers.map((u) => key(u.id)));
    const preservedUsers = data('users').filter((u) => !customerIds.has(key(u.id)));
    assert.ok(preservedUsers.some((u) => u.is_super_admin && u.status === 'ACTIVE' && !u.deleted_at), 'Debe quedar un propietario activo');
    assert.ok(customers.every((u) => !u.is_super_admin));
    const scoped = new Map();
    const marked = (table, id) => scoped.get(table)?.has(key(id)) || false;
    const mark = (table, predicate) => {
      const column = pk(table);
      const ids = scoped.get(table) || new Set();
      for (const row of data(table).filter(predicate)) ids.add(key(row[column]));
      if (ids.size) scoped.set(table, ids);
    };
    const byUser = (row) => customerIds.has(key(row.user_id));
    mark('users', (u) => customerIds.has(key(u.id)));
    mark('orders', byUser);
    for (const table of ['addresses', 'builder_events', 'cake_design_requests', 'complaints', 'coupon_redemptions',
      'kitchen_push_subscriptions', 'mobile_devices', 'newsletter_subscriptions', 'notifications',
      'product_availability_subscriptions', 'product_favorites', 'product_reviews', 'saved_bowls', 'subscriptions',
      'user_plans', 'user_preferences', 'user_purchase_contexts', 'user_roles', 'ux_events', 'wallets']) mark(table, byUser);
    mark('admin_drafts', (r) => customerIds.has(key(r.owner_user_id)));
    const emails = new Set(customers.map((u) => String(u.email || '').toLowerCase()).filter(Boolean));
    const phones = new Set(customers.map((u) => phone(u.phone)).filter(Boolean));
    for (const u of preservedUsers) { emails.delete(String(u.email || '').toLowerCase()); phones.delete(phone(u.phone)); }
    const ownedOrders = data('orders').filter((r) => marked('orders', r.id));
    for (const r of ownedOrders) if (r.contact_phone && !preservedUsers.some((u) => phone(u.phone) === phone(r.contact_phone))) phones.add(phone(r.contact_phone));
    mark('newsletter_subscriptions', (r) => emails.has(String(r.email || '').toLowerCase()));
    mark('whatsapp_conversations', (r) => phones.has(phone(r.phone)));
    mark('whatsapp_messages', (r) => marked('whatsapp_conversations', r.conversation_id));
    mark('payments', (r) => byUser(r)
      || (r.payable_type === 'ORDER' && marked('orders', r.payable_id))
      || (r.payable_type === 'PLAN_PURCHASE' && marked('user_plans', r.payable_id)));
    for (const table of ['cake_capacity_reservations', 'cake_commissions', 'cake_order_cost_snapshots', 'cake_production_tasks',
      'deliveries', 'kitchen_tickets', 'order_discounts', 'order_items', 'order_status_history', 'coupon_redemptions',
      'complaints', 'dining_order_requests', 'notifications', 'communication_deliveries', 'cake_finance_entries']) mark(table, (r) => marked('orders', r.order_id));
    for (const table of ['mobile_payment_events', 'mobile_payment_claims', 'payment_attempts', 'refunds', 'cake_finance_entries']) mark(table, (r) => marked('payments', r.payment_id));
    for (const table of ['cake_design_references', 'cake_design_quotes']) mark(table, (r) => marked('cake_design_requests', r.request_id));
    mark('cake_commission_settlements', (r) => marked('cake_commissions', r.commission_id));
    mark('delivery_events', (r) => marked('deliveries', r.delivery_id));
    mark('kitchen_ticket_events', (r) => marked('kitchen_tickets', r.ticket_id));
    for (const table of ['product_reviews', 'order_item_references', 'order_item_customizations']) mark(table, (r) => marked('order_items', r.order_item_id));
    mark('subscription_cycles', (r) => marked('subscriptions', r.subscription_id));
    for (const table of ['wallet_transactions', 'wallet_credit_lots']) mark(table, (r) => marked('wallets', r.wallet_id));
    mark('wallet_lot_allocations', (r) => marked('wallet_transactions', r.wallet_transaction_id) || marked('wallet_credit_lots', r.wallet_credit_lot_id));
    mark('communication_deliveries', (r) => byUser(r) || marked('whatsapp_messages', r.message_id)
      || emails.has(String(r.recipient || '').toLowerCase()) || phones.has(phone(r.recipient))
      || marked('cake_design_requests', (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload)?.requestId));
    // Eventos anónimos de sesiones que después pertenecieron a estos clientes.
    for (const table of ['ux_events', 'builder_events']) {
      const sessions = new Set(data(table).filter(byUser).map((r) => r.session_id).filter(Boolean));
      mark(table, (r) => r.user_id === null && sessions.has(r.session_id));
    }
    const providerMessageIds = new Set([
      ...data('communication_deliveries').filter((r) => marked('communication_deliveries', r.id)),
      ...data('whatsapp_messages').filter((r) => marked('whatsapp_messages', r.id)),
    ].map((r) => r.provider_message_id).filter(Boolean));
    const paymentProviders = new Set(data('payments').filter((r) => marked('payments', r.id)).map((r) => r.provider));
    mark('webhook_events', (r) => {
      const payload = typeof r.payload_json === 'string' ? JSON.parse(r.payload_json) : r.payload_json;
      if (r.provider === 'meta_whatsapp') return providerMessageIds.has(payload?.messageId);
      return paymentProviders.has(r.provider)
        && !data('payments').some((p) => p.provider === r.provider && !marked('payments', p.id))
        && !data('subscriptions').some((s) => !marked('subscriptions', s.id));
    });
    const orderNumbers = new Set(ownedOrders.map((r) => r.order_number));
    mark('audit_logs', (r) => customerIds.has(key(r.actor_id)) || marked(r.entity, r.entity_id)
      || (r.entity === 'orders' && orderNumbers.has(r.entity_id)));

    const detach = [];
    const allowedDetach = new Set(['inventory_movements.order_id', 'cake_design_quotes.order_id', 'subscription_cycles.order_id', 'wallet_transactions.order_id']);
    // No se permite una cascada implícita que borre filas ajenas al alcance.
    for (const fk of fks.filter((f) => scoped.has(f.parent))) {
      const parentValues = new Set(data(fk.parent).filter((r) => marked(fk.parent, r[pk(fk.parent)])).map((r) => key(r[fk.parentCol])));
      for (const row of data(fk.child)) {
        if (marked(fk.child, row[pk(fk.child)]) || row[fk.col] === null || !parentValues.has(key(row[fk.col]))) continue;
        assert.ok(allowedDetach.has(`${fk.child}.${fk.col}`), `Hay una referencia ajena en ${fk.child}.${fk.col}; no se borra fuera del alcance`);
        assert.equal(columns.find((c) => c.tab === fk.child && c.col === fk.col)?.nullable, 'YES');
        detach.push({ table: fk.child, column: fk.col, id: row[pk(fk.child)] });
      }
    }
    assert.equal(data('media_assets').filter((r) => customerIds.has(key(r.created_by))).length, 0, 'Los archivos creados por clientes requieren comprobar sus usos antes de borrarlos');
    const plan = Object.fromEntries([...scoped].map(([table, ids]) => [table, ids.size]));
    const report = {
      customerAccounts: customers.length, staffAccountsPreserved: preservedUsers.length,
      ordersRemoved: scoped.get('orders')?.size || 0, remove: plan,
      inventoryMovementsToDetach: detach.filter((r) => r.table === 'inventory_movements').length,
    };
    if (!execute || !customers.length) {
      await db.rollback(); transaction = false;
      console.log(JSON.stringify({ dryRun: true, ...report }, null, 2));
      return;
    }
    const saved = backup(tables.length);
    console.log(`Respaldo completo verificado: ${saved.file}`);

    const allowedUpdates = new Map();
    const allowUpdate = (table, rowId, fields) => {
      const entries = allowedUpdates.get(table) || new Map();
      entries.set(key(rowId), new Set([...(entries.get(key(rowId)) || []), ...fields]));
      allowedUpdates.set(table, entries);
    };
    let released = 0;
    const pending = new Map();
    for (const r of data('inventory_movements').filter((m) => marked('orders', m.order_id))) {
      assert.ok(['RESERVE', 'RELEASE', 'CONSUME', 'WASTE'].includes(r.type), 'Hay un ajuste de inventario que requiere revisión');
      const group = `${r.order_id}:${r.branch_id}:${r.inventory_item_id}`;
      const delta = r.type === 'RESERVE' ? Number(r.quantity) : ['RELEASE', 'CONSUME'].includes(r.type) ? -Number(r.quantity) : 0;
      pending.set(group, round((pending.get(group) || 0) + delta));
    }
    const releaseByStock = new Map();
    for (const [group, qty] of pending) {
      const [, branchId, itemId] = group.split(':');
      const stockKey = `${branchId}:${itemId}`;
      releaseByStock.set(stockKey, round((releaseByStock.get(stockKey) || 0) + Math.max(0, qty)));
    }
    const addedMovements = new Set();
    for (const stock of data('branch_inventory')) {
      const quantity = releaseByStock.get(`${stock.branch_id}:${stock.inventory_item_id}`) || 0;
      if (!quantity) continue;
      assert.ok(round(stock.reserved) >= quantity, 'La reserva no coincide con el inventario');
      const reserved = round(Number(stock.reserved) - quantity);
      await q('UPDATE branch_inventory SET reserved=?,updated_at=NOW() WHERE id=?', [reserved, stock.id]);
      allowUpdate('branch_inventory', stock.id, ['reserved', 'updated_at']);
      const movement = await q("INSERT INTO inventory_movements (branch_id,inventory_item_id,type,quantity,on_hand_after,reserved_after,order_id,actor_id,reason,created_at,updated_at) VALUES (?,?,'RELEASE',?,?,?,NULL,NULL,?,NOW(),NOW())", [stock.branch_id, stock.inventory_item_id, quantity, stock.on_hand, reserved, 'Liberación por limpieza local de cuentas de clientes']);
      addedMovements.add(key(movement.insertId));
      for (const availability of data('branch_option_availability').filter((a) => key(a.branch_id) === key(stock.branch_id))) {
        const option = data('customization_options').find((o) => key(o.id) === key(availability.option_id) && key(o.inventory_item_id) === key(stock.inventory_item_id));
        if (!option || Number(option.consumption_quantity) <= 0) continue;
        const available = Number(stock.on_hand) - reserved >= Number(option.consumption_quantity);
        if (Boolean(availability.is_available) === available) continue;
        await q('UPDATE branch_option_availability SET is_available=?,updated_at=NOW() WHERE id=?', [available, availability.id]);
        allowUpdate('branch_option_availability', availability.id, ['is_available', 'updated_at']);
      }
      released = round(released + quantity);
    }
    for (const item of detach) {
      if (item.table === 'inventory_movements') {
        await q("UPDATE inventory_movements SET order_id=NULL,reason='Movimiento histórico de pedido eliminado en limpieza local',actor_id=IF(actor_id IN (" + [...customerIds].map(() => '?').join(',') + "),NULL,actor_id),updated_at=NOW() WHERE id=?", [...customerIds, item.id]);
        allowUpdate(item.table, item.id, ['order_id', 'reason', 'actor_id', 'updated_at']);
      } else {
        await q(`UPDATE ${identifier(item.table)} SET ${identifier(item.column)}=NULL WHERE ${identifier(pk(item.table))}=?`, [item.id]);
        allowUpdate(item.table, item.id, [item.column]);
      }
    }
    const confirmedStates = new Set(['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED']);
    for (const slot of data('delivery_slots')) {
      const orders = ownedOrders.filter((o) => key(o.delivery_slot_id) === key(slot.id) && !['CANCELLED', 'REFUNDED'].includes(o.status));
      const confirmed = orders.filter((o) => confirmedStates.has(o.status)).length;
      const held = orders.length - confirmed;
      if (!orders.length) continue;
      assert.ok(Number(slot.reserved_count) >= held && Number(slot.confirmed_count) >= confirmed, 'Los cupos de entrega no coinciden');
      await q('UPDATE delivery_slots SET reserved_count=reserved_count-?,confirmed_count=confirmed_count-?,updated_at=NOW() WHERE id=?', [held, confirmed, slot.id]);
      allowUpdate('delivery_slots', slot.id, ['reserved_count', 'confirmed_count', 'updated_at']);
    }
    for (const capacity of data('cake_station_capacities')) {
      const reservations = data('cake_capacity_reservations').filter((r) => marked('cake_capacity_reservations', r.id) && key(r.capacity_id) === key(capacity.id));
      const held = reservations.filter((r) => r.status === 'HELD').reduce((n, r) => n + Number(r.minutes), 0);
      const confirmed = reservations.filter((r) => r.status === 'CONFIRMED').reduce((n, r) => n + Number(r.minutes), 0);
      if (!held && !confirmed) continue;
      assert.ok(Number(capacity.reserved_minutes) >= held && Number(capacity.confirmed_minutes) >= confirmed, 'La capacidad de producción no coincide');
      await q('UPDATE cake_station_capacities SET reserved_minutes=reserved_minutes-?,confirmed_minutes=confirmed_minutes-?,updated_at=NOW() WHERE id=?', [held, confirmed, capacity.id]);
      allowUpdate('cake_station_capacities', capacity.id, ['reserved_minutes', 'confirmed_minutes', 'updated_at']);
    }
    for (const coupon of data('coupons')) {
      const count = data('coupon_redemptions').filter((r) => marked('coupon_redemptions', r.id) && key(r.coupon_id) === key(coupon.id) && r.status === 'CONFIRMED').length;
      if (!count) continue;
      assert.ok(Number(coupon.used_count) >= count);
      await q('UPDATE coupons SET used_count=used_count-?,updated_at=NOW() WHERE id=?', [count, coupon.id]);
      allowUpdate('coupons', coupon.id, ['used_count', 'updated_at']);
    }

    const remaining = new Set(scoped.keys());
    const virtualEdges = [
      ['cake_commission_settlements', 'cake_commissions'], ['cake_order_cost_snapshots', 'orders'],
      ['cake_finance_entries', 'orders'], ['cake_finance_entries', 'payments'], ['dining_order_requests', 'orders'],
      ['payments', 'user_plans'], ['order_items', 'cake_design_quotes'],
    ].map(([child, parent]) => ({ child, parent }));
    const edges = [...fks, ...virtualEdges].filter((f) => f.child !== f.parent);
    while (remaining.size) {
      const leaves = [...remaining].filter((parent) => !edges.some((f) => f.parent === parent && remaining.has(f.child)));
      assert.ok(leaves.length, 'Hay un ciclo de dependencias; se revierte la limpieza');
      for (const table of leaves) {
        const ids = [...scoped.get(table)];
        const result = await q(`DELETE FROM ${identifier(table)} WHERE ${identifier(pk(table))} IN (${ids.map(() => '?').join(',')})`, ids);
        assert.equal(Number(result.affectedRows), ids.length, `Cambió el alcance de ${table}`);
        remaining.delete(table);
      }
    }

    // Cada fila conservada debe ser idéntica, salvo los campos contables declarados.
    let unchangedTables = 0;
    for (const table of tables.map((t) => t.name)) {
      const after = await q(`SELECT * FROM ${identifier(table)}`);
      const primary = pk(table);
      const expected = original.get(table).filter((r) => !marked(table, r[primary]));
      const extra = table === 'inventory_movements' ? addedMovements : new Set();
      const kept = after.filter((r) => !extra.has(key(r[primary])));
      assert.equal(kept.length, expected.length, `Cambió el número de filas ajenas en ${table}`);
      const normalize = (list) => list.map((r) => {
        const copy = { ...r };
        for (const field of allowedUpdates.get(table)?.get(key(r[primary])) || []) delete copy[field];
        return copy;
      });
      assert.equal(digest(normalize(kept)), digest(normalize(expected)), `Se modificaron datos ajenos en ${table}`);
      assert.ok(!after.some((r) => marked(table, r[primary])), `Quedaron datos en ${table}`);
      if (!scoped.has(table) && !allowedUpdates.has(table) && !extra.size) unchangedTables++;
    }
    assert.equal((await q('SELECT id FROM users WHERE is_super_admin=1 AND status=? AND deleted_at IS NULL', ['ACTIVE'])).length,
      preservedUsers.filter((u) => u.is_super_admin && u.status === 'ACTIVE' && !u.deleted_at).length);
    for (const fk of fks) {
      const [r] = await q(`SELECT COUNT(*) AS n FROM ${identifier(fk.child)} c LEFT JOIN ${identifier(fk.parent)} p ON c.${identifier(fk.col)}=p.${identifier(fk.parentCol)} WHERE c.${identifier(fk.col)} IS NOT NULL AND p.${identifier(fk.parentCol)} IS NULL`);
      assert.equal(Number(r.n), 0, `Referencia huérfana en ${fk.child}.${fk.col}`);
    }
    const result = { ...report, releasedInventoryUnits: released, unchangedTablesVerified: unchangedTables, foreignKeysVerified: true,
      customerAccountsAfter: 0, backup: saved, completedAt: new Date().toISOString() };
    const reportFile = path.join(saved.dir, 'verification.json');
    fs.writeFileSync(reportFile, JSON.stringify({ committed: false, ...result }, null, 2), { flag: 'wx' });
    await db.commit(); transaction = false;
    fs.writeFileSync(reportFile, JSON.stringify({ committed: true, ...result }, null, 2));
    console.log(JSON.stringify({ committed: true, ...result }, null, 2));
  } catch (error) {
    if (transaction) await db.rollback();
    throw error;
  } finally { await db.end(); }
}
main().catch((error) => { console.error(`Limpieza de clientes: ${error.code || error.message}`); process.exitCode = 1; });
