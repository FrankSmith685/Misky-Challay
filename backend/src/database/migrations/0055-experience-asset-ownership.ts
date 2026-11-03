import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
export const up = async ({ context: q }: MigrationParams<QueryInterface>) => {
  const columns = await q.describeTable('experience_assets');
  if (!columns.project_id)
    await q.addColumn('experience_assets', 'project_id', {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'experience_projects', key: 'id' },
      onDelete: 'CASCADE',
    });
};
export const down = async ({ context: q }: MigrationParams<QueryInterface>) => {
  await q.removeColumn('experience_assets', 'project_id');
};
