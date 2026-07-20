import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from 'sequelize';
import { sequelize } from '../connection';
import { CURRENCY } from '@config/constants';
import type { PlanBenefit } from './planBenefit.model';

/**
 * Tabla `plans` (seccion 13.5).
 *
 * Decision de Fase 0: el plan es una RECARGA con beneficios, no una suscripcion.
 * El cliente paga `price` y recibe `grantedCredit` de saldo (la bonificacion es la
 * diferencia entre ambos), mas los beneficios de plan_benefits, durante `validityDays`.
 */
export class Plan extends Model<InferAttributes<Plan>, InferCreationAttributes<Plan>> {
  declare id: CreationOptional<number>;
  declare cityId: CreationOptional<number | null>;
  declare code: string;
  declare name: string;
  declare description: CreationOptional<string | null>;
  /** Lo que paga el cliente. */
  declare price: number;
  /** El saldo que recibe (price + bonificacion). */
  declare grantedCredit: number;
  declare currency: CreationOptional<string>;
  declare validityDays: CreationOptional<number>;
  declare isFeatured: CreationOptional<boolean>;
  declare isActive: CreationOptional<boolean>;
  declare sortOrder: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date | null>;

  declare benefits?: NonAttribute<PlanBenefit[]>;

  /** Cuanto regala el plan sobre lo que se paga. */
  get bonusAmount(): NonAttribute<number> {
    return Math.round((Number(this.grantedCredit) - Number(this.price)) * 100) / 100;
  }
}

Plan.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    cityId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    code: { type: DataTypes.STRING(40), allowNull: false },
    name: { type: DataTypes.STRING(80), allowNull: false },
    description: { type: DataTypes.STRING(255), allowNull: true },
    price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    grantedCredit: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    currency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: CURRENCY },
    validityDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
    isFeatured: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
    deletedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'Plan',
    tableName: 'plans',
    paranoid: true,
    indexes: [{ name: 'uq_plans_code', unique: true, fields: ['code'] }],
  },
);

export default Plan;
