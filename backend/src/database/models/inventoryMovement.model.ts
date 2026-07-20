import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

export const MOVEMENT_TYPE = {
  PURCHASE: 'PURCHASE', // entrada por compra
  RESERVE: 'RESERVE', // reserva al confirmar el pedido
  RELEASE: 'RELEASE', // liberacion al cancelar
  CONSUME: 'CONSUME', // salida definitiva al preparar
  WASTE: 'WASTE', // merma
  ADJUSTMENT: 'ADJUSTMENT', // ajuste de inventario
} as const;
export type MovementType = (typeof MOVEMENT_TYPE)[keyof typeof MOVEMENT_TYPE];

/**
 * Tabla `inventory_movements`: el libro de movimientos. Es inmutable:
 * una correccion se hace con un ADJUSTMENT nuevo, nunca editando el pasado.
 */
export class InventoryMovement extends Model<
  InferAttributes<InventoryMovement>,
  InferCreationAttributes<InventoryMovement>
> {
  declare id: CreationOptional<number>;
  declare branchId: number;
  declare inventoryItemId: number;
  declare type: MovementType;
  /** Siempre positivo: el tipo define el sentido. */
  declare quantity: number;
  declare onHandAfter: CreationOptional<number>;
  declare reservedAfter: CreationOptional<number>;
  declare orderId: CreationOptional<number | null>;
  declare actorId: CreationOptional<number | null>;
  declare reason: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

InventoryMovement.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    inventoryItemId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    type: { type: DataTypes.ENUM(...Object.values(MOVEMENT_TYPE)), allowNull: false },
    quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    onHandAfter: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    reservedAfter: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    orderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    actorId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    reason: { type: DataTypes.STRING(255), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'InventoryMovement',
    tableName: 'inventory_movements',
    indexes: [
      { name: 'idx_inv_mov_branch_item', fields: ['branch_id', 'inventory_item_id'] },
      { name: 'idx_inv_mov_order', fields: ['order_id'] },
    ],
  },
);

export default InventoryMovement;
