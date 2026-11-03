import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../connection';

export const CAKE_FINANCE_KIND = {
  BUSINESS_EXPENSE: 'BUSINESS_EXPENSE', PLATFORM_EXPENSE: 'PLATFORM_EXPENSE',
  SUPPLIER_PAYMENT: 'SUPPLIER_PAYMENT', PAYMENT_FEE: 'PAYMENT_FEE',
} as const;
export type CakeFinanceKind = (typeof CAKE_FINANCE_KIND)[keyof typeof CAKE_FINANCE_KIND];

/** Libro de egresos y conciliaciones; las compras no se confunden con consumo de receta. */
export class CakeFinanceEntry extends Model<InferAttributes<CakeFinanceEntry>, InferCreationAttributes<CakeFinanceEntry>> {
  declare id: CreationOptional<number>;
  declare kind: CakeFinanceKind;
  declare branchId: CreationOptional<number | null>;
  declare orderId: CreationOptional<number | null>;
  declare purchaseOrderId: CreationOptional<number | null>;
  declare paymentId: CreationOptional<number | null>;
  declare category: string;
  declare amount: number;
  declare netAmount: CreationOptional<number | null>;
  declare reference: string;
  declare occurredAt: Date;
  declare actorId: number;
  declare notes: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

CakeFinanceEntry.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  kind: { type: DataTypes.ENUM(...Object.values(CAKE_FINANCE_KIND)), allowNull: false },
  branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  orderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  purchaseOrderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  paymentId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  category: { type: DataTypes.STRING(40), allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  netAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
  reference: { type: DataTypes.STRING(120), allowNull: false },
  occurredAt: { type: DataTypes.DATE, allowNull: false },
  actorId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  notes: { type: DataTypes.STRING(500), allowNull: true },
  createdAt: DataTypes.DATE, updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'CakeFinanceEntry', tableName: 'cake_finance_entries', indexes: [
  { name: 'idx_cake_finance_branch_date', fields: ['branch_id', 'occurred_at'] },
  { name: 'idx_cake_finance_order', fields: ['order_id'] },
  { name: 'uq_cake_finance_payment', unique: true, fields: ['payment_id'] },
  { name: 'uq_cake_finance_reference', unique: true, fields: ['kind', 'reference'] },
] });
