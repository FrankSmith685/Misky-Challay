import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, addIndexIfMissing, removeColumnIfPresent } from '../migrationHelpers';

/**
 * Registra la respuesta real del proveedor de comprobantes. No marca pedidos
 * como emitidos por si sola: el operador debe guardar la serie/correlativo que
 * obtuvo de su OSE o integrador SUNAT.
 */
export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(context, 'orders', 'invoice_series', { type: DataTypes.STRING(4), allowNull: true });
  await addColumnIfMissing(context, 'orders', 'invoice_number', { type: DataTypes.STRING(8), allowNull: true });
  await addColumnIfMissing(context, 'orders', 'invoice_issued_at', { type: DataTypes.DATE, allowNull: true });
  await addColumnIfMissing(context, 'orders', 'invoice_provider_reference', { type: DataTypes.STRING(100), allowNull: true });
  await addColumnIfMissing(context, 'orders', 'invoice_pdf_url', { type: DataTypes.STRING(500), allowNull: true });
  await addColumnIfMissing(context, 'orders', 'invoice_xml_url', { type: DataTypes.STRING(500), allowNull: true });
  await addIndexIfMissing(context, 'orders', ['invoice_series', 'invoice_number'], {
    name: 'uq_orders_invoice_number',
    unique: true,
  });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await context.removeIndex('orders', 'uq_orders_invoice_number').catch(() => undefined);
  await removeColumnIfPresent(context, 'orders', 'invoice_xml_url');
  await removeColumnIfPresent(context, 'orders', 'invoice_pdf_url');
  await removeColumnIfPresent(context, 'orders', 'invoice_provider_reference');
  await removeColumnIfPresent(context, 'orders', 'invoice_issued_at');
  await removeColumnIfPresent(context, 'orders', 'invoice_number');
  await removeColumnIfPresent(context, 'orders', 'invoice_series');
};
