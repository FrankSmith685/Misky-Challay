import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/**
 * Version publicada del constructor. Las tablas de edición pueden cambiar sin
 * alterar el configurador público hasta que el superadmin publique una versión.
 */
export class BuilderRelease extends Model<
  InferAttributes<BuilderRelease>,
  InferCreationAttributes<BuilderRelease>
> {
  declare id: CreationOptional<number>;
  declare productId: number;
  declare version: number;
  declare snapshotJson: Record<string, unknown>;
  declare publishedBy: CreationOptional<number | null>;
  declare publishedAt: CreationOptional<Date>;
  declare idempotencyKey: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

BuilderRelease.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    productId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    snapshotJson: { type: DataTypes.JSON, allowNull: false },
    publishedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    publishedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    idempotencyKey: { type: DataTypes.STRING(100), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'BuilderRelease',
    tableName: 'builder_releases',
    indexes: [
      { name: 'uq_builder_releases_product_version', unique: true, fields: ['product_id', 'version'] },
      { name: 'idx_builder_releases_product_date', fields: ['product_id', 'published_at'] },
      { name: 'uq_builder_releases_idempotency', unique: true, fields: ['idempotency_key'] },
    ],
  },
);

export default BuilderRelease;
