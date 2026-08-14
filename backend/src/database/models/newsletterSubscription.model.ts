import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../connection';

export const NEWSLETTER_STATUS = { SUBSCRIBED: 'SUBSCRIBED', UNSUBSCRIBED: 'UNSUBSCRIBED' } as const;
export type NewsletterStatus = (typeof NEWSLETTER_STATUS)[keyof typeof NEWSLETTER_STATUS];

/** Consentimiento de comunicaciones comerciales, separado de notificaciones operativas. */
export class NewsletterSubscription extends Model<InferAttributes<NewsletterSubscription>, InferCreationAttributes<NewsletterSubscription>> {
  declare id: CreationOptional<number>;
  declare userId: CreationOptional<number | null>;
  declare email: string;
  declare status: CreationOptional<NewsletterStatus>;
  declare source: CreationOptional<'WEB' | 'MOBILE'>;
  declare subscribedAt: CreationOptional<Date | null>;
  declare unsubscribedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

NewsletterSubscription.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  email: { type: DataTypes.STRING(191), allowNull: false },
  status: { type: DataTypes.ENUM(...Object.values(NEWSLETTER_STATUS)), allowNull: false, defaultValue: NEWSLETTER_STATUS.SUBSCRIBED },
  source: { type: DataTypes.ENUM('WEB', 'MOBILE'), allowNull: false, defaultValue: 'WEB' },
  subscribedAt: { type: DataTypes.DATE, allowNull: true },
  unsubscribedAt: { type: DataTypes.DATE, allowNull: true },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE,
}, {
  sequelize,
  modelName: 'NewsletterSubscription',
  tableName: 'newsletter_subscriptions',
  indexes: [
    { name: 'uq_newsletter_subscriptions_email', unique: true, fields: ['email'] },
    { name: 'idx_newsletter_subscriptions_user', fields: ['user_id'] },
  ],
});

export default NewsletterSubscription;
