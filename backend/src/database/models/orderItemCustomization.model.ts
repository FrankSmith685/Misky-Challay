import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';
import type { NutritionSnapshot } from './orderItem.model';

/**
 * Tabla `order_item_customizations`: la personalizacion historica del plato.
 * Guarda los NOMBRES, no solo los ids: si borran la opcion del catalogo, el
 * pedido sigue diciendo que llevaba "Salmon fresco" (RN-017).
 */
export class OrderItemCustomization extends Model<
  InferAttributes<OrderItemCustomization>,
  InferCreationAttributes<OrderItemCustomization>
> {
  declare id: CreationOptional<number>;
  declare orderItemId: number;
  declare groupId: number | null;
  declare groupNameSnapshot: string;
  declare optionId: number | null;
  declare optionNameSnapshot: string;
  declare quantity: CreationOptional<number>;
  declare priceDelta: CreationOptional<number>;
  /** Lo que realmente se cobro por esta opcion (0 si entro en las incluidas). */
  declare lineExtra: CreationOptional<number>;
  declare nutritionSnapshotJson: CreationOptional<NutritionSnapshot | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

OrderItemCustomization.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    orderItemId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    groupId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    groupNameSnapshot: { type: DataTypes.STRING(80), allowNull: false },
    optionId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    optionNameSnapshot: { type: DataTypes.STRING(80), allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    priceDelta: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    lineExtra: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    nutritionSnapshotJson: { type: DataTypes.JSON, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'OrderItemCustomization',
    tableName: 'order_item_customizations',
    indexes: [{ name: 'idx_oic_item', fields: ['order_item_id'] }],
  },
);

export default OrderItemCustomization;
