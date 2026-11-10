import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/** Perfil legal y de contacto editable por el superadmin. Existe una sola fila (id=1). */
export class BusinessSetting extends Model<
  InferAttributes<BusinessSetting>,
  InferCreationAttributes<BusinessSetting>
> {
  declare id: CreationOptional<number>;
  declare legalName: string;
  declare commercialName: string;
  declare ruc: string;
  declare address: string;
  declare phone: string;
  declare email: string;
  declare supportEmail: string;
  declare complaintResponseDays: number;
  declare timeZone: string;
  declare currency: string;
  declare taxRate: number;
  declare platformCommissionRate: number;
  declare version: CreationOptional<number>;
  declare updatedBy: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

BusinessSetting.init(
  {
    id: { type: DataTypes.TINYINT.UNSIGNED, primaryKey: true, defaultValue: 1 },
    legalName: { type: DataTypes.STRING(180), allowNull: false },
    commercialName: { type: DataTypes.STRING(100), allowNull: false },
    ruc: { type: DataTypes.CHAR(11), allowNull: false },
    address: { type: DataTypes.STRING(255), allowNull: false },
    phone: { type: DataTypes.STRING(30), allowNull: false },
    email: { type: DataTypes.STRING(160), allowNull: false },
    supportEmail: { type: DataTypes.STRING(160), allowNull: false },
    complaintResponseDays: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 15 },
    timeZone: { field: 'time_zone', type: DataTypes.STRING(64), allowNull: false, defaultValue: 'America/Lima' },
    currency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'PEN' },
    taxRate: { field: 'tax_rate', type: DataTypes.DECIMAL(5, 4), allowNull: false, defaultValue: 0.18 },
    platformCommissionRate: { field: 'platform_commission_rate', type: DataTypes.DECIMAL(5, 4), allowNull: false, defaultValue: 0.15 },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    updatedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'BusinessSetting',
    tableName: 'business_settings',
  },
);

export default BusinessSetting;
