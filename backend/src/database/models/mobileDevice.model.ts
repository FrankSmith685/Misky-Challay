import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../connection';

export class MobileDevice extends Model<InferAttributes<MobileDevice>, InferCreationAttributes<MobileDevice>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare expoPushToken: string;
  declare platform: 'android' | 'ios';
  declare deviceId: CreationOptional<string | null>;
  declare appVersion: CreationOptional<string | null>;
  declare isActive: CreationOptional<boolean>;
  declare lastSeenAt: Date;
  declare lastSuccessAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

MobileDevice.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  expoPushToken: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  platform: { type: DataTypes.ENUM('android', 'ios'), allowNull: false },
  deviceId: { type: DataTypes.STRING(160), allowNull: true },
  appVersion: { type: DataTypes.STRING(30), allowNull: true },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  lastSeenAt: { type: DataTypes.DATE, allowNull: false },
  lastSuccessAt: { type: DataTypes.DATE, allowNull: true },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'MobileDevice', tableName: 'mobile_devices', indexes: [{ name: 'idx_mobile_devices_user_active', fields: ['user_id', 'is_active'] }, { name: 'idx_mobile_devices_device_id', fields: ['device_id'] }] });

export default MobileDevice;
