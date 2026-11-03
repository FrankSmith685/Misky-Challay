import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { tableExists } from '../migrationHelpers';

export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  if (!(await tableExists(context, 'cake_order_cost_snapshots'))) await context.createTable('cake_order_cost_snapshots', {
    order_id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true },
    estimated_material_cost: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    costs_complete: { type: DataTypes.BOOLEAN, allowNull: false },
    materials_json: { type: DataTypes.JSON, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
};
export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  if (await tableExists(context, 'cake_order_cost_snapshots')) await context.dropTable('cake_order_cost_snapshots');
};
