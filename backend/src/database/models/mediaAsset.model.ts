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
  },
  {
    sequelize,
    modelName: 'MediaAsset',
    tableName: 'media_assets',
    paranoid: true,
    indexes: [
      { name: 'uq_media_assets_filename', unique: true, fields: ['filename'] },
      { fields: ['category'] },
      { fields: ['created_at'] },
    ],
  },
);

export default MediaAsset;
