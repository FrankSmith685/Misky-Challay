import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, removeColumnIfPresent, tableExists } from '../migrationHelpers';

/** Versiones optimistas y publicaciones inmutables del constructor. */
export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  for (const table of [
    'customization_groups',
    'customization_options',
    'product_customization_groups',
    'builder_presets',
    'branch_option_availability',
  ]) {
    await addColumnIfMissing(q, table, 'version', {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 1,
    });
  }

  if (!(await tableExists(q, 'builder_releases'))) {
    await q.createTable('builder_releases', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      product_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      snapshot_json: { type: DataTypes.JSON, allowNull: false },
      published_by: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      published_at: { type: DataTypes.DATE, allowNull: false },
      idempotency_key: { type: DataTypes.STRING(100), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  }
  try { await q.addIndex('builder_releases', ['product_id', 'version'], { name: 'uq_builder_releases_product_version', unique: true }); } catch { /* sync pudo crearlo */ }
  try { await q.addIndex('builder_releases', ['product_id', 'published_at'], { name: 'idx_builder_releases_product_date' }); } catch { /* sync pudo crearlo */ }
  try { await q.addIndex('builder_releases', ['idempotency_key'], { name: 'uq_builder_releases_idempotency', unique: true }); } catch { /* sync pudo crearlo */ }
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  if (await tableExists(q, 'builder_releases')) await q.dropTable('builder_releases');
  for (const table of [
    'branch_option_availability',
    'builder_presets',
    'product_customization_groups',
    'customization_options',
    'customization_groups',
  ]) await removeColumnIfPresent(q, table, 'version');
};
