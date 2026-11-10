import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/**
 * Tabla puente `product_customization_groups`: permite reutilizar un grupo en varios
 * productos y ajustar sus reglas por producto (un bowl grande puede incluir mas
 * toppings gratis que uno regular). Si un override es null, manda el valor del grupo.
 */
export class ProductCustomizationGroup extends Model<
  InferAttributes<ProductCustomizationGroup>,
  InferCreationAttributes<ProductCustomizationGroup>
> {
  declare id: CreationOptional<number>;
  declare productId: number;
  declare groupId: number;
  declare variantId: CreationOptional<number | null>;
  declare minSelectionOverride: CreationOptional<number | null>;
  declare maxSelectionOverride: CreationOptional<number | null>;
  declare freeQuantityOverride: CreationOptional<number | null>;
  declare sortOrder: CreationOptional<number>;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare version: CreationOptional<number>;
}

ProductCustomizationGroup.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    productId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    groupId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    variantId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    minSelectionOverride: { type: DataTypes.INTEGER, allowNull: true },
    maxSelectionOverride: { type: DataTypes.INTEGER, allowNull: true },
    freeQuantityOverride: { type: DataTypes.INTEGER, allowNull: true },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
  },
  {
    sequelize,
    modelName: 'ProductCustomizationGroup',
    tableName: 'product_customization_groups',
    indexes: [
      {
        name: 'uq_product_customization_groups',
        unique: true,
        fields: ['product_id', 'group_id', 'variant_id'],
      },
    ],
  },
);

export default ProductCustomizationGroup;
