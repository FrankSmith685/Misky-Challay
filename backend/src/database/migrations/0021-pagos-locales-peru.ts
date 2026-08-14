import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addIndexIfMissing, tableExists } from '../migrationHelpers';

/** Fase 7: configuracion de Yape/Plin y cola auditable de validacion manual. */
export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  if (!(await tableExists(context, 'local_payment_settings'))) {
    await context.createTable('local_payment_settings', {
      id: { type: DataTypes.TINYINT.UNSIGNED, primaryKey: true, defaultValue: 1 },
      yape_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      yape_phone: { type: DataTypes.STRING(30), allowNull: true },
      yape_recipient: { type: DataTypes.STRING(120), allowNull: true },
      yape_qr_image_url: { type: DataTypes.STRING(500), allowNull: true },
      plin_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      plin_phone: { type: DataTypes.STRING(30), allowNull: true },
      plin_recipient: { type: DataTypes.STRING(120), allowNull: true },
      plin_qr_image_url: { type: DataTypes.STRING(500), allowNull: true },
      instructions: { type: DataTypes.STRING(500), allowNull: true },
      updated_by: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  }

  if (!(await tableExists(context, 'mobile_payment_claims'))) {
    await context.createTable('mobile_payment_claims', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      payment_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      provider: { type: DataTypes.ENUM('yape', 'plin'), allowNull: false },
      operation_code: { type: DataTypes.STRING(24), allowNull: false },
      payer_phone: { type: DataTypes.STRING(20), allowNull: true },
      status: { type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'), allowNull: false, defaultValue: 'PENDING' },
      submitted_at: { type: DataTypes.DATE, allowNull: false },
      reviewed_by: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      reviewed_at: { type: DataTypes.DATE, allowNull: true },
      rejection_reason: { type: DataTypes.STRING(255), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  }
  await addIndexIfMissing(context, 'mobile_payment_claims', ['payment_id'], { name: 'uq_mobile_payment_claim_payment', unique: true });
  await addIndexIfMissing(context, 'mobile_payment_claims', ['provider', 'operation_code'], { name: 'uq_mobile_payment_claim_operation', unique: true });
  await addIndexIfMissing(context, 'mobile_payment_claims', ['status', 'submitted_at'], { name: 'idx_mobile_payment_claim_status' });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  if (await tableExists(context, 'mobile_payment_claims')) await context.dropTable('mobile_payment_claims');
  if (await tableExists(context, 'local_payment_settings')) await context.dropTable('local_payment_settings');
};
