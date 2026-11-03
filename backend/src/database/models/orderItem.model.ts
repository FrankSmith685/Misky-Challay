import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from 'sequelize';
import { sequelize } from '../connection';
import type { OrderItemCustomization } from './orderItemCustomization.model';
import type { CakeThemeSnapshot } from './cakeTheme.model';

export interface NutritionSnapshot {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/**
 * Tabla `order_items` (seccion 14.5).
 * RN-017: guarda una FOTOGRAFIA de lo comprado (nombre, precio, nutricion,
 * alergenos). Si manana cambia el catalogo, este pedido no cambia.
 * Los FK al catalogo son solo referenciales y pueden quedar nulos.
 */
export class OrderItem extends Model<
  InferAttributes<OrderItem>,
  InferCreationAttributes<OrderItem>
> {
  declare id: CreationOptional<number>;
  declare orderId: number;
  declare itemKind: CreationOptional<'PRODUCT' | 'EXPERIENCE'>;
  declare productId: number | null;
  declare variantId: number | null;
  declare designQuoteId: CreationOptional<number | null>;
  declare requestedServings: CreationOptional<number | null>;
  declare themeSnapshotJson: CreationOptional<CakeThemeSnapshot | null>;

  declare productNameSnapshot: string;
  declare variantNameSnapshot: CreationOptional<string | null>;
  /** Texto legible de la personalizacion: "Regular · Base: Quinoa · ..." */
  declare descriptionSnapshot: CreationOptional<string | null>;

  declare quantity: number;
  declare unitPrice: number;
  declare extrasTotal: CreationOptional<number>;
  /** Parte del descuento del pedido que corresponde a esta linea (reparto proporcional). */
  declare discountTotal: CreationOptional<number>;
  declare lineTotal: number;
  /** Valor de venta de la linea, ya descontado y sin IGV. */
  declare taxableBase: CreationOptional<number>;
  /** IGV contenido en la linea. Lo exige el detalle de la boleta. */
  declare taxTotal: CreationOptional<number>;

  declare nutritionSnapshotJson: CreationOptional<NutritionSnapshot | null>;
  declare allergenSnapshotJson: CreationOptional<string[] | null>;
  declare designDetailsJson: CreationOptional<{
    inscription: string;
    occasion: string;
    finish: string;
    originalInstructions?: string;
  } | null>;
  declare specialInstructions: CreationOptional<string | null>;

  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare customizations?: NonAttribute<OrderItemCustomization[]>;
}

OrderItem.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    orderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    itemKind: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'PRODUCT' },
    productId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    variantId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    designQuoteId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    requestedServings: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    themeSnapshotJson: { type: DataTypes.JSON, allowNull: true },

    productNameSnapshot: { type: DataTypes.STRING(150), allowNull: false },
    variantNameSnapshot: { type: DataTypes.STRING(120), allowNull: true },
    descriptionSnapshot: { type: DataTypes.TEXT, allowNull: true },

    quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    unitPrice: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    extrasTotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    discountTotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    lineTotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    taxableBase: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    taxTotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },

    nutritionSnapshotJson: { type: DataTypes.JSON, allowNull: true },
    allergenSnapshotJson: { type: DataTypes.JSON, allowNull: true },
    designDetailsJson: { type: DataTypes.JSON, allowNull: true },
    specialInstructions: { type: DataTypes.TEXT, allowNull: true },

    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'OrderItem',
    tableName: 'order_items',
    indexes: [{ name: 'idx_order_items_order', fields: ['order_id'] }],
  },
);

export default OrderItem;
