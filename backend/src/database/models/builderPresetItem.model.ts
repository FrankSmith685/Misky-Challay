import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

export class BuilderPresetItem extends Model<
  InferAttributes<BuilderPresetItem>,
  InferCreationAttributes<BuilderPresetItem>
> {
  declare id: CreationOptional<number>;
  declare presetId: number;
  declare optionId: number;
  declare quantity: CreationOptional<number>;
  declare sortOrder: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

BuilderPresetItem.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    presetId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    optionId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    quantity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'BuilderPresetItem',
    tableName: 'builder_preset_items',
    indexes: [
      { name: 'uq_builder_preset_items_preset_option', unique: true, fields: ['preset_id', 'option_id'] },
    ],
  },
);

export default BuilderPresetItem;
