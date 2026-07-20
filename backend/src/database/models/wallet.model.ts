import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
} from 'sequelize';
import { sequelize } from '../connection';
import { CURRENCY } from '@config/constants';

/**
 * Tabla `wallets`: una billetera por usuario y moneda.
 *
 * `balance` es un CACHE del libro mayor: se actualiza en la misma transaccion que
 * el movimiento, nunca a mano (RN-013). La verdad siempre son las transacciones;
 * este campo existe para no sumar el libro entero en cada consulta.
 */
export class Wallet extends Model<InferAttributes<Wallet>, InferCreationAttributes<Wallet>> {
  declare id: CreationOptional<number>;
  declare userId: number;
  declare currency: CreationOptional<string>;
  declare balance: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Wallet.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    currency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: CURRENCY },
    balance: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'Wallet',
    tableName: 'wallets',
    indexes: [{ name: 'uq_wallets_user_currency', unique: true, fields: ['user_id', 'currency'] }],
  },
);

export default Wallet;
