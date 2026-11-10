import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../connection';

export interface BoxItem {
  variantId: number;
  productId: number;
  productName: string;
  productSlug?: string;
  variantName: string;
  imageUrl?: string | null;
  quantity: number;
  catalogPrice: number;
}

/** Recurring boxes are separate from the historical, one-off wallet plans. */
export class SubscriptionPlan extends Model<InferAttributes<SubscriptionPlan>, InferCreationAttributes<SubscriptionPlan>> {
  declare id: CreationOptional<number>;
  declare code: string;
  declare name: string;
  declare description: string;
  declare monthlyPrice: number;
  declare itemsJson: Array<{ variantId: number; quantity: number }>;
  declare branchIdsJson: number[];
  declare leadDays: CreationOptional<number>;
  declare maxActiveSubscribers: CreationOptional<number>;
  declare maxDailyPickups: CreationOptional<number>;
  declare isActive: CreationOptional<boolean>;
  declare sortOrder: CreationOptional<number>;
  declare version: CreationOptional<number>;
  declare effectiveFrom: CreationOptional<Date | null>;
  declare archivedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

SubscriptionPlan.init({
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: false },
  monthlyPrice: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  itemsJson: { type: DataTypes.JSON, allowNull: false },
  branchIdsJson: { type: DataTypes.JSON, allowNull: false },
  leadDays: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 3 },
  maxActiveSubscribers: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 100 },
  maxDailyPickups: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 10 },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
  effectiveFrom: { type: DataTypes.DATE, allowNull: true },
  archivedAt: { type: DataTypes.DATE, allowNull: true },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'SubscriptionPlan', tableName: 'subscription_plans' });

export const SUBSCRIPTION_STATUS = {
  PENDING: 'PENDING', ACTIVE: 'ACTIVE', PAST_DUE: 'PAST_DUE', CANCELED: 'CANCELED',
} as const;
export type SubscriptionStatus = typeof SUBSCRIPTION_STATUS[keyof typeof SUBSCRIPTION_STATUS];

export class Subscription extends Model<InferAttributes<Subscription>, InferCreationAttributes<Subscription>> {
  declare id: CreationOptional<number>;
  declare planId: number;
  declare userId: number;
  declare branchId: number;
  declare status: CreationOptional<SubscriptionStatus>;
  declare providerReference: CreationOptional<string | null>;
  declare planNameSnapshot: string;
  declare priceSnapshot: number;
  declare itemsSnapshotJson: BoxItem[];
  declare leadDaysSnapshot: number;
  declare termsSnapshotJson: CreationOptional<Record<string, unknown> | null>;
  declare termsVersion: string;
  declare termsAcceptedAt: Date;
  declare nextChargeAt: CreationOptional<Date | null>;
  declare canceledAt: CreationOptional<Date | null>;
  declare lastSyncAt: CreationOptional<Date | null>;
  declare lastSyncError: CreationOptional<string | null>;
  declare cancellationReason: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Subscription.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  planId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  status: { type: DataTypes.ENUM(...Object.values(SUBSCRIPTION_STATUS)), allowNull: false, defaultValue: SUBSCRIPTION_STATUS.PENDING },
  providerReference: { type: DataTypes.STRING(100), allowNull: true, unique: true },
  planNameSnapshot: { type: DataTypes.STRING(100), allowNull: false },
  priceSnapshot: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  itemsSnapshotJson: { type: DataTypes.JSON, allowNull: false },
  leadDaysSnapshot: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  termsSnapshotJson: { type: DataTypes.JSON, allowNull: true },
  termsVersion: { type: DataTypes.STRING(20), allowNull: false },
  termsAcceptedAt: { type: DataTypes.DATE, allowNull: false },
  nextChargeAt: { type: DataTypes.DATE, allowNull: true },
  canceledAt: { type: DataTypes.DATE, allowNull: true },
  lastSyncAt: { type: DataTypes.DATE, allowNull: true },
  lastSyncError: { type: DataTypes.STRING(500), allowNull: true },
  cancellationReason: { type: DataTypes.STRING(500), allowNull: true },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'Subscription', tableName: 'subscriptions', indexes: [
  { name: 'idx_subscriptions_user_status', fields: ['user_id', 'status'] },
  { name: 'idx_subscriptions_plan_status', fields: ['plan_id', 'status'] },
] });

export class SubscriptionCycle extends Model<InferAttributes<SubscriptionCycle>, InferCreationAttributes<SubscriptionCycle>> {
  declare id: CreationOptional<number>;
  declare subscriptionId: number;
  declare providerInvoiceId: string;
  declare providerPaymentId: CreationOptional<string | null>;
  declare amount: number;
  declare paidAt: Date;
  declare expiresAt: Date;
  declare orderId: CreationOptional<number | null>;
  declare scheduledAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

SubscriptionCycle.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  subscriptionId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  providerInvoiceId: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  providerPaymentId: { type: DataTypes.STRING(100), allowNull: true },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  paidAt: { type: DataTypes.DATE, allowNull: false },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  orderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, unique: true },
  scheduledAt: { type: DataTypes.DATE, allowNull: true },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'SubscriptionCycle', tableName: 'subscription_cycles', indexes: [
  { name: 'idx_subscription_cycles_subscription', fields: ['subscription_id', 'paid_at'] },
] });
