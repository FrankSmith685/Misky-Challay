import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/**
 * Producto ofrecido en salón con reglas propias de una sucursal.
 *
 * El producto y su variante siguen siendo los dueños de receta, nutrición e
 * inventario. Esta fila solo decide cuándo se vende en salón, a qué precio y
 * cuántas porciones pueden salir ese día.
 */
export class DiningOffering extends Model<
  InferAttributes<DiningOffering>,
  InferCreationAttributes<DiningOffering>
> {
  declare id: CreationOptional<number>;
  declare branchId: number;
  declare productId: number;
  declare variantId: number;
  declare name: string;
  declare price: number;
  declare weekdaysJson: CreationOptional<number[]>;
  declare startsAt: CreationOptional<string>;
  declare endsAt: CreationOptional<string>;
  declare dailyLimit: CreationOptional<number | null>;
  declare soldDate: CreationOptional<string | null>;
  declare soldCount: CreationOptional<number>;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

DiningOffering.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    productId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    variantId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: false },
    price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    weekdaysJson: { type: DataTypes.JSON, allowNull: false, defaultValue: [1, 2, 3, 4, 5] },
    startsAt: { type: DataTypes.TIME, allowNull: false, defaultValue: '11:00:00' },
    endsAt: { type: DataTypes.TIME, allowNull: false, defaultValue: '16:00:00' },
    dailyLimit: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    soldDate: { type: DataTypes.DATEONLY, allowNull: true },
    soldCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'DiningOffering',
    tableName: 'dining_offerings',
    indexes: [
      { name: 'idx_dining_offerings_branch_active', fields: ['branch_id', 'is_active'] },
      { name: 'idx_dining_offerings_product_variant', fields: ['product_id', 'variant_id'] },
    ],
  },
);

export default DiningOffering;
