import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, removeColumnIfPresent } from '../migrationHelpers';

/**
 * Desglose del IGV en pedidos y lineas.
 *
 * El precio del catalogo ya incluye el impuesto —obligatorio de cara al consumidor
 * en Peru— pero no se guardaba separado en ningun sitio: `orders.tax_total` estaba
 * cableado a 0. Sin ese desglose no se puede emitir una boleta ni una factura.
 *
 * El cliente sigue pagando exactamente lo mismo: esto solo documenta cuanto de lo
 * cobrado es valor de venta y cuanto es impuesto.
 *
 * `tax_rate` se guarda por pedido y no se lee de la configuracion al consultarlo:
 * si algun dia cambia la tasa, los pedidos antiguos siguen explicando su importe con
 * la que se les aplico.
 */
const MONEY = { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 } as const;

export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(context, 'orders', 'tax_rate', {
    type: DataTypes.DECIMAL(5, 4),
    allowNull: false,
    defaultValue: 0,
  });
  await addColumnIfMissing(context, 'orders', 'taxable_base', MONEY);
  await addColumnIfMissing(context, 'order_items', 'taxable_base', MONEY);
  await addColumnIfMissing(context, 'order_items', 'tax_total', MONEY);
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await removeColumnIfPresent(context, 'order_items', 'tax_total');
  await removeColumnIfPresent(context, 'order_items', 'taxable_base');
  await removeColumnIfPresent(context, 'orders', 'taxable_base');
  await removeColumnIfPresent(context, 'orders', 'tax_rate');
};
