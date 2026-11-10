import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, addIndexIfMissing, removeColumnIfPresent } from '../migrationHelpers';

/** Conserva roles archivados para trazabilidad y restauración. */
export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(q, 'roles', 'archived_at', { type: DataTypes.DATE, allowNull: true });
  await addIndexIfMissing(q, 'roles', ['archived_at', 'is_system'], { name: 'idx_roles_lifecycle' });
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  try { await q.removeIndex('roles', 'idx_roles_lifecycle'); } catch { /* indice inexistente */ }
  await removeColumnIfPresent(q, 'roles', 'archived_at');
};
