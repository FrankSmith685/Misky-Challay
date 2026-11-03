import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, addIndexIfMissing, removeColumnIfPresent, tableExists } from '../migrationHelpers';

export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(context, 'branch_inventory', 'average_unit_cost', { type: DataTypes.DECIMAL(12, 4), allowNull: false, defaultValue: 0 });
  await addColumnIfMissing(context, 'inventory_movements', 'lot_id', { type: DataTypes.BIGINT.UNSIGNED, allowNull: true });
  await addColumnIfMissing(context, 'inventory_movements', 'purchase_order_id', { type: DataTypes.BIGINT.UNSIGNED, allowNull: true });
  await addColumnIfMissing(context, 'inventory_movements', 'unit_cost', { type: DataTypes.DECIMAL(12, 4), allowNull: true });
  await addColumnIfMissing(context, 'inventory_movements', 'total_cost', { type: DataTypes.DECIMAL(12, 2), allowNull: true });

  if (!(await tableExists(context, 'suppliers'))) await context.createTable('suppliers', {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    code: { type: DataTypes.STRING(40), allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: false },
    tax_id: { type: DataTypes.STRING(20), allowNull: true },
    contact_name: { type: DataTypes.STRING(120), allowNull: true },
    email: { type: DataTypes.STRING(160), allowNull: true },
    phone: { type: DataTypes.STRING(30), allowNull: true },
    address: { type: DataTypes.STRING(255), allowNull: true },
    payment_terms_days: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    notes: { type: DataTypes.TEXT, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await addIndexIfMissing(context, 'suppliers', ['code'], { name: 'uq_suppliers_code', unique: true });
  await addIndexIfMissing(context, 'suppliers', ['is_active', 'name'], { name: 'idx_suppliers_active_name' });

  if (!(await tableExists(context, 'purchase_orders'))) await context.createTable('purchase_orders', {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    order_number: { type: DataTypes.STRING(40), allowNull: false },
    branch_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    supplier_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    status: { type: DataTypes.ENUM('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'), allowNull: false, defaultValue: 'DRAFT' },
    ordered_at: { type: DataTypes.DATE, allowNull: true },
    expected_at: { type: DataTypes.DATE, allowNull: true },
    received_at: { type: DataTypes.DATE, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    subtotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    tax: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    total: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    created_by: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    received_by: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await addIndexIfMissing(context, 'purchase_orders', ['order_number'], { name: 'uq_purchase_orders_number', unique: true });
  await addIndexIfMissing(context, 'purchase_orders', ['branch_id', 'status', 'created_at'], { name: 'idx_purchase_orders_branch_status' });

  if (!(await tableExists(context, 'purchase_order_items'))) await context.createTable('purchase_order_items', {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    purchase_order_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    inventory_item_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    quantity_ordered: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    quantity_received: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    unit_cost: { type: DataTypes.DECIMAL(12, 4), allowNull: false },
    lot_code: { type: DataTypes.STRING(80), allowNull: true },
    expires_at: { type: DataTypes.DATEONLY, allowNull: true },
    notes: { type: DataTypes.STRING(255), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await addIndexIfMissing(context, 'purchase_order_items', ['purchase_order_id'], { name: 'idx_purchase_order_items_order' });
  await addIndexIfMissing(context, 'purchase_order_items', ['inventory_item_id'], { name: 'idx_purchase_order_items_item' });

  if (!(await tableExists(context, 'inventory_lots'))) await context.createTable('inventory_lots', {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    branch_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    inventory_item_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    supplier_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    purchase_order_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    purchase_order_item_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    lot_code: { type: DataTypes.STRING(80), allowNull: false },
    received_at: { type: DataTypes.DATE, allowNull: false },
    expires_at: { type: DataTypes.DATEONLY, allowNull: true },
    quantity_received: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    quantity_available: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    unit_cost: { type: DataTypes.DECIMAL(12, 4), allowNull: false },
    status: { type: DataTypes.ENUM('ACTIVE', 'DEPLETED', 'EXPIRED', 'BLOCKED'), allowNull: false, defaultValue: 'ACTIVE' },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await addIndexIfMissing(context, 'inventory_lots', ['branch_id', 'inventory_item_id', 'lot_code'], { name: 'uq_inventory_lots_code', unique: true });
  await addIndexIfMissing(context, 'inventory_lots', ['branch_id', 'inventory_item_id', 'status', 'received_at'], { name: 'idx_inventory_lots_fifo' });
  await addIndexIfMissing(context, 'inventory_lots', ['branch_id', 'expires_at', 'status'], { name: 'idx_inventory_lots_expiry' });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  if (await tableExists(context, 'inventory_lots')) await context.dropTable('inventory_lots');
  if (await tableExists(context, 'purchase_order_items')) await context.dropTable('purchase_order_items');
  if (await tableExists(context, 'purchase_orders')) await context.dropTable('purchase_orders');
  if (await tableExists(context, 'suppliers')) await context.dropTable('suppliers');
  for (const [table, column] of [['inventory_movements', 'total_cost'], ['inventory_movements', 'unit_cost'], ['inventory_movements', 'purchase_order_id'], ['inventory_movements', 'lot_id'], ['branch_inventory', 'average_unit_cost']] as const) await removeColumnIfPresent(context, table, column);
};
