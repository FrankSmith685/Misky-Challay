import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';

export const up = async ({ context: q }: MigrationParams<QueryInterface>) => {
  const tables = await q.showAllTables() as string[];
  if (!tables.includes('app_events')) await q.createTable('app_events', {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    topic: { type: DataTypes.STRING(40), allowNull: false }, model: { type: DataTypes.STRING(60), allowNull: false },
    entity_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false }, branch_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true }, user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    payload: { type: DataTypes.JSON, allowNull: false }, state: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'DONE' },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, available_at: { type: DataTypes.DATE, allowNull: false }, locked_at: { type: DataTypes.DATE, allowNull: true }, error: { type: DataTypes.STRING(500), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false }, updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  if (!tables.includes('push_deliveries')) await q.createTable('push_deliveries', {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false }, device_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    idempotency_key: { type: DataTypes.STRING(180), allowNull: false, unique: true }, payload: { type: DataTypes.JSON, allowNull: false },
    state: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'QUEUED' }, attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    available_at: { type: DataTypes.DATE, allowNull: false }, locked_at: { type: DataTypes.DATE, allowNull: true }, ticket_id: { type: DataTypes.STRING(200), allowNull: true }, error: { type: DataTypes.STRING(500), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false }, updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  for (const table of ['app_events', 'push_deliveries']) {
    const name = `idx_${table}_queue`;
    if (!(await q.showIndex(table) as Array<{ name: string }>).some((index) => index.name === name)) await q.addIndex(table, ['state', 'available_at'], { name });
  }
  const columns = await q.describeTable('notifications');
  for (const [name, definition] of Object.entries({
    branch_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    permission_code: { type: DataTypes.STRING(80), allowNull: true },
    audience: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'CUSTOMER' },
    body: { type: DataTypes.TEXT, allowNull: true },
    delivery_state: { type: DataTypes.STRING(20), allowNull: true },
  })) if (!columns[name]) await q.addColumn('notifications', name, definition);
  for (const [table, name, fields] of [
    ['app_events', 'idx_app_events_retention', ['created_at', 'id']],
    ['notifications', 'idx_notifications_feed', ['user_id', 'audience', 'channel', 'status', 'id']],
    ['notifications', 'idx_notifications_unread', ['user_id', 'read_at', 'channel', 'status']],
  ] as Array<[string, string, string[]]>) {
    if (!(await q.showIndex(table) as Array<{ name: string }>).some((index) => index.name === name)) await q.addIndex(table, fields, { name });
  }
  await q.sequelize.query("UPDATE notifications SET audience='STAFF',permission_code='payment.verify' WHERE template='PAYMENT_REVIEW_REQUIRED'");
  await q.sequelize.query("UPDATE notifications n JOIN orders o ON o.id=n.order_id SET n.branch_id=o.branch_id WHERE n.audience='STAFF' AND n.branch_id IS NULL");
  await q.sequelize.query("UPDATE notifications SET audience='STAFF' WHERE template IN ('STAFF_OPERATIONAL','STAFF_ACCESS_CREATED')");
  await q.sequelize.query("UPDATE notifications SET permission_code='procurement.read' WHERE template='STAFF_OPERATIONAL' AND permission_code IS NULL");
  await q.sequelize.query("UPDATE notifications SET branch_id=CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(action_url,'branchId=',-1),'&',1) AS UNSIGNED) WHERE audience='STAFF' AND branch_id IS NULL AND action_url LIKE '%branchId=%'");
};
