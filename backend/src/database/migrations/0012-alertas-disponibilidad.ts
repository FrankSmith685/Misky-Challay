import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, addIndexIfMissing, tableExists } from '../migrationHelpers';

export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  if (!(await tableExists(context, 'product_availability_subscriptions'))) await context.createTable('product_availability_subscriptions', {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    user_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    product_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'products', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    branch_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'branches', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    notify_email: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    notify_in_app: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    status: {
      type: DataTypes.ENUM('WAITING', 'NOTIFIED', 'CANCELLED'),
      allowNull: false,
      defaultValue: 'WAITING',
    },
    notified_at: { type: DataTypes.DATE, allowNull: true },
    cancelled_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await addIndexIfMissing(context, 'product_availability_subscriptions', ['user_id', 'product_id', 'branch_id'], {
    name: 'uq_product_availability_subscription',
    unique: true,
  });
  await addIndexIfMissing(context, 'product_availability_subscriptions', ['product_id', 'branch_id', 'status'], {
    name: 'idx_availability_subscription_waiting',
  });

  await addColumnIfMissing(context, 'communication_settings', 'availability_alerts_enabled', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  });
  await addColumnIfMissing(context, 'notifications', 'action_url', {
    type: DataTypes.STRING(255),
    allowNull: true,
  });
  await addColumnIfMissing(context, 'communication_settings', 'availability_email_subject', {
    type: DataTypes.STRING(200),
    allowNull: false,
    defaultValue: '{{product}} volvio a estar disponible',
  });
  await addColumnIfMissing(context, 'communication_settings', 'availability_email_body', {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: 'El plato {{product}} ya esta disponible nuevamente en {{branch}}. Puedes pedirlo antes de que se agote.',
  });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await context.removeColumn('notifications', 'action_url');
  await context.removeColumn('communication_settings', 'availability_email_body');
  await context.removeColumn('communication_settings', 'availability_email_subject');
  await context.removeColumn('communication_settings', 'availability_alerts_enabled');
  await context.dropTable('product_availability_subscriptions');
};
