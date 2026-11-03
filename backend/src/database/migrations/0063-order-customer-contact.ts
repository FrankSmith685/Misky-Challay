import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';

export const up = async ({ context: q }: MigrationParams<QueryInterface>) => {
  const columns = await q.describeTable('orders');
  if (!columns.customer_contact_json) await q.addColumn('orders', 'customer_contact_json', { type: DataTypes.JSON, allowNull: true });
};
