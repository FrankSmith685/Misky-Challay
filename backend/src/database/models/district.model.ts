import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/**
 * Tabla `districts`: division administrativa usada para direcciones y reportes.
 * `coverageZoneId` permite resolver la cobertura sin geocodificar (el cliente elige distrito).
 */
export class District extends Model<InferAttributes<District>, InferCreationAttributes<District>> {
  declare id: CreationOptional<number>;
  declare cityId: number;
  declare coverageZoneId: CreationOptional<number | null>;
  /** Código oficial INEI de 6 dígitos (departamento + provincia + distrito). */
  declare ubigeoCode: CreationOptional<string | null>;
  declare name: string;
  declare slug: string;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

District.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    cityId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    coverageZoneId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    ubigeoCode: { type: DataTypes.STRING(6), allowNull: true },
    name: { type: DataTypes.STRING(80), allowNull: false },
    slug: { type: DataTypes.STRING(80), allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'District',
    tableName: 'districts',
    indexes: [
      { unique: true, fields: ['city_id', 'slug'] },
      { name: 'uq_districts_ubigeo_code', unique: true, fields: ['ubigeo_code'] },
    ],
  },
);

export default District;
