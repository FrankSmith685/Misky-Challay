import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from 'sequelize';
import { sequelize } from '../connection';
import type { User } from './user.model';

export const DRIVER_STATUS = {
  AVAILABLE: 'AVAILABLE',
  BUSY: 'BUSY',
  OFFLINE: 'OFFLINE',
} as const;
export type DriverStatus = (typeof DRIVER_STATUS)[keyof typeof DRIVER_STATUS];
export type VehicleType = 'CAR' | 'MOTORCYCLE' | 'OTHER' | 'UNSPECIFIED';

/** Tabla `drivers`: repartidores de la flota propia (decision de Fase 0). */
export class Driver extends Model<InferAttributes<Driver>, InferCreationAttributes<Driver>> {
  declare id: CreationOptional<number>;
  /**
   * Cuenta con la que ese repartidor inicia sesion. Es el UNICO vinculo entre la
   * persona y la fila de la flota, y de el dependen dos cosas: que el tablero le
   * muestre SUS repartos y no los de sus companeros, y que se le pueda asignar uno.
   *
   * Nullable porque la flota puede existir antes que las cuentas (los repartidores
   * sembrados no tienen usuario). Lo rellena `accessService` al conceder el rol de
   * repartidor: mientras siga en null, esa cuenta no vera ningun reparto.
   */
  declare userId: CreationOptional<number | null>;
  declare branchId: number;
  declare fullName: string;
  declare phone: CreationOptional<string | null>;
  declare vehicle: CreationOptional<string | null>;
  declare vehicleType: CreationOptional<VehicleType>;
  declare status: CreationOptional<DriverStatus>;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare user?: NonAttribute<User>;
}

Driver.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    fullName: { type: DataTypes.STRING(120), allowNull: false },
    phone: { type: DataTypes.STRING(30), allowNull: true },
    vehicle: { type: DataTypes.STRING(50), allowNull: true },
    vehicleType: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'UNSPECIFIED' },
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
