import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

export interface SavedBowlSelection {
  optionId: number;
  quantity: number;
}

/** Receta personal guardada por un cliente para volver a pedirla. */
export class SavedBowl extends Model<InferAttributes<SavedBowl>, InferCreationAttributes<SavedBowl>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare productId: number;
  declare variantId: number;
  declare name: string;
  declare selections: SavedBowlSelection[];
  declare lastOrderedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date | null>;
}

SavedBowl.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    productId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    variantId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    name: { type: DataTypes.STRING(80), allowNull: false },
    selections: { type: DataTypes.JSON, allowNull: false },
    lastOrderedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
    deletedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'SavedBowl',
    tableName: 'saved_bowls',
    paranoid: true,
    indexes: [
      { fields: ['user_id', 'updated_at'] },
      { fields: ['product_id'] },
    ],
  },
);

export default SavedBowl;
