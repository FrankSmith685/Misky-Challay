import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

export const CASH_SESSION_STATUS = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;
export type CashSessionStatus = (typeof CASH_SESSION_STATUS)[keyof typeof CASH_SESSION_STATUS];

/** Jornada de caja por sucursal y fecha operativa de Lima. */
export class CashSession extends Model<InferAttributes<CashSession>, InferCreationAttributes<CashSession>> {
  declare id: CreationOptional<number>;
  declare branchId: number;
  declare businessDate: string;
  declare status: CashSessionStatus;
  declare openedBy: number;
  declare openedAt: CreationOptional<Date>;
  declare openingFloat: number;
  declare closedBy: CreationOptional<number | null>;
  declare closedAt: CreationOptional<Date | null>;
  declare expectedCash: CreationOptional<number | null>;
  declare declaredCash: CreationOptional<number | null>;
  declare variance: CreationOptional<number | null>;
  declare closingNotes: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

CashSession.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    branchId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    businessDate: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.ENUM(...Object.values(CASH_SESSION_STATUS)), allowNull: false, defaultValue: CASH_SESSION_STATUS.OPEN },
    openedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    openedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    openingFloat: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    closedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    closedAt: { type: DataTypes.DATE, allowNull: true },
    expectedCash: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    declaredCash: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    variance: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    closingNotes: { type: DataTypes.STRING(500), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'CashSession',
    tableName: 'cash_sessions',
    indexes: [
      { name: 'idx_cash_sessions_branch_date', fields: ['branch_id', 'business_date'] },
      { name: 'idx_cash_sessions_open', fields: ['branch_id', 'status'] },
    ],
  },
);

export default CashSession;
