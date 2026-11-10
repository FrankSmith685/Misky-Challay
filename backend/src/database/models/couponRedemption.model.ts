import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from 'sequelize';
import { sequelize } from '../connection';
import type { Order } from './order.model';

export const REDEMPTION_STATUS = {
  RESERVED: 'RESERVED',
  CONFIRMED: 'CONFIRMED',
  RELEASED: 'RELEASED',
} as const;
export type RedemptionStatus = (typeof REDEMPTION_STATUS)[keyof typeof REDEMPTION_STATUS];

/**
 * Tabla `coupon_redemptions` (RN-011).
 * El cupon se RESERVA al crear el pedido, se CONFIRMA cuando el pago llega y se
 * LIBERA si el pago falla o el pedido se cancela.
 */
export class CouponRedemption extends Model<
  InferAttributes<CouponRedemption>,
  InferCreationAttributes<CouponRedemption>
> {
  declare id: CreationOptional<number>;
  declare couponId: number;
  declare userId: number | null;
  declare orderId: number;
  declare amount: number;
  declare status: CreationOptional<RedemptionStatus>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare order?: NonAttribute<Order | null>;
}

CouponRedemption.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    couponId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    orderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    status: {
      type: DataTypes.ENUM(...Object.values(REDEMPTION_STATUS)),
      allowNull: false,
      defaultValue: REDEMPTION_STATUS.RESERVED,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'CouponRedemption',
    tableName: 'coupon_redemptions',
    indexes: [
      { name: 'uq_coupon_redemptions_order', unique: true, fields: ['coupon_id', 'order_id'] },
      { name: 'idx_coupon_redemptions_user', fields: ['coupon_id', 'user_id'] },
      { name: 'idx_coupon_redemptions_status', fields: ['coupon_id', 'status'] },
    ],
  },
);

export default CouponRedemption;
