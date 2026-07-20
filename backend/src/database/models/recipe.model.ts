import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from 'sequelize';
import { sequelize } from '../connection';
import type { RecipeItem } from './recipeItem.model';

/**
 * Tabla `recipes`: que insumos consume una variante de producto.
 * Solo la usan los productos FIJOS; en los bowls personalizados el consumo lo
 * define cada opcion elegida.
 */
export class Recipe extends Model<InferAttributes<Recipe>, InferCreationAttributes<Recipe>> {
  declare id: CreationOptional<number>;
  declare productId: number;
  declare variantId: number;
  declare yieldQuantity: CreationOptional<number>;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare items?: NonAttribute<RecipeItem[]>;
}

Recipe.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    productId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    variantId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    yieldQuantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'Recipe',
    tableName: 'recipes',
    indexes: [{ name: 'uq_recipes_variant', unique: true, fields: ['variant_id'] }],
  },
);

export default Recipe;
