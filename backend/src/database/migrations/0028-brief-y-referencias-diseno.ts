import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, addIndexIfMissing, removeColumnIfPresent, tableExists } from '../migrationHelpers';

export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(context, 'cake_design_requests', 'brief_json', {
    type: DataTypes.JSON, allowNull: false, defaultValue: {},
  });
  if (!(await tableExists(context, 'cake_design_references'))) {
    await context.createTable('cake_design_references', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      request_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      sort_order: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
      mime: { type: DataTypes.STRING(30), allowNull: false },
      bytes: { type: DataTypes.BLOB('long'), allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  }
  await addIndexIfMissing(context, 'cake_design_references', ['request_id', 'sort_order'], { name: 'idx_cake_design_reference_request' });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  if (await tableExists(context, 'cake_design_references')) await context.dropTable('cake_design_references');
  await removeColumnIfPresent(context, 'cake_design_requests', 'brief_json');
};
