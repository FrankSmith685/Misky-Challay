import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { tableExists } from '../migrationHelpers';

/**
 * `PurchaseOrder.createdBy` se conserva como referencia informativa. Si el
 * usuario se elimina, la orden debe seguir existiendo y quedar sin autor.
 * Las bases creadas con la migracion 0029 anterior tenian la columna NOT NULL,
 * lo que impedia crear la FK con ON DELETE SET NULL durante sequelize.sync.
 */
export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  if (!(await tableExists(context, 'purchase_orders'))) return;

  await context.changeColumn('purchase_orders', 'created_by', {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
  });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  if (!(await tableExists(context, 'purchase_orders'))) return;

  const [rows] = await context.sequelize.query(
    'SELECT COUNT(*) AS `null_count` FROM `purchase_orders` WHERE `created_by` IS NULL',
  );
  const nullCount = Number((rows as Array<{ null_count: number }>)[0]?.null_count ?? 0);
  if (nullCount > 0) {
    throw new Error('No se puede revertir: purchase_orders.created_by contiene valores NULL');
  }

  await context.changeColumn('purchase_orders', 'created_by', {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
  });
};
