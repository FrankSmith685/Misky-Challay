import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, removeColumnIfPresent } from '../migrationHelpers';

export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(context, 'orders', 'whatsapp_opt_in_at', { type: DataTypes.DATE, allowNull: true });
  await addColumnIfMissing(context, 'cake_design_requests', 'whatsapp_opt_in_at', { type: DataTypes.DATE, allowNull: true });
  await addColumnIfMissing(context, 'communication_settings', 'whatsapp_updates_enabled', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await removeColumnIfPresent(context, 'communication_settings', 'whatsapp_updates_enabled');
  await removeColumnIfPresent(context, 'cake_design_requests', 'whatsapp_opt_in_at');
  await removeColumnIfPresent(context, 'orders', 'whatsapp_opt_in_at');
};
