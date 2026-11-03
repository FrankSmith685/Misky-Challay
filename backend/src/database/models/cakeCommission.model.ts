import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../connection';

export const CAKE_COMMISSION_STATUS = { PENDING: 'PENDING', LIQUIDATED: 'LIQUIDATED' } as const;
export type CakeCommissionStatus = (typeof CAKE_COMMISSION_STATUS)[keyof typeof CAKE_COMMISSION_STATUS];

/** Liquidación congelada por pedido: base, tasa, ajustes y reembolsos. */
export class CakeCommission extends Model<InferAttributes<CakeCommission>, InferCreationAttributes<CakeCommission>> {
  declare id: CreationOptional<number>;
  declare orderId: number;
  declare baseAmount: number;
  declare rate: number;
  declare adjustmentAmount: CreationOptional<number>;
  declare refundAmount: CreationOptional<number>;
  declare commissionAmount: number;
  declare status: CreationOptional<CakeCommissionStatus>;
  declare liquidatedAt: CreationOptional<Date | null>;
  declare liquidatedBy: CreationOptional<number | null>;
  declare notes: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

CakeCommission.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  orderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  baseAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  rate: { type: DataTypes.DECIMAL(5, 4), allowNull: false, defaultValue: 0.15 },
  adjustmentAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  refundAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  commissionAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  status: { type: DataTypes.ENUM(...Object.values(CAKE_COMMISSION_STATUS)), allowNull: false, defaultValue: CAKE_COMMISSION_STATUS.PENDING },
  liquidatedAt: { type: DataTypes.DATE, allowNull: true },
  liquidatedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  notes: { type: DataTypes.STRING(500), allowNull: true },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE,
}, {
  sequelize,
  modelName: 'CakeCommission',
  tableName: 'cake_commissions',
  indexes: [{ name: 'uq_cake_commission_order', unique: true, fields: ['order_id'] }, { name: 'idx_cake_commission_status', fields: ['status'] }],
});

export default CakeCommission;
