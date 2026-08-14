import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/** Mesa física de un local. Su ocupación se deriva de la comanda abierta. */
export class DiningTable extends Model<
  InferAttributes<DiningTable>,
  InferCreationAttributes<DiningTable>
> {
  declare id: CreationOptional<number>;
  declare branchId: number;
  declare code: string;
  declare area: CreationOptional<string>;
  declare capacity: CreationOptional<number>;
  /** Token de capacidad para la carta QR. No contiene ids predecibles. */
  declare qrToken: CreationOptional<string>;
  declare qrEnabled: CreationOptional<boolean>;
  declare sortOrder: CreationOptional<number>;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

DiningTable.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    code: { type: DataTypes.STRING(30), allowNull: false },
    area: { type: DataTypes.STRING(60), allowNull: false, defaultValue: 'Salón principal' },
    capacity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 2 },
    // Nullable durante `sync({ alter: true })`: MySQL rellena con cadena vacÃ­a
    // una columna UUID NOT NULL agregada a mesas antiguas y el Ã­ndice UNIQUE
    // falla antes de que podamos asignar tokens. El bootstrap completa los
    // valores antes y despuÃ©s del sync; la migraciÃ³n 0018 lo deja NOT NULL.
    qrToken: { type: DataTypes.UUID, allowNull: true, defaultValue: DataTypes.UUIDV4 },
    qrEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'DiningTable',
    tableName: 'dining_tables',
    indexes: [
      { name: 'uq_dining_tables_branch_code', unique: true, fields: ['branch_id', 'code'] },
      { name: 'uq_dining_tables_qr_token', unique: true, fields: ['qr_token'] },
      { name: 'idx_dining_tables_branch_active', fields: ['branch_id', 'is_active', 'sort_order'] },
    ],
  },
);

export default DiningTable;
