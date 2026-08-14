import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';

/**
 * Tabla `dining_order_requests`: peticiones ya atendidas del pedido de mesa.
 *
 * El pedido publico por QR AÑADE los platos a la comanda abierta. Con el wifi
 * del local saturado el comensal reintenta, y sin esta tabla cada reintento
 * sumaba OrderItem nuevos: cocina preparaba dos veces lo mismo, el inventario
 * quedaba reservado dos veces y la cuenta salia inflada.
 *
 * La clave la manda el cliente y es unica por mesa. Se guarda el resultado que
 * ya se devolvio para poder repetirlo tal cual, sin volver a tocar nada.
 */
export class DiningOrderRequest extends Model<
  InferAttributes<DiningOrderRequest>,
  InferCreationAttributes<DiningOrderRequest>
> {
  declare id: CreationOptional<number>;
  /** Mesa desde la que se pidio: el ambito en el que la clave debe ser unica. */
  declare diningTableId: number;
  declare idempotencyKey: string;
  declare orderId: number;
  declare orderNumber: string;
  declare status: string;
  declare total: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

DiningOrderRequest.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    diningTableId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    idempotencyKey: { type: DataTypes.STRING(120), allowNull: false },
    orderId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    orderNumber: { type: DataTypes.STRING(20), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false },
    total: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'DiningOrderRequest',
    tableName: 'dining_order_requests',
    indexes: [
      {
        // El indice unico es la proteccion de verdad: dos peticiones simultaneas
        // con la misma clave no pueden ganar las dos.
        name: 'uq_dining_request_key',
        unique: true,
        fields: ['dining_table_id', 'idempotency_key'],
      },
    ],
  },
);

export default DiningOrderRequest;
