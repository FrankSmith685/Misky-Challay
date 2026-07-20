import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

export const NOTIFICATION_STATUS = {
  SENT: 'SENT',
  FAILED: 'FAILED',
} as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUS)[keyof typeof NOTIFICATION_STATUS];

/**
 * Tabla `notifications` (seccion 13.8): que se le mando a quien y cuando.
 *
 * Sirve para dos cosas muy practicas: responder "no me llego el correo" con datos,
 * y no mandar dos veces el mismo aviso (la clave de idempotencia).
 */
export class Notification extends Model<
  InferAttributes<Notification>,
  InferCreationAttributes<Notification>
> {
  declare id: CreationOptional<number>;
  declare userId: CreationOptional<number | null>;
  declare channel: CreationOptional<string>;
  declare template: string;
  declare recipient: string;
  declare subject: string;
  declare status: CreationOptional<NotificationStatus>;
  declare provider: CreationOptional<string | null>;
  declare providerMessageId: CreationOptional<string | null>;
  declare errorMessage: CreationOptional<string | null>;
  declare orderId: CreationOptional<number | null>;
  /** Evita mandar el mismo aviso dos veces (ej. reintento del webhook). */
  declare idempotencyKey: string;
  declare sentAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Notification.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    channel: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'EMAIL' },
    template: { type: DataTypes.STRING(60), allowNull: false },
    recipient: { type: DataTypes.STRING(160), allowNull: false },
    subject: { type: DataTypes.STRING(200), allowNull: false },
    status: {
      type: DataTypes.ENUM(...Object.values(NOTIFICATION_STATUS)),
      allowNull: false,
      defaultValue: NOTIFICATION_STATUS.SENT,
    },
    provider: { type: DataTypes.STRING(30), allowNull: true },
    providerMessageId: { type: DataTypes.STRING(255), allowNull: true },
    errorMessage: { type: DataTypes.STRING(500), allowNull: true },
    orderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    idempotencyKey: { type: DataTypes.STRING(120), allowNull: false },
    sentAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'Notification',
    tableName: 'notifications',
    indexes: [
      { name: 'uq_notifications_idempotency', unique: true, fields: ['idempotency_key'] },
      { name: 'idx_notifications_user', fields: ['user_id'] },
      { name: 'idx_notifications_order', fields: ['order_id'] },
    ],
  },
);

export default Notification;
