import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addIndexIfMissing } from '../migrationHelpers';

export const up = async ({ context: db }: MigrationParams<QueryInterface>): Promise<void> => {
  await db.createTable('cake_preview_shares', {
    token: { type: DataTypes.STRING(32), primaryKey: true },
    snapshot_json: { type: DataTypes.JSON, allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false },
  });
  await addIndexIfMissing(db, 'cake_preview_shares', ['expires_at'], {
    name: 'idx_cake_preview_shares_expiry',
  });
};

export const down = async ({ context: db }: MigrationParams<QueryInterface>): Promise<void> => {
  await db.dropTable('cake_preview_shares');
};
