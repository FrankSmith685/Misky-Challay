import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, addIndexIfMissing, removeColumnIfPresent } from '../migrationHelpers';
import { auditCanonical, auditHash, sanitizeAuditValue } from '@shared/utils/auditIntegrity';

/** Bitácora append-only: sanitización, clasificación, cadena HMAC y filtros operativos. */
export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(q, 'audit_logs', 'severity', { type: DataTypes.ENUM('INFO', 'WARNING', 'CRITICAL'), allowNull: false, defaultValue: 'INFO' });
  await addColumnIfMissing(q, 'audit_logs', 'outcome', { type: DataTypes.ENUM('SUCCESS', 'FAILURE'), allowNull: false, defaultValue: 'SUCCESS' });
  await addColumnIfMissing(q, 'audit_logs', 'method', { type: DataTypes.STRING(10), allowNull: true });
  await addColumnIfMissing(q, 'audit_logs', 'path', { type: DataTypes.STRING(255), allowNull: true });
  await addColumnIfMissing(q, 'audit_logs', 'session_id', { type: DataTypes.STRING(100), allowNull: true });
  await addColumnIfMissing(q, 'audit_logs', 'event_version', { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 });
  await addColumnIfMissing(q, 'audit_logs', 'previous_hash', { type: DataTypes.STRING(64), allowNull: true });
  await addColumnIfMissing(q, 'audit_logs', 'integrity_hash', { type: DataTypes.STRING(64), allowNull: true });
  await addIndexIfMissing(q, 'audit_logs', ['created_at', 'severity', 'outcome', 'action'], { name: 'idx_audit_filters' });
  await addIndexIfMissing(q, 'audit_logs', ['correlation_id'], { name: 'idx_audit_correlation' });

  // Si una ejecución anterior llegó a crear los triggers antes de fallar, la
  // reconstrucción de hashes debe poder repetirse sin bloquear los UPDATE.
  await q.sequelize.query('DROP TRIGGER IF EXISTS trg_audit_logs_no_update');
  await q.sequelize.query('DROP TRIGGER IF EXISTS trg_audit_logs_no_delete');

  const [legacyRows] = await q.sequelize.query(`SELECT id, actor_id, action, entity, entity_id, before_json, after_json, severity, outcome, method, path, correlation_id, created_at, previous_hash, integrity_hash FROM audit_logs ORDER BY id ASC`);
  let previousHash: string | null = null;
  for (const row of legacyRows as Array<Record<string, unknown>>) {
    const createdAt = new Date(String(row.created_at ?? new Date().toISOString()));
    const beforeJson = (sanitizeAuditValue(row.before_json ?? null) ?? null) as Record<string, unknown> | null;
    const afterJson = (sanitizeAuditValue(row.after_json ?? null) ?? null) as Record<string, unknown> | null;
    const severity = String(row.severity ?? 'INFO');
    const outcome = String(row.outcome ?? 'SUCCESS');
    const canonical = auditCanonical({ previousHash, action: String(row.action), entity: String(row.entity), entityId: row.entity_id == null ? null : String(row.entity_id), actorId: row.actor_id == null ? null : Number(row.actor_id), beforeJson, afterJson, severity, outcome, method: row.method == null ? null : String(row.method), path: row.path == null ? null : String(row.path), correlationId: row.correlation_id == null ? null : String(row.correlation_id), createdAt });
    const integrityHash = auditHash(canonical);
    await q.sequelize.query(`UPDATE audit_logs SET before_json=:beforeJson, after_json=:afterJson, previous_hash=:previousHash, integrity_hash=:integrityHash WHERE id=:id`, { replacements: { id: row.id, beforeJson: JSON.stringify(beforeJson), afterJson: JSON.stringify(afterJson), previousHash, integrityHash } });
    previousHash = integrityHash;
  }
  await q.sequelize.query(`ALTER TABLE audit_logs MODIFY integrity_hash VARCHAR(64) NOT NULL`);

  const [triggers] = await q.sequelize.query(`SHOW TRIGGERS LIKE 'audit_logs'`);
  const names = new Set((triggers as Array<Record<string, unknown>>).map((row) => String(row.Trigger ?? row.trigger ?? '')));
  if (!names.has('trg_audit_logs_no_update')) await q.sequelize.query(`CREATE TRIGGER trg_audit_logs_no_update BEFORE UPDATE ON audit_logs FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs es append-only'`);
  if (!names.has('trg_audit_logs_no_delete')) await q.sequelize.query(`CREATE TRIGGER trg_audit_logs_no_delete BEFORE DELETE ON audit_logs FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs es append-only'`);
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  await q.sequelize.query('DROP TRIGGER IF EXISTS trg_audit_logs_no_update');
  await q.sequelize.query('DROP TRIGGER IF EXISTS trg_audit_logs_no_delete');
  try { await q.removeIndex('audit_logs', 'idx_audit_filters'); } catch { /* indice ausente */ }
  try { await q.removeIndex('audit_logs', 'idx_audit_correlation'); } catch { /* indice ausente */ }
  for (const column of ['severity', 'outcome', 'method', 'path', 'session_id', 'event_version', 'previous_hash', 'integrity_hash']) await removeColumnIfPresent(q, 'audit_logs', column);
};
