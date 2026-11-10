import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, addIndexIfMissing, removeColumnIfPresent, tableExists } from '../migrationHelpers';

/** Ciclo de vida de cuentas, MFA y sesiones revocables para el gobierno de accesos. */
export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(q, 'users', 'must_change_password', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
  await addColumnIfMissing(q, 'users', 'password_changed_at', { type: DataTypes.DATE, allowNull: true });
  await addColumnIfMissing(q, 'users', 'version', { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 });
  await addColumnIfMissing(q, 'users', 'archived_at', { type: DataTypes.DATE, allowNull: true });
  await addColumnIfMissing(q, 'users', 'mfa_enabled', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
  await addColumnIfMissing(q, 'users', 'mfa_secret_encrypted', { type: DataTypes.STRING(500), allowNull: true });
  await addColumnIfMissing(q, 'users', 'mfa_recovery_codes_json', { type: DataTypes.JSON, allowNull: true });
  await addIndexIfMissing(q, 'users', ['archived_at', 'status'], { name: 'idx_users_lifecycle' });

  if (!(await tableExists(q, 'user_sessions'))) {
    await q.createTable('user_sessions', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      token_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      last_seen_at: { type: DataTypes.DATE, allowNull: false },
      expires_at: { type: DataTypes.DATE, allowNull: false },
      revoked_at: { type: DataTypes.DATE, allowNull: true },
      ip: { type: DataTypes.STRING(64), allowNull: true },
      user_agent: { type: DataTypes.STRING(250), allowNull: true },
      device_label: { type: DataTypes.STRING(120), allowNull: true },
    });
  }
  await addIndexIfMissing(q, 'user_sessions', ['user_id', 'revoked_at', 'expires_at'], { name: 'idx_user_sessions_user_status' });
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  try { await q.removeIndex('users', 'idx_users_lifecycle'); } catch { /* indice inexistente */ }
  try { await q.removeIndex('user_sessions', 'idx_user_sessions_user_status'); } catch { /* indice inexistente */ }
  for (const column of ['device_label', 'user_agent', 'ip', 'revoked_at', 'expires_at', 'last_seen_at', 'created_at', 'token_hash', 'user_id']) {
    // La tabla se elimina completa abajo; estas columnas solo existen en esquemas antiguos parciales.
    void column;
  }
  try { await q.dropTable('user_sessions'); } catch { /* tabla inexistente */ }
  for (const column of ['mfa_recovery_codes_json', 'mfa_secret_encrypted', 'mfa_enabled', 'archived_at', 'version', 'password_changed_at', 'must_change_password']) {
    await removeColumnIfPresent(q, 'users', column);
  }
};
