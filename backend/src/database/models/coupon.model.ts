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

/**
 * Tabla `coupons` (RN-010, RN-011).
 * Cupon simple: vigencia, monto minimo, tope de descuento y limites de uso.
 * El motor de promociones por reglas llega despues; esto cubre el MVP.
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
