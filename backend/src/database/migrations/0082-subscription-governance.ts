import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, addIndexIfMissing, removeColumnIfPresent } from '../migrationHelpers';

/** Versionado, publicación programada y trazabilidad de renovaciones. */
export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(q, 'subscription_plans', 'version', { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 });
  await addColumnIfMissing(q, 'subscription_plans', 'effective_from', { type: DataTypes.DATE, allowNull: true });
  await addColumnIfMissing(q, 'subscription_plans', 'archived_at', { type: DataTypes.DATE, allowNull: true });
  await addColumnIfMissing(q, 'subscriptions', 'last_sync_at', { type: DataTypes.DATE, allowNull: true });
  await addColumnIfMissing(q, 'subscriptions', 'last_sync_error', { type: DataTypes.STRING(500), allowNull: true });
  await addColumnIfMissing(q, 'subscriptions', 'cancellation_reason', { type: DataTypes.STRING(500), allowNull: true });
  await addIndexIfMissing(q, 'subscription_plans', ['is_active', 'effective_from', 'archived_at'], { name: 'idx_subscription_plans_publication' });
  await addIndexIfMissing(q, 'subscriptions', ['status', 'next_charge_at'], { name: 'idx_subscriptions_billing' });
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  try { await q.removeIndex('subscription_plans', 'idx_subscription_plans_publication'); } catch { /* índice inexistente */ }
  try { await q.removeIndex('subscriptions', 'idx_subscriptions_billing'); } catch { /* índice inexistente */ }
  for (const column of ['cancellation_reason', 'last_sync_error', 'last_sync_at']) await removeColumnIfPresent(q, 'subscriptions', column);
  for (const column of ['archived_at', 'effective_from', 'version']) await removeColumnIfPresent(q, 'subscription_plans', column);
};
