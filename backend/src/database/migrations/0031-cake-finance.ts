import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addIndexIfMissing, tableExists } from '../migrationHelpers';

export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  if (!(await tableExists(context, 'cake_commission_settlements'))) await context.createTable('cake_commission_settlements', {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    commission_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    reference: { type: DataTypes.STRING(120), allowNull: false },
    actor_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    notes: { type: DataTypes.STRING(500), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await addIndexIfMissing(context, 'cake_commission_settlements', ['commission_id'], { name: 'idx_cake_settlement_commission' });
  await addIndexIfMissing(context, 'cake_commission_settlements', ['reference'], { name: 'uq_cake_settlement_reference', unique: true });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  if (await tableExists(context, 'cake_commission_settlements')) await context.dropTable('cake_commission_settlements');
};
