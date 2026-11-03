import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../connection';

/** Transactional change log and notification outbox, shared by all API instances. */
export class AppEvent extends Model<InferAttributes<AppEvent>, InferCreationAttributes<AppEvent>> {
  declare id: CreationOptional<number>;
  declare topic: string;
  declare model: string;
  declare entityId: number;
  declare branchId: CreationOptional<number | null>;
  declare userId: CreationOptional<number | null>;
  declare payload: CreationOptional<Record<string, unknown>>;
  declare state: CreationOptional<string>;
  declare attempts: CreationOptional<number>;
  declare availableAt: CreationOptional<Date>;
  declare lockedAt: CreationOptional<Date | null>;
  declare error: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
AppEvent.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  topic: { type: DataTypes.STRING(40), allowNull: false },
  model: { type: DataTypes.STRING(60), allowNull: false },
  entityId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  payload: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  state: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'DONE' },
  attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  availableAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  lockedAt: { type: DataTypes.DATE, allowNull: true },
  error: { type: DataTypes.STRING(500), allowNull: true },
  createdAt: DataTypes.DATE, updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'AppEvent', tableName: 'app_events', indexes: [
  { name: 'idx_app_events_queue', fields: ['state', 'available_at'] }, { name: 'idx_app_events_retention', fields: ['created_at', 'id'] },
] });
