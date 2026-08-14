import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addIndexIfMissing, tableExists } from '../migrationHelpers';

export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  if (!(await tableExists(context, 'product_favorites'))) await context.createTable('product_favorites', {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    product_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await addIndexIfMissing(context, 'product_favorites', ['user_id', 'product_id'], { name: 'uq_product_favorites_user_product', unique: true });

  if (!(await tableExists(context, 'product_reviews'))) await context.createTable('product_reviews', {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    product_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    order_item_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    rating: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
    comment: { type: DataTypes.STRING(800), allowNull: true },
    status: { type: DataTypes.ENUM('PUBLISHED', 'HIDDEN'), allowNull: false, defaultValue: 'PUBLISHED' },
    verified_purchase: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await addIndexIfMissing(context, 'product_reviews', ['order_item_id'], { name: 'uq_product_reviews_order_item', unique: true });
  await addIndexIfMissing(context, 'product_reviews', ['product_id', 'status', 'created_at'], { name: 'idx_product_reviews_product_status' });
  await addIndexIfMissing(context, 'product_reviews', ['user_id', 'created_at'], { name: 'idx_product_reviews_user' });

  if (!(await tableExists(context, 'newsletter_subscriptions'))) await context.createTable('newsletter_subscriptions', {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    email: { type: DataTypes.STRING(191), allowNull: false },
    status: { type: DataTypes.ENUM('SUBSCRIBED', 'UNSUBSCRIBED'), allowNull: false, defaultValue: 'SUBSCRIBED' },
    source: { type: DataTypes.ENUM('WEB', 'MOBILE'), allowNull: false, defaultValue: 'WEB' },
    subscribed_at: { type: DataTypes.DATE, allowNull: true },
    unsubscribed_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await addIndexIfMissing(context, 'newsletter_subscriptions', ['email'], { name: 'uq_newsletter_subscriptions_email', unique: true });
  await addIndexIfMissing(context, 'newsletter_subscriptions', ['user_id'], { name: 'idx_newsletter_subscriptions_user' });

  await context.changeColumn('ux_events', 'event_type', {
    type: DataTypes.ENUM('COVERAGE_SUCCESS', 'COVERAGE_FAIL', 'COVERAGE_ERROR', 'CHECKOUT_START', 'CHECKOUT_ERROR', 'PAYMENT_REDIRECT', 'APP_OPEN', 'MENU_VIEW', 'PRODUCT_VIEW', 'FAVORITE_ADD', 'FAVORITE_REMOVE', 'CART_ADD', 'CHECKOUT_STEP', 'ORDER_COMPLETED', 'REVIEW_SUBMITTED', 'RECOMMENDATION_OPEN'),
    allowNull: false,
  });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await context.changeColumn('ux_events', 'event_type', {
    type: DataTypes.ENUM('COVERAGE_SUCCESS', 'COVERAGE_FAIL', 'COVERAGE_ERROR', 'CHECKOUT_START', 'CHECKOUT_ERROR', 'PAYMENT_REDIRECT'),
    allowNull: false,
  });
  await context.dropTable('newsletter_subscriptions');
  await context.dropTable('product_reviews');
  await context.dropTable('product_favorites');
};
