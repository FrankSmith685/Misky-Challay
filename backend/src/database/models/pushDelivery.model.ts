import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../connection';

export class PushDelivery extends Model<InferAttributes<PushDelivery>, InferCreationAttributes<PushDelivery>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare deviceId: number;
  declare idempotencyKey: string;
  declare payload: Record<string, unknown>;
  declare state: CreationOptional<string>;
  declare attempts: CreationOptional<number>;
  declare availableAt: CreationOptional<Date>;
  declare lockedAt: CreationOptional<Date | null>;
  declare ticketId: CreationOptional<string | null>;
  declare error: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
PushDelivery.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  deviceId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  idempotencyKey: { type: DataTypes.STRING(180), allowNull: false, unique: true },
  payload: { type: DataTypes.JSON, allowNull: false },
  state: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'QUEUED' },
  attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  availableAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  lockedAt: { type: DataTypes.DATE, allowNull: true },
  ticketId: { type: DataTypes.STRING(200), allowNull: true },
  error: { type: DataTypes.STRING(500), allowNull: true },
  createdAt: DataTypes.DATE, updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'PushDelivery', tableName: 'push_deliveries', indexes: [{ name: 'idx_push_deliveries_queue', fields: ['state', 'available_at'] }] });
