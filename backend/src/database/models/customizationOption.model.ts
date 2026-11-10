import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';
import type { CakeEffort } from './cakeProduction.model';

export const OPTION_STATUS = {
  ACTIVE: 'ACTIVE',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  INACTIVE: 'INACTIVE',
} as const;
export type OptionStatus = (typeof OPTION_STATUS)[keyof typeof OPTION_STATUS];

/**
 * Tabla `customization_options` (seccion 14.3): cada opcion de un paso.
 *
 * priceDelta -> lo que suma al precio si se cobra (RN-007).
 * calorias/macros -> aporte nutricional de la opcion (RN-008). Decision de Fase 0:
 * se cargan manualmente; mas adelante pueden derivarse del ingrediente vinculado.
 */
export class CustomizationOption extends Model<
  InferAttributes<CustomizationOption>,
  InferCreationAttributes<CustomizationOption>
> {
  declare id: CreationOptional<number>;
  declare groupId: number;
  declare ingredientId: CreationOptional<number | null>;
  declare name: string;
  declare description: CreationOptional<string | null>;
  declare imageUrl: CreationOptional<string | null>;
  declare imageAlt: CreationOptional<string | null>;
  declare imagePosition: CreationOptional<string>;
  declare dietaryTags: CreationOptional<string[]>;
  declare allergens: CreationOptional<string[]>;
  declare spiceLevel: CreationOptional<number>;
  declare priceDelta: CreationOptional<number>;
  /**
   * true  -> suplemento: SIEMPRE se cobra y no consume las unidades incluidas del grupo
   *          (ej. salmon premium dentro de "1 proteina incluida").
   * false -> extra normal: es gratis si entra en freeQuantity del grupo.
   */
  declare chargeAlways: CreationOptional<boolean>;
  /** Al pedir porciones libres, escala precio, insumo y esfuerzo de esta opcion. */
  declare cakeScaleWithServings: CreationOptional<boolean>;
  declare calories: CreationOptional<number>;
  declare protein: CreationOptional<number>;
  declare carbs: CreationOptional<number>;
  declare fat: CreationOptional<number>;
  declare maxPerItem: CreationOptional<number>;
  /** Insumo que descuenta del inventario al elegir esta opcion (RN-016). */
  declare inventoryItemId: CreationOptional<number | null>;
  /** Cuanto de ese insumo consume una unidad de la opcion (en la unidad del insumo). */
  declare consumptionQuantity: CreationOptional<number>;
  /** Minutos adicionales por estacion de produccion de tortas. */
  declare productionMinutesJson: CreationOptional<CakeEffort>;
  declare status: CreationOptional<OptionStatus>;
  declare sortOrder: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare version: CreationOptional<number>;
}

CustomizationOption.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    groupId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    ingredientId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    name: { type: DataTypes.STRING(80), allowNull: false },
    description: { type: DataTypes.STRING(255), allowNull: true },
    imageUrl: { type: DataTypes.STRING(255), allowNull: true },
    imageAlt: { type: DataTypes.STRING(180), allowNull: true },
    imagePosition: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '50% 50%' },
    dietaryTags: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    allergens: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    spiceLevel: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0 },
    priceDelta: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    chargeAlways: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    cakeScaleWithServings: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    calories: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
    protein: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
    carbs: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
    fat: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
    maxPerItem: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    inventoryItemId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    consumptionQuantity: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    productionMinutesJson: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    status: {
      type: DataTypes.ENUM(...Object.values(OPTION_STATUS)),
      allowNull: false,
      defaultValue: OPTION_STATUS.ACTIVE,
    },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
  },
  {
    sequelize,
    modelName: 'CustomizationOption',
    tableName: 'customization_options',
    indexes: [{ fields: ['group_id'] }, { fields: ['status'] }],
  },
);

export default CustomizationOption;
