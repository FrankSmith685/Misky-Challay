import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, removeColumnIfPresent } from '../migrationHelpers';

/** Congela en el pedido el componente de delivery asociado a tortas. */
export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(context, 'orders', 'cake_delivery_fee', {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await removeColumnIfPresent(context, 'orders', 'cake_delivery_fee');
};

