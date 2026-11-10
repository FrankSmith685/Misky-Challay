import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/** Archivo optimizado disponible en la biblioteca visual del panel. */
export class MediaAsset extends Model<InferAttributes<MediaAsset>, InferCreationAttributes<MediaAsset>> {
  declare id: CreationOptional<number>;
  declare originalName: string;
  declare filename: string;
  declare mimeType: string;
  declare sizeBytes: number;
  declare url: string;
  declare altText: CreationOptional<string | null>;
  declare category: CreationOptional<string>;
  declare createdBy: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date | null>;
  declare sha256: CreationOptional<string | null>;
  declare width: CreationOptional<number | null>;
  declare height: CreationOptional<number | null>;
  declare reviewStatus: CreationOptional<'APPROVED' | 'DRAFT' | 'ARCHIVED'>;
  declare sourceType: CreationOptional<'UPLOAD' | 'URL' | 'AI' | 'PROFILE'>;
  declare sourcePrompt: CreationOptional<string | null>;
}

MediaAsset.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    originalName: { type: DataTypes.STRING(180), allowNull: false },
    filename: { type: DataTypes.STRING(180), allowNull: false },
    mimeType: { type: DataTypes.STRING(80), allowNull: false },
    sizeBytes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    url: { type: DataTypes.STRING(255), allowNull: false },
    altText: { type: DataTypes.STRING(180), allowNull: true },
    category: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'ingredients' },
    createdBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
    deletedAt: DataTypes.DATE,
    sha256: { type: DataTypes.STRING(64), allowNull: true },
    width: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    height: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    reviewStatus: { type: DataTypes.ENUM('APPROVED', 'DRAFT', 'ARCHIVED'), allowNull: false, defaultValue: 'APPROVED' },
    sourceType: { type: DataTypes.ENUM('UPLOAD', 'URL', 'AI', 'PROFILE'), allowNull: false, defaultValue: 'UPLOAD' },
    sourcePrompt: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    modelName: 'MediaAsset',
    tableName: 'media_assets',
    paranoid: true,
    indexes: [
      { name: 'uq_media_assets_filename', unique: true, fields: ['filename'] },
      { name: 'uq_media_assets_sha256', unique: true, fields: ['sha256'] },
      { fields: ['category'] },
      { fields: ['review_status'] },
      { fields: ['created_at'] },
    ],
  },
);

export default MediaAsset;
