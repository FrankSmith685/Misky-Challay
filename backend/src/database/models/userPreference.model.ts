import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/** Preferencias alimentarias persistentes que acompanan al cliente en cada pedido. */
export class UserPreference extends Model<
  InferAttributes<UserPreference>,
  InferCreationAttributes<UserPreference>
> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare allergens: CreationOptional<string[]>;
  declare dietaryTags: CreationOptional<string[]>;
  declare dislikedOptionIds: CreationOptional<number[]>;
  declare calorieTarget: CreationOptional<number | null>;
  declare proteinTarget: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

UserPreference.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    allergens: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    dietaryTags: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    dislikedOptionIds: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    calorieTarget: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    proteinTarget: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'UserPreference',
    tableName: 'user_preferences',
    indexes: [{ name: 'uq_user_preferences_user', unique: true, fields: ['user_id'] }],
  },
);

export default UserPreference;
