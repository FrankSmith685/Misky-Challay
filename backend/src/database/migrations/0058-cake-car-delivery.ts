import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';

export const up = async ({ context: q }: MigrationParams<QueryInterface>) => {
  const add = async (table: string, column: string, definition: Parameters<QueryInterface['addColumn']>[2]) => {
    if (!(await q.describeTable(table))[column]) await q.addColumn(table, column, definition);
  };
  await add('drivers', 'vehicle_type', { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'UNSPECIFIED' });
  await add('delivery_slots', 'car_capacity', { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 });
  await add('branches', 'car_delivery_instructions', { type: DataTypes.STRING(1000), allowNull: false, defaultValue: 'Transportar la torta en su caja, sobre una superficie nivelada y antideslizante. Mantenerla protegida del calor y evitar movimientos bruscos.' });
  await add('orders', 'delivery_vehicle_type', { type: DataTypes.STRING(16), allowNull: true });
  await add('orders', 'delivery_handling_instructions', { type: DataTypes.STRING(1000), allowNull: true });
  await add('deliveries', 'vehicle_type', { type: DataTypes.STRING(16), allowNull: true });
  if (!await q.tableExists('delivery_evidence')) await q.createTable('delivery_evidence', {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    delivery_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, references: { model: 'deliveries', key: 'id' }, onDelete: 'CASCADE' },
    stage: { type: DataTypes.STRING(12), allowNull: false }, mime: { type: DataTypes.STRING(40), allowNull: false },
    bytes: { type: DataTypes.BLOB('medium'), allowNull: false }, created_by: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false }, updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  const evidenceIndexes = await q.showIndex('delivery_evidence') as Array<{ name: string }>;
  if (!evidenceIndexes.some((index) => index.name === 'uq_delivery_evidence_stage'))
    await q.addIndex('delivery_evidence', ['delivery_id', 'stage'], { name: 'uq_delivery_evidence_stage', unique: true });
  // Existing orders retain their original delivery commitment. Fleet is classified explicitly in the panel.
  const indexes = await q.showIndex('orders') as Array<{ name: string }>;
  if (!indexes.some((index) => index.name === 'idx_orders_car_slot'))
    await q.addIndex('orders', ['delivery_slot_id', 'delivery_vehicle_type', 'status'], { name: 'idx_orders_car_slot' });
};
