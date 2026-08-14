import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addIndexIfMissing, tableExists } from '../migrationHelpers';

/**
 * Idempotencia del pedido publico de mesa (QR).
 *
 * `publicOrder` AÑADE los platos a la comanda ya abierta. Con la red del local
 * saturada el comensal reintenta y, sin registro de la peticion, cada reintento
 * sumaba OrderItem nuevos: cocina preparaba dos veces lo mismo, el inventario
 * quedaba reservado dos veces y la cuenta salia inflada. Aqui se guarda que
 * clave se atendio en cada mesa y con que resultado, para poder devolver la
 * misma respuesta sin volver a tocar nada.
 */
export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  if (!(await tableExists(context, 'dining_order_requests'))) {
    await context.createTable('dining_order_requests', {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      dining_table_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      idempotency_key: { type: DataTypes.STRING(120), allowNull: false },
      order_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      order_number: { type: DataTypes.STRING(20), allowNull: false },
      status: { type: DataTypes.STRING(20), allowNull: false },
      total: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  }

  // El indice unico es la proteccion de verdad: dos peticiones simultaneas con
  // la misma clave no pueden ganar las dos.
  await addIndexIfMissing(context, 'dining_order_requests', ['dining_table_id', 'idempotency_key'], {
    name: 'uq_dining_request_key',
    unique: true,
  });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await context.dropTable('dining_order_requests').catch(() => undefined);
};
