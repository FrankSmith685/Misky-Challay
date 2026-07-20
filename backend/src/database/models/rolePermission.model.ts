import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/** Tabla puente `role_permissions`. */
export class RolePermission extends Model<
  InferAttributes<RolePermission>,
  InferCreationAttributes<RolePermission>
> {
  declare id: CreationOptional<number>;
  declare roleId: number;
  declare permissionId: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

RolePermission.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    roleId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    permissionId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'RolePermission',
    tableName: 'role_permissions',
    indexes: [
      { name: 'uq_role_permissions_role_permission', unique: true, fields: ['role_id', 'permission_id'] },
    ],
  },
);

export default RolePermission;
