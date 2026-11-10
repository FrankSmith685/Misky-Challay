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

export const TICKET_STATUS = {
  QUEUED: 'QUEUED', // esperando que la cocina lo tome
  ACCEPTED: 'ACCEPTED', // cocina lo acepto
  PREPARING: 'PREPARING', // en preparacion
  READY: 'READY', // listo para despacho o recojo
  ON_HOLD: 'ON_HOLD', // incidencia o espera operativa
  DISPATCHED: 'DISPATCHED', // salio de cocina
  CANCELLED: 'CANCELLED',
} as const;
export type TicketStatus = (typeof TICKET_STATUS)[keyof typeof TICKET_STATUS];

/** Transiciones validas del ticket de cocina. */
export const TICKET_FLOW: Record<TicketStatus, TicketStatus[]> = {
  QUEUED: ['ACCEPTED', 'ON_HOLD', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'ON_HOLD', 'CANCELLED'],
  PREPARING: ['READY', 'ON_HOLD', 'CANCELLED'],
  READY: ['DISPATCHED', 'ON_HOLD', 'CANCELLED'],
  ON_HOLD: ['CANCELLED'],
  DISPATCHED: [],
  CANCELLED: [],
};

/**
 * Tabla `kitchen_tickets` (seccion 13.7): la vista operativa del pedido.
 * Se crea cuando el pago se confirma, nunca antes: la cocina no cocina sin cobrar.
 * `targetAt` es la hora comprometida: por ella se ordena la cola.
 */
export class KitchenTicket extends Model<
  InferAttributes<KitchenTicket>,
  InferCreationAttributes<KitchenTicket>
> {
  declare id: CreationOptional<number>;
  declare orderId: number;
  declare branchId: number;
  declare status: CreationOptional<TicketStatus>;
  /** 1 = normal, mas alto = mas urgente (pedidos con retraso, VIP, etc). */
  declare priority: CreationOptional<number>;
  declare targetAt: Date;
  declare acceptedAt: CreationOptional<Date | null>;
  declare startedAt: CreationOptional<Date | null>;
  declare readyAt: CreationOptional<Date | null>;
  declare station: CreationOptional<string | null>;
  declare assignedTo: CreationOptional<number | null>;
  declare pausedFromStatus: CreationOptional<TicketStatus | null>;
  declare incidentReason: CreationOptional<string | null>;
  declare incidentAt: CreationOptional<Date | null>;
  declare incidentBy: CreationOptional<number | null>;
  declare dispatchedAt: CreationOptional<Date | null>;
  /** Primera alerta de que nadie acepto la comanda dentro del SLA. */
  declare escalatedAt: CreationOptional<Date | null>;
  /** Minutos reales entre aceptado y listo: alimenta los reportes de tiempos. */
  declare prepMinutesActual: CreationOptional<number | null>;
  declare notes: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare order?: NonAttribute<Order>;
}

KitchenTicket.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    orderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    status: {
      type: DataTypes.ENUM(...Object.values(TICKET_STATUS)),
      allowNull: false,
      defaultValue: TICKET_STATUS.QUEUED,
    },
    priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    targetAt: { type: DataTypes.DATE, allowNull: false },
    acceptedAt: { type: DataTypes.DATE, allowNull: true },
    startedAt: { type: DataTypes.DATE, allowNull: true },
    readyAt: { type: DataTypes.DATE, allowNull: true },
    station: { type: DataTypes.STRING(40), allowNull: true },
    assignedTo: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    pausedFromStatus: { type: DataTypes.STRING(20), allowNull: true },
    incidentReason: { type: DataTypes.STRING(500), allowNull: true },
    incidentAt: { type: DataTypes.DATE, allowNull: true },
    incidentBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    dispatchedAt: { type: DataTypes.DATE, allowNull: true },
    escalatedAt: { type: DataTypes.DATE, allowNull: true },
    prepMinutesActual: { type: DataTypes.INTEGER, allowNull: true },
    notes: { type: DataTypes.STRING(255), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'KitchenTicket',
    tableName: 'kitchen_tickets',
    indexes: [
      { name: 'uq_kitchen_tickets_order', unique: true, fields: ['order_id'] },
      { name: 'idx_kitchen_tickets_board', fields: ['branch_id', 'status', 'target_at'] },
    ],
  },
);

export default KitchenTicket;
