import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';

export const up = async ({ context }: MigrationParams<QueryInterface>) => {
  const tables = await context.showAllTables();
  if (!tables.includes('cake_themes')) await context.createTable('cake_themes', {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true, allowNull: false },
    product_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, references: { model: 'products', key: 'id' }, onDelete: 'CASCADE' },
    name: { type: DataTypes.STRING(120), allowNull: false },
    slug: { type: DataTypes.STRING(150), allowNull: false, unique: true },
    theme: { type: DataTypes.STRING(80), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    image_urls_json: { type: DataTypes.JSON, allowNull: false },
    sale_mode: { type: DataTypes.ENUM('CONFIGURED', 'QUOTE'), allowNull: false },
    min_lead_hours: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    min_servings: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    max_servings: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    variant_rules_json: { type: DataTypes.JSON, allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
    sort_order: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 0, allowNull: false },
    version: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 1, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  for (const table of ['order_items', 'cake_design_requests']) {
    if (!(await context.describeTable(table)).theme_snapshot_json) await context.addColumn(table, 'theme_snapshot_json', { type: DataTypes.JSON, allowNull: true });
  }
};
export const down = async ({ context }: MigrationParams<QueryInterface>) => {
  await context.removeColumn('cake_design_requests', 'theme_snapshot_json');
  await context.removeColumn('order_items', 'theme_snapshot_json');
  await context.dropTable('cake_themes');
};
