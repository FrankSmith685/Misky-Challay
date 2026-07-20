import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { addColumnIfMissing, removeColumnIfPresent } from '../migrationHelpers';

/**
 * Libro de Reclamaciones (INDECOPI) y consentimiento del registro (Ley 29733).
 *
 * - users.terms_accepted_at: sella cuando el cliente acepto los terminos. Un parrafo
 *   pasivo no es consentimiento valido; esta fecha es la prueba.
 * - complaints: el registro formal del Libro de Reclamaciones, con correlativo, plazo
 *   legal de respuesta y la respuesta del proveedor.
 */
export const up = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await addColumnIfMissing(context, 'users', 'terms_accepted_at', {
    type: DataTypes.DATE,
    allowNull: true,
  });

  const tables = await context.showAllTables();
  if (tables.map((t) => String(t).toLowerCase()).includes('complaints')) {
    // sync ya la creo en desarrollo: no se recrea.
    return;
  }

  await context.createTable('complaints', {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    code: { type: DataTypes.STRING(20), allowNull: true },
    type: { type: DataTypes.ENUM('RECLAMO', 'QUEJA'), allowNull: false },
    item_type: { type: DataTypes.ENUM('PRODUCTO', 'SERVICIO'), allowNull: false, defaultValue: 'PRODUCTO' },
    consumer_name: { type: DataTypes.STRING(160), allowNull: false },
    doc_type: { type: DataTypes.ENUM('DNI', 'CE', 'PASAPORTE', 'RUC'), allowNull: false, defaultValue: 'DNI' },
    doc_number: { type: DataTypes.STRING(20), allowNull: false },
    email: { type: DataTypes.STRING(160), allowNull: false },
    phone: { type: DataTypes.STRING(30), allowNull: true },
    address: { type: DataTypes.STRING(200), allowNull: true },
    is_minor: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    guardian_name: { type: DataTypes.STRING(160), allowNull: true },
    item_description: { type: DataTypes.STRING(255), allowNull: true },
    claimed_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    detail: { type: DataTypes.TEXT, allowNull: false },
    request: { type: DataTypes.TEXT, allowNull: false },
    order_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'orders', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    },
    user_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    },
    status: {
      type: DataTypes.ENUM('RECEIVED', 'IN_PROGRESS', 'RESOLVED'),
      allowNull: false,
      defaultValue: 'RECEIVED',
    },
    due_at: { type: DataTypes.DATE, allowNull: false },
    response: { type: DataTypes.TEXT, allowNull: true },
    responded_at: { type: DataTypes.DATE, allowNull: true },
    responded_by: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    // Nullable para igualar lo que genera sync() desde el modelo: Sequelize gestiona
    // los timestamps y no los declara NOT NULL. Si divergen, el chequeo de deriva salta.
    created_at: { type: DataTypes.DATE, allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: true },
  });

  await context.addIndex('complaints', {
    name: 'uq_complaints_code',
    unique: true,
    fields: ['code'],
  });
  await context.addIndex('complaints', {
    name: 'idx_complaints_status_created',
    fields: ['status', 'created_at'],
  });
  await context.addIndex('complaints', { name: 'idx_complaints_user', fields: ['user_id'] });
  await context.addIndex('complaints', { name: 'idx_complaints_doc', fields: ['doc_number'] });
};

export const down = async ({ context }: MigrationParams<QueryInterface>): Promise<void> => {
  await context.dropTable('complaints');
  await removeColumnIfPresent(context, 'users', 'terms_accepted_at');
};
