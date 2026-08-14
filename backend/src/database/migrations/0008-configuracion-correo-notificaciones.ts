import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';

/** Configuracion SMTP y reglas de notificacion singleton. */
export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  const tables = (await context.showAllTables()).map((table) => String(table).toLowerCase());
  if (tables.includes('communication_settings')) return;

  await context.createTable('communication_settings', {
    id: { type: DataTypes.TINYINT.UNSIGNED, primaryKey: true, defaultValue: 1 },
    email_notifications_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    in_app_notifications_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    order_updates_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    plan_updates_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    staff_access_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    smtp_host: { type: DataTypes.STRING(180), allowNull: true },
    smtp_port: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 587 },
    smtp_secure: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    smtp_user: { type: DataTypes.STRING(180), allowNull: true },
    smtp_password_encrypted: { type: DataTypes.TEXT, allowNull: true },
    from_email: { type: DataTypes.STRING(160), allowNull: false },
    from_name: { type: DataTypes.STRING(100), allowNull: false },
    reply_to_email: { type: DataTypes.STRING(160), allowNull: true },
    updated_by: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    },
    created_at: { type: DataTypes.DATE, allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: true },
  });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  const tables = (await context.showAllTables()).map((table) => String(table).toLowerCase());
  if (tables.includes('communication_settings')) await context.dropTable('communication_settings');
};
