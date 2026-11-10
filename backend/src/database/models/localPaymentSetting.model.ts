import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/** Configuracion singleton de pagos peruanos mostrada en web y app. */
export class LocalPaymentSetting extends Model<
  InferAttributes<LocalPaymentSetting>,
  InferCreationAttributes<LocalPaymentSetting>
> {
  declare id: CreationOptional<number>;
  declare yapeEnabled: CreationOptional<boolean>;
  declare yapePhone: CreationOptional<string | null>;
  declare yapeRecipient: CreationOptional<string | null>;
  declare yapeQrImageUrl: CreationOptional<string | null>;
  declare plinEnabled: CreationOptional<boolean>;
  declare plinPhone: CreationOptional<string | null>;
  declare plinRecipient: CreationOptional<string | null>;
  declare plinQrImageUrl: CreationOptional<string | null>;
  declare instructions: CreationOptional<string | null>;
  declare paymentWindowMinutes: CreationOptional<number>;
  declare reviewAlertMinutes: CreationOptional<number>;
  declare version: CreationOptional<number>;
  declare updatedBy: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

LocalPaymentSetting.init(
  {
    id: { type: DataTypes.TINYINT.UNSIGNED, primaryKey: true, defaultValue: 1 },
    yapeEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    yapePhone: { type: DataTypes.STRING(30), allowNull: true },
    yapeRecipient: { type: DataTypes.STRING(120), allowNull: true },
    yapeQrImageUrl: { type: DataTypes.STRING(500), allowNull: true },
    plinEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    plinPhone: { type: DataTypes.STRING(30), allowNull: true },
    plinRecipient: { type: DataTypes.STRING(120), allowNull: true },
    plinQrImageUrl: { type: DataTypes.STRING(500), allowNull: true },
    instructions: { type: DataTypes.STRING(500), allowNull: true },
    paymentWindowMinutes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 15 },
    reviewAlertMinutes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 10 },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    updatedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: 'LocalPaymentSetting', tableName: 'local_payment_settings' },
);

export default LocalPaymentSetting;
