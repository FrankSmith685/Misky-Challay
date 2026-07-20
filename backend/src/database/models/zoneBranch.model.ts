import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/**
 * Tabla puente `zone_branches`: que sucursales atienden una zona y con que prioridad.
 * RN-002: la sucursal elegible se decide aqui y queda guardada en el pedido.
 */
export class ZoneBranch extends Model<
  InferAttributes<ZoneBranch>,
  InferCreationAttributes<ZoneBranch>
> {
  declare id: CreationOptional<number>;
  declare coverageZoneId: number;
  declare branchId: number;
  declare priority: CreationOptional<number>;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

ZoneBranch.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    coverageZoneId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'ZoneBranch',
    tableName: 'zone_branches',
    indexes: [{ unique: true, fields: ['coverage_zone_id', 'branch_id'] }],
  },
);

export default ZoneBranch;
