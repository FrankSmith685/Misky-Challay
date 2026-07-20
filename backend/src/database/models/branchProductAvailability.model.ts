import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/**
 * Disponibilidad de un producto por sucursal (RN-005).
 * Sin fila = disponible; una fila con isAvailable=false lo saca del menu de esa cocina.
 */
export class BranchProductAvailability extends Model<
  InferAttributes<BranchProductAvailability>,
  InferCreationAttributes<BranchProductAvailability>
> {
  declare id: CreationOptional<number>;
  declare branchId: number;
  declare productId: number;
  declare isAvailable: CreationOptional<boolean>;
  declare unavailableReason: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

BranchProductAvailability.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    productId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    isAvailable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    unavailableReason: { type: DataTypes.STRING(255), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'BranchProductAvailability',
    tableName: 'branch_product_availability',
    indexes: [{ unique: true, fields: ['branch_id', 'product_id'] }],
  },
);

export default BranchProductAvailability;
