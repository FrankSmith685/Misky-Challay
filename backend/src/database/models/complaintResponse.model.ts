import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../connection';

export type ComplaintResponseStatus = 'IN_PROGRESS' | 'RESOLVED';
export type ComplaintNotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SIMULATED';

export class ComplaintResponse extends Model<InferAttributes<ComplaintResponse>, InferCreationAttributes<ComplaintResponse>> {
  declare id: CreationOptional<number>;
  declare complaintId: number;
  declare version: number;
  declare response: string;
  declare status: ComplaintResponseStatus;
  declare actorId: CreationOptional<number | null>;
  declare reason: CreationOptional<string | null>;
  declare notificationStatus: CreationOptional<ComplaintNotificationStatus>;
  declare notificationError: CreationOptional<string | null>;
  declare sentAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

ComplaintResponse.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  complaintId: { field: 'complaint_id', type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  response: { type: DataTypes.TEXT, allowNull: false },
  status: { type: DataTypes.ENUM('IN_PROGRESS', 'RESOLVED'), allowNull: false },
  actorId: { field: 'actor_id', type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  reason: { type: DataTypes.STRING(500), allowNull: true },
  notificationStatus: { field: 'notification_status', type: DataTypes.ENUM('PENDING', 'SENT', 'FAILED', 'SIMULATED'), allowNull: false, defaultValue: 'PENDING' },
  notificationError: { field: 'notification_error', type: DataTypes.STRING(500), allowNull: true },
  sentAt: { field: 'sent_at', type: DataTypes.DATE, allowNull: true },
  createdAt: { field: 'created_at', type: DataTypes.DATE },
  updatedAt: { field: 'updated_at', type: DataTypes.DATE },
}, {
  sequelize,
  modelName: 'ComplaintResponse',
  tableName: 'complaint_responses',
  indexes: [
    { name: 'uq_complaint_responses_version', unique: true, fields: ['complaint_id', 'version'] },
    { name: 'idx_complaint_responses_notification', fields: ['notification_status'] },
  ],
});

export default ComplaintResponse;
