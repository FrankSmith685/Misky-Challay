import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, addIndexIfMissing, removeColumnIfPresent } from '../migrationHelpers';

export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  await q.changeColumn('purchase_orders', 'status', { type: DataTypes.ENUM('DRAFT', 'APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'), allowNull: false, defaultValue: 'DRAFT' });
  await addColumnIfMissing(q, 'purchase_orders', 'approval_required', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
  await addColumnIfMissing(q, 'purchase_orders', 'approved_by', { type: DataTypes.BIGINT.UNSIGNED, allowNull: true });
  await addColumnIfMissing(q, 'purchase_orders', 'approved_at', { type: DataTypes.DATE, allowNull: true });
  await addColumnIfMissing(q, 'purchase_orders', 'idempotency_key', { type: DataTypes.STRING(100), allowNull: true });
  await addIndexIfMissing(q, 'purchase_orders', ['idempotency_key'], { name: 'uq_purchase_orders_idempotency', unique: true });
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  await removeColumnIfPresent(q, 'purchase_orders', 'idempotency_key');
  await removeColumnIfPresent(q, 'purchase_orders', 'approved_at');
  await removeColumnIfPresent(q, 'purchase_orders', 'approved_by');
  await removeColumnIfPresent(q, 'purchase_orders', 'approval_required');
  await q.changeColumn('purchase_orders', 'status', { type: DataTypes.ENUM('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'), allowNull: false, defaultValue: 'DRAFT' });
};
