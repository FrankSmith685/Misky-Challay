import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, addIndexIfMissing, removeColumnIfPresent, tableExists } from '../migrationHelpers';

/** Web Push por cocina y marca persistente de escalamiento del ticket. */
export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  if (!(await tableExists(context, 'kitchen_push_subscriptions'))) await context.createTable('kitchen_push_subscriptions', {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    endpoint_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    endpoint: { type: DataTypes.TEXT, allowNull: false },
    p256dh: { type: DataTypes.STRING(255), allowNull: false },
    auth: { type: DataTypes.STRING(255), allowNull: false },
    user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    branch_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    user_agent: { type: DataTypes.STRING(255), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    last_success_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await addIndexIfMissing(context, 'kitchen_push_subscriptions', ['branch_id', 'is_active'], { name: 'idx_kitchen_push_branch_active' });
  await addIndexIfMissing(context, 'kitchen_push_subscriptions', ['user_id'], { name: 'idx_kitchen_push_user' });
  await addColumnIfMissing(context, 'kitchen_tickets', 'escalated_at', { type: DataTypes.DATE, allowNull: true });
  await addIndexIfMissing(context, 'kitchen_tickets', ['status', 'escalated_at', 'created_at'], { name: 'idx_kitchen_tickets_escalation' });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await context.removeIndex('kitchen_tickets', 'idx_kitchen_tickets_escalation');
  await removeColumnIfPresent(context, 'kitchen_tickets', 'escalated_at');
  await context.dropTable('kitchen_push_subscriptions');
};
