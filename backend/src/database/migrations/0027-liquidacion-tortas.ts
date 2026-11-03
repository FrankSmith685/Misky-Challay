import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, addIndexIfMissing, removeColumnIfPresent, tableExists } from '../migrationHelpers';

export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(context, 'orders', 'payment_plan', { type: DataTypes.ENUM('FULL', 'DEPOSIT_BALANCE'), allowNull: false, defaultValue: 'FULL' });
  await addColumnIfMissing(context, 'orders', 'deposit_amount', { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 });
  await addColumnIfMissing(context, 'orders', 'balance_amount', { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 });
  await addColumnIfMissing(context, 'orders', 'balance_due_at', { type: DataTypes.DATE, allowNull: true });
  await addColumnIfMissing(context, 'orders', 'deposit_paid_at', { type: DataTypes.DATE, allowNull: true });
  await addColumnIfMissing(context, 'orders', 'balance_paid_at', { type: DataTypes.DATE, allowNull: true });
  await addColumnIfMissing(context, 'payments', 'stage', { type: DataTypes.ENUM('FULL', 'DEPOSIT', 'BALANCE'), allowNull: false, defaultValue: 'FULL' });
  await addColumnIfMissing(context, 'cake_production_tasks', 'material_plan_json', { type: DataTypes.JSON, allowNull: true });
  await addColumnIfMissing(context, 'cake_production_tasks', 'material_consumed_json', { type: DataTypes.JSON, allowNull: true });
  await addColumnIfMissing(context, 'cake_production_tasks', 'material_waste_json', { type: DataTypes.JSON, allowNull: true });
  if (!(await tableExists(context, 'cake_commissions'))) await context.createTable('cake_commissions', {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    order_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    base_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    rate: { type: DataTypes.DECIMAL(5, 4), allowNull: false, defaultValue: 0.15 },
    adjustment_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    refund_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    commission_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    status: { type: DataTypes.ENUM('PENDING', 'LIQUIDATED'), allowNull: false, defaultValue: 'PENDING' },
    liquidated_at: { type: DataTypes.DATE, allowNull: true },
    liquidated_by: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    notes: { type: DataTypes.STRING(500), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await addIndexIfMissing(context, 'cake_commissions', ['order_id'], { name: 'uq_cake_commission_order', unique: true });
  await addIndexIfMissing(context, 'cake_commissions', ['status'], { name: 'idx_cake_commission_status' });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  if (await tableExists(context, 'cake_commissions')) await context.dropTable('cake_commissions');
  for (const [table, column] of [['cake_production_tasks', 'material_plan_json'], ['cake_production_tasks', 'material_consumed_json'], ['cake_production_tasks', 'material_waste_json'], ['payments', 'stage'], ['orders', 'payment_plan'], ['orders', 'deposit_amount'], ['orders', 'balance_amount'], ['orders', 'balance_due_at'], ['orders', 'deposit_paid_at'], ['orders', 'balance_paid_at']] as const) await removeColumnIfPresent(context, table, column);
};
