import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

export class MessagingSetting extends Model<
  InferAttributes<MessagingSetting>,
  InferCreationAttributes<MessagingSetting>
> {
  declare id: CreationOptional<number>;
  declare config: Record<string, unknown>;
  declare secrets: CreationOptional<Record<string, string> | null>;
  declare updatedBy: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
MessagingSetting.init(
  {
    id: { type: DataTypes.TINYINT.UNSIGNED, primaryKey: true, defaultValue: 1 },
    config: { type: DataTypes.JSON, allowNull: false },
    secrets: { type: DataTypes.JSON, allowNull: true },
    updatedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'messaging_settings', modelName: 'MessagingSetting' },
);

export type DeliveryState =
  | 'QUEUED'
  | 'PROCESSING'
  | 'ACCEPTED'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED'
  | 'BLOCKED'
  | 'UNKNOWN'
  | 'SIMULATED'
  | 'SKIPPED';
export class CommunicationDelivery extends Model<
  InferAttributes<CommunicationDelivery>,
  InferCreationAttributes<CommunicationDelivery>
> {
  declare id: CreationOptional<number>;
  declare channel: 'EMAIL' | 'WHATSAPP';
  declare recipient: string;
  declare subject: string;
  declare event: string;
  declare payload: Record<string, unknown>;
  declare idempotencyKey: string;
  declare state: CreationOptional<DeliveryState>;
  declare simulation: boolean;
  declare attempts: CreationOptional<number>;
  declare nextAttemptAt: CreationOptional<Date>;
  declare lockedAt: CreationOptional<Date | null>;
  declare providerMessageId: CreationOptional<string | null>;
  declare error: CreationOptional<string | null>;
  declare orderId: CreationOptional<number | null>;
  declare userId: CreationOptional<number | null>;
  declare messageId: CreationOptional<number | null>;
  declare acceptedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
CommunicationDelivery.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    channel: { type: DataTypes.STRING(20), allowNull: false },
    recipient: { type: DataTypes.STRING(160), allowNull: false },
    subject: { type: DataTypes.STRING(200), allowNull: false },
    event: { type: DataTypes.STRING(60), allowNull: false },
    payload: { type: DataTypes.JSON, allowNull: false },
    idempotencyKey: { type: DataTypes.STRING(160), allowNull: false, unique: true },
    state: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'QUEUED' },
    simulation: { type: DataTypes.BOOLEAN, allowNull: false },
    attempts: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    nextAttemptAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    lockedAt: { type: DataTypes.DATE, allowNull: true },
    providerMessageId: { type: DataTypes.STRING(255), allowNull: true },
    error: { type: DataTypes.STRING(500), allowNull: true },
    orderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, references: { model: 'orders', key: 'id' }, onDelete: 'SET NULL' },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    messageId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, references: { model: 'whatsapp_messages', key: 'id' }, onDelete: 'SET NULL' },
    acceptedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'communication_deliveries',
    modelName: 'CommunicationDelivery',
    indexes: [{ name: 'idx_communication_queue', fields: ['state', 'next_attempt_at'] }, { name: 'idx_communication_provider_message', fields: ['provider_message_id'] }],
  },
);

export class WhatsappConversation extends Model<
  InferAttributes<WhatsappConversation>,
  InferCreationAttributes<WhatsappConversation>
> {
  declare id: CreationOptional<number>;
  declare phone: string;
  declare name: CreationOptional<string | null>;
  declare isTest: boolean;
  declare mode: CreationOptional<'BOT' | 'HUMAN'>;
  declare assignedTo: CreationOptional<number | null>;
  declare optedOutAt: CreationOptional<Date | null>;
  declare lastInboundAt: CreationOptional<Date | null>;
  declare lastMessage: CreationOptional<string>;
  declare unread: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
WhatsappConversation.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    phone: { type: DataTypes.STRING(30), allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: true },
    isTest: { type: DataTypes.BOOLEAN, allowNull: false },
    mode: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'BOT' },
    assignedTo: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    optedOutAt: { type: DataTypes.DATE, allowNull: true },
    lastInboundAt: { type: DataTypes.DATE, allowNull: true },
    lastMessage: { type: DataTypes.STRING(255), allowNull: false, defaultValue: '' },
    unread: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'whatsapp_conversations',
    modelName: 'WhatsappConversation',
    indexes: [{ name: 'uq_whatsapp_phone_test', unique: true, fields: ['phone', 'is_test'] }],
  },
);

export class WhatsappMessage extends Model<
  InferAttributes<WhatsappMessage>,
  InferCreationAttributes<WhatsappMessage>
> {
  declare id: CreationOptional<number>;
  declare conversationId: number;
  declare direction: 'IN' | 'OUT';
  declare body: string;
  declare providerMessageId: CreationOptional<string | null>;
  declare actorId: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
WhatsappMessage.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    conversationId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, references: { model: 'whatsapp_conversations', key: 'id' }, onDelete: 'CASCADE' },
    direction: { type: DataTypes.STRING(3), allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },
    providerMessageId: { type: DataTypes.STRING(255), allowNull: true, unique: true },
    actorId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'whatsapp_messages',
    modelName: 'WhatsappMessage',
    indexes: [{ name: 'idx_whatsapp_conversation_messages', fields: ['conversation_id', 'id'] }],
  },
);
