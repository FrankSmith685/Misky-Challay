import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/** Tabla `dietary_tags`: vegano, vegetariano, alto en proteina, sin gluten, bajo en calorias... */
export class DietaryTag extends Model<
  InferAttributes<DietaryTag>,
  InferCreationAttributes<DietaryTag>
> {
  declare id: CreationOptional<number>;
  declare code: string;
  declare name: string;
  declare color: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

DietaryTag.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    code: { type: DataTypes.STRING(40), allowNull: false },
    name: { type: DataTypes.STRING(60), allowNull: false },
    color: { type: DataTypes.STRING(20), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'DietaryTag',
    tableName: 'dietary_tags',
    indexes: [{ name: 'uq_dietary_tags_code', unique: true, fields: ['code'] }],
  },
);

export default DietaryTag;
