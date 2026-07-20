import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../connection';

export type AdminDraftStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'FAILED';

/** Borradores compartidos del panel, persistidos en servidor y publicables por fecha. */
export class AdminDraft extends Model<InferAttributes<AdminDraft>, InferCreationAttributes<AdminDraft>> {
  declare id: CreationOptional<number>;
  declare key: string;
  declare scope: string;
  declare ownerUserId: number;
  declare payload: Record<string, unknown>;
  declare publishAt: CreationOptional<Date | null>;
  declare status: CreationOptional<AdminDraftStatus>;
  declare errorMessage: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

AdminDraft.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  key: { type: DataTypes.STRING(120), allowNull: false },
  scope: { type: DataTypes.STRING(60), allowNull: false },
  ownerUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  payload: { type: DataTypes.JSON, allowNull: false },
  publishAt: { type: DataTypes.DATE, allowNull: true },
  status: { type: DataTypes.ENUM('DRAFT', 'SCHEDULED', 'PUBLISHED', 'FAILED'), allowNull: false, defaultValue: 'DRAFT' },
  errorMessage: { type: DataTypes.STRING(500), allowNull: true },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE,
}, {
  sequelize,
  modelName: 'AdminDraft',
  tableName: 'admin_drafts',
  indexes: [
    { name: 'uq_admin_drafts_key', unique: true, fields: ['key'] },
    { name: 'idx_admin_drafts_schedule', fields: ['status', 'publish_at'] },
  ],
});

export default AdminDraft;
