import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addIndexIfMissing, tableExists } from '../migrationHelpers';

export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  if (!(await tableExists(q, 'setting_revisions'))) {
    await q.createTable('setting_revisions', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      scope: { type: DataTypes.ENUM('business', 'local-payments', 'receipts', 'communication'), allowNull: false },
      version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      snapshot_encrypted: { type: DataTypes.TEXT, allowNull: false },
      actor_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      reason: { type: DataTypes.STRING(255), allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  }
  await addIndexIfMissing(q, 'setting_revisions', ['scope', 'version'], { name: 'idx_setting_revisions_scope_version' });
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => { try { await q.dropTable('setting_revisions'); } catch { /* tabla ausente */ } };
