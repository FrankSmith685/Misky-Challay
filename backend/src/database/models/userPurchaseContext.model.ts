import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  type NonAttribute,
} from 'sequelize';
import { sequelize } from '../connection';
import { DELIVERY_TYPE, type DeliveryType } from '@config/constants';
import type { Address } from './address.model';
import type { Branch } from './branch.model';

/**
 * Tabla `user_purchase_contexts`: donde se quedo el cliente la ultima vez.
 *
 * Una fila por usuario. No es un pedido ni una preferencia de menu: es el "donde
 * entregamos" activo, para que iniciar sesion en otro navegador no empiece de cero.
 * La cobertura NO se guarda aqui; se revalida siempre contra las zonas vigentes
 * (RN-001), porque una direccion cubierta hace un mes puede no estarlo hoy.
 */
export class UserPurchaseContext extends Model<
  InferAttributes<UserPurchaseContext>,
  InferCreationAttributes<UserPurchaseContext>
> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare deliveryType: CreationOptional<DeliveryType>;
  declare cityId: CreationOptional<number | null>;
  /** Sede que atiende: la elegida para recojo, o la asignada por cobertura. */
  declare branchId: CreationOptional<number | null>;
  /** Direccion de la libreta en uso. Siempre null cuando la modalidad es recojo. */
  declare addressId: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Asociaciones (models/index.ts)
  declare address?: NonAttribute<Address>;
  declare branch?: NonAttribute<Branch>;
}

UserPurchaseContext.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    deliveryType: {
      type: DataTypes.ENUM(...Object.values(DELIVERY_TYPE)),
      allowNull: false,
      defaultValue: DELIVERY_TYPE.DELIVERY,
    },
    cityId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    addressId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'UserPurchaseContext',
    tableName: 'user_purchase_contexts',
    indexes: [{ name: 'uq_user_purchase_contexts_user', unique: true, fields: ['user_id'] }],
  },
);

export default UserPurchaseContext;
