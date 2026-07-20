import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/**
 * Tabla `product_nutrition` (seccion 13.3).
 * Decision de Fase 0: la nutricion se CARGA MANUAL por variante.
 * Cuando se pase a calculo por receta, esta tabla se llenara automaticamente
 * desde ingredient_nutrition sin cambiar la API.
 */
export class ProductNutrition extends Model<
  InferAttributes<ProductNutrition>,
  InferCreationAttributes<ProductNutrition>
> {
  declare id: CreationOptional<number>;
  declare productId: number;
  declare variantId: CreationOptional<number | null>;
  declare calories: number;
  declare protein: number;
  declare carbs: number;
  declare fat: number;
  declare fiber: CreationOptional<number>;
  declare sodium: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

ProductNutrition.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    productId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    variantId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    calories: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
    protein: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
    carbs: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
    fat: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
    fiber: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
    sodium: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'ProductNutrition',
    tableName: 'product_nutrition',
    indexes: [{ unique: true, fields: ['variant_id'] }, { fields: ['product_id'] }],
  },
);

export default ProductNutrition;
