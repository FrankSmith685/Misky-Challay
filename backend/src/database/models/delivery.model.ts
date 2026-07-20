import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

export const DELIVERY_STATUS = {
  PENDING: 'PENDING', // esperando repartidor
  ASSIGNED: 'ASSIGNED',
  PICKED_UP: 'PICKED_UP',
  ON_ROUTE: 'ON_ROUTE',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
} as const;
export type DeliveryStatus = (typeof DELIVERY_STATUS)[keyof typeof DELIVERY_STATUS];

export const DELIVERY_FLOW: Record<DeliveryStatus, DeliveryStatus[]> = {
  PENDING: ['ASSIGNED', 'FAILED'],
  ASSIGNED: ['PICKED_UP', 'FAILED'],
  PICKED_UP: ['ON_ROUTE', 'DELIVERED', 'FAILED'],
  ON_ROUTE: ['DELIVERED', 'FAILED'],
  DELIVERED: [],
  FAILED: [],
};

export const DELIVERY_CARRIER = {
  OWN: 'OWN', // flota propia
  EXTERNAL: 'EXTERNAL', // proveedor externo
} as const;
export type DeliveryCarrier = (typeof DELIVERY_CARRIER)[keyof typeof DELIVERY_CARRIER];

/**
 * Tabla `deliveries` (seccion 13.7): el reparto de un pedido.
 * Se crea cuando el pedido de delivery se confirma; los pedidos de recojo no la usan.
 */
export class Delivery extends Model<InferAttributes<Delivery>, InferCreationAttributes<Delivery>> {
  declare id: CreationOptional<number>;
  declare orderId: number;
  declare branchId: number;
  declare carrier: CreationOptional<DeliveryCarrier>;
  declare driverId: CreationOptional<number | null>;
  declare externalProvider: CreationOptional<string | null>;
  declare externalReference: CreationOptional<string | null>;
  declare status: CreationOptional<DeliveryStatus>;
  declare cost: CreationOptional<number>;
  declare etaMinutes: CreationOptional<number | null>;
  declare assignedAt: CreationOptional<Date | null>;
  declare pickedUpAt: CreationOptional<Date | null>;
  declare deliveredAt: CreationOptional<Date | null>;
  /** Prueba de entrega: quien recibio, foto, firma... */
  declare proofJson: CreationOptional<Record<string, unknown> | null>;
  declare failureReason: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Delivery.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    orderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    carrier: {
      type: DataTypes.ENUM(...Object.values(DELIVERY_CARRIER)),
      allowNull: false,
      defaultValue: DELIVERY_CARRIER.OWN,
    },
    driverId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    externalProvider: { type: DataTypes.STRING(40), allowNull: true },
    externalReference: { type: DataTypes.STRING(120), allowNull: true },
    status: {
      type: DataTypes.ENUM(...Object.values(DELIVERY_STATUS)),
      allowNull: false,
      defaultValue: DELIVERY_STATUS.PENDING,
    },
    cost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    etaMinutes: { type: DataTypes.INTEGER, allowNull: true },
    assignedAt: { type: DataTypes.DATE, allowNull: true },
    pickedUpAt: { type: DataTypes.DATE, allowNull: true },
    deliveredAt: { type: DataTypes.DATE, allowNull: true },
    proofJson: { type: DataTypes.JSON, allowNull: true },
    failureReason: { type: DataTypes.STRING(255), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'Delivery',
    tableName: 'deliveries',
    indexes: [
      { name: 'uq_deliveries_order', unique: true, fields: ['order_id'] },
      { name: 'idx_deliveries_branch_status', fields: ['branch_id', 'status'] },
    ],
  },
);

export default Delivery;
