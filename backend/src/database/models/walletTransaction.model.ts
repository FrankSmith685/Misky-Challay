import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';
import { WALLET_TX_TYPE, type WalletTxType } from '@config/constants';

/**
 * Tabla `wallet_transactions` (seccion 14.6): el LIBRO MAYOR del saldo.
 *
 * RN-013: todo credito o debito pasa por aqui. El saldo nunca se edita a mano;
 * si hay un error, se corrige con un movimiento nuevo, no borrando el pasado.
 *
 * `idempotencyKey` impide duplicar un movimiento (ej. reintento del webhook).
 * `balanceAfter` congela el saldo resultante: permite auditar sin recalcular.
 */
export class WalletTransaction extends Model<
  InferAttributes<WalletTransaction>,
  InferCreationAttributes<WalletTransaction>
> {
  declare id: CreationOptional<number>;
  declare walletId: number;
  declare type: WalletTxType;
  /** Siempre positivo: el tipo define el sentido. */
  declare amount: number;
  declare balanceAfter: number;
  declare userPlanId: CreationOptional<number | null>;
  declare orderId: CreationOptional<number | null>;
  /** Vencimiento del lote de saldo acreditado (los creditos lo llevan). */
  declare expiresAt: CreationOptional<Date | null>;
  declare idempotencyKey: string;
  declare description: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

WalletTransaction.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    walletId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    type: { type: DataTypes.ENUM(...Object.values(WALLET_TX_TYPE)), allowNull: false },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    balanceAfter: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    userPlanId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    orderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    expiresAt: { type: DataTypes.DATE, allowNull: true },
    idempotencyKey: { type: DataTypes.STRING(100), allowNull: false },
    description: { type: DataTypes.STRING(200), allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'WalletTransaction',
    tableName: 'wallet_transactions',
    indexes: [
      { name: 'uq_wallet_tx_idempotency', unique: true, fields: ['idempotency_key'] },
      { name: 'idx_wallet_tx_wallet', fields: ['wallet_id'] },
      { name: 'idx_wallet_tx_order', fields: ['order_id'] },
    ],
  },
);

export default WalletTransaction;
