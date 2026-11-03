import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../connection';

/** Transferencias efectivamente registradas a favor de la plataforma. */
export class CakeCommissionSettlement extends Model<InferAttributes<CakeCommissionSettlement>, InferCreationAttributes<CakeCommissionSettlement>> {
  declare id: CreationOptional<number>;
  declare commissionId: number;
  declare amount: number;
  declare reference: string;
  declare actorId: number;
  declare notes: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

CakeCommissionSettlement.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  commissionId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  reference: { type: DataTypes.STRING(120), allowNull: false },
  actorId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  notes: { type: DataTypes.STRING(500), allowNull: true },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'CakeCommissionSettlement', tableName: 'cake_commission_settlements', indexes: [
  { name: 'idx_cake_settlement_commission', fields: ['commission_id'] },
  { name: 'uq_cake_settlement_reference', unique: true, fields: ['reference'] },
] });
