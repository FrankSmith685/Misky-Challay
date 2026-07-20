import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/**
 * Tabla `option_incompatibilities`: pares de opciones que no pueden ir juntas.
 * El servicio de personalizacion la trata como simetrica (A-B implica B-A).
 */
export class OptionIncompatibility extends Model<
  InferAttributes<OptionIncompatibility>,
  InferCreationAttributes<OptionIncompatibility>
> {
  declare id: CreationOptional<number>;
  declare optionId: number;
  declare incompatibleOptionId: number;
  declare reason: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

OptionIncompatibility.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    optionId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    incompatibleOptionId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    reason: { type: DataTypes.STRING(255), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'OptionIncompatibility',
    tableName: 'option_incompatibilities',
    indexes: [
      {
        name: 'uq_option_incompatibilities_pair',
        unique: true,
        fields: ['option_id', 'incompatible_option_id'],
      },
    ],
  },
);

export default OptionIncompatibility;
