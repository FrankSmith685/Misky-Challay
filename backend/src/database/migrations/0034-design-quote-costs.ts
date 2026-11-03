import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, removeColumnIfPresent } from '../migrationHelpers';

export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(context, 'cake_design_quotes', 'material_extras_json', { type: DataTypes.JSON, allowNull: false, defaultValue: [] });
  await addColumnIfMissing(context, 'cake_design_quotes', 'estimated_labor_cost', { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 });
  await addColumnIfMissing(context, 'cake_design_quotes', 'estimated_packaging_cost', { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 });
  await addColumnIfMissing(context, 'cake_order_cost_snapshots', 'estimated_labor_cost', { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 });
  await addColumnIfMissing(context, 'cake_order_cost_snapshots', 'estimated_packaging_cost', { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 });
};
export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  for (const [table, column] of [['cake_order_cost_snapshots', 'estimated_packaging_cost'], ['cake_order_cost_snapshots', 'estimated_labor_cost'], ['cake_design_quotes', 'estimated_packaging_cost'], ['cake_design_quotes', 'estimated_labor_cost'], ['cake_design_quotes', 'material_extras_json']] as const) await removeColumnIfPresent(context, table, column);
};
