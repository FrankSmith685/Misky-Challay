import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/** Tabla `permissions`: acciones autorizables con codigo unico (ej. order.cancel). */
export class Permission extends Model<
  InferAttributes<Permission>,
  InferCreationAttributes<Permission>
> {
  declare id: CreationOptional<number>;
  declare code: string;
  declare description: string | null;
  declare module: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Permission.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    code: { type: DataTypes.STRING(80), allowNull: false },
    description: { type: DataTypes.STRING(255), allowNull: true },
    module: { type: DataTypes.STRING(50), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'Permission',
    tableName: 'permissions',
    indexes: [{ name: 'uq_permissions_code', unique: true, fields: ['code'] }],
  },
);

export default Permission;
