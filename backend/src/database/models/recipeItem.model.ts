import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/** Tabla `recipe_items`: insumo y cantidad que consume una receta (mas la merma estimada). */
export class RecipeItem extends Model<
  InferAttributes<RecipeItem>,
  InferCreationAttributes<RecipeItem>
> {
  declare id: CreationOptional<number>;
  declare recipeId: number;
  declare inventoryItemId: number;
  declare quantity: number;
  /** Merma estimada en porcentaje (5 = 5%). */
  declare wastePercent: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

RecipeItem.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    recipeId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    inventoryItemId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    quantity: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    wastePercent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'RecipeItem',
    tableName: 'recipe_items',
    indexes: [
      { name: 'uq_recipe_items', unique: true, fields: ['recipe_id', 'inventory_item_id'] },
    ],
  },
);

export default RecipeItem;
