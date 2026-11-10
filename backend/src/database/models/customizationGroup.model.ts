import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
} from 'sequelize';
import { sequelize } from '../connection';
import type { CustomizationOption } from './customizationOption.model';

export const SELECTION_TYPE = { SINGLE: 'SINGLE', MULTIPLE: 'MULTIPLE' } as const;
export type SelectionType = (typeof SELECTION_TYPE)[keyof typeof SELECTION_TYPE];

/**
 * Tabla `customization_groups` (seccion 14.3): un paso del constructor.
 *
 * minSelection / maxSelection -> RN-006 (obligatorios y limites)
 * freeQuantity -> unidades incluidas sin costo dentro del grupo (RN-007 / 11.2)
 */
export class CustomizationGroup extends Model<
  InferAttributes<CustomizationGroup>,
  InferCreationAttributes<CustomizationGroup>
> {
  declare id: CreationOptional<number>;
  declare code: string;
  declare name: string;
  declare description: CreationOptional<string | null>;
  declare selectionType: CreationOptional<SelectionType>;
  declare minSelection: CreationOptional<number>;
  declare maxSelection: CreationOptional<number>;
  declare freeQuantity: CreationOptional<number>;
  declare sortOrder: CreationOptional<number>;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare version: CreationOptional<number>;

  declare options?: NonAttribute<CustomizationOption[]>;
}

CustomizationGroup.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    code: { type: DataTypes.STRING(40), allowNull: false },
    name: { type: DataTypes.STRING(80), allowNull: false },
    description: { type: DataTypes.STRING(255), allowNull: true },
    selectionType: {
      type: DataTypes.ENUM(...Object.values(SELECTION_TYPE)),
      allowNull: false,
      defaultValue: SELECTION_TYPE.SINGLE,
    },
    minSelection: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    maxSelection: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    freeQuantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
  },
  {
    sequelize,
    modelName: 'CustomizationGroup',
    tableName: 'customization_groups',
    indexes: [{ name: 'uq_customization_groups_code', unique: true, fields: ['code'] }],
    validate: {
      limitesCoherentes(this: CustomizationGroup) {
        if (this.minSelection < 0) throw new Error('min_selection no puede ser negativo');
        if (this.maxSelection < this.minSelection) {
          throw new Error('max_selection debe ser mayor o igual que min_selection');
        }
      },
    },
  },
);

export default CustomizationGroup;
