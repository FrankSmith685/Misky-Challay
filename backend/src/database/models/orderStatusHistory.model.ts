import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';
import type { OrderStatus } from '@config/constants';

/**
 * Tabla `order_status_history`: quien cambio el estado, cuando y por que.
 * Es la trazabilidad del pedido (RN-021). No se edita ni se borra.
 */
export class OrderStatusHistory extends Model<
  InferAttributes<OrderStatusHistory>,
  InferCreationAttributes<OrderStatusHistory>
> {
  declare id: CreationOptional<number>;
  declare orderId: number;
  declare fromStatus: CreationOptional<OrderStatus | null>;
  declare toStatus: OrderStatus;
  declare actorId: CreationOptional<number | null>;
  /** Quien origino el cambio: CUSTOMER, STAFF, SYSTEM, PAYMENT_WEBHOOK. */
  declare source: CreationOptional<string>;
  declare comment: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

OrderStatusHistory.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    orderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    fromStatus: { type: DataTypes.STRING(30), allowNull: true },
    toStatus: { type: DataTypes.STRING(30), allowNull: false },
    actorId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    source: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'SYSTEM' },
    comment: { type: DataTypes.STRING(255), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'OrderStatusHistory',
    tableName: 'order_status_history',
    indexes: [{ name: 'idx_osh_order', fields: ['order_id'] }],
  },
);

export default OrderStatusHistory;
