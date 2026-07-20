import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/**
 * Tabla `branch_schedules`: horario regular por dia de la semana y excepciones por fecha.
 * RN-003: la sucursal debe estar abierta en la fecha/hora solicitada.
 *
 * weekday: 0 = domingo ... 6 = sabado. Si `exceptionDate` tiene valor, esa fila
 * manda sobre el horario regular de ese dia (feriado, cierre, horario especial).
 */
export class BranchSchedule extends Model<
  InferAttributes<BranchSchedule>,
  InferCreationAttributes<BranchSchedule>
> {
  declare id: CreationOptional<number>;
  declare branchId: number;
  declare weekday: CreationOptional<number | null>;
  declare exceptionDate: CreationOptional<string | null>;
  declare opensAt: string;
  declare closesAt: string;
  declare isClosed: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

BranchSchedule.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    weekday: { type: DataTypes.TINYINT, allowNull: true },
    exceptionDate: { type: DataTypes.DATEONLY, allowNull: true },
    opensAt: { type: DataTypes.STRING(5), allowNull: false, defaultValue: '10:00' },
    closesAt: { type: DataTypes.STRING(5), allowNull: false, defaultValue: '22:00' },
    isClosed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'BranchSchedule',
    tableName: 'branch_schedules',
    indexes: [{ fields: ['branch_id', 'weekday'] }],
  },
);

export default BranchSchedule;
