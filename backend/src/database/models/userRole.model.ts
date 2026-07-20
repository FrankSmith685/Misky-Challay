import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from 'sequelize';
import { sequelize } from '../connection';
import type { Branch } from './branch.model';

/**
 * Tabla puente `user_roles`.
 * `branchId` permite limitar al personal operativo a una sucursal (seccion 13.1).
 */
export class UserRole extends Model<InferAttributes<UserRole>, InferCreationAttributes<UserRole>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare roleId: number;
  declare branchId: CreationOptional<number | null>;
  declare branch?: NonAttribute<Branch | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

UserRole.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    roleId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'UserRole',
    tableName: 'user_roles',
    indexes: [
      {
        name: 'uq_user_roles_user_role_branch',
        unique: true,
        fields: ['user_id', 'role_id', 'branch_id'],
      },
    ],
  },
);

export default UserRole;
