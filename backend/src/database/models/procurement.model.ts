import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from 'sequelize';
import { sequelize } from '../connection';
import type { Branch } from './branch.model';
import type { InventoryItem } from './inventoryItem.model';

export const PURCHASE_ORDER_STATUS = {
  DRAFT: 'DRAFT',
  ORDERED: 'ORDERED',
  PARTIALLY_RECEIVED: 'PARTIALLY_RECEIVED',
  RECEIVED: 'RECEIVED',
  CANCELLED: 'CANCELLED',
} as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUS)[keyof typeof PURCHASE_ORDER_STATUS];

export const INVENTORY_LOT_STATUS = {
  ACTIVE: 'ACTIVE',
  DEPLETED: 'DEPLETED',
  EXPIRED: 'EXPIRED',
  BLOCKED: 'BLOCKED',
} as const;
export type InventoryLotStatus = (typeof INVENTORY_LOT_STATUS)[keyof typeof INVENTORY_LOT_STATUS];

export class Supplier extends Model<InferAttributes<Supplier>, InferCreationAttributes<Supplier>> {
  declare id: CreationOptional<number>;
  declare code: string;
  declare name: string;
  declare taxId: CreationOptional<string | null>;
  declare contactName: CreationOptional<string | null>;
  declare email: CreationOptional<string | null>;
  declare phone: CreationOptional<string | null>;
  declare address: CreationOptional<string | null>;
  declare paymentTermsDays: CreationOptional<number>;
  declare notes: CreationOptional<string | null>;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
Supplier.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  code: { type: DataTypes.STRING(40), allowNull: false },
  name: { type: DataTypes.STRING(120), allowNull: false },
  taxId: { type: DataTypes.STRING(20), allowNull: true },
  contactName: { type: DataTypes.STRING(120), allowNull: true },
  email: { type: DataTypes.STRING(160), allowNull: true },
  phone: { type: DataTypes.STRING(30), allowNull: true },
  address: { type: DataTypes.STRING(255), allowNull: true },
  paymentTermsDays: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
  notes: { type: DataTypes.TEXT, allowNull: true },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'Supplier', tableName: 'suppliers', indexes: [
  { name: 'uq_suppliers_code', unique: true, fields: ['code'] },
  { name: 'idx_suppliers_active_name', fields: ['is_active', 'name'] },
] });

export class PurchaseOrder extends Model<InferAttributes<PurchaseOrder>, InferCreationAttributes<PurchaseOrder>> {
  declare id: CreationOptional<number>;
  declare orderNumber: string;
  declare branchId: number;
  declare supplierId: number;
  declare status: CreationOptional<PurchaseOrderStatus>;
  declare orderedAt: CreationOptional<Date | null>;
  declare expectedAt: CreationOptional<Date | null>;
  declare receivedAt: CreationOptional<Date | null>;
  declare notes: CreationOptional<string | null>;
  declare subtotal: CreationOptional<number>;
  declare tax: CreationOptional<number>;
  declare total: CreationOptional<number>;
  declare createdBy: CreationOptional<number | null>;
  declare receivedBy: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare supplier?: NonAttribute<Supplier>;
  declare branch?: NonAttribute<Branch>;
  declare items?: NonAttribute<PurchaseOrderItem[]>;
}
PurchaseOrder.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  orderNumber: { type: DataTypes.STRING(40), allowNull: false },
  branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  supplierId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  status: { type: DataTypes.ENUM(...Object.values(PURCHASE_ORDER_STATUS)), allowNull: false, defaultValue: PURCHASE_ORDER_STATUS.DRAFT },
  orderedAt: { type: DataTypes.DATE, allowNull: true },
  expectedAt: { type: DataTypes.DATE, allowNull: true },
  receivedAt: { type: DataTypes.DATE, allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  subtotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  tax: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  total: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  // La orden permanece aunque se elimine al usuario que la registró.
  // La asociación usa ON DELETE SET NULL, por eso esta columna debe aceptar NULL.
  createdBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  receivedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'PurchaseOrder', tableName: 'purchase_orders', indexes: [
  { name: 'uq_purchase_orders_number', unique: true, fields: ['order_number'] },
  { name: 'idx_purchase_orders_branch_status', fields: ['branch_id', 'status', 'created_at'] },
] });

export class PurchaseOrderItem extends Model<InferAttributes<PurchaseOrderItem>, InferCreationAttributes<PurchaseOrderItem>> {
  declare id: CreationOptional<number>;
  declare purchaseOrderId: number;
  declare inventoryItemId: number;
  declare quantityOrdered: number;
  declare quantityReceived: CreationOptional<number>;
  declare unitCost: number;
  declare lotCode: CreationOptional<string | null>;
  declare expiresAt: CreationOptional<Date | null>;
  declare notes: CreationOptional<string | null>;
  declare item?: NonAttribute<InventoryItem>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
PurchaseOrderItem.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  purchaseOrderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  inventoryItemId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  quantityOrdered: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  quantityReceived: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  unitCost: { type: DataTypes.DECIMAL(12, 4), allowNull: false },
  lotCode: { type: DataTypes.STRING(80), allowNull: true },
  expiresAt: { type: DataTypes.DATEONLY, allowNull: true },
  notes: { type: DataTypes.STRING(255), allowNull: true },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'PurchaseOrderItem', tableName: 'purchase_order_items', indexes: [
  { name: 'idx_purchase_order_items_order', fields: ['purchase_order_id'] },
  { name: 'idx_purchase_order_items_item', fields: ['inventory_item_id'] },
] });

export class InventoryLot extends Model<InferAttributes<InventoryLot>, InferCreationAttributes<InventoryLot>> {
  declare id: CreationOptional<number>;
  declare branchId: number;
  declare inventoryItemId: number;
  declare supplierId: CreationOptional<number | null>;
  declare purchaseOrderId: CreationOptional<number | null>;
  declare purchaseOrderItemId: CreationOptional<number | null>;
  declare lotCode: string;
  declare receivedAt: CreationOptional<Date>;
  declare expiresAt: CreationOptional<Date | null>;
  declare quantityReceived: number;
  declare quantityAvailable: number;
  declare unitCost: number;
  declare status: CreationOptional<InventoryLotStatus>;
  declare item?: NonAttribute<InventoryItem>;
  declare supplier?: NonAttribute<Supplier>;
  declare purchaseOrder?: NonAttribute<PurchaseOrder>;
  declare purchaseOrderItem?: NonAttribute<PurchaseOrderItem>;
  declare branch?: NonAttribute<Branch>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
InventoryLot.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  inventoryItemId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  supplierId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  purchaseOrderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  purchaseOrderItemId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  lotCode: { type: DataTypes.STRING(80), allowNull: false },
  receivedAt: { type: DataTypes.DATE, allowNull: false },
  expiresAt: { type: DataTypes.DATEONLY, allowNull: true },
  quantityReceived: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  quantityAvailable: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  unitCost: { type: DataTypes.DECIMAL(12, 4), allowNull: false },
  status: { type: DataTypes.ENUM(...Object.values(INVENTORY_LOT_STATUS)), allowNull: false, defaultValue: INVENTORY_LOT_STATUS.ACTIVE },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'InventoryLot', tableName: 'inventory_lots', indexes: [
  { name: 'idx_inventory_lots_fifo', fields: ['branch_id', 'inventory_item_id', 'status', 'received_at'] },
  { name: 'idx_inventory_lots_expiry', fields: ['branch_id', 'expires_at', 'status'] },
  { name: 'uq_inventory_lots_code', unique: true, fields: ['branch_id', 'inventory_item_id', 'lot_code'] },
] });

