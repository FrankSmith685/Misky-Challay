import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, addIndexIfMissing, removeColumnIfPresent, tableExists } from '../migrationHelpers';

/** Mesas, procedencia POS y asignación del mozo para pedidos consumidos en el local. */
export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  if (!(await tableExists(context, 'dining_tables'))) await context.createTable('dining_tables', {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    branch_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    code: { type: DataTypes.STRING(30), allowNull: false },
    area: { type: DataTypes.STRING(60), allowNull: false, defaultValue: 'Salón principal' },
    capacity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 2 },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await addIndexIfMissing(context, 'dining_tables', ['branch_id', 'code'], { name: 'uq_dining_tables_branch_code', unique: true });
  await addIndexIfMissing(context, 'dining_tables', ['branch_id', 'is_active', 'sort_order'], { name: 'idx_dining_tables_branch_active' });

  await context.changeColumn('orders', 'delivery_type', {
    type: DataTypes.ENUM('DELIVERY', 'PICKUP', 'DINE_IN'), allowNull: false, defaultValue: 'DELIVERY',
  });
  await addColumnIfMissing(context, 'orders', 'dining_table_id', { type: DataTypes.BIGINT.UNSIGNED, allowNull: true });
  await addColumnIfMissing(context, 'orders', 'waiter_id', { type: DataTypes.BIGINT.UNSIGNED, allowNull: true });
  await addColumnIfMissing(context, 'orders', 'source', { type: DataTypes.ENUM('WEB', 'POS'), allowNull: false, defaultValue: 'WEB' });
  await addIndexIfMissing(context, 'orders', ['dining_table_id', 'status'], { name: 'idx_orders_dining_table_status' });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await context.removeIndex('orders', 'idx_orders_dining_table_status');
  await removeColumnIfPresent(context, 'orders', 'source');
  await removeColumnIfPresent(context, 'orders', 'waiter_id');
  await removeColumnIfPresent(context, 'orders', 'dining_table_id');
  await context.changeColumn('orders', 'delivery_type', {
    type: DataTypes.ENUM('DELIVERY', 'PICKUP'), allowNull: false, defaultValue: 'DELIVERY',
  });
  await context.dropTable('dining_tables');
};
