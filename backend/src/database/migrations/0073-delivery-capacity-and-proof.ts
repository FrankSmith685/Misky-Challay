import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';

/** Capacidad operativa de repartidores y prueba mínima de entrega. */
export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  const drivers = await q.describeTable('drivers');
  if (!drivers.max_active_deliveries) await q.addColumn('drivers', 'max_active_deliveries', { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 3 });
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  const drivers = await q.describeTable('drivers');
  if (drivers.max_active_deliveries) await q.removeColumn('drivers', 'max_active_deliveries');
};
