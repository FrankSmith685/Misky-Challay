import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from 'sequelize';
import { sequelize } from '../connection';
import type { InventoryItem } from './inventoryItem.model';

/**
 * Tabla `branch_inventory`: el stock real de cada insumo en cada cocina.
 *
 * RN-016: al confirmar el pedido se RESERVA (reserved sube), al preparar se
 * CONSUME (onHand y reserved bajan) y al cancelar se LIBERA (reserved baja).
 * Lo vendible es `available = onHand - reserved`.
 */
export class BranchInventory extends Model<
  InferAttributes<BranchInventory>,
  InferCreationAttributes<BranchInventory>
> {
  declare id: CreationOptional<number>;
  declare branchId: number;
  declare inventoryItemId: number;
  declare onHand: CreationOptional<number>;
  declare reserved: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare item?: NonAttribute<InventoryItem>;

  get available(): NonAttribute<number> {
    return Number(this.onHand) - Number(this.reserved);
  }
}

BranchInventory.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    inventoryItemId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    onHand: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    reserved: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'BranchInventory',
    tableName: 'branch_inventory',
    indexes: [
      { name: 'uq_branch_inventory', unique: true, fields: ['branch_id', 'inventory_item_id'] },
    ],
  },
);

export default BranchInventory;
