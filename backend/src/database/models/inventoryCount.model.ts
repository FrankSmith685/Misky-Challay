import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model, NonAttribute } from 'sequelize';
import { sequelize } from '../connection';
import type { InventoryItem } from './inventoryItem.model';

export const INVENTORY_COUNT_STATUS = {
  OPEN: 'OPEN',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  CANCELLED: 'CANCELLED',
} as const;
export type InventoryCountStatus = (typeof INVENTORY_COUNT_STATUS)[keyof typeof INVENTORY_COUNT_STATUS];

export class InventoryCountSession extends Model<InferAttributes<InventoryCountSession>, InferCreationAttributes<InventoryCountSession>> {
  declare id: CreationOptional<number>;
  declare branchId: number;
  declare name: string;
  declare status: CreationOptional<InventoryCountStatus>;
  declare startedBy: number | null;
  declare submittedBy: CreationOptional<number | null>;
  declare approvedBy: CreationOptional<number | null>;
  declare startedAt: CreationOptional<Date>;
  declare submittedAt: CreationOptional<Date | null>;
  declare approvedAt: CreationOptional<Date | null>;
  declare notes: CreationOptional<string | null>;
  declare items?: NonAttribute<InventoryCountItem[]>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

InventoryCountSession.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  name: { type: DataTypes.STRING(120), allowNull: false },
  status: { type: DataTypes.ENUM(...Object.values(INVENTORY_COUNT_STATUS)), allowNull: false, defaultValue: INVENTORY_COUNT_STATUS.OPEN },
  startedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  submittedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  approvedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  startedAt: { type: DataTypes.DATE, allowNull: false },
  submittedAt: { type: DataTypes.DATE, allowNull: true },
  approvedAt: { type: DataTypes.DATE, allowNull: true },
  notes: { type: DataTypes.STRING(500), allowNull: true },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'InventoryCountSession', tableName: 'inventory_count_sessions', indexes: [
  { name: 'idx_inventory_count_sessions_branch_status', fields: ['branch_id', 'status', 'created_at'] },
] });

export class InventoryCountItem extends Model<InferAttributes<InventoryCountItem>, InferCreationAttributes<InventoryCountItem>> {
  declare id: CreationOptional<number>;
  declare sessionId: number;
  declare inventoryItemId: number;
  declare expectedOnHand: number;
  declare countedOnHand: CreationOptional<number | null>;
  declare variance: CreationOptional<number | null>;
  declare item?: NonAttribute<InventoryItem>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

InventoryCountItem.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  sessionId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  inventoryItemId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  expectedOnHand: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  countedOnHand: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
  variance: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'InventoryCountItem', tableName: 'inventory_count_items', indexes: [
  { name: 'uq_inventory_count_items', unique: true, fields: ['session_id', 'inventory_item_id'] },
  { name: 'idx_inventory_count_items_item', fields: ['inventory_item_id'] },
] });

export default InventoryCountSession;
