import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, addIndexIfMissing, removeColumnIfPresent } from '../migrationHelpers';

/** Versionado, programacion y archivado seguro de la configuracion territorial. */
export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(q, 'coverage_zones', 'version', { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 });
  await addColumnIfMissing(q, 'coverage_zones', 'effective_from', { type: DataTypes.DATE, allowNull: true });
  await addColumnIfMissing(q, 'coverage_zones', 'archived_at', { type: DataTypes.DATE, allowNull: true });
  await addColumnIfMissing(q, 'branches', 'version', { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 });
  await addIndexIfMissing(q, 'coverage_zones', ['is_active', 'effective_from', 'archived_at'], { name: 'idx_coverage_zones_publication' });
  await addIndexIfMissing(q, 'branches', ['is_active', 'version'], { name: 'idx_branches_governance' });
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  try { await q.removeIndex('coverage_zones', 'idx_coverage_zones_publication'); } catch { /* indice inexistente */ }
  try { await q.removeIndex('branches', 'idx_branches_governance'); } catch { /* indice inexistente */ }
  await removeColumnIfPresent(q, 'branches', 'version');
  await removeColumnIfPresent(q, 'coverage_zones', 'archived_at');
  await removeColumnIfPresent(q, 'coverage_zones', 'effective_from');
  await removeColumnIfPresent(q, 'coverage_zones', 'version');
};
