import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';

/** Permite que la campana muestre solo pendientes y no un contador historico eterno. */
export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  const table = await context.describeTable('notifications');
  if (!table.read_at) await context.addColumn('notifications', 'read_at', { type: DataTypes.DATE, allowNull: true });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  const table = await context.describeTable('notifications');
  if (table.read_at) await context.removeColumn('notifications', 'read_at');
};
