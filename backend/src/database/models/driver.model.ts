import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

export const DRIVER_STATUS = {
  AVAILABLE: 'AVAILABLE',
  BUSY: 'BUSY',
  OFFLINE: 'OFFLINE',
} as const;
export type DriverStatus = (typeof DRIVER_STATUS)[keyof typeof DRIVER_STATUS];

/** Tabla `drivers`: repartidores de la flota propia (decision de Fase 0). */
export class Driver extends Model<InferAttributes<Driver>, InferCreationAttributes<Driver>> {
  declare id: CreationOptional<number>;
  declare userId: CreationOptional<number | null>;
  declare branchId: number;
  declare fullName: string;
  declare phone: CreationOptional<string | null>;
  declare vehicle: CreationOptional<string | null>;
  declare status: CreationOptional<DriverStatus>;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Driver.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    fullName: { type: DataTypes.STRING(120), allowNull: false },
    phone: { type: DataTypes.STRING(30), allowNull: true },
    vehicle: { type: DataTypes.STRING(50), allowNull: true },
    status: {
      type: DataTypes.ENUM(...Object.values(DRIVER_STATUS)),
      allowNull: false,
      defaultValue: DRIVER_STATUS.AVAILABLE,
    },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'Driver',
    tableName: 'drivers',
    indexes: [{ name: 'idx_drivers_branch_status', fields: ['branch_id', 'status'] }],
  },
);

export default Driver;
