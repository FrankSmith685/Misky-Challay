import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/** Tabla puente `product_allergens`: alergenos declarados de un producto fijo. */
export class ProductAllergen extends Model<
  InferAttributes<ProductAllergen>,
  InferCreationAttributes<ProductAllergen>
> {
  declare id: CreationOptional<number>;
  declare productId: number;
  declare allergenId: number;
  /** CONTAINS o MAY_CONTAIN (trazas). */
  declare level: CreationOptional<string>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

ProductAllergen.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    productId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    allergenId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    level: {
      type: DataTypes.ENUM('CONTAINS', 'MAY_CONTAIN'),
      allowNull: false,
      defaultValue: 'CONTAINS',
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'ProductAllergen',
    tableName: 'product_allergens',
    indexes: [{ unique: true, fields: ['product_id', 'allergen_id'] }],
  },
);

export default ProductAllergen;
