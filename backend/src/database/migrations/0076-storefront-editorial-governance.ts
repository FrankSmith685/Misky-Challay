import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, removeColumnIfPresent } from '../migrationHelpers';

/** Borradores, programacion e idempotencia de la portada usan admin_drafts existente. */
export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(q, 'storefront_settings', 'last_publish_key', {
    type: DataTypes.STRING(100),
    allowNull: true,
  });
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  await removeColumnIfPresent(q, 'storefront_settings', 'last_publish_key');
};
