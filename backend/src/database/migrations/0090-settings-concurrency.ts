import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, addIndexIfMissing, removeColumnIfPresent } from '../migrationHelpers';

/** Versionado optimista para que dos administradores no se pisen cambios críticos. */
export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  for (const table of ['business_settings', 'local_payment_settings', 'receipt_settings', 'communication_settings']) {
    await addColumnIfMissing(q, table, 'version', { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 });
    await addIndexIfMissing(q, table, ['version'], { name: `idx_${table}_version` });
  }
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  for (const table of ['business_settings', 'local_payment_settings', 'receipt_settings', 'communication_settings']) {
    try { await q.removeIndex(table, `idx_${table}_version`); } catch { /* índice ausente */ }
    await removeColumnIfPresent(q, table, 'version');
  }
};
