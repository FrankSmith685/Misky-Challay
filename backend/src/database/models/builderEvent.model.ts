import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

export const BUILDER_EVENT_TYPES = [
  'VIEW',
  'START',
  'OPTION_SELECT',
  'CONFLICT_RESOLVE',
  'PRESET_APPLY',
  'QUOTE_ERROR',
  'COMPLETE',
  'ADD_TO_CART',
  'SAVE_BOWL',
  'ABANDON',
] as const;
export type BuilderEventType = (typeof BUILDER_EVENT_TYPES)[number];

/** Eventos anónimos o autenticados del embudo del constructor. */
export class BuilderEvent extends Model<
  InferAttributes<BuilderEvent>,
  InferCreationAttributes<BuilderEvent>
> {
  declare id: CreationOptional<number>;
  declare sessionId: string;
  declare userId: CreationOptional<number | null>;
  declare productId: number;
  declare eventType: BuilderEventType;
  declare groupId: CreationOptional<number | null>;
  declare optionId: CreationOptional<number | null>;
  declare presetId: CreationOptional<number | null>;
  declare metadata: CreationOptional<Record<string, unknown> | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

BuilderEvent.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    sessionId: { type: DataTypes.STRING(64), allowNull: false },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    productId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    eventType: { type: DataTypes.ENUM(...BUILDER_EVENT_TYPES), allowNull: false },
    groupId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    optionId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    presetId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    metadata: { type: DataTypes.JSON, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'BuilderEvent',
    tableName: 'builder_events',
    indexes: [
      { fields: ['product_id', 'created_at'] },
      { fields: ['event_type', 'created_at'] },
      { fields: ['session_id'] },
      { fields: ['option_id'] },
    ],
  },
);

export default BuilderEvent;
