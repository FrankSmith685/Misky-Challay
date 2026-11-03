import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addIndexIfMissing } from '../migrationHelpers';

export const up = async ({ context: db }: MigrationParams<QueryInterface>): Promise<void> => {
  await db.createTable('subscription_plans', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    code: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    monthly_price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    items_json: { type: DataTypes.JSON, allowNull: false },
    branch_ids_json: { type: DataTypes.JSON, allowNull: false },
    lead_days: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 3 },
    max_active_subscribers: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 100,
    },
    max_daily_pickups: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 10 },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await db.createTable('subscriptions', {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    plan_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'subscription_plans', key: 'id' },
      onDelete: 'RESTRICT',
    },
    user_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'RESTRICT',
    },
    branch_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'branches', key: 'id' },
      onDelete: 'RESTRICT',
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    provider_reference: { type: DataTypes.STRING(100), allowNull: true, unique: true },
    plan_name_snapshot: { type: DataTypes.STRING(100), allowNull: false },
    price_snapshot: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    items_snapshot_json: { type: DataTypes.JSON, allowNull: false },
    lead_days_snapshot: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    terms_version: { type: DataTypes.STRING(20), allowNull: false },
    terms_accepted_at: { type: DataTypes.DATE, allowNull: false },
    next_charge_at: { type: DataTypes.DATE, allowNull: true },
    canceled_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await addIndexIfMissing(db, 'subscriptions', ['user_id', 'status'], {
    name: 'idx_subscriptions_user_status',
  });
  await addIndexIfMissing(db, 'subscriptions', ['plan_id', 'status'], {
    name: 'idx_subscriptions_plan_status',
  });
  await db.createTable('subscription_cycles', {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    subscription_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'subscriptions', key: 'id' },
      onDelete: 'RESTRICT',
    },
    provider_invoice_id: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    provider_payment_id: { type: DataTypes.STRING(100), allowNull: true },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    paid_at: { type: DataTypes.DATE, allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    order_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      unique: true,
      references: { model: 'orders', key: 'id' },
      onDelete: 'RESTRICT',
    },
    scheduled_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await addIndexIfMissing(db, 'subscription_cycles', ['subscription_id', 'paid_at'], {
    name: 'idx_subscription_cycles_subscription',
  });
};

export const down = async ({ context: db }: MigrationParams<QueryInterface>): Promise<void> => {
  await db.dropTable('subscription_cycles');
  await db.dropTable('subscriptions');
  await db.dropTable('subscription_plans');
};
