import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

export const DISCOUNT_SOURCE = {
  COUPON: 'COUPON',
  PROMOTION: 'PROMOTION',
  PLAN_BENEFIT: 'PLAN_BENEFIT',
  MANUAL: 'MANUAL',
} as const;
export type DiscountSource = (typeof DISCOUNT_SOURCE)[keyof typeof DISCOUNT_SOURCE];

/**
 * Tabla `order_discounts`: explica cada descuento aplicado.
 * Guarda el codigo y la descripcion como snapshot: si la campana cambia manana,
 * el pedido sigue explicando por que se descontaron S/ X.
 */
export class OrderDiscount extends Model<
  InferAttributes<OrderDiscount>,
  InferCreationAttributes<OrderDiscount>
> {
  declare id: CreationOptional<number>;
  declare orderId: number;
  declare source: DiscountSource;
  declare referenceId: CreationOptional<number | null>;
  declare code: CreationOptional<string | null>;
  declare description: string;
  declare amount: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

OrderDiscount.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    orderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    source: { type: DataTypes.ENUM(...Object.values(DISCOUNT_SOURCE)), allowNull: false },
    referenceId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    code: { type: DataTypes.STRING(40), allowNull: true },
    description: { type: DataTypes.STRING(150), allowNull: false },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'OrderDiscount',
    tableName: 'order_discounts',
    indexes: [{ name: 'idx_order_discounts_order', fields: ['order_id'] }],
  },
);

export default OrderDiscount;
