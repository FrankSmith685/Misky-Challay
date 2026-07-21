import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, removeColumnIfPresent } from '../migrationHelpers';

/**
 * Recuperacion de contrasena.
 *
 * Se guarda el SHA-256 del token (nunca el token en claro) y su expiracion. Al
 * resetear se limpian ambas columnas (un solo uso) y se sube users.token_version
 * para cerrar las sesiones abiertas.
 */
export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(context, 'users', 'password_reset_token_hash', {
    type: DataTypes.STRING(64),
    allowNull: true,
  });
  await addColumnIfMissing(context, 'users', 'password_reset_expires_at', {
    type: DataTypes.DATE,
    allowNull: true,
  });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await removeColumnIfPresent(context, 'users', 'password_reset_expires_at');
  await removeColumnIfPresent(context, 'users', 'password_reset_token_hash');
};
