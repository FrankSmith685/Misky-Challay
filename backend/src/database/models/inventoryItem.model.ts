import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/**
 * Tabla `inventory_items`: el insumo controlable (salmon, palta, quinoa...).
 * Es la unidad de stock; los productos lo consumen mediante recetas y las
 * opciones del constructor lo consumen directamente.
 */
export class InventoryItem extends Model<
  InferAttributes<InventoryItem>,
  InferCreationAttributes<InventoryItem>
> {
  declare id: CreationOptional<number>;
  declare code: string;
  declare name: string;
  declare itemType: CreationOptional<'INGREDIENT' | 'FINISHED_PRODUCT'>;
  /** g, ml, unidad... */
  declare unit: CreationOptional<string>;
  declare unitCost: CreationOptional<number>;
  declare imageUrl: CreationOptional<string | null>;
  /** null = pendiente de clasificar; [] = revisado sin alérgenos de la lista. */
  declare allergens: CreationOptional<string[] | null>;
  /** Debajo de este nivel se avisa para reponer. */
  declare minLevel: CreationOptional<number>;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

InventoryItem.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    itemType: { type: DataTypes.ENUM('INGREDIENT', 'FINISHED_PRODUCT'), allowNull: false, defaultValue: 'INGREDIENT' },
    code: { type: DataTypes.STRING(40), allowNull: false },
    name: { type: DataTypes.STRING(80), allowNull: false },
    unit: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'g' },
    unitCost: { type: DataTypes.DECIMAL(12, 4), allowNull: false, defaultValue: 0 },
    imageUrl: { type: DataTypes.STRING(255), allowNull: true },
    allergens: { type: DataTypes.JSON, allowNull: true, defaultValue: null },
    minLevel: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'InventoryItem',
    tableName: 'inventory_items',
    indexes: [{ name: 'uq_inventory_items_code', unique: true, fields: ['code'] }],
  },
);

export default InventoryItem;
