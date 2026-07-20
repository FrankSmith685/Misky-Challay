import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../connection';

export const UX_EVENT_TYPES = ['COVERAGE_SUCCESS', 'COVERAGE_FAIL', 'COVERAGE_ERROR', 'CHECKOUT_START', 'CHECKOUT_ERROR', 'PAYMENT_REDIRECT'] as const;
export type UxEventType = (typeof UX_EVENT_TYPES)[number];

export class UxEvent extends Model<InferAttributes<UxEvent>, InferCreationAttributes<UxEvent>> {
  declare id: CreationOptional<number>;
  declare sessionId: string;
  declare userId: CreationOptional<number | null>;
  declare eventType: UxEventType;
  declare metadata: CreationOptional<Record<string, unknown> | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

UxEvent.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  sessionId: { type: DataTypes.STRING(64), allowNull: false },
  userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  eventType: { type: DataTypes.ENUM(...UX_EVENT_TYPES), allowNull: false },
  metadata: { type: DataTypes.JSON, allowNull: true },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'UxEvent', tableName: 'ux_events', indexes: [{ fields: ['event_type', 'created_at'] }, { fields: ['session_id'] }] });

export default UxEvent;
