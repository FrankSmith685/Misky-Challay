import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';
import type { StorefrontContent } from '@modules/settings/storefront.schema';

export class StorefrontSetting extends Model<
  InferAttributes<StorefrontSetting>,
  InferCreationAttributes<StorefrontSetting>
> {
  declare id: CreationOptional<number>;
  declare contentJson: StorefrontContent;
  declare version: number;
  declare updatedBy: CreationOptional<number | null>;
  declare lastPublishKey: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
StorefrontSetting.init(
  {
    id: { type: DataTypes.TINYINT.UNSIGNED, primaryKey: true, defaultValue: 1 },
    contentJson: { type: DataTypes.JSON, allowNull: false },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    updatedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    lastPublishKey: { type: DataTypes.STRING(100), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'storefront_settings', modelName: 'StorefrontSetting' },
);
