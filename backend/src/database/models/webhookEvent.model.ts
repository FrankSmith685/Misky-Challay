import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/**
 * Tabla `webhook_events` (RN-015).
 * Stripe reintenta los webhooks: guardamos el id del evento con UNIQUE para que
 * procesarlo dos veces no confirme el pedido ni cobre dos veces.
 */
export class WebhookEvent extends Model<
  InferAttributes<WebhookEvent>,
  InferCreationAttributes<WebhookEvent>
> {
  declare id: CreationOptional<number>;
  declare provider: string;
  declare eventId: string;
  declare eventType: string;
  declare payloadJson: CreationOptional<Record<string, unknown> | null>;
  declare processedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

WebhookEvent.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    provider: { type: DataTypes.STRING(30), allowNull: false },
    eventId: { type: DataTypes.STRING(120), allowNull: false },
    eventType: { type: DataTypes.STRING(80), allowNull: false },
    payloadJson: { type: DataTypes.JSON, allowNull: true },
    processedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'WebhookEvent',
    tableName: 'webhook_events',
    indexes: [{ name: 'uq_webhook_events_event', unique: true, fields: ['provider', 'event_id'] }],
  },
);

export default WebhookEvent;
