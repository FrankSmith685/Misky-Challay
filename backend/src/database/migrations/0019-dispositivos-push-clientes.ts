import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addIndexIfMissing, tableExists } from '../migrationHelpers';

/** Tokens Expo vinculados a una cuenta; cerrar sesión puede revocar solo este dispositivo. */
export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  if (!(await tableExists(context, 'mobile_devices'))) await context.createTable('mobile_devices', {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    expo_push_token: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    platform: { type: DataTypes.ENUM('android', 'ios'), allowNull: false },
    device_id: { type: DataTypes.STRING(160), allowNull: true },
    app_version: { type: DataTypes.STRING(30), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    last_seen_at: { type: DataTypes.DATE, allowNull: false },
    last_success_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await addIndexIfMissing(context, 'mobile_devices', ['user_id', 'is_active'], { name: 'idx_mobile_devices_user_active' });
  await addIndexIfMissing(context, 'mobile_devices', ['device_id'], { name: 'idx_mobile_devices_device_id' });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await context.dropTable('mobile_devices');
};
