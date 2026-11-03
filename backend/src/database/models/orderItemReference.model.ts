import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../connection';

/** Private order images, copied at checkout. Never include bytes in order responses. */
export class OrderItemReference extends Model<InferAttributes<OrderItemReference>, InferCreationAttributes<OrderItemReference>> {
  declare id: CreationOptional<number>;
  declare orderItemId: number;
  declare kind: CreationOptional<'CUSTOMER_REFERENCE' | 'AI_PROPOSAL'>;
  declare position: CreationOptional<number>;
  declare mime: string;
  declare bytes: Buffer;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

OrderItemReference.init({
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  orderItemId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  kind: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'CUSTOMER_REFERENCE' },
  position: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0 },
  mime: { type: DataTypes.STRING(30), allowNull: false },
  bytes: { type: DataTypes.BLOB('long'), allowNull: false },
  createdAt: DataTypes.DATE,
  updatedAt: DataTypes.DATE,
}, { sequelize, modelName: 'OrderItemReference', tableName: 'order_item_references', indexes: [
  { name: 'uq_order_item_images_kind_position', fields: ['order_item_id', 'kind', 'position'], unique: true },
] });
