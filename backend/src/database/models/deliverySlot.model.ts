import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from 'sequelize';
import { sequelize } from '../connection';

/**
 * Tabla `delivery_slots` (seccion 14.8): franja horaria con cupo.
 * RN-004: una franja no acepta mas pedidos que su capacidad, contando las reservas
 * temporales del checkout (reservedCount) ademas de las confirmadas (confirmedCount).
 */
export class DeliverySlot extends Model<
  InferAttributes<DeliverySlot>,
  InferCreationAttributes<DeliverySlot>
> {
  declare id: CreationOptional<number>;
  declare branchId: number;
  declare coverageZoneId: CreationOptional<number | null>;
  declare startsAt: Date;
  declare endsAt: Date;
  declare capacity: CreationOptional<number>;
  declare carCapacity: CreationOptional<number>;
  declare reservedCount: CreationOptional<number>;
  declare confirmedCount: CreationOptional<number>;
  declare orderCutoffAt: Date;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  /** Cupos que todavia se pueden vender (calculado, no es una columna). */
  get availableCount(): NonAttribute<number> {
    return Math.max(0, this.capacity - this.reservedCount - this.confirmedCount);
  }
}

DeliverySlot.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    coverageZoneId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    startsAt: { type: DataTypes.DATE, allowNull: false },
    endsAt: { type: DataTypes.DATE, allowNull: false },
    capacity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 20 },
    carCapacity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    reservedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    confirmedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    orderCutoffAt: { type: DataTypes.DATE, allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'DeliverySlot',
    tableName: 'delivery_slots',
    indexes: [{ fields: ['branch_id', 'starts_at'] }],
    validate: {
      rangoValido(this: DeliverySlot) {
        if (this.endsAt <= this.startsAt) {
          throw new Error('delivery_slots: ends_at debe ser mayor que starts_at');
        }
        if (this.orderCutoffAt > this.startsAt) {
          throw new Error('delivery_slots: el cierre de venta no puede ser posterior al inicio');
        }
      },
    },
  },
);

export default DeliverySlot;
