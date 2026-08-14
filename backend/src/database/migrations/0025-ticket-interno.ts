import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, removeColumnIfPresent, tableExists } from '../migrationHelpers';

/** Modo de comprobante operativo y trazabilidad de impresiones del ticket interno. */
export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  if (!(await tableExists(context, 'receipt_settings'))) {
    await context.createTable('receipt_settings', {
      id: { type: DataTypes.TINYINT.UNSIGNED, primaryKey: true, defaultValue: 1 },
      mode: {
        type: DataTypes.ENUM('INTERNAL_ONLY', 'EXTERNAL_MANUAL', 'INTEGRATED'),
        allowNull: false,
        defaultValue: 'INTERNAL_ONLY',
      },
      auto_print_kitchen_ticket: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      auto_print_customer_ticket: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      paper_width: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 80 },
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
  }

  await addColumnIfMissing(context, 'orders', 'internal_receipt_first_printed_at', {
    type: DataTypes.DATE,
    allowNull: true,
  });
  await addColumnIfMissing(context, 'orders', 'internal_receipt_last_printed_at', {
    type: DataTypes.DATE,
    allowNull: true,
  });
  await addColumnIfMissing(context, 'orders', 'internal_receipt_print_count', {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    defaultValue: 0,
  });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await removeColumnIfPresent(context, 'orders', 'internal_receipt_print_count');
  await removeColumnIfPresent(context, 'orders', 'internal_receipt_last_printed_at');
  await removeColumnIfPresent(context, 'orders', 'internal_receipt_first_printed_at');
  if (await tableExists(context, 'receipt_settings')) await context.dropTable('receipt_settings');
};
