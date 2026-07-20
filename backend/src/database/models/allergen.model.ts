import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/**
 * Tabla `allergens`: catalogo de alergenos.
 * RN-009: el sistema informa, no garantiza ausencia de contaminacion cruzada.
 */
export class Allergen extends Model<InferAttributes<Allergen>, InferCreationAttributes<Allergen>> {
  declare id: CreationOptional<number>;
  declare code: string;
  declare name: string;
  declare warning: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Allergen.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    code: { type: DataTypes.STRING(40), allowNull: false },
    name: { type: DataTypes.STRING(60), allowNull: false },
    warning: { type: DataTypes.STRING(255), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'Allergen',
    tableName: 'allergens',
    indexes: [{ name: 'uq_allergens_code', unique: true, fields: ['code'] }],
  },
);

export default Allergen;
