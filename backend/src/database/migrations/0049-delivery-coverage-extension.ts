import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, removeColumnIfPresent } from '../migrationHelpers';

export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(context, 'coverage_zones', 'extra_coverage_km', { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 0 });
  await addColumnIfMissing(context, 'coverage_zones', 'extra_fee_per_km', { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await removeColumnIfPresent(context, 'coverage_zones', 'extra_fee_per_km');
  await removeColumnIfPresent(context, 'coverage_zones', 'extra_coverage_km');
};
