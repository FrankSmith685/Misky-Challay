import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from 'sequelize';
import { sequelize } from '../connection';
import { PRODUCT_TYPE, type ProductType } from '@config/constants';
import type { ProductVariant } from './productVariant.model';

export const PRODUCT_STATUS = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;
export type ProductStatus = (typeof PRODUCT_STATUS)[keyof typeof PRODUCT_STATUS];

/**
 * Tabla `products` (seccion 14.2).
 * FIXED        -> se vende tal cual (con variantes de tamano).
 * CUSTOMIZABLE -> pasa por el constructor de bowls (grupos y opciones).
 */
export class Product extends Model<InferAttributes<Product>, InferCreationAttributes<Product>> {
  declare id: CreationOptional<number>;
  declare categoryId: number;
  declare type: CreationOptional<ProductType>;
  declare name: string;
  declare slug: string;
  declare description: CreationOptional<string | null>;
  declare imageUrl: CreationOptional<string | null>;
  declare imageAlt: CreationOptional<string | null>;
  declare imagePosition: CreationOptional<string>;
  declare status: CreationOptional<ProductStatus>;
  declare isFeatured: CreationOptional<boolean>;
  declare sortOrder: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date | null>;

  declare variants?: NonAttribute<ProductVariant[]>;
}

Product.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    categoryId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    type: {
      type: DataTypes.ENUM(...Object.values(PRODUCT_TYPE)),
      allowNull: false,
      defaultValue: PRODUCT_TYPE.FIXED,
    },
    name: { type: DataTypes.STRING(120), allowNull: false },
    slug: { type: DataTypes.STRING(120), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    imageUrl: { type: DataTypes.STRING(255), allowNull: true },
    imageAlt: { type: DataTypes.STRING(180), allowNull: true },
    imagePosition: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '50% 50%' },
    status: {
      type: DataTypes.ENUM(...Object.values(PRODUCT_STATUS)),
      allowNull: false,
      defaultValue: PRODUCT_STATUS.ACTIVE,
    },
    isFeatured: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
    deletedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'Product',
    tableName: 'products',
    paranoid: true,
    indexes: [
      { name: 'uq_products_slug', unique: true, fields: ['slug'] },
      { name: 'idx_products_category', fields: ['category_id'] },
      { name: 'idx_products_status', fields: ['status'] },
    ],
  },
);

export default Product;
