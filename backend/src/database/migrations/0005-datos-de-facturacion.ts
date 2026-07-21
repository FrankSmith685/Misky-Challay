import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, removeColumnIfPresent } from '../migrationHelpers';

/**
 * Datos de facturacion en el pedido (SUNAT).
 *
 * Se capturan al hacer el checkout: tipo de comprobante (boleta/factura), documento
 * del receptor y razon social. La emision real ante el OSE se hace despues; por eso
 * el estado nace PENDING. Sin estos datos no se puede emitir una factura, y no se
 * pueden reconstruir una vez cerrado el pedido.
 */
export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(context, 'orders', 'document_type', {
    type: DataTypes.ENUM('BOLETA', 'FACTURA'),
    allowNull: false,
    defaultValue: 'BOLETA',
  });
  await addColumnIfMissing(context, 'orders', 'billing_doc_type', {
    type: DataTypes.ENUM('DNI', 'RUC', 'CE'),
    allowNull: true,
  });
  await addColumnIfMissing(context, 'orders', 'billing_doc_number', {
    type: DataTypes.STRING(20),
    allowNull: true,
  });
  await addColumnIfMissing(context, 'orders', 'billing_name', {
    type: DataTypes.STRING(200),
    allowNull: true,
  });
  await addColumnIfMissing(context, 'orders', 'billing_address', {
    type: DataTypes.STRING(200),
    allowNull: true,
  });
  await addColumnIfMissing(context, 'orders', 'invoice_status', {
    type: DataTypes.ENUM('PENDING', 'ISSUED', 'FAILED', 'VOID'),
    allowNull: false,
    defaultValue: 'PENDING',
  });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await removeColumnIfPresent(context, 'orders', 'invoice_status');
  await removeColumnIfPresent(context, 'orders', 'billing_address');
  await removeColumnIfPresent(context, 'orders', 'billing_name');
  await removeColumnIfPresent(context, 'orders', 'billing_doc_number');
  await removeColumnIfPresent(context, 'orders', 'billing_doc_type');
  await removeColumnIfPresent(context, 'orders', 'document_type');
};
