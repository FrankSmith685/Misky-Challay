import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

export const BENEFIT_TYPE = {
  /** Descuento porcentual en cada pedido mientras el plan este vigente. */
  DISCOUNT_PERCENT: 'DISCOUNT_PERCENT',
  /** Delivery gratis mientras el plan este vigente. */
  FREE_DELIVERY: 'FREE_DELIVERY',
} as const;
export type BenefitType = (typeof BENEFIT_TYPE)[keyof typeof BENEFIT_TYPE];

/**
 * Tabla `plan_benefits` (seccion 13.5).
 * Los beneficios son DATOS: se pueden cambiar sin tocar codigo. El motor de
 * precios los lee al cotizar y los registra como descuentos explicados (RN-010).
 */
export class PlanBenefit extends Model<
  InferAttributes<PlanBenefit>,
  InferCreationAttributes<PlanBenefit>
> {
  declare id: CreationOptional<number>;
  declare planId: number;
  declare type: BenefitType;
  /** DISCOUNT_PERCENT: 0-100. FREE_DELIVERY: se ignora. */
  declare value: CreationOptional<number>;
  /** Tope del descuento por pedido (null = sin tope). */
  declare maxAmountPerOrder: CreationOptional<number | null>;
  declare description: string;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

PlanBenefit.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    planId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    type: { type: DataTypes.ENUM(...Object.values(BENEFIT_TYPE)), allowNull: false },
    value: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    maxAmountPerOrder: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    description: { type: DataTypes.STRING(150), allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'PlanBenefit',
    tableName: 'plan_benefits',
    indexes: [{ name: 'uq_plan_benefits', unique: true, fields: ['plan_id', 'type'] }],
  },
);

export default PlanBenefit;
