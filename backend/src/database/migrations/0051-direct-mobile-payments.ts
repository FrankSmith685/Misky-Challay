import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, tableExists, addIndexIfMissing } from '../migrationHelpers';

export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(context, 'local_payment_settings', 'payment_window_minutes', {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    defaultValue: 15,
  });
  await addColumnIfMissing(context, 'local_payment_settings', 'review_alert_minutes', {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    defaultValue: 10,
  });
  await context.changeColumn('mobile_payment_claims', 'status', {
    type: DataTypes.ENUM('PENDING', 'OBSERVED', 'APPROVED', 'REJECTED'),
    allowNull: false,
    defaultValue: 'PENDING',
  });
  await addColumnIfMissing(context, 'mobile_payment_claims', 'payer_name', {
    type: DataTypes.STRING(120),
    allowNull: true,
  });
  await addColumnIfMissing(context, 'mobile_payment_claims', 'paid_at', {
    type: DataTypes.DATE,
    allowNull: true,
  });
  await addColumnIfMissing(context, 'mobile_payment_claims', 'declared_amount', {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  });
  if (!(await tableExists(context, 'mobile_payment_events'))) {
    await context.createTable('mobile_payment_events', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      payment_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'payments', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      actor_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      kind: { type: DataTypes.STRING(30), allowNull: false },
      details: { type: DataTypes.JSON, allowNull: true },
      evidence_mime: { type: DataTypes.STRING(40), allowNull: true },
      evidence_bytes: { type: DataTypes.BLOB('medium'), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
    });
  }
  await addIndexIfMissing(context, 'mobile_payment_events', ['payment_id', 'created_at'], {
    name: 'idx_mobile_events_payment',
  });
};
