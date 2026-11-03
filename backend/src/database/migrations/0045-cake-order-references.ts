import { DataTypes, QueryTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { tableExists } from '../migrationHelpers';

export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await context.changeColumn('order_items', 'special_instructions', { type: DataTypes.TEXT, allowNull: true });
  if (!(await tableExists(context, 'order_item_references'))) await context.createTable('order_item_references', {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    order_item_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, unique: true, references: { model: 'order_items', key: 'id' }, onDelete: 'CASCADE' },
    mime: { type: DataTypes.STRING(30), allowNull: false },
    bytes: { type: DataTypes.BLOB('long'), allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  const rows = await context.sequelize.query<{ longest: number }>('SELECT COALESCE(MAX(CHAR_LENGTH(special_instructions)), 0) AS longest FROM order_items', { type: QueryTypes.SELECT });
  if (Number(rows[0]?.longest ?? 0) > 255) throw new Error('No se puede reducir la descripción sin perder pedidos existentes');
  if (await tableExists(context, 'order_item_references')) await context.dropTable('order_item_references');
  await context.changeColumn('order_items', 'special_instructions', { type: DataTypes.STRING(255), allowNull: true });
};
