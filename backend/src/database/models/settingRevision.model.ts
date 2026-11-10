import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../connection';

export type SettingRevisionScope = 'business' | 'local-payments' | 'receipts' | 'communication' | 'theme';

export class SettingRevision extends Model<InferAttributes<SettingRevision>, InferCreationAttributes<SettingRevision>> {
  declare id: CreationOptional<number>;
  declare scope: SettingRevisionScope;
  declare version: number;
  declare snapshotEncrypted: string;
  declare actorId: number | null;
  declare reason: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

SettingRevision.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  scope: { type: DataTypes.ENUM('business', 'local-payments', 'receipts', 'communication', 'theme'), allowNull: false },
  version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  snapshotEncrypted: { field: 'snapshot_encrypted', type: DataTypes.TEXT, allowNull: false },
  actorId: { field: 'actor_id', type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  reason: { type: DataTypes.STRING(255), allowNull: false },
  createdAt: { field: 'created_at', type: DataTypes.DATE },
  updatedAt: { field: 'updated_at', type: DataTypes.DATE },
}, { sequelize, modelName: 'SettingRevision', tableName: 'setting_revisions', indexes: [{ name: 'idx_setting_revisions_scope_version', fields: ['scope', 'version'] }] });

export default SettingRevision;
