import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';
import { CURRENCY, PAYMENT_STATUS, type PaymentStatus } from '@config/constants';

export const PAYABLE_TYPE = {
  ORDER: 'ORDER',
  PLAN_PURCHASE: 'PLAN_PURCHASE',
} as const;
export const PAYMENT_STAGE = { FULL: 'FULL', DEPOSIT: 'DEPOSIT', BALANCE: 'BALANCE' } as const;
export type PaymentStage = (typeof PAYMENT_STAGE)[keyof typeof PAYMENT_STAGE];
export type PayableType = (typeof PAYABLE_TYPE)[keyof typeof PAYABLE_TYPE];

/**
 * Tabla `payments` (seccion 14.7).
 * NUNCA guarda datos de tarjeta: solo el importe, el proveedor, su referencia y
 * una respuesta depurada. El estado real lo dicta el webhook (RN-014).
 */
export class Payment extends Model<InferAttributes<Payment>, InferCreationAttributes<Payment>> {
  declare id: CreationOptional<number>;
  declare payableType: CreationOptional<PayableType>;
  declare payableId: number;
  declare userId: CreationOptional<number | null>;

  declare provider: string;
  /** Referencia de la sesión u order en la pasarela. */
  declare providerReference: CreationOptional<string | null>;
  declare method: CreationOptional<string | null>;

  declare amount: number;
  declare stage: CreationOptional<PaymentStage>;
  declare currency: CreationOptional<string>;
  declare status: CreationOptional<PaymentStatus>;
  /** RN-015: la misma clave no crea dos cobros. */
  declare idempotencyKey: string;

  declare checkoutUrl: CreationOptional<string | null>;
  declare failureReason: CreationOptional<string | null>;
  declare safeResponseJson: CreationOptional<Record<string, unknown> | null>;

  declare authorizedAt: CreationOptional<Date | null>;
  declare capturedAt: CreationOptional<Date | null>;
  declare failedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Payment.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    payableType: {
      type: DataTypes.ENUM(...Object.values(PAYABLE_TYPE)),
      allowNull: false,
      defaultValue: PAYABLE_TYPE.ORDER,
    },
    payableId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },

    provider: { type: DataTypes.STRING(30), allowNull: false },
    providerReference: { type: DataTypes.STRING(255), allowNull: true },
    method: { type: DataTypes.STRING(30), allowNull: true },

    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    stage: { type: DataTypes.ENUM(...Object.values(PAYMENT_STAGE)), allowNull: false, defaultValue: PAYMENT_STAGE.FULL },
    currency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: CURRENCY },
    status: {
      type: DataTypes.ENUM(...Object.values(PAYMENT_STATUS)),
      allowNull: false,
      defaultValue: PAYMENT_STATUS.CREATED,
    },
    idempotencyKey: { type: DataTypes.STRING(80), allowNull: false },

    checkoutUrl: { type: DataTypes.STRING(500), allowNull: true },
    failureReason: { type: DataTypes.STRING(255), allowNull: true },
    safeResponseJson: { type: DataTypes.JSON, allowNull: true },

    authorizedAt: { type: DataTypes.DATE, allowNull: true },
    capturedAt: { type: DataTypes.DATE, allowNull: true },
    failedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'Payment',
    tableName: 'payments',
    indexes: [
      { name: 'uq_payments_idempotency', unique: true, fields: ['idempotency_key'] },
      { name: 'idx_payments_reference', fields: ['provider_reference'] },
      { name: 'idx_payments_payable', fields: ['payable_type', 'payable_id'] },
      { name: 'idx_payments_status', fields: ['status'] },
    ],
  },
);

export default Payment;
