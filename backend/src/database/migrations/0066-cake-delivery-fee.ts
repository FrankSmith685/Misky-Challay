import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, removeColumnIfPresent } from '../migrationHelpers';

/** Recargo único por manejo especial de tortas dentro de cada zona. */
export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(context, 'coverage_zones', 'cake_delivery_fee', {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await removeColumnIfPresent(context, 'coverage_zones', 'cake_delivery_fee');
};

