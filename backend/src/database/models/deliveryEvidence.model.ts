import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../connection';

/** Private photos: served only through the scoped delivery endpoints. */
export class DeliveryEvidence extends Model<InferAttributes<DeliveryEvidence>, InferCreationAttributes<DeliveryEvidence>> {
  declare id: CreationOptional<number>;
  declare deliveryId: number;
  declare stage: 'DEPARTURE' | 'ARRIVAL';
  declare mime: string;
  declare bytes: Buffer;
  declare createdBy: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
DeliveryEvidence.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  deliveryId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  stage: { type: DataTypes.STRING(12), allowNull: false }, mime: { type: DataTypes.STRING(40), allowNull: false },
  bytes: { type: DataTypes.BLOB('medium'), allowNull: false },
  createdBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  createdAt: DataTypes.DATE, updatedAt: DataTypes.DATE,
}, { sequelize, tableName: 'delivery_evidence', modelName: 'DeliveryEvidence', indexes: [{ name: 'uq_delivery_evidence_stage', unique: true, fields: ['delivery_id', 'stage'] }] });
