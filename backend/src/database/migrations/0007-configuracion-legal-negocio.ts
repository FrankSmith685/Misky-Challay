import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';

/** Perfil legal singleton gestionado desde el panel del superadmin. */
export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  const tables = (await context.showAllTables()).map((table) => String(table).toLowerCase());
  if (tables.includes('business_settings')) return;

  await context.createTable('business_settings', {
    id: { type: DataTypes.TINYINT.UNSIGNED, primaryKey: true, defaultValue: 1 },
    legal_name: { type: DataTypes.STRING(180), allowNull: false },
    commercial_name: { type: DataTypes.STRING(100), allowNull: false },
    ruc: { type: DataTypes.CHAR(11), allowNull: false },
    address: { type: DataTypes.STRING(255), allowNull: false },
    phone: { type: DataTypes.STRING(30), allowNull: false },
    email: { type: DataTypes.STRING(160), allowNull: false },
    support_email: { type: DataTypes.STRING(160), allowNull: false },
    complaint_response_days: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 15 },
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
  if (tables.includes('business_settings')) await context.dropTable('business_settings');
};
