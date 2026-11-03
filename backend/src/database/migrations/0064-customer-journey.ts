import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
export const up = async ({ context: q }: MigrationParams<QueryInterface>) => {
  const tables = new Set((await q.showAllTables()).map(String));
  if (!tables.has('customer_workspaces'))
    await q.createTable('customer_workspaces', {
      user_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        references: { model: 'users', key: 'id' },
      },
      revision: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
      cart_json: { type: DataTypes.JSON, allowNull: false },
      favorites_json: { type: DataTypes.JSON, allowNull: false },
      drafts_json: { type: DataTypes.JSON, allowNull: false },
      channels_json: { type: DataTypes.JSON, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  if (!tables.has('customer_media')) {
    await q.createTable('customer_media', {
      id: { type: DataTypes.STRING(36), primaryKey: true },
      user_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      hash: { type: DataTypes.STRING(64), allowNull: false },
      mime: { type: DataTypes.STRING(40), allowNull: false },
      bytes: { type: DataTypes.BLOB('medium'), allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
    await q.addIndex('customer_media', ['user_id', 'hash'], {
      unique: true,
      name: 'uq_customer_media_owner_hash',
    });
  }
  if (!tables.has('customer_order_cases')) {
    await q.createTable('customer_order_cases', {
      id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      order_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'orders', key: 'id' },
      },
      user_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      branch_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'branches', key: 'id' },
      },
      kind: { type: DataTypes.STRING(20), allowNull: false },
      status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'OPEN' },
      version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
      payload_json: { type: DataTypes.JSON, allowNull: false },
      messages_json: { type: DataTypes.JSON, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
    await q.addIndex('customer_order_cases', ['order_id', 'id']);
    await q.addIndex('customer_order_cases', ['branch_id', 'status']);
  }
  if (!tables.has('customer_care_policies')) {
    await q.createTable('customer_care_policies', {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true },
      version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      content: { type: DataTypes.TEXT, allowNull: false },
      product_instructions_json: { type: DataTypes.JSON, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
    await q.bulkInsert('customer_care_policies', [
      {
        id: 1,
        version: 1,
        content:
          'Consulta al equipo las indicaciones de conservación y traslado específicas de tu producto. Si encuentras un problema, abre una consulta desde el detalle de tu pedido.',
        product_instructions_json: JSON.stringify({}),
        updated_at: new Date(),
      },
    ]);
  }
  for (const [table, column] of [
    ['orders', 'gift_json'],
    ['order_items', 'design_details_json'],
    ['subscriptions', 'terms_snapshot_json'],
  ] as const) {
    if (!(await q.describeTable(table))[column])
      await q.addColumn(table, column, { type: DataTypes.JSON, allowNull: true });
  }
  const [rows] = await q.sequelize.query('SELECT id FROM checkout_terms WHERE id = 2');
  if (!(rows as unknown[]).length)
    await q.bulkInsert('checkout_terms', [
      {
        id: 2,
        version: 1,
        title: 'Condiciones de suscripción',
        content:
          'Autorizas el cobro mensual del importe mostrado al suscribirte. Cada pago confirmado habilita una caja con el contenido, sede y vigencia indicados. Puedes cancelar futuras renovaciones desde Mis suscripciones. Las cajas ya pagadas conservan su vigencia. Revisa la fecha de recojo y consulta al equipo antes de confirmar cualquier cambio.',
        acceptance_label:
          'He leído y acepto las condiciones de suscripción y autorizo el cobro mensual.',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
};
