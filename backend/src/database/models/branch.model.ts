import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  type NonAttribute,
} from 'sequelize';
import { sequelize } from '../connection';
import { City } from './city.model';

/** Tabla `branches`: cocina/local que recibe pedidos, maneja stock y horarios. */
export class Branch extends Model<InferAttributes<Branch>, InferCreationAttributes<Branch>> {
  declare id: CreationOptional<number>;
  declare cityId: number;
  declare name: string;
  declare slug: string;
  declare addressLine: string;
  declare districtId: CreationOptional<number | null>;
  declare latitude: CreationOptional<number | null>;
  declare longitude: CreationOptional<number | null>;
  declare phone: CreationOptional<string | null>;
  /** Minutos base de preparacion; se suman al tiempo de reparto para el ETA. */
  declare prepMinutes: CreationOptional<number>;
  declare acceptsPickup: CreationOptional<boolean>;
  declare acceptsDelivery: CreationOptional<boolean>;
  declare carDeliveryInstructions: CreationOptional<string>;
  declare defaultCarCapacity: CreationOptional<number>;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date | null>;

  /** Asociacion (index.ts). Aporta la zona horaria con la que se leen los horarios. */
  declare city?: NonAttribute<City>;
}

Branch.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    cityId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    name: { type: DataTypes.STRING(100), allowNull: false },
    slug: { type: DataTypes.STRING(100), allowNull: false },
    addressLine: { type: DataTypes.STRING(200), allowNull: false },
    districtId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    latitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    longitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    phone: { type: DataTypes.STRING(30), allowNull: true },
    prepMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 20 },
    acceptsPickup: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    acceptsDelivery: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    carDeliveryInstructions: { type: DataTypes.STRING(1000), allowNull: false, defaultValue: 'Transportar la torta en su caja, sobre una superficie nivelada y antideslizante. Mantenerla protegida del calor y evitar movimientos bruscos.' },
    defaultCarCapacity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 10 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
    deletedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'Branch',
    tableName: 'branches',
    paranoid: true,
    indexes: [{ name: 'uq_branches_slug', unique: true, fields: ['slug'] }],
  },
);

export default Branch;
