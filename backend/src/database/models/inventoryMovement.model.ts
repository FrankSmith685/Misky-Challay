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
  TRANSFER_OUT: 'TRANSFER_OUT', // salida hacia otra sucursal
  TRANSFER_IN: 'TRANSFER_IN', // entrada recibida desde otra sucursal
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
  /** Positivo para salidas/entradas; ADJUSTMENT conserva el signo del conteo. */
  declare quantity: number;
  declare onHandAfter: CreationOptional<number>;
  declare reservedAfter: CreationOptional<number>;
  declare lotId: CreationOptional<number | null>;
  declare purchaseOrderId: CreationOptional<number | null>;
  declare unitCost: CreationOptional<number | null>;
  declare totalCost: CreationOptional<number | null>;
  declare orderId: CreationOptional<number | null>;
  declare actorId: CreationOptional<number | null>;
  declare reason: CreationOptional<string | null>;
  /** Clave de reintento para movimientos manuales o recepciones. */
  declare idempotencyKey: CreationOptional<string | null>;
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
    lotId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    purchaseOrderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    unitCost: { type: DataTypes.DECIMAL(12, 4), allowNull: true },
    totalCost: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    orderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    actorId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    reason: { type: DataTypes.STRING(255), allowNull: true },
    idempotencyKey: { type: DataTypes.STRING(100), allowNull: true },
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
      { name: 'uq_inv_mov_idempotency', unique: true, fields: ['branch_id', 'idempotency_key'] },
    ],
  },
);

export default InventoryMovement;
