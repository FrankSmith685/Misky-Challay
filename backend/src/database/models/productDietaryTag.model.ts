import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/** Tabla puente `product_dietary_tags`: facilita los filtros del menu. */
export class ProductDietaryTag extends Model<
  InferAttributes<ProductDietaryTag>,
  InferCreationAttributes<ProductDietaryTag>
> {
  declare id: CreationOptional<number>;
  declare productId: number;
  declare dietaryTagId: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

ProductDietaryTag.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    productId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    dietaryTagId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'ProductDietaryTag',
    tableName: 'product_dietary_tags',
    indexes: [{ unique: true, fields: ['product_id', 'dietary_tag_id'] }],
  },
);

export default ProductDietaryTag;
