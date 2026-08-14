import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';
import {
  WALLET_LOT_KIND,
  WALLET_LOT_STATUS,
  type WalletLotKind,
  type WalletLotStatus,
} from '@config/constants';

/**
 * Una bolsa independiente de saldo.
 *
 * La billetera conserva un total para lecturas rápidas, pero esta tabla determina
 * qué dinero se gasta y qué importe puede vencer. Así una compra antigua nunca
 * anula el saldo de una compra posterior.
 */
export class WalletCreditLot extends Model<
  InferAttributes<WalletCreditLot>,
  InferCreationAttributes<WalletCreditLot>
> {
  declare id: CreationOptional<number>;
  declare walletId: number;
  declare userPlanId: CreationOptional<number | null>;
  declare sourceTransactionId: CreationOptional<number | null>;
  declare kind: WalletLotKind;
  declare initialAmount: number;
  declare remainingAmount: number;
  declare expiresAt: CreationOptional<Date | null>;
  declare status: CreationOptional<WalletLotStatus>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

WalletCreditLot.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    walletId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    userPlanId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    sourceTransactionId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    kind: { type: DataTypes.ENUM(...Object.values(WALLET_LOT_KIND)), allowNull: false },
    initialAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    remainingAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    expiresAt: { type: DataTypes.DATE, allowNull: true },
    status: {
      type: DataTypes.ENUM(...Object.values(WALLET_LOT_STATUS)),
      allowNull: false,
      defaultValue: WALLET_LOT_STATUS.ACTIVE,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'WalletCreditLot',
    tableName: 'wallet_credit_lots',
    indexes: [
      { name: 'uq_wallet_credit_lots_source_tx', unique: true, fields: ['source_transaction_id'] },
      { name: 'idx_wallet_credit_lots_spend', fields: ['wallet_id', 'status', 'expires_at'] },
      { name: 'idx_wallet_credit_lots_plan', fields: ['user_plan_id'] },
    ],
  },
);

export default WalletCreditLot;
