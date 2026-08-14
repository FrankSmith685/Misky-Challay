import { DataTypes, type QueryInterface, QueryTypes } from 'sequelize';
import type { MigrationParams } from 'umzug';

/** Permite conservar completa la personalización de bowls extensos en el pedido. */
export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await context.changeColumn('order_items', 'description_snapshot', {
    type: DataTypes.TEXT,
    allowNull: true,
  });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  const rows = await context.sequelize.query<{ longest: number }>(
    'SELECT COALESCE(MAX(CHAR_LENGTH(description_snapshot)), 0) AS longest FROM order_items',
    { type: QueryTypes.SELECT },
  );
  if (Number(rows[0]?.longest ?? 0) > 500) {
    throw new Error('No se puede reducir description_snapshot a 500 caracteres sin perder datos');
  }
  await context.changeColumn('order_items', 'description_snapshot', {
    type: DataTypes.STRING(500),
    allowNull: true,
  });
};
