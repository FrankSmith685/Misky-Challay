import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';

const columns = async (q: QueryInterface) => q.describeTable('kitchen_tickets');

/** Estados y datos de asignacion para operar incidencias sin perder trazabilidad. */
export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  const current = await columns(q);
  const add = async (name: string, definition: Record<string, unknown>) => {
    if (!current[name]) await q.addColumn('kitchen_tickets', name, definition as never);
  };
  await add('station', { type: DataTypes.STRING(40), allowNull: true });
  await add('assigned_to', { type: DataTypes.BIGINT.UNSIGNED, allowNull: true });
  await add('paused_from_status', { type: DataTypes.STRING(20), allowNull: true });
  await add('incident_reason', { type: DataTypes.STRING(500), allowNull: true });
  await add('incident_at', { type: DataTypes.DATE, allowNull: true });
  await add('incident_by', { type: DataTypes.BIGINT.UNSIGNED, allowNull: true });
  await q.sequelize.query("ALTER TABLE kitchen_tickets MODIFY COLUMN status ENUM('QUEUED','ACCEPTED','PREPARING','READY','ON_HOLD','DISPATCHED','CANCELLED') NOT NULL DEFAULT 'QUEUED'");
  try { await q.addIndex('kitchen_tickets', ['branch_id', 'status', 'station', 'target_at'], { name: 'idx_kitchen_tickets_station' }); } catch { /* ya existe en una base parcialmente aplicada */ }
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  await q.sequelize.query("UPDATE kitchen_tickets SET status='ACCEPTED' WHERE status='ON_HOLD'");
  await q.sequelize.query("ALTER TABLE kitchen_tickets MODIFY COLUMN status ENUM('QUEUED','ACCEPTED','PREPARING','READY','DISPATCHED','CANCELLED') NOT NULL DEFAULT 'QUEUED'");
  const current = await columns(q);
  for (const name of ['incident_by', 'incident_at', 'incident_reason', 'paused_from_status', 'assigned_to', 'station']) {
    if (current[name]) await q.removeColumn('kitchen_tickets', name);
  }
  try { await q.removeIndex('kitchen_tickets', 'idx_kitchen_tickets_station'); } catch { /* noop */ }
};
