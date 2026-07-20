import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

export const REFUND_STATUS = {
  PENDING: 'PENDING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
} as const;
export type RefundStatus = (typeof REFUND_STATUS)[keyof typeof REFUND_STATUS];

/** Tabla `refunds` (RN-019): todo reembolso referencia pago, importe, motivo y responsable. */
export class Refund extends Model<InferAttributes<Refund>, InferCreationAttributes<Refund>> {
  declare id: CreationOptional<number>;
  declare paymentId: number;
  declare amount: number;
  declare reason: string;
  declare status: CreationOptional<RefundStatus>;
  declare providerReference: CreationOptional<string | null>;
  declare approvedBy: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Refund.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    paymentId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    reason: { type: DataTypes.STRING(255), allowNull: false },
    status: {
      type: DataTypes.ENUM(...Object.values(REFUND_STATUS)),
      allowNull: false,
      defaultValue: REFUND_STATUS.PENDING,
    },
    providerReference: { type: DataTypes.STRING(255), allowNull: true },
    approvedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'Refund',
    tableName: 'refunds',
    indexes: [{ name: 'idx_refunds_payment', fields: ['payment_id'] }],
  },
);

export default Refund;
