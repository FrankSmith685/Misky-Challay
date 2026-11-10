import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { tableExists } from '../migrationHelpers';

const DEFAULT_THEME = { primary: '#006fb9', secondary: '#ffbd16', tertiary: '#f15b3a', radius: 5, fontFamily: 'inter', baseFontSize: 16, density: 'comfortable', shadowStrength: 100 };

/** Tema global con borrador, publicación explícita y versiones auditables. */
export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  if (!(await tableExists(q, 'theme_settings'))) {
    await q.createTable('theme_settings', {
      id: { type: DataTypes.TINYINT.UNSIGNED, primaryKey: true, defaultValue: 1 },
      draft_tokens_json: { type: DataTypes.JSON, allowNull: false },
      published_tokens_json: { type: DataTypes.JSON, allowNull: false },
      draft_version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
      published_version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
      updated_by: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      published_by: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  }
  const [rows] = await q.sequelize.query('SELECT id FROM theme_settings WHERE id=1');
  if (!(rows as Array<{ id: number }>).length) {
    await q.bulkInsert('theme_settings', [{
      id: 1,
      draft_tokens_json: JSON.stringify(DEFAULT_THEME),
      published_tokens_json: JSON.stringify(DEFAULT_THEME),
      draft_version: 1,
      published_version: 1,
      updated_by: null,
      published_by: null,
      created_at: new Date(),
      updated_at: new Date(),
    }]);
  }
  await q.sequelize.query("ALTER TABLE setting_revisions MODIFY scope ENUM('business','local-payments','receipts','communication','theme') NOT NULL");
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  await q.dropTable('theme_settings');
  await q.sequelize.query("ALTER TABLE setting_revisions MODIFY scope ENUM('business','local-payments','receipts','communication') NOT NULL");
};
