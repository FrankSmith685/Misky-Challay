import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/**
 * Tabla `payment_attempts`: diagnostico de cada intento contra el proveedor.
 * Guarda solo datos seguros (nunca la tarjeta).
 */
export class PaymentAttempt extends Model<
  InferAttributes<PaymentAttempt>,
  InferCreationAttributes<PaymentAttempt>
> {
  declare id: CreationOptional<number>;
  declare paymentId: number;
  declare idempotencyKey: string;
  declare requestJson: CreationOptional<Record<string, unknown> | null>;
  declare responseJson: CreationOptional<Record<string, unknown> | null>;
  declare success: CreationOptional<boolean>;
  declare errorMessage: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

PaymentAttempt.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    paymentId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    idempotencyKey: { type: DataTypes.STRING(80), allowNull: false },
    requestJson: { type: DataTypes.JSON, allowNull: true },
    responseJson: { type: DataTypes.JSON, allowNull: true },
    success: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    errorMessage: { type: DataTypes.STRING(500), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'PaymentAttempt',
    tableName: 'payment_attempts',
    indexes: [{ name: 'idx_payment_attempts_payment', fields: ['payment_id'] }],
  },
);

export default PaymentAttempt;
