import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/**
 * Tabla `branch_option_availability`: una opcion puede estar agotada solo en una
 * sucursal o costar distinto ahi. Si no hay fila, manda el estado global de la opcion.
 * RN-005: no se ofrece lo que la cocina no puede preparar.
 */
export class BranchOptionAvailability extends Model<
  InferAttributes<BranchOptionAvailability>,
  InferCreationAttributes<BranchOptionAvailability>
> {
  declare id: CreationOptional<number>;
  declare branchId: number;
  declare optionId: number;
  declare isAvailable: CreationOptional<boolean>;
  declare priceOverride: CreationOptional<number | null>;
  declare availableFrom: CreationOptional<Date | null>;
  declare availableUntil: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare version: CreationOptional<number>;
}

BranchOptionAvailability.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    optionId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    isAvailable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    priceOverride: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    availableFrom: { type: DataTypes.DATE, allowNull: true },
    availableUntil: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
  },
  {
    sequelize,
    modelName: 'BranchOptionAvailability',
    tableName: 'branch_option_availability',
    indexes: [
      { name: 'uq_branch_option_availability', unique: true, fields: ['branch_id', 'option_id'] },
    ],
  },
);

export default BranchOptionAvailability;
