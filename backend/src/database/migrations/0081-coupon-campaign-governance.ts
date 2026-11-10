import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, addIndexIfMissing, removeColumnIfPresent } from '../migrationHelpers';

/** Gobierno de campañas: programación, reglas, presupuesto y concurrencia optimista. */
export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(q, 'coupons', 'version', {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    defaultValue: 1,
  });
  await addColumnIfMissing(q, 'coupons', 'rules_json', {
    type: DataTypes.JSON,
    allowNull: true,
  });
  await addColumnIfMissing(q, 'coupons', 'stack_mode', {
    type: DataTypes.ENUM('EXCLUSIVE', 'STACKABLE'),
    allowNull: false,
    defaultValue: 'STACKABLE',
  });
  await addColumnIfMissing(q, 'coupons', 'budget_amount', {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  });
  await addColumnIfMissing(q, 'coupons', 'budget_used', {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  });
  await addColumnIfMissing(q, 'coupons', 'archived_at', {
    type: DataTypes.DATE,
    allowNull: true,
  });
  await addIndexIfMissing(q, 'coupons', ['is_active', 'valid_from', 'valid_until'], {
    name: 'idx_coupons_campaign_window',
  });
  await addIndexIfMissing(q, 'coupon_redemptions', ['coupon_id', 'status'], {
    name: 'idx_coupon_redemptions_status',
  });
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  try { await q.removeIndex('coupons', 'idx_coupons_campaign_window'); } catch { /* índice inexistente */ }
  try { await q.removeIndex('coupon_redemptions', 'idx_coupon_redemptions_status'); } catch { /* índice inexistente */ }
  for (const column of ['archived_at', 'budget_used', 'budget_amount', 'stack_mode', 'rules_json', 'version']) {
    await removeColumnIfPresent(q, 'coupons', column);
  }
};
