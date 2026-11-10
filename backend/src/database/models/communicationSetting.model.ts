import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/** Correo y notificaciones editables por superadmin. Singleton id=1. */
export class CommunicationSetting extends Model<
  InferAttributes<CommunicationSetting>,
  InferCreationAttributes<CommunicationSetting>
> {
  declare id: CreationOptional<number>;
  declare emailNotificationsEnabled: CreationOptional<boolean>;
  declare inAppNotificationsEnabled: CreationOptional<boolean>;
  declare orderUpdatesEnabled: CreationOptional<boolean>;
  declare whatsappUpdatesEnabled: CreationOptional<boolean>;
  declare planUpdatesEnabled: CreationOptional<boolean>;
  declare staffAccessEnabled: CreationOptional<boolean>;
  declare availabilityAlertsEnabled: CreationOptional<boolean>;
  declare availabilityEmailSubject: CreationOptional<string>;
  declare availabilityEmailBody: CreationOptional<string>;
  declare smtpHost: CreationOptional<string | null>;
  declare smtpPort: CreationOptional<number>;
  declare smtpSecure: CreationOptional<boolean>;
  declare smtpUser: CreationOptional<string | null>;
  declare smtpPasswordEncrypted: CreationOptional<string | null>;
  declare fromEmail: string;
  declare fromName: string;
  declare replyToEmail: CreationOptional<string | null>;
  declare version: CreationOptional<number>;
  declare updatedBy: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

CommunicationSetting.init(
  {
    id: { type: DataTypes.TINYINT.UNSIGNED, primaryKey: true, defaultValue: 1 },
    emailNotificationsEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    inAppNotificationsEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    orderUpdatesEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    whatsappUpdatesEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    planUpdatesEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    staffAccessEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    availabilityAlertsEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    availabilityEmailSubject: {
      type: DataTypes.STRING(200),
      allowNull: false,
      defaultValue: '{{product}} volvio a estar disponible',
    },
    availabilityEmailBody: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: 'El plato {{product}} ya esta disponible nuevamente en {{branch}}. Puedes pedirlo antes de que se agote.',
    },
    smtpHost: { type: DataTypes.STRING(180), allowNull: true },
    smtpPort: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 587 },
    smtpSecure: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    smtpUser: { type: DataTypes.STRING(180), allowNull: true },
    smtpPasswordEncrypted: { type: DataTypes.TEXT, allowNull: true },
    fromEmail: { type: DataTypes.STRING(160), allowNull: false },
    fromName: { type: DataTypes.STRING(100), allowNull: false },
    replyToEmail: { type: DataTypes.STRING(160), allowNull: true },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    updatedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'CommunicationSetting',
    tableName: 'communication_settings',
  },
);

export default CommunicationSetting;
