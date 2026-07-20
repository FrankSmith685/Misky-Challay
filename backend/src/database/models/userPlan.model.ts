import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from 'sequelize';
import { sequelize } from '../connection';
import type { Plan } from './plan.model';

export const USER_PLAN_STATUS = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;
export type UserPlanStatus = (typeof USER_PLAN_STATUS)[keyof typeof USER_PLAN_STATUS];

/**
 * Tabla `user_plans` (seccion 13.5): la activacion que compro un cliente.
 *
 * RN-012: nace en PENDING_PAYMENT y SOLO pasa a ACTIVE (acreditando el saldo)
 * cuando el webhook confirma el pago. Nunca antes.
 *
 * Guarda un snapshot del precio y del saldo: si manana cambia el plan, esta
 * activacion sigue diciendo que se compro y por cuanto.
 */
export class UserPlan extends Model<InferAttributes<UserPlan>, InferCreationAttributes<UserPlan>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare planId: number;
  declare status: CreationOptional<UserPlanStatus>;

  declare planNameSnapshot: string;
  declare priceSnapshot: number;
  declare creditSnapshot: number;
  declare validityDaysSnapshot: number;

  declare startsAt: CreationOptional<Date | null>;
  declare expiresAt: CreationOptional<Date | null>;
  declare activatedAt: CreationOptional<Date | null>;
  declare expiredAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare plan?: NonAttribute<Plan>;

  get isActiveNow(): NonAttribute<boolean> {
    if (this.status !== USER_PLAN_STATUS.ACTIVE) return false;
    if (!this.expiresAt) return true;
    return new Date() <= this.expiresAt;
  }
}

UserPlan.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    planId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    status: {
      type: DataTypes.ENUM(...Object.values(USER_PLAN_STATUS)),
      allowNull: false,
      defaultValue: USER_PLAN_STATUS.PENDING_PAYMENT,
    },

    planNameSnapshot: { type: DataTypes.STRING(80), allowNull: false },
    priceSnapshot: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    creditSnapshot: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    validityDaysSnapshot: { type: DataTypes.INTEGER, allowNull: false },

    startsAt: { type: DataTypes.DATE, allowNull: true },
    expiresAt: { type: DataTypes.DATE, allowNull: true },
    activatedAt: { type: DataTypes.DATE, allowNull: true },
    expiredAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'UserPlan',
    tableName: 'user_plans',
    indexes: [
      { name: 'idx_user_plans_user_status', fields: ['user_id', 'status'] },
      { name: 'idx_user_plans_expires', fields: ['expires_at'] },
    ],
  },
);

export default UserPlan;
