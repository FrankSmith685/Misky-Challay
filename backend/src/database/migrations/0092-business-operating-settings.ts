import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, removeColumnIfPresent } from '../migrationHelpers';

/** Politica operativa central: zona horaria, moneda soportada e impuesto vigente. */
export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(q, 'business_settings', 'time_zone', { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'America/Lima' });
  await addColumnIfMissing(q, 'business_settings', 'currency', { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'PEN' });
  await addColumnIfMissing(q, 'business_settings', 'tax_rate', { type: DataTypes.DECIMAL(5, 4), allowNull: false, defaultValue: 0.18 });
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  await removeColumnIfPresent(q, 'business_settings', 'tax_rate');
  await removeColumnIfPresent(q, 'business_settings', 'currency');
  await removeColumnIfPresent(q, 'business_settings', 'time_zone');
};
