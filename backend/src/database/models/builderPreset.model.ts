import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from 'sequelize';
import { sequelize } from '../connection';
import type { BuilderPresetItem } from './builderPresetItem.model';

/** Combinacion recomendada que el cliente puede aplicar con un toque. */
export class BuilderPreset extends Model<
  InferAttributes<BuilderPreset>,
  InferCreationAttributes<BuilderPreset>
> {
  declare id: CreationOptional<number>;
  declare productId: number;
  declare code: string;
  declare name: string;
  declare description: CreationOptional<string | null>;
  declare imageUrl: CreationOptional<string | null>;
  declare badge: CreationOptional<string | null>;
  declare isFeatured: CreationOptional<boolean>;
  declare isActive: CreationOptional<boolean>;
  declare sortOrder: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare items?: NonAttribute<BuilderPresetItem[]>;
}

BuilderPreset.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    productId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    code: { type: DataTypes.STRING(60), allowNull: false },
    name: { type: DataTypes.STRING(100), allowNull: false },
    description: { type: DataTypes.STRING(255), allowNull: true },
    imageUrl: { type: DataTypes.STRING(255), allowNull: true },
    badge: { type: DataTypes.STRING(40), allowNull: true },
    isFeatured: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'BuilderPreset',
    tableName: 'builder_presets',
    indexes: [
      { name: 'uq_builder_presets_product_code', unique: true, fields: ['product_id', 'code'] },
      { fields: ['product_id', 'is_active', 'sort_order'] },
    ],
  },
);

export default BuilderPreset;
