import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, addIndexIfMissing, removeColumnIfPresent, tableExists } from '../migrationHelpers';

export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  for (const column of ['assigned_to', 'reopened_by', 'draft_by']) {
    await addColumnIfMissing(q, 'complaints', column, { type: DataTypes.BIGINT.UNSIGNED, allowNull: true });
  }
  for (const column of ['assigned_at', 'reopened_at', 'draft_updated_at', 'escalated_at']) {
    await addColumnIfMissing(q, 'complaints', column, { type: DataTypes.DATE, allowNull: true });
  }
  for (const column of ['reopen_reason', 'escalation_reason']) {
    await addColumnIfMissing(q, 'complaints', column, { type: DataTypes.STRING(500), allowNull: true });
  }
  await addColumnIfMissing(q, 'complaints', 'draft_response', { type: DataTypes.TEXT, allowNull: true });
  await addIndexIfMissing(q, 'complaints', ['status', 'due_at', 'assigned_to'], { name: 'idx_complaints_due_assignment' });

  const id = { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true };
  const complaintId = { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, references: { model: 'complaints', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' };
  const actorId = { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' };
  const timestamps = { created_at: { type: DataTypes.DATE, allowNull: false }, updated_at: { type: DataTypes.DATE, allowNull: false } };
  if (!(await tableExists(q, 'complaint_responses'))) {
    await q.createTable('complaint_responses', {
      id, complaint_id: complaintId,
      version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      response: { type: DataTypes.TEXT, allowNull: false },
      status: { type: DataTypes.ENUM('IN_PROGRESS', 'RESOLVED'), allowNull: false },
      actor_id: actorId,
      reason: { type: DataTypes.STRING(500), allowNull: true },
      notification_status: { type: DataTypes.ENUM('PENDING', 'SENT', 'FAILED', 'SIMULATED'), allowNull: false, defaultValue: 'PENDING' },
      notification_error: { type: DataTypes.STRING(500), allowNull: true },
      sent_at: { type: DataTypes.DATE, allowNull: true },
      ...timestamps,
    });
  }
  await addIndexIfMissing(q, 'complaint_responses', ['complaint_id', 'version'], { name: 'uq_complaint_responses_version', unique: true });
  await addIndexIfMissing(q, 'complaint_responses', ['notification_status'], { name: 'idx_complaint_responses_notification' });
  // Conserva las respuestas existentes sin reenviar correos ni alterar plazos.
  await q.sequelize.query(`INSERT INTO complaint_responses
    (complaint_id, version, response, status, actor_id, reason, notification_status, created_at, updated_at)
    SELECT c.id, 1, c.response, IF(c.status = 'RESOLVED', 'RESOLVED', 'IN_PROGRESS'), c.responded_by,
      'Respuesta anterior a la version del historial', 'PENDING', COALESCE(c.responded_at, c.updated_at), c.updated_at
    FROM complaints c WHERE c.response IS NOT NULL AND TRIM(c.response) <> ''
    AND NOT EXISTS (SELECT 1 FROM complaint_responses r WHERE r.complaint_id = c.id)`);

  if (!(await tableExists(q, 'complaint_notes'))) {
    await q.createTable('complaint_notes', { id, complaint_id: complaintId, author_id: actorId, note: { type: DataTypes.TEXT, allowNull: false }, ...timestamps });
  }
  await addIndexIfMissing(q, 'complaint_notes', ['complaint_id', 'created_at'], { name: 'idx_complaint_notes_complaint' });
  if (!(await tableExists(q, 'complaint_evidences'))) {
    await q.createTable('complaint_evidences', {
      id, complaint_id: complaintId, uploaded_by: actorId,
      file_name: { type: DataTypes.STRING(180), allowNull: false },
      file_url: { type: DataTypes.STRING(500), allowNull: false },
      mime_type: { type: DataTypes.STRING(100), allowNull: true }, ...timestamps,
    });
  }
  await addIndexIfMissing(q, 'complaint_evidences', ['complaint_id', 'created_at'], { name: 'idx_complaint_evidences_complaint' });
  if (!(await tableExists(q, 'complaint_holidays'))) {
    await q.createTable('complaint_holidays', {
      id, holiday_date: { type: DataTypes.DATEONLY, allowNull: false },
      label: { type: DataTypes.STRING(120), allowNull: false },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, created_by: actorId, ...timestamps,
    });
  }
  await addIndexIfMissing(q, 'complaint_holidays', ['holiday_date'], { name: 'uq_complaint_holidays_date', unique: true });
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  for (const table of ['complaint_evidences', 'complaint_notes', 'complaint_responses', 'complaint_holidays']) {
    if (await tableExists(q, table)) await q.dropTable(table);
  }
  try { await q.removeIndex('complaints', 'idx_complaints_due_assignment'); } catch { /* indice ausente */ }
  for (const column of ['assigned_to', 'assigned_at', 'reopened_by', 'reopened_at', 'reopen_reason', 'draft_response', 'draft_updated_at', 'draft_by', 'escalated_at', 'escalation_reason']) {
    await removeColumnIfPresent(q, 'complaints', column);
  }
};
