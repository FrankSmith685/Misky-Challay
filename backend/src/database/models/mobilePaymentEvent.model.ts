import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/** Append-only history; evidence is served through authenticated endpoints. */
export class MobilePaymentEvent extends Model<
  InferAttributes<MobilePaymentEvent>,
  InferCreationAttributes<MobilePaymentEvent>
> {
  declare id: CreationOptional<number>;
  declare paymentId: number;
  declare actorId: CreationOptional<number | null>;
  declare kind: string;
  declare details: CreationOptional<Record<string, unknown> | null>;
  declare evidenceMime: CreationOptional<string | null>;
  declare evidenceBytes: CreationOptional<Buffer | null>;
  declare createdAt: CreationOptional<Date>;
}

MobilePaymentEvent.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    paymentId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    actorId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    kind: { type: DataTypes.STRING(30), allowNull: false },
    details: { type: DataTypes.JSON, allowNull: true },
    evidenceMime: { type: DataTypes.STRING(40), allowNull: true },
    evidenceBytes: { type: DataTypes.BLOB('medium'), allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'MobilePaymentEvent',
    tableName: 'mobile_payment_events',
    updatedAt: false,
    indexes: [{ name: 'idx_mobile_events_payment', fields: ['payment_id', 'created_at'] }],
  },
);
