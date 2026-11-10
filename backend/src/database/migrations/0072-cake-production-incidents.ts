import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';

/** Motivo y responsable del bloqueo de una etapa de tortas. */
export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  const current = await q.describeTable('cake_production_tasks');
  if (!current.incident_reason) await q.addColumn('cake_production_tasks', 'incident_reason', { type: DataTypes.STRING(500), allowNull: true });
  if (!current.incident_at) await q.addColumn('cake_production_tasks', 'incident_at', { type: DataTypes.DATE, allowNull: true });
  if (!current.incident_by) await q.addColumn('cake_production_tasks', 'incident_by', { type: DataTypes.BIGINT.UNSIGNED, allowNull: true });
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  const current = await q.describeTable('cake_production_tasks');
  for (const column of ['incident_by', 'incident_at', 'incident_reason']) {
    if (current[column]) await q.removeColumn('cake_production_tasks', column);
  }
};
