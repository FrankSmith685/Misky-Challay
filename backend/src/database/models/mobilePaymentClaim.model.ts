import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

export const MOBILE_PAYMENT_PROVIDER = { YAPE: 'yape', PLIN: 'plin' } as const;
export type MobilePaymentProvider = (typeof MOBILE_PAYMENT_PROVIDER)[keyof typeof MOBILE_PAYMENT_PROVIDER];

export const MOBILE_PAYMENT_CLAIM_STATUS = {
  PENDING: 'PENDING', OBSERVED: 'OBSERVED', APPROVED: 'APPROVED', REJECTED: 'REJECTED',
} as const;
export type MobilePaymentClaimStatus = (typeof MOBILE_PAYMENT_CLAIM_STATUS)[keyof typeof MOBILE_PAYMENT_CLAIM_STATUS];

/** Declaracion del cliente que Caja contrasta contra el movimiento real de Yape/Plin. */
export class MobilePaymentClaim extends Model<
  InferAttributes<MobilePaymentClaim>,
  InferCreationAttributes<MobilePaymentClaim>
> {
  declare id: CreationOptional<number>;
  declare paymentId: number;
  declare provider: MobilePaymentProvider;
  declare operationCode: string;
  declare payerPhone: CreationOptional<string | null>;
  declare payerName: CreationOptional<string | null>;
  declare paidAt: CreationOptional<Date | null>;
  declare declaredAmount: CreationOptional<number | null>;
  declare status: CreationOptional<MobilePaymentClaimStatus>;
  declare submittedAt: CreationOptional<Date>;
  declare reviewedBy: CreationOptional<number | null>;
  declare reviewedAt: CreationOptional<Date | null>;
  declare rejectionReason: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

MobilePaymentClaim.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    paymentId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    provider: { type: DataTypes.ENUM(...Object.values(MOBILE_PAYMENT_PROVIDER)), allowNull: false },
    operationCode: { type: DataTypes.STRING(24), allowNull: false },
    payerPhone: { type: DataTypes.STRING(20), allowNull: true },
    payerName: { type: DataTypes.STRING(120), allowNull: true },
    paidAt: { type: DataTypes.DATE, allowNull: true },
    declaredAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    status: {
      type: DataTypes.ENUM(...Object.values(MOBILE_PAYMENT_CLAIM_STATUS)),
      allowNull: false,
      defaultValue: MOBILE_PAYMENT_CLAIM_STATUS.PENDING,
    },
    submittedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    reviewedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    reviewedAt: { type: DataTypes.DATE, allowNull: true },
    rejectionReason: { type: DataTypes.STRING(255), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'MobilePaymentClaim',
    tableName: 'mobile_payment_claims',
    indexes: [
      { name: 'uq_mobile_payment_claim_payment', unique: true, fields: ['payment_id'] },
      { name: 'uq_mobile_payment_claim_operation', unique: true, fields: ['provider', 'operation_code'] },
      { name: 'idx_mobile_payment_claim_status', fields: ['status', 'submitted_at'] },
    ],
  },
);

export default MobilePaymentClaim;
