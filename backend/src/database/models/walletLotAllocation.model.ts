import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/** Traza qué lotes financiaron cada débito para poder auditarlo y devolverlo. */
export class WalletLotAllocation extends Model<
  InferAttributes<WalletLotAllocation>,
  InferCreationAttributes<WalletLotAllocation>
> {
  declare id: CreationOptional<number>;
  declare walletTransactionId: number;
  declare walletCreditLotId: number;
  declare amount: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

WalletLotAllocation.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    walletTransactionId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    walletCreditLotId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'WalletLotAllocation',
    tableName: 'wallet_lot_allocations',
    indexes: [
      {
        name: 'uq_wallet_lot_allocations_tx_lot',
        unique: true,
        fields: ['wallet_transaction_id', 'wallet_credit_lot_id'],
      },
      { name: 'idx_wallet_lot_allocations_lot', fields: ['wallet_credit_lot_id'] },
    ],
  },
);

export default WalletLotAllocation;
