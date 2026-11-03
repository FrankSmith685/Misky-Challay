import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { defaultStorefront } from '../../modules/settings/storefront.schema';

export const up = async ({ context: q }: MigrationParams<QueryInterface>) => {
  if (!(await q.tableExists('storefront_settings'))) {
    await q.createTable('storefront_settings', {
      id: { type: DataTypes.TINYINT.UNSIGNED, primaryKey: true, allowNull: false },
      content_json: { type: DataTypes.JSON, allowNull: false },
      version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
      updated_by: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  }
  await q.sequelize.query(
    'INSERT IGNORE INTO storefront_settings (id, content_json, version, created_at, updated_at) VALUES (1, :content, 1, NOW(), NOW())',
    { replacements: { content: JSON.stringify(defaultStorefront()) } },
  );
};
export const down = async ({ context: q }: MigrationParams<QueryInterface>) => {
  await q.dropTable('storefront_settings');
};
