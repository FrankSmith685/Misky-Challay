import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from 'sequelize';
import { sequelize } from '../connection';
import type { Permission } from './permission.model';

/** Tabla `roles`: agrupa permisos y se asigna a los usuarios (RBAC, seccion 7.1). */
export class Role extends Model<InferAttributes<Role>, InferCreationAttributes<Role>> {
  declare id: CreationOptional<number>;
  declare code: string;
  declare name: string;
  declare description: string | null;
  declare isSystem: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare permissions?: NonAttribute<Permission[]>;
}

Role.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    code: { type: DataTypes.STRING(50), allowNull: false },
    name: { type: DataTypes.STRING(80), allowNull: false },
    description: { type: DataTypes.STRING(255), allowNull: true },
    isSystem: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'Role',
    tableName: 'roles',
    indexes: [{ name: 'uq_roles_code', unique: true, fields: ['code'] }],
  },
);

export default Role;
