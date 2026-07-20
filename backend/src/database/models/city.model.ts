import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/** Tabla `cities`: ciudad operativa con su zona horaria (seccion 13.2). */
export class City extends Model<InferAttributes<City>, InferCreationAttributes<City>> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare slug: string;
  declare country: CreationOptional<string>;
  declare currency: CreationOptional<string>;
  declare timezone: CreationOptional<string>;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

City.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(80), allowNull: false },
    slug: { type: DataTypes.STRING(80), allowNull: false },
    country: { type: DataTypes.STRING(2), allowNull: false, defaultValue: 'PE' },
    currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'PEN' },
    timezone: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'America/Lima' },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'City',
    tableName: 'cities',
    indexes: [{ name: 'uq_cities_slug', unique: true, fields: ['slug'] }],
  },
);

export default City;
