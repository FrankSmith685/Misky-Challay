import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, addIndexIfMissing, removeColumnIfPresent } from '../migrationHelpers';

export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  await q.changeColumn('inventory_movements', 'type', { type: DataTypes.ENUM('PURCHASE', 'RESERVE', 'RELEASE', 'CONSUME', 'WASTE', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN'), allowNull: false });
  await addColumnIfMissing(q, 'inventory_movements', 'idempotency_key', { type: DataTypes.STRING(100), allowNull: true });
  await addIndexIfMissing(q, 'inventory_movements', ['branch_id', 'idempotency_key'], { name: 'uq_inv_mov_idempotency', unique: true });
  const tables = await q.showAllTables() as string[];
  if (!tables.includes('inventory_transfers')) {
    await q.createTable('inventory_transfers', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      transfer_number: { type: DataTypes.STRING(40), allowNull: false },
      source_branch_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      destination_branch_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      status: { type: DataTypes.ENUM('REQUESTED', 'APPROVED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED'), allowNull: false, defaultValue: 'REQUESTED' },
      requested_by: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      approved_by: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      shipped_by: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      received_by: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      requested_at: { type: DataTypes.DATE, allowNull: false },
      approved_at: { type: DataTypes.DATE, allowNull: true },
      shipped_at: { type: DataTypes.DATE, allowNull: true },
      received_at: { type: DataTypes.DATE, allowNull: true },
      notes: { type: DataTypes.STRING(500), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
    await q.addIndex('inventory_transfers', ['transfer_number'], { name: 'uq_inventory_transfers_number', unique: true });
    await q.addIndex('inventory_transfers', ['source_branch_id', 'status', 'created_at'], { name: 'idx_inventory_transfers_source_status' });
    await q.addIndex('inventory_transfers', ['destination_branch_id', 'status', 'created_at'], { name: 'idx_inventory_transfers_destination_status' });
  }
  if (!tables.includes('inventory_transfer_items')) {
    await q.createTable('inventory_transfer_items', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      transfer_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      inventory_item_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      quantity_requested: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      quantity_shipped: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      quantity_received: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      unit_cost: { type: DataTypes.DECIMAL(12, 4), allowNull: false, defaultValue: 0 },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
    await q.addIndex('inventory_transfer_items', ['transfer_id', 'inventory_item_id'], { name: 'uq_inventory_transfer_items', unique: true });
    await q.addIndex('inventory_transfer_items', ['inventory_item_id'], { name: 'idx_inventory_transfer_items_item' });
  }
  if (!tables.includes('inventory_count_sessions')) {
    await q.createTable('inventory_count_sessions', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      branch_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      name: { type: DataTypes.STRING(120), allowNull: false },
      status: { type: DataTypes.ENUM('OPEN', 'SUBMITTED', 'APPROVED', 'CANCELLED'), allowNull: false, defaultValue: 'OPEN' },
      started_by: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      submitted_by: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      approved_by: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      started_at: { type: DataTypes.DATE, allowNull: false },
      submitted_at: { type: DataTypes.DATE, allowNull: true },
      approved_at: { type: DataTypes.DATE, allowNull: true },
      notes: { type: DataTypes.STRING(500), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
    await q.addIndex('inventory_count_sessions', ['branch_id', 'status', 'created_at'], { name: 'idx_inventory_count_sessions_branch_status' });
  }
  if (!tables.includes('inventory_count_items')) {
    await q.createTable('inventory_count_items', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      session_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      inventory_item_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      expected_on_hand: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      counted_on_hand: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      variance: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
    await q.addIndex('inventory_count_items', ['session_id', 'inventory_item_id'], { name: 'uq_inventory_count_items', unique: true });
    await q.addIndex('inventory_count_items', ['inventory_item_id'], { name: 'idx_inventory_count_items_item' });
  }
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  const tables = await q.showAllTables() as string[];
  for (const table of ['inventory_count_items', 'inventory_count_sessions', 'inventory_transfer_items', 'inventory_transfers']) {
    if (tables.includes(table)) await q.dropTable(table);
  }
  await removeColumnIfPresent(q, 'inventory_movements', 'idempotency_key');
  await q.changeColumn('inventory_movements', 'type', { type: DataTypes.ENUM('PURCHASE', 'RESERVE', 'RELEASE', 'CONSUME', 'WASTE', 'ADJUSTMENT'), allowNull: false });
};
