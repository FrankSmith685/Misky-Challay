import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addIndexIfMissing, tableExists } from '../migrationHelpers';

/** Equipos configurables y responsables principales/reemplazos con vigencia. */
export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  if (!(await tableExists(q, 'teams'))) {
    await q.createTable('teams', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      team_key: { type: DataTypes.STRING(50), allowNull: false },
      name: { type: DataTypes.STRING(100), allowNull: false },
      description: { type: DataTypes.STRING(255), allowNull: true },
      route: { type: DataTypes.STRING(120), allowNull: false },
      icon: { type: DataTypes.STRING(40), allowNull: true },
      role_codes_json: { type: DataTypes.JSON, allowNull: false },
      branch_required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      minimum_per_branch: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
      deleted_at: { type: DataTypes.DATE, allowNull: true },
    });
  }
  await addIndexIfMissing(q, 'teams', ['team_key'], { name: 'uq_teams_key', unique: true });
  await addIndexIfMissing(q, 'teams', ['is_active', 'sort_order'], { name: 'idx_teams_active_order' });

  if (!(await tableExists(q, 'team_assignments'))) {
    await q.createTable('team_assignments', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      team_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      branch_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      responsibility: { type: DataTypes.ENUM('PRIMARY', 'BACKUP'), allowNull: false, defaultValue: 'PRIMARY' },
      effective_from: { type: DataTypes.DATE, allowNull: false },
      effective_until: { type: DataTypes.DATE, allowNull: true },
      availability: { type: DataTypes.ENUM('AVAILABLE', 'AWAY', 'UNAVAILABLE'), allowNull: false, defaultValue: 'AVAILABLE' },
      reason: { type: DataTypes.STRING(255), allowNull: true },
      created_by: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  }
  await addIndexIfMissing(q, 'team_assignments', ['team_id', 'branch_id', 'responsibility', 'effective_until'], { name: 'idx_team_assignments_team_branch_status' });
  await addIndexIfMissing(q, 'team_assignments', ['user_id', 'effective_until'], { name: 'idx_team_assignments_user' });
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  try { await q.dropTable('team_assignments'); } catch { /* tabla inexistente */ }
  try { await q.dropTable('teams'); } catch { /* tabla inexistente */ }
};
