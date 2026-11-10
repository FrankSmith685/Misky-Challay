import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

export const CASH_MOVEMENT_TYPE = {
  SALE: 'SALE',
  REFUND: 'REFUND',
  EXPENSE: 'EXPENSE',
  CASH_IN: 'CASH_IN',
  CASH_OUT: 'CASH_OUT',
  ADJUSTMENT: 'ADJUSTMENT',
} as const;
export type CashMovementType = (typeof CASH_MOVEMENT_TYPE)[keyof typeof CASH_MOVEMENT_TYPE];

/** Libro inmutable de entradas y salidas de efectivo de una jornada. */
export class CashMovement extends Model<InferAttributes<CashMovement>, InferCreationAttributes<CashMovement>> {
  declare id: CreationOptional<number>;
  declare sessionId: number;
  declare branchId: number;
  declare type: CashMovementType;
  declare amount: number;
  declare paymentId: CreationOptional<number | null>;
  declare orderId: CreationOptional<number | null>;
  declare reason: string;
  declare actorId: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

CashMovement.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    sessionId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    type: { type: DataTypes.ENUM(...Object.values(CASH_MOVEMENT_TYPE)), allowNull: false },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    paymentId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    orderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    reason: { type: DataTypes.STRING(255), allowNull: false },
    actorId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'CashMovement',
    tableName: 'cash_movements',
    indexes: [
      { name: 'idx_cash_movements_session', fields: ['session_id', 'created_at'] },
      { name: 'idx_cash_movements_payment', fields: ['payment_id'] },
      { name: 'idx_cash_movements_order', fields: ['order_id'] },
    ],
  },
);

export default CashMovement;
