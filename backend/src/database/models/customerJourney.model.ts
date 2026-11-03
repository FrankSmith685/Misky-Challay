import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

export interface ChannelPreferences {
  email: boolean;
  whatsapp: boolean;
  push: boolean;
}
export class CustomerWorkspace extends Model<
  InferAttributes<CustomerWorkspace>,
  InferCreationAttributes<CustomerWorkspace>
> {
  declare userId: number;
  declare revision: CreationOptional<number>;
  declare cartJson: CreationOptional<unknown[]>;
  declare favoritesJson: CreationOptional<unknown[]>;
  declare draftsJson: CreationOptional<Record<string, unknown>>;
  declare channelsJson: CreationOptional<ChannelPreferences>;
  declare updatedAt: CreationOptional<Date>;
}
CustomerWorkspace.init(
  {
    userId: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true },
    revision: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 1 },
    cartJson: { type: DataTypes.JSON, defaultValue: [] },
    favoritesJson: { type: DataTypes.JSON, defaultValue: [] },
    draftsJson: { type: DataTypes.JSON, defaultValue: {} },
    channelsJson: {
      type: DataTypes.JSON,
      defaultValue: { email: true, whatsapp: true, push: true },
    },
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'customer_workspaces', modelName: 'CustomerWorkspace', createdAt: false },
);

export class CustomerMedia extends Model<
  InferAttributes<CustomerMedia>,
  InferCreationAttributes<CustomerMedia>
> {
  declare id: string;
  declare userId: number;
  declare hash: string;
  declare mime: string;
  declare bytes: Buffer;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
CustomerMedia.init(
  {
    id: { type: DataTypes.STRING(36), primaryKey: true },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    hash: { type: DataTypes.STRING(64), allowNull: false },
    mime: { type: DataTypes.STRING(40), allowNull: false },
    bytes: { type: DataTypes.BLOB('medium'), allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'customer_media',
    modelName: 'CustomerMedia',
    indexes: [{ unique: true, fields: ['user_id', 'hash'] }],
  },
);

export interface CaseMessage {
  id: string;
  author: 'CUSTOMER' | 'STAFF';
  text: string;
  createdAt: string;
}
export class CustomerOrderCase extends Model<
  InferAttributes<CustomerOrderCase>,
  InferCreationAttributes<CustomerOrderCase>
> {
  declare id: CreationOptional<number>;
  declare orderId: number;
  declare userId: number;
  declare branchId: number;
  declare kind: 'SUPPORT' | 'CHANGE' | 'DESIGN';
  declare status: CreationOptional<
    'OPEN' | 'AWAITING_CUSTOMER' | 'ACCEPTED' | 'REJECTED' | 'CLOSED'
  >;
  declare version: CreationOptional<number>;
  declare payloadJson: Record<string, unknown>;
  declare messagesJson: CaseMessage[];
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
CustomerOrderCase.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    orderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    kind: { type: DataTypes.STRING(20), allowNull: false },
    status: { type: DataTypes.STRING(30), defaultValue: 'OPEN' },
    version: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 1 },
    payloadJson: { type: DataTypes.JSON, allowNull: false },
    messagesJson: { type: DataTypes.JSON, allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'customer_order_cases',
    modelName: 'CustomerOrderCase',
    indexes: [{ fields: ['order_id', 'id'] }, { fields: ['branch_id', 'status'] }],
  },
);

export class CustomerCarePolicy extends Model<
  InferAttributes<CustomerCarePolicy>,
  InferCreationAttributes<CustomerCarePolicy>
> {
  declare id: CreationOptional<number>;
  declare version: CreationOptional<number>;
  declare content: string;
  declare productInstructionsJson: Record<string, string>;
  declare updatedAt: CreationOptional<Date>;
}
CustomerCarePolicy.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, defaultValue: 1 },
    version: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 1 },
    content: { type: DataTypes.TEXT, allowNull: false },
    productInstructionsJson: { type: DataTypes.JSON, allowNull: false },
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'customer_care_policies',
    modelName: 'CustomerCarePolicy',
    createdAt: false,
  },
);
