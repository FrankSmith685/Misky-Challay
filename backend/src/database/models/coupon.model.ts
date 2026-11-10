import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

export const DISCOUNT_TYPE = {
  PERCENT: 'PERCENT',
  FIXED: 'FIXED',
  FREE_DELIVERY: 'FREE_DELIVERY',
} as const;
export type DiscountType = (typeof DISCOUNT_TYPE)[keyof typeof DISCOUNT_TYPE];

export const COUPON_STACK_MODE = {
  EXCLUSIVE: 'EXCLUSIVE',
  STACKABLE: 'STACKABLE',
} as const;
export type CouponStackMode = (typeof COUPON_STACK_MODE)[keyof typeof COUPON_STACK_MODE];

/** Segmentación que puede evaluar el motor sin confiar en datos del frontend. */
export interface CouponRules {
  branchIds?: number[];
  productIds?: number[];
  deliveryTypes?: string[];
  paymentMethods?: string[];
  firstOrderOnly?: boolean;
}

/**
 * Tabla `coupons` (RN-010, RN-011).
 * Campaña comercial: vigencia, segmentación, política de combinación, presupuesto
 * y límites de uso. Los pedidos guardan el resultado aplicado como snapshot.
 */
export class Coupon extends Model<InferAttributes<Coupon>, InferCreationAttributes<Coupon>> {
  declare id: CreationOptional<number>;
  declare code: string;
  declare description: string;
  declare discountType: DiscountType;
  /** PERCENT: 0-100. FIXED: importe. FREE_DELIVERY: se ignora. */
  declare value: CreationOptional<number>;
  declare minOrderAmount: CreationOptional<number>;
  declare maxDiscountAmount: CreationOptional<number | null>;
  declare validFrom: CreationOptional<Date | null>;
  declare validUntil: CreationOptional<Date | null>;
  /** Usos totales permitidos; null = sin limite. */
  declare usageLimit: CreationOptional<number | null>;
  declare usageLimitPerUser: CreationOptional<number>;
  declare usedCount: CreationOptional<number>;
  declare isActive: CreationOptional<boolean>;
  declare version: CreationOptional<number>;
  declare rulesJson: CreationOptional<CouponRules | null>;
  declare stackMode: CreationOptional<CouponStackMode>;
  declare budgetAmount: CreationOptional<number | null>;
  declare budgetUsed: CreationOptional<number>;
  declare archivedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Coupon.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    code: { type: DataTypes.STRING(40), allowNull: false },
    description: { type: DataTypes.STRING(150), allowNull: false },
    discountType: { type: DataTypes.ENUM(...Object.values(DISCOUNT_TYPE)), allowNull: false },
    value: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    minOrderAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    maxDiscountAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    validFrom: { type: DataTypes.DATE, allowNull: true },
    validUntil: { type: DataTypes.DATE, allowNull: true },
    usageLimit: { type: DataTypes.INTEGER, allowNull: true },
    usageLimitPerUser: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    usedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    rulesJson: { type: DataTypes.JSON, allowNull: true },
    stackMode: {
      type: DataTypes.ENUM(...Object.values(COUPON_STACK_MODE)),
      allowNull: false,
      defaultValue: COUPON_STACK_MODE.STACKABLE,
    },
    budgetAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    budgetUsed: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    archivedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'Coupon',
    tableName: 'coupons',
    indexes: [{ name: 'uq_coupons_code', unique: true, fields: ['code'] }],
  },
);

export default Coupon;
