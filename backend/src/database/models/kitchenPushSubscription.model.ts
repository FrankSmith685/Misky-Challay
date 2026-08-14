import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/** Dispositivo autorizado para recibir alertas operativas de una sucursal. */
export class KitchenPushSubscription extends Model<
  InferAttributes<KitchenPushSubscription>,
  InferCreationAttributes<KitchenPushSubscription>
> {
  declare id: CreationOptional<number>;
  declare endpointHash: string;
  declare endpoint: string;
  declare p256dh: string;
  declare auth: string;
  declare userId: number;
  declare branchId: number;
  declare userAgent: CreationOptional<string | null>;
  declare isActive: CreationOptional<boolean>;
  declare lastSuccessAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

KitchenPushSubscription.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    endpointHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    endpoint: { type: DataTypes.TEXT, allowNull: false },
    p256dh: { type: DataTypes.STRING(255), allowNull: false },
    auth: { type: DataTypes.STRING(255), allowNull: false },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    userAgent: { type: DataTypes.STRING(255), allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    lastSuccessAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'KitchenPushSubscription',
    tableName: 'kitchen_push_subscriptions',
    indexes: [
      { name: 'idx_kitchen_push_branch_active', fields: ['branch_id', 'is_active'] },
      { name: 'idx_kitchen_push_user', fields: ['user_id'] },
    ],
  },
);

export default KitchenPushSubscription;

