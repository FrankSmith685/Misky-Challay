import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/** Tabla `addresses`: libreta de direcciones del cliente; se valida contra coverage_zones. */
export class Address extends Model<InferAttributes<Address>, InferCreationAttributes<Address>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare label: string;
  declare line1: string;
  declare reference: CreationOptional<string | null>;
  declare districtId: CreationOptional<number | null>;
  declare latitude: CreationOptional<number | null>;
  declare longitude: CreationOptional<number | null>;
  declare isDefault: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date | null>;
}

Address.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    label: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'Casa' },
    line1: { type: DataTypes.STRING(200), allowNull: false },
    reference: { type: DataTypes.STRING(200), allowNull: true },
    districtId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    latitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    longitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
    deletedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'Address',
    tableName: 'addresses',
    paranoid: true,
    indexes: [{ fields: ['user_id'] }],
  },
);

export default Address;
