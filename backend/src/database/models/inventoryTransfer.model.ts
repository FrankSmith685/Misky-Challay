import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model, NonAttribute } from 'sequelize';
import { sequelize } from '../connection';
import type { InventoryItem } from './inventoryItem.model';

export const INVENTORY_TRANSFER_STATUS = {
  REQUESTED: 'REQUESTED',
  APPROVED: 'APPROVED',
  IN_TRANSIT: 'IN_TRANSIT',
  RECEIVED: 'RECEIVED',
  CANCELLED: 'CANCELLED',
} as const;
export type InventoryTransferStatus = (typeof INVENTORY_TRANSFER_STATUS)[keyof typeof INVENTORY_TRANSFER_STATUS];

export class InventoryTransfer extends Model<InferAttributes<InventoryTransfer>, InferCreationAttributes<InventoryTransfer>> {
  declare id: CreationOptional<number>;
  declare transferNumber: string;
  declare sourceBranchId: number;
  declare destinationBranchId: number;
  declare status: CreationOptional<InventoryTransferStatus>;
  declare requestedBy: number | null;
  declare approvedBy: CreationOptional<number | null>;
  declare shippedBy: CreationOptional<number | null>;
  declare receivedBy: CreationOptional<number | null>;
  declare requestedAt: CreationOptional<Date>;
  declare approvedAt: CreationOptional<Date | null>;
  declare shippedAt: CreationOptional<Date | null>;
  declare receivedAt: CreationOptional<Date | null>;
  declare notes: CreationOptional<string | null>;
  declare items?: NonAttribute<InventoryTransferItem[]>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

InventoryTransfer.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  transferNumber: { type: DataTypes.STRING(40), allowNull: false },
  sourceBranchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  destinationBranchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  status: { type: DataTypes.ENUM(...Object.values(INVENTORY_TRANSFER_STATUS)), allowNull: false, defaultValue: INVENTORY_TRANSFER_STATUS.REQUESTED },
  requestedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  approvedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  shippedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  receivedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  requestedAt: { type: DataTypes.DATE, allowNull: false },
  approvedAt: { type: DataTypes.DATE, allowNull: true },
  shippedAt: { type: DataTypes.DATE, allowNull: true },
  receivedAt: { type: DataTypes.DATE, allowNull: true },
  notes: { type: DataTypes.STRING(500), allowNull: true },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'InventoryTransfer', tableName: 'inventory_transfers', indexes: [
  { name: 'uq_inventory_transfers_number', unique: true, fields: ['transfer_number'] },
  { name: 'idx_inventory_transfers_source_status', fields: ['source_branch_id', 'status', 'created_at'] },
  { name: 'idx_inventory_transfers_destination_status', fields: ['destination_branch_id', 'status', 'created_at'] },
] });

export class InventoryTransferItem extends Model<InferAttributes<InventoryTransferItem>, InferCreationAttributes<InventoryTransferItem>> {
  declare id: CreationOptional<number>;
  declare transferId: number;
  declare inventoryItemId: number;
  declare quantityRequested: number;
  declare quantityShipped: CreationOptional<number>;
  declare quantityReceived: CreationOptional<number>;
  declare unitCost: CreationOptional<number>;
  declare item?: NonAttribute<InventoryItem>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

InventoryTransferItem.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  transferId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  inventoryItemId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  quantityRequested: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  quantityShipped: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  quantityReceived: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  unitCost: { type: DataTypes.DECIMAL(12, 4), allowNull: false, defaultValue: 0 },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'InventoryTransferItem', tableName: 'inventory_transfer_items', indexes: [
  { name: 'uq_inventory_transfer_items', unique: true, fields: ['transfer_id', 'inventory_item_id'] },
  { name: 'idx_inventory_transfer_items_item', fields: ['inventory_item_id'] },
] });

export default InventoryTransfer;
