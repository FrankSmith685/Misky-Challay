import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../connection';

export const REVIEW_STATUS = { PUBLISHED: 'PUBLISHED', HIDDEN: 'HIDDEN' } as const;
export type ReviewStatus = (typeof REVIEW_STATUS)[keyof typeof REVIEW_STATUS];

/** RN-020: una reseña solo nace desde una línea de pedido entregado. */
export class ProductReview extends Model<InferAttributes<ProductReview>, InferCreationAttributes<ProductReview>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare productId: number;
  declare orderItemId: number;
  declare rating: number;
  declare comment: CreationOptional<string | null>;
  declare status: CreationOptional<ReviewStatus>;
  declare verifiedPurchase: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

ProductReview.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  productId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  orderItemId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  rating: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
  comment: { type: DataTypes.STRING(800), allowNull: true },
  status: { type: DataTypes.ENUM(...Object.values(REVIEW_STATUS)), allowNull: false, defaultValue: REVIEW_STATUS.PUBLISHED },
  verifiedPurchase: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE,
}, {
  sequelize,
  modelName: 'ProductReview',
  tableName: 'product_reviews',
  indexes: [
    { name: 'uq_product_reviews_order_item', unique: true, fields: ['order_item_id'] },
    { name: 'idx_product_reviews_product_status', fields: ['product_id', 'status', 'created_at'] },
    { name: 'idx_product_reviews_user', fields: ['user_id', 'created_at'] },
  ],
});

export default ProductReview;
