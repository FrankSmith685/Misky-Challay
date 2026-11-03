/**
 * Reinicia un cliente y borra todos los pedidos de la base local de pruebas.
 * Conserva credenciales, catálogo, compras, existencias y cuentas ajenas.
 * Por defecto solo inspecciona. --execute exige respaldo y verificación transaccional.
 * Uso: node backend/scripts/reset-local-customer-and-orders.cjs --email cliente@example.test --all-orders [--execute]
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const args = process.argv.slice(2);
const email = args[args.indexOf('--email') + 1]?.trim().toLowerCase();
const execute = args.includes('--execute');
const identifier = (name) => {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error('Identificador SQL inesperado');
  return `\`${name}\``;
};
const inside = (column, ids) => ({
  sql: ids.length ? `${identifier(column)} IN (${ids.map(() => '?').join(',')})` : 'FALSE',
  values: ids,
});
const any = (...conditions) => ({ sql: conditions.map((c) => `(${c.sql})`).join(' OR '), values: conditions.flatMap((c) => c.values) });
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const round = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function assertScope() {
  if (!args.includes('--email') || !email || !email.includes('@') || !args.includes('--all-orders'))
    throw new Error('Indica --email y --all-orders explícitamente');
  if (process.env.NODE_ENV !== 'development' || process.env.DB_NAME !== 'DulceFlow'
    || !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST)
    || process.env.MERCADOPAGO_MODE !== 'test')
    throw new Error('Este reinicio solo admite la base DulceFlow local de desarrollo con pagos de prueba');
}

function backup() {
  const root = path.resolve(__dirname, '../../backups');
  const dir = path.join(root, `customer-and-orders-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'DulceFlow.sql');
  const executable = [process.env.MYSQLDUMP_PATH,
    'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe', 'mysqldump']
    .filter(Boolean).find((candidate) => candidate === 'mysqldump' || fs.existsSync(candidate));
  if (!executable) throw new Error('No se encontró mysqldump para el respaldo obligatorio');
  const result = spawnSync(executable, [
    `--host=${process.env.DB_HOST}`, `--port=${process.env.DB_PORT || 3306}`,
    `--user=${process.env.DB_USER}`, '--single-transaction', '--quick', '--skip-lock-tables',
    '--routines', '--triggers', '--events', '--set-gtid-purged=OFF', '--no-tablespaces', '--hex-blob',
    `--result-file=${file}`, process.env.DB_NAME,
  ], { env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD }, encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024 });
  if (result.status !== 0 || !fs.existsSync(file)) throw new Error('Falló el respaldo; no se borró ningún dato');
  const bytes = fs.readFileSync(file);
  const tableCount = (bytes.toString('utf8').match(/CREATE TABLE `/g) || []).length;
  if (bytes.length < 10000 || tableCount < 90) throw new Error('Respaldo incompleto; no se borró ningún dato');
  return { dir, file, bytes: bytes.length, tableCount, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

async function main() {
  assertScope();
  const db = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    supportBigNumbers: true, bigNumberStrings: true,
  });
  const query = async (sql, values = []) => (await db.execute(sql, values))[0];
  const select = async (table, condition = { sql: 'TRUE', values: [] }) =>
    query(`SELECT * FROM ${identifier(table)} WHERE ${condition.sql}`, condition.values);
  const byUser = (column = 'user_id') => ({ sql: `${identifier(column)} = ?`, values: [user.id] });
  let user;
  let transaction = false;
  try {
    const targets = await query('SELECT * FROM users WHERE LOWER(email) = ?', [email]);
    if (targets.length !== 1 || targets[0].is_super_admin || targets[0].status !== 'ACTIVE' || targets[0].deleted_at)
      throw new Error('Se requiere exactamente un cliente activo que no sea superadministrador');
    user = targets[0];
    const roles = await query('SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=?', [user.id]);
    if (roles.length !== 1 || roles[0].code !== 'customer') throw new Error('La cuenta debe ser exclusivamente cliente');

    await db.beginTransaction();
    transaction = true;
    const [lockedUser] = await query('SELECT * FROM users WHERE id=? FOR UPDATE', [user.id]);
    assert.equal(hash(lockedUser), hash(user), 'La cuenta cambió durante la inspección');
    const orders = await query('SELECT * FROM orders FOR UPDATE');
    const orderIds = orders.map((row) => row.id);
    const tables = (await query('SELECT TABLE_NAME AS name,ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()'));
    if (tables.some((table) => table.engine !== 'InnoDB')) throw new Error('Todas las tablas deben admitir transacciones');
    const tableNames = tables.map((table) => table.name);
    for (const table of ['payments', 'subscriptions', 'subscription_cycles', 'inventory_movements', 'branch_inventory',
      'cake_capacity_reservations', 'cake_station_capacities', 'delivery_slots', 'wallets', 'wallet_transactions'])
      await query(`SELECT * FROM ${identifier(table)} FOR UPDATE`);

    const ids = async (table, condition) => (await select(table, condition)).map((row) => row.id);
    const items = await ids('order_items', inside('order_id', orderIds));
    const tickets = await ids('kitchen_tickets', inside('order_id', orderIds));
    const deliveries = await ids('deliveries', inside('order_id', orderIds));
    const commissions = await ids('cake_commissions', inside('order_id', orderIds));
    const tasks = await ids('cake_production_tasks', inside('order_id', orderIds));
    const requests = await ids('cake_design_requests', byUser());
    const subscriptions = await ids('subscriptions', byUser());
    const plans = await ids('user_plans', byUser());
    const wallets = await ids('wallets', byUser());
    const walletTransactions = await ids('wallet_transactions', inside('wallet_id', wallets));
    const lots = await ids('wallet_credit_lots', inside('wallet_id', wallets));
    const payments = await ids('payments', any({ sql: 'payable_type = ?', values: ['ORDER'] }, byUser()));
    const scoped = [];
    const add = (table, condition) => scoped.push({ table, ...condition });

    add('mobile_payment_events', inside('payment_id', payments));
    add('mobile_payment_claims', inside('payment_id', payments));
    add('payment_attempts', inside('payment_id', payments));
    add('refunds', inside('payment_id', payments));
    add('cake_finance_entries', any(inside('order_id', orderIds), inside('payment_id', payments)));
    add('cake_commission_settlements', inside('commission_id', commissions));
    add('cake_commissions', inside('order_id', orderIds));
    add('cake_order_cost_snapshots', inside('order_id', orderIds));
    add('cake_capacity_reservations', inside('order_id', orderIds));
    add('cake_production_tasks', inside('order_id', orderIds));
    add('delivery_events', inside('delivery_id', deliveries));
    add('deliveries', inside('order_id', orderIds));
    add('kitchen_ticket_events', inside('ticket_id', tickets));
    add('kitchen_tickets', inside('order_id', orderIds));
    add('product_reviews', any(inside('order_item_id', items), byUser()));
    add('order_item_references', inside('order_item_id', items));
    add('order_item_customizations', inside('order_item_id', items));
    add('order_items', inside('order_id', orderIds));
    add('order_discounts', inside('order_id', orderIds));
    add('order_status_history', inside('order_id', orderIds));
    add('coupon_redemptions', any(inside('order_id', orderIds), byUser()));
    add('complaints', any(inside('order_id', orderIds), byUser()));
    add('dining_order_requests', inside('order_id', orderIds));
    add('notifications', any(inside('order_id', orderIds), byUser()));
    add('webhook_events', { sql: "event_type LIKE 'order.%'", values: [] });
    add('ux_events', any(byUser(), { sql: 'event_type = ?', values: ['ORDER_COMPLETED'] }));
    add('builder_events', byUser());
    add('user_purchase_contexts', byUser());
    add('user_preferences', byUser());
    add('saved_bowls', byUser());
    add('product_favorites', byUser());
    add('product_availability_subscriptions', byUser());
    add('newsletter_subscriptions', any(byUser(), { sql: 'LOWER(email) = ?', values: [email] }));
    add('kitchen_push_subscriptions', byUser());
    add('mobile_devices', byUser());
    add('admin_drafts', byUser('owner_user_id'));
    add('wallet_lot_allocations', any(inside('wallet_transaction_id', walletTransactions), inside('wallet_credit_lot_id', lots)));
    add('wallet_credit_lots', inside('wallet_id', wallets));
    add('wallet_transactions', inside('wallet_id', wallets));
    add('wallets', byUser());
    add('user_plans', byUser());
    add('subscription_cycles', inside('subscription_id', subscriptions));
    add('subscriptions', byUser());
    add('cake_design_references', inside('request_id', requests));
    add('cake_design_quotes', inside('request_id', requests));
    add('cake_design_requests', byUser());
    add('payments', inside('id', payments));
    add('addresses', byUser());
    add('orders', inside('id', orderIds));
    add('audit_logs', any(byUser('actor_id'), ...[
      ['orders', [...orderIds, ...orders.map((row) => row.order_number)]],
      ['payments', payments], ['cake_production_tasks', tasks], ['cake_commissions', commissions],
    ].map(([entity, entityIds]) => {
      const condition = inside('entity_id', entityIds);
      return { sql: `entity = ? AND ${condition.sql}`, values: [entity, ...condition.values] };
    })));

    const plan = [];
    for (const scope of scoped) {
      assert.ok(tableNames.includes(scope.table), `Falta la tabla ${scope.table}`);
      const [row] = await query(`SELECT COUNT(*) AS n FROM ${identifier(scope.table)} WHERE ${scope.sql}`, scope.values);
      plan.push({ ...scope, count: Number(row.n) });
    }
    const stock = await select('branch_inventory');
    const movements = await select('inventory_movements', inside('order_id', orderIds));
    if (movements.some((row) => !['RESERVE', 'RELEASE', 'CONSUME', 'WASTE'].includes(row.type)))
      throw new Error('Un pedido tiene movimientos extraordinarios que requieren revisión');
    const summary = {
      email, userId: user.id, orders: orders.length,
      remove: Object.fromEntries(plan.filter((scope) => scope.count > 0).map((scope) => [scope.table, scope.count])),
      inventoryMovementsToDetach: movements.length,
      activeTestSubscriptionsToRemove: subscriptions.length,
    };
    if (!execute) {
      await db.rollback(); transaction = false;
      console.log(JSON.stringify({ dryRun: true, ...summary }, null, 2));
      return;
    }

    const saved = backup();
    console.log(`Respaldo verificado: ${saved.file} (${saved.tableCount} tablas)`);
    const modified = new Set([...plan.map((scope) => scope.table), 'users', 'inventory_movements', 'branch_inventory',
      'cake_design_quotes', 'subscription_cycles', 'wallet_transactions', 'coupons', 'delivery_slots',
      'cake_station_capacities', 'branch_option_availability', 'saved_bowls']);
    const unchanged = new Map();
    for (const table of tableNames.filter((table) => !modified.has(table))) unchanged.set(table, hash(await select(table)));
    const otherUsers = hash(await select('users', { sql: 'id <> ?', values: [user.id] }));
    const coupons = await query(`SELECT coupon_id,COUNT(*) AS n FROM coupon_redemptions
      WHERE order_id IS NOT NULL AND status='CONFIRMED' GROUP BY coupon_id`);
    for (const coupon of coupons) await query('UPDATE coupons SET used_count=GREATEST(0,used_count-?) WHERE id=?', [coupon.n, coupon.coupon_id]);

    const reservations = new Map();
    for (const row of movements) {
      const key = `${row.branch_id}:${row.inventory_item_id}`;
      const delta = row.type === 'RESERVE' ? Number(row.quantity)
        : ['RELEASE', 'CONSUME'].includes(row.type) ? -Number(row.quantity) : 0;
      reservations.set(key, round((reservations.get(key) || 0) + delta));
    }
    let released = 0;
    for (const row of stock) {
      const pending = Math.max(0, reservations.get(`${row.branch_id}:${row.inventory_item_id}`) || 0);
      if (!pending) continue;
      if (round(row.reserved) < pending) throw new Error('La reserva contable no coincide con inventario; se revierte el reinicio');
      const reserved = round(Number(row.reserved) - pending);
      await query('UPDATE branch_inventory SET reserved=?,updated_at=NOW() WHERE id=?', [reserved, row.id]);
      await query(`INSERT INTO inventory_movements
        (branch_id,inventory_item_id,type,quantity,on_hand_after,reserved_after,order_id,actor_id,reason,created_at,updated_at)
        VALUES (?,?,'RELEASE',?,?,?,NULL,NULL,?,NOW(),NOW())`,
      [row.branch_id, row.inventory_item_id, pending, row.on_hand, reserved, 'Liberación por limpieza local de pedidos de prueba']);
      await query(`UPDATE branch_option_availability availability JOIN customization_options option_row ON option_row.id=availability.option_id
        SET availability.is_available=(? - ? >= option_row.consumption_quantity),availability.updated_at=NOW()
        WHERE availability.branch_id=? AND option_row.inventory_item_id=? AND option_row.consumption_quantity>0`,
      [row.on_hand, reserved, row.branch_id, row.inventory_item_id]);
      released = round(released + pending);
    }
    await query(`UPDATE inventory_movements SET order_id=NULL,reason='Movimiento histórico de pedido eliminado en limpieza local',updated_at=NOW()
      WHERE order_id IS NOT NULL`);
    await query('UPDATE cake_design_quotes SET order_id=NULL WHERE order_id IS NOT NULL');
    await query('UPDATE subscription_cycles SET order_id=NULL,scheduled_at=NULL WHERE order_id IS NOT NULL');
    await query('UPDATE wallet_transactions SET order_id=NULL WHERE order_id IS NOT NULL');
    await query('UPDATE saved_bowls SET last_ordered_at=NULL WHERE last_ordered_at IS NOT NULL');
    await query('UPDATE delivery_slots SET reserved_count=0,confirmed_count=0 WHERE reserved_count<>0 OR confirmed_count<>0');
    await query('UPDATE cake_station_capacities SET reserved_minutes=0,confirmed_minutes=0 WHERE reserved_minutes<>0 OR confirmed_minutes<>0');
    for (const scope of plan) {
      const result = await query(`DELETE FROM ${identifier(scope.table)} WHERE ${scope.sql}`, scope.values);
      assert.equal(Number(result.affectedRows), scope.count, `Cambió el alcance de ${scope.table}; se revierte`);
    }
    await query(`UPDATE users SET avatar_url=NULL,last_login_at=NULL,password_reset_token_hash=NULL,
      password_reset_expires_at=NULL,token_version=token_version+1,updated_at=NOW() WHERE id=?`, [user.id]);

    for (const scope of plan) {
      const [row] = await query(`SELECT COUNT(*) AS n FROM ${identifier(scope.table)} WHERE ${scope.sql}`, scope.values);
      assert.equal(Number(row.n), 0, `Quedaron datos en ${scope.table}`);
    }
    for (const table of ['orders', 'order_items', 'kitchen_tickets', 'cake_production_tasks', 'cake_capacity_reservations', 'cake_commissions'])
      assert.equal((await select(table)).length, 0, `${table} debe quedar vacía`);
    assert.equal((await query('SELECT id FROM payments WHERE payable_type=?', ['ORDER'])).length, 0);
    assert.equal((await query('SELECT id FROM inventory_movements WHERE order_id IS NOT NULL')).length, 0);
    for (const [table, digest] of unchanged) assert.equal(hash(await select(table)), digest, `Se modificó ${table} fuera del alcance`);
    assert.equal(hash(await select('users', { sql: 'id <> ?', values: [user.id] })), otherUsers);
    const [fresh] = await query('SELECT * FROM users WHERE id=?', [user.id]);
    for (const key of Object.keys(user).filter((key) => !['avatar_url','last_login_at','password_reset_token_hash','password_reset_expires_at','token_version','updated_at'].includes(key)))
      assert.equal(hash(fresh[key]), hash(user[key]), `Cambió el dato de acceso ${key}`);
    const freshStock = await select('branch_inventory');
    for (const row of stock) assert.equal(freshStock.find((candidate) => candidate.id === row.id).on_hand, row.on_hand, 'Cambió una existencia física');
    const fks = await query(`SELECT DISTINCT TABLE_NAME AS child,COLUMN_NAME AS columnName,
      REFERENCED_TABLE_NAME AS parent,REFERENCED_COLUMN_NAME AS parentColumn FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL`);
    for (const fk of fks.filter((fk) => modified.has(fk.child) || modified.has(fk.parent))) {
      const [row] = await query(`SELECT COUNT(*) AS n FROM ${identifier(fk.child)} c LEFT JOIN ${identifier(fk.parent)} p
        ON c.${identifier(fk.columnName)}=p.${identifier(fk.parentColumn)}
        WHERE c.${identifier(fk.columnName)} IS NOT NULL AND p.${identifier(fk.parentColumn)} IS NULL`);
      assert.equal(Number(row.n), 0, `Referencia huérfana en ${fk.child}.${fk.columnName}`);
    }
    const report = { ...summary, releasedInventoryUnits: released, ordersAfter: 0, userActive: true, credentialsPreserved: true,
      foreignKeysVerified: true, unchangedTablesVerified: unchanged.size, backup: saved, completedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(saved.dir, 'verification.json'), JSON.stringify({ committed: false, ...report }, null, 2), { flag: 'wx' });
    await db.commit(); transaction = false;
    fs.writeFileSync(path.join(saved.dir, 'verification.json'), JSON.stringify({ committed: true, ...report }, null, 2));
    console.log(JSON.stringify({ committed: true, ...report }, null, 2));
  } catch (error) {
    if (transaction) await db.rollback();
    throw error;
  } finally {
    await db.end();
  }
}
main().catch((error) => { console.error(`Reinicio local: ${error.code || error.message}`); process.exitCode = 1; });
