import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, removeColumnIfPresent } from '../migrationHelpers';

/**
 * La imagen vive en `uploads/media`; el usuario solo conserva la URL estable.
 * No se guarda base64 en MySQL: eso inflaria backups y respuestas de sesion.
 */
export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(context, 'users', 'avatar_url', {
    type: DataTypes.STRING(255),
    allowNull: true,
  });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await removeColumnIfPresent(context, 'users', 'avatar_url');
};
