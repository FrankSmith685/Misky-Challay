import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from 'sequelize';
import { sequelize } from '../connection';
import type { ProductNutrition } from './productNutrition.model';
import type { CakeEffort } from './cakeProduction.model';

/** Tabla `product_variants`: la presentacion comprable (Regular, Grande...). */
export class ProductVariant extends Model<
  InferAttributes<ProductVariant>,
  InferCreationAttributes<ProductVariant>
> {
  declare id: CreationOptional<number>;
  declare productId: number;
  declare name: string;
  declare sku: string;
  declare basePrice: number;
  declare servingSize: CreationOptional<number | null>;
  declare servingUnit: CreationOptional<string | null>;
  declare productionMinutesJson: CreationOptional<CakeEffort>;
  declare isDefault: CreationOptional<boolean>;
  declare isActive: CreationOptional<boolean>;
  declare sortOrder: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date | null>;
  declare version: CreationOptional<number>;

  declare nutrition?: NonAttribute<ProductNutrition | null>;
}

ProductVariant.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    productId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    name: { type: DataTypes.STRING(80), allowNull: false },
    sku: { type: DataTypes.STRING(60), allowNull: false },
    basePrice: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    servingSize: { type: DataTypes.DECIMAL(8, 2), allowNull: true },
    servingUnit: { type: DataTypes.STRING(10), allowNull: true, defaultValue: 'g' },
    productionMinutesJson: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
    deletedAt: DataTypes.DATE,
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
  },
  {
    sequelize,
    modelName: 'ProductVariant',
    tableName: 'product_variants',
    paranoid: true,
    indexes: [
      { name: 'uq_product_variants_sku', unique: true, fields: ['sku'] },
      { name: 'idx_product_variants_product', fields: ['product_id'] },
    ],
  },
);

export default ProductVariant;
