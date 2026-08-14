import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  type NonAttribute,
} from 'sequelize';
import { sequelize } from '../connection';
import type { Product } from './product.model';
import type { Branch } from './branch.model';
import type { User } from './user.model';

export const AVAILABILITY_SUBSCRIPTION_STATUS = {
  WAITING: 'WAITING',
  NOTIFIED: 'NOTIFIED',
  CANCELLED: 'CANCELLED',
} as const;

export type AvailabilitySubscriptionStatus =
  (typeof AVAILABILITY_SUBSCRIPTION_STATUS)[keyof typeof AVAILABILITY_SUBSCRIPTION_STATUS];

/** Solicitud del cliente para recibir un aviso cuando un plato vuelva en un local. */
export class ProductAvailabilitySubscription extends Model<
  InferAttributes<ProductAvailabilitySubscription>,
  InferCreationAttributes<ProductAvailabilitySubscription>
> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare productId: number;
  declare branchId: number;
  declare notifyEmail: CreationOptional<boolean>;
  declare notifyInApp: CreationOptional<boolean>;
  declare status: CreationOptional<AvailabilitySubscriptionStatus>;
  declare notifiedAt: CreationOptional<Date | null>;
  declare cancelledAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare product?: NonAttribute<Product>;
  declare branch?: NonAttribute<Branch>;
  declare user?: NonAttribute<User>;
}

ProductAvailabilitySubscription.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    productId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    notifyEmail: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    notifyInApp: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    status: {
      type: DataTypes.ENUM(...Object.values(AVAILABILITY_SUBSCRIPTION_STATUS)),
      allowNull: false,
      defaultValue: AVAILABILITY_SUBSCRIPTION_STATUS.WAITING,
    },
    notifiedAt: { type: DataTypes.DATE, allowNull: true },
    cancelledAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'ProductAvailabilitySubscription',
    tableName: 'product_availability_subscriptions',
    indexes: [
      {
        name: 'uq_product_availability_subscription',
        unique: true,
        fields: ['user_id', 'product_id', 'branch_id'],
      },
      { name: 'idx_availability_subscription_waiting', fields: ['product_id', 'branch_id', 'status'] },
    ],
  },
);

export default ProductAvailabilitySubscription;
