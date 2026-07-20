import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from 'sequelize';
import { sequelize } from '../connection';
import { USER_STATUS, type UserStatus } from '@config/constants';
import type { Role } from './role.model';

/**
 * Tabla `users` (seccion 14.1 del analisis funcional).
 * Cuenta base del sistema: clientes y personal interno.
 */
export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<number>;
  declare email: string | null;
  declare phone: string | null;
  declare passwordHash: string | null;
  declare firstName: string | null;
  declare lastName: string | null;
  declare status: CreationOptional<UserStatus>;
  /**
   * Superadmin: NO es un rol de datos, es una marca del sistema.
   *
   * Por que: si los roles son editables desde el panel, un admin podria quitarse
   * a si mismo el permiso de gestionar usuarios y dejar el sistema sin dueno, o
   * escalarse privilegios editando su propio rol. El superadmin se salta la
   * verificacion de permisos por definicion y no se puede borrar el ultimo.
   */
  declare isSuperAdmin: CreationOptional<boolean>;
  /**
   * Version del token de sesion. Se incrementa al cerrar sesion o cambiar la
   * contrasena para invalidar los refresh tokens ya emitidos (ver jwt.ts).
   */
  declare tokenVersion: CreationOptional<number>;
  declare emailVerifiedAt: Date | null;
  declare lastLoginAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date | null>;

  // Asociaciones (se completan en models/index.ts)
  declare roles?: NonAttribute<Role[]>;

  get fullName(): NonAttribute<string> {
    return [this.firstName, this.lastName].filter(Boolean).join(' ').trim();
  }
}

User.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    // Los indices unicos se declaran abajo con nombre propio (ver nota en `indexes`).
    email: { type: DataTypes.STRING(160), allowNull: true, validate: { isEmail: true } },
    phone: { type: DataTypes.STRING(30), allowNull: true },
    passwordHash: { type: DataTypes.STRING(255), allowNull: true },
    firstName: { type: DataTypes.STRING(80), allowNull: true },
    lastName: { type: DataTypes.STRING(80), allowNull: true },
    status: {
      type: DataTypes.ENUM(...Object.values(USER_STATUS)),
      allowNull: false,
      defaultValue: USER_STATUS.ACTIVE,
    },
    isSuperAdmin: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    tokenVersion: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    emailVerifiedAt: { type: DataTypes.DATE, allowNull: true },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
    deletedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    paranoid: true, // borrado logico
    defaultScope: {
      attributes: { exclude: ['passwordHash'] },
    },
    scopes: {
      withPassword: { attributes: { include: ['passwordHash'] } },
    },
    /**
     * IMPORTANTE (MySQL + sync alter): los indices unicos SIEMPRE se declaran aqui
     * con `name`. Si se usa `unique: true` en la columna, cada arranque con
     * DB_ALTER=true agrega un indice nuevo (email_2, email_3...) hasta reventar el
     * limite de 64 claves de MySQL. Con nombre explicito, Sequelize lo reconoce.
     */
    indexes: [
      { name: 'uq_users_email', unique: true, fields: ['email'] },
      { name: 'uq_users_phone', unique: true, fields: ['phone'] },
      { name: 'idx_users_status', fields: ['status'] },
    ],
  },
);

export default User;
