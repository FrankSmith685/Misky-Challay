import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/** Tabla `delivery_events`: historial del reparto (asignado, recogido, en ruta, entregado). */
export class DeliveryEvent extends Model<
  InferAttributes<DeliveryEvent>,
  InferCreationAttributes<DeliveryEvent>
> {
  declare id: CreationOptional<number>;
  declare deliveryId: number;
  declare fromStatus: CreationOptional<string | null>;
  declare toStatus: string;
  declare actorId: CreationOptional<number | null>;
  declare latitude: CreationOptional<number | null>;
  declare longitude: CreationOptional<number | null>;
  declare comment: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

DeliveryEvent.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    deliveryId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    fromStatus: { type: DataTypes.STRING(20), allowNull: true },
    toStatus: { type: DataTypes.STRING(20), allowNull: false },
    actorId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    latitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    longitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    comment: { type: DataTypes.STRING(255), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'DeliveryEvent',
    tableName: 'delivery_events',
    indexes: [{ name: 'idx_delivery_events_delivery', fields: ['delivery_id'] }],
  },
);

export default DeliveryEvent;
