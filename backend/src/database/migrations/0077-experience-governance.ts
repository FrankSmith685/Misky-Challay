import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, addIndexIfMissing, removeColumnIfPresent } from '../migrationHelpers';

/** Borradores, trazabilidad de versiones e idempotencia para Experiencias QR. */
export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(q, 'experience_projects', 'draft_scene_json', {
    type: DataTypes.JSON,
    allowNull: true,
  });
  await addColumnIfMissing(q, 'experience_projects', 'draft_assigned_to', {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
  });
  await addColumnIfMissing(q, 'experience_projects', 'draft_updated_at', {
    type: DataTypes.DATE,
    allowNull: true,
  });
  await addColumnIfMissing(q, 'experience_events', 'snapshot_json', {
    type: DataTypes.JSON,
    allowNull: true,
  });
  await addColumnIfMissing(q, 'experience_events', 'assigned_to_snapshot', {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
  });
  await addColumnIfMissing(q, 'experience_events', 'request_key', {
    type: DataTypes.STRING(160),
    allowNull: true,
  });
  await addIndexIfMissing(q, 'experience_events', ['project_id', 'request_key'], {
    name: 'idx_experience_events_request_key',
    unique: true,
  });
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  await removeColumnIfPresent(q, 'experience_events', 'request_key');
  await removeColumnIfPresent(q, 'experience_events', 'assigned_to_snapshot');
  await removeColumnIfPresent(q, 'experience_events', 'snapshot_json');
  await removeColumnIfPresent(q, 'experience_projects', 'draft_updated_at');
  await removeColumnIfPresent(q, 'experience_projects', 'draft_assigned_to');
  await removeColumnIfPresent(q, 'experience_projects', 'draft_scene_json');
};
