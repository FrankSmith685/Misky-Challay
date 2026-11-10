import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, removeColumnIfPresent, addIndexIfMissing } from '../migrationHelpers';

/** Metadatos de integridad, procedencia y revisión de la biblioteca visual. */
export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(q, 'media_assets', 'sha256', { type: DataTypes.STRING(64), allowNull: true });
  await addColumnIfMissing(q, 'media_assets', 'width', { type: DataTypes.INTEGER.UNSIGNED, allowNull: true });
  await addColumnIfMissing(q, 'media_assets', 'height', { type: DataTypes.INTEGER.UNSIGNED, allowNull: true });
  await addColumnIfMissing(q, 'media_assets', 'review_status', { type: DataTypes.ENUM('APPROVED', 'DRAFT', 'ARCHIVED'), allowNull: false, defaultValue: 'APPROVED' });
  await addColumnIfMissing(q, 'media_assets', 'source_type', { type: DataTypes.ENUM('UPLOAD', 'URL', 'AI', 'PROFILE'), allowNull: false, defaultValue: 'UPLOAD' });
  await addColumnIfMissing(q, 'media_assets', 'source_prompt', { type: DataTypes.TEXT, allowNull: true });
  await addIndexIfMissing(q, 'media_assets', ['sha256'], { name: 'uq_media_assets_sha256', unique: true });
  await addIndexIfMissing(q, 'media_assets', ['review_status'], { name: 'idx_media_assets_review_status' });
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  try { await q.removeIndex('media_assets', 'uq_media_assets_sha256'); } catch { /* índice inexistente */ }
  try { await q.removeIndex('media_assets', 'idx_media_assets_review_status'); } catch { /* índice inexistente */ }
  for (const column of ['source_prompt', 'source_type', 'review_status', 'height', 'width', 'sha256']) {
    await removeColumnIfPresent(q, 'media_assets', column);
  }
};
