import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, removeColumnIfPresent } from '../migrationHelpers';

/** Tasa futura de la plataforma; las liquidaciones existentes conservan su snapshot. */
export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(q, 'business_settings', 'platform_commission_rate', {
    type: DataTypes.DECIMAL(5, 4),
    allowNull: false,
    defaultValue: 0.15,
  });
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  await removeColumnIfPresent(q, 'business_settings', 'platform_commission_rate');
};
