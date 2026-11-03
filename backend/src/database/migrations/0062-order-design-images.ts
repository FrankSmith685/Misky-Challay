import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';

export const up = async ({ context: q }: MigrationParams<QueryInterface>) => {
  const columns = await q.describeTable('order_item_references');
  if (!columns.kind) await q.addColumn('order_item_references', 'kind', { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'CUSTOMER_REFERENCE' });
  if (!columns.position) await q.addColumn('order_item_references', 'position', { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0 });
  const indexes = await q.showIndex('order_item_references') as Array<{ name: string; unique: boolean; fields: Array<{ attribute: string }> }>;
  // Create the replacement first: the foreign key still needs an index starting with order_item_id.
  if (!indexes.some((index) => index.name === 'uq_order_item_images_kind_position')) {
    await q.addIndex('order_item_references', ['order_item_id', 'kind', 'position'], { unique: true, name: 'uq_order_item_images_kind_position' });
  }
  for (const index of indexes) {
    if (index.unique && index.fields.length === 1 && index.fields[0].attribute === 'order_item_id') await q.removeIndex('order_item_references', index.name);
  }
};
