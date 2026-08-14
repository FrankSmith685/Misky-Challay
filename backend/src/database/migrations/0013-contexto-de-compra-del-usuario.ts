import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addIndexIfMissing, tableExists } from '../migrationHelpers';

/**
 * Contexto de compra del cliente: modalidad, sede y direccion activa.
 *
 * Hasta ahora vivia solo en el localStorage del navegador, asi que abrir la tienda
 * en otro equipo —o simplemente cerrar sesion— obligaba a volver a elegir direccion
 * o local de recojo. La libreta de direcciones si estaba en la base, pero nadie
 * guardaba CUAL de ellas estaba usando el cliente, y el recojo no tenia respaldo
 * de ningun tipo.
 */
export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  if (!(await tableExists(context, 'user_purchase_contexts'))) await context.createTable('user_purchase_contexts', {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    user_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    delivery_type: {
      type: DataTypes.ENUM('DELIVERY', 'PICKUP'),
      allowNull: false,
      defaultValue: 'DELIVERY',
    },
    city_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: 'cities', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    },
    branch_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'branches', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    },
    address_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'addresses', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await addIndexIfMissing(context, 'user_purchase_contexts', ['user_id'], {
    name: 'uq_user_purchase_contexts_user',
    unique: true,
  });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await context.dropTable('user_purchase_contexts');
};
