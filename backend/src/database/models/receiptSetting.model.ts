import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

export const RECEIPT_MODE = {
  INTERNAL_ONLY: 'INTERNAL_ONLY',
  EXTERNAL_MANUAL: 'EXTERNAL_MANUAL',
  INTEGRATED: 'INTEGRATED',
} as const;
export type ReceiptMode = (typeof RECEIPT_MODE)[keyof typeof RECEIPT_MODE];

/** Configuracion global de documentos operativos. Existe una sola fila (id=1). */
export class ReceiptSetting extends Model<
  InferAttributes<ReceiptSetting>,
  InferCreationAttributes<ReceiptSetting>
> {
  declare id: CreationOptional<number>;
  declare mode: CreationOptional<ReceiptMode>;
  declare autoPrintKitchenTicket: CreationOptional<boolean>;
  declare autoPrintCustomerTicket: CreationOptional<boolean>;
  declare paperWidth: CreationOptional<58 | 80>;
  declare version: CreationOptional<number>;
  declare updatedBy: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

ReceiptSetting.init(
  {
    id: { type: DataTypes.TINYINT.UNSIGNED, primaryKey: true, defaultValue: 1 },
    mode: {
      type: DataTypes.ENUM(...Object.values(RECEIPT_MODE)),
      allowNull: false,
      defaultValue: RECEIPT_MODE.INTERNAL_ONLY,
    },
    autoPrintKitchenTicket: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    autoPrintCustomerTicket: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    paperWidth: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 80 },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    updatedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'ReceiptSetting',
    tableName: 'receipt_settings',
  },
);

export default ReceiptSetting;
