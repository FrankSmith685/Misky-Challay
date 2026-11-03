import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { tableExists } from '../migrationHelpers';

export const up = async ({ context }: MigrationParams<QueryInterface>) => {
  const id = () => ({ type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true });
  const dates = () => ({
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  const userRef = () => ({
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL',
  });
  if (!(await tableExists(context, 'messaging_settings')))
    await context.createTable('messaging_settings', {
      id: { type: DataTypes.TINYINT.UNSIGNED, primaryKey: true },
      config: { type: DataTypes.JSON, allowNull: false },
      secrets: { type: DataTypes.JSON, allowNull: true },
      updated_by: userRef(),
      ...dates(),
    });
  if (!(await tableExists(context, 'whatsapp_conversations'))) {
    await context.createTable('whatsapp_conversations', {
      id: id(),
      phone: { type: DataTypes.STRING(30), allowNull: false },
      name: { type: DataTypes.STRING(120), allowNull: true },
      is_test: { type: DataTypes.BOOLEAN, allowNull: false },
      mode: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'BOT' },
      assigned_to: userRef(),
      opted_out_at: { type: DataTypes.DATE, allowNull: true },
      last_inbound_at: { type: DataTypes.DATE, allowNull: true },
      last_message: { type: DataTypes.STRING(255), allowNull: false, defaultValue: '' },
      unread: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      ...dates(),
    });
    await context.addIndex('whatsapp_conversations', ['phone', 'is_test'], {
      unique: true,
      name: 'uq_whatsapp_phone_test',
    });
  }
  if (!(await tableExists(context, 'whatsapp_messages'))) {
    await context.createTable('whatsapp_messages', {
      id: id(),
      conversation_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'whatsapp_conversations', key: 'id' },
        onDelete: 'CASCADE',
      },
      direction: { type: DataTypes.STRING(3), allowNull: false },
      body: { type: DataTypes.TEXT, allowNull: false },
      provider_message_id: { type: DataTypes.STRING(255), allowNull: true, unique: true },
      actor_id: userRef(),
      ...dates(),
    });
    await context.addIndex('whatsapp_messages', ['conversation_id', 'id'], {
      name: 'idx_whatsapp_conversation_messages',
    });
  }
  if (!(await tableExists(context, 'communication_deliveries'))) {
    await context.createTable('communication_deliveries', {
      id: id(),
      channel: { type: DataTypes.STRING(20), allowNull: false },
      recipient: { type: DataTypes.STRING(160), allowNull: false },
      subject: { type: DataTypes.STRING(200), allowNull: false },
      event: { type: DataTypes.STRING(60), allowNull: false },
      payload: { type: DataTypes.JSON, allowNull: false },
      idempotency_key: { type: DataTypes.STRING(160), allowNull: false, unique: true },
      state: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'QUEUED' },
      simulation: { type: DataTypes.BOOLEAN, allowNull: false },
      attempts: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      next_attempt_at: { type: DataTypes.DATE, allowNull: false },
      locked_at: { type: DataTypes.DATE, allowNull: true },
      provider_message_id: { type: DataTypes.STRING(255), allowNull: true },
      error: { type: DataTypes.STRING(500), allowNull: true },
      order_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        references: { model: 'orders', key: 'id' },
        onDelete: 'SET NULL',
      },
      user_id: userRef(),
      message_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        references: { model: 'whatsapp_messages', key: 'id' },
        onDelete: 'SET NULL',
      },
      accepted_at: { type: DataTypes.DATE, allowNull: true },
      ...dates(),
    });
    await context.addIndex('communication_deliveries', ['state', 'next_attempt_at'], {
      name: 'idx_communication_queue',
    });
    await context.addIndex('communication_deliveries', ['provider_message_id'], {
      name: 'idx_communication_provider_message',
    });
  }
  for (const [code, description] of [
    ['communication.read', 'Consultar conversaciones y avisos'],
    ['communication.reply', 'Atender conversaciones y reintentar avisos'],
  ]) {
    await context.sequelize.query(
      'INSERT INTO permissions (code,description,module,created_at,updated_at) SELECT ?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP() WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code=?)',
      { replacements: [code, description, 'communication', code] },
    );
  }
};
