import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addIndexIfMissing, tableExists } from '../migrationHelpers';

export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  if (!(await tableExists(context, 'cake_finance_entries'))) await context.createTable('cake_finance_entries', {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    kind: { type: DataTypes.ENUM('BUSINESS_EXPENSE', 'PLATFORM_EXPENSE', 'SUPPLIER_PAYMENT', 'PAYMENT_FEE'), allowNull: false },
    branch_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    order_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    purchase_order_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    payment_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    category: { type: DataTypes.STRING(40), allowNull: false },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    net_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    reference: { type: DataTypes.STRING(120), allowNull: false },
    occurred_at: { type: DataTypes.DATE, allowNull: false },
    actor_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    notes: { type: DataTypes.STRING(500), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await addIndexIfMissing(context, 'cake_finance_entries', ['branch_id', 'occurred_at'], { name: 'idx_cake_finance_branch_date' });
  await addIndexIfMissing(context, 'cake_finance_entries', ['order_id'], { name: 'idx_cake_finance_order' });
  await addIndexIfMissing(context, 'cake_finance_entries', ['payment_id'], { name: 'uq_cake_finance_payment', unique: true });
  await addIndexIfMissing(context, 'cake_finance_entries', ['kind', 'reference'], { name: 'uq_cake_finance_reference', unique: true });
};
export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  if (await tableExists(context, 'cake_finance_entries')) await context.dropTable('cake_finance_entries');
};
