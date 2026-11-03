import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';
import { tableExists } from '../migrationHelpers';

export const up = async ({ context: q }: MigrationParams<QueryInterface>) => {
  const orderColumns = await q.describeTable('order_items');
  if (!orderColumns.item_kind)
    await q.addColumn('order_items', 'item_kind', {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'PRODUCT',
    });
  const id = () => ({ type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true });
  const dates = () => ({
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  const ref = (model: string, nullable = true, onDelete = 'SET NULL') => ({
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: nullable,
    references: { model, key: 'id' },
    onDelete,
  });
  if (!(await tableExists(q, 'experience_templates')))
    await q.createTable('experience_templates', {
      id: id(),
      name: { type: DataTypes.STRING(100), allowNull: false },
      scene_json: { type: DataTypes.JSON, allowNull: false },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
      version: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 1 },
      ...dates(),
    });
  if (!(await tableExists(q, 'experience_packages')))
    await q.createTable('experience_packages', {
      id: id(),
      name: { type: DataTypes.STRING(100), allowNull: false },
      description: { type: DataTypes.STRING(600), allowNull: false },
      mode: { type: DataTypes.STRING(10), allowNull: false },
      price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      validity_days: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      revisions_included: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      min_lead_hours: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      payment_requirement: { type: DataTypes.STRING(10), allowNull: false },
      template_id: ref('experience_templates'),
      is_active: { type: DataTypes.BOOLEAN, defaultValue: false },
      version: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 1 },
      sort_order: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 0 },
      ...dates(),
    });
  if (!(await tableExists(q, 'experience_assets')))
    await q.createTable('experience_assets', {
      id: id(),
      kind: { type: DataTypes.STRING(10), allowNull: false },
      mime: { type: DataTypes.STRING(80), allowNull: false },
      name: { type: DataTypes.STRING(150), allowNull: false },
      bytes: { type: DataTypes.BLOB('long'), allowNull: false },
      size: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      sha256: { type: DataTypes.STRING(64), allowNull: false },
      source_image_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      created_by: ref('users'),
      created_at: { type: DataTypes.DATE, allowNull: false },
    });
  if (!(await tableExists(q, 'experience_projects')))
    await q.createTable('experience_projects', {
      id: id(),
      order_id: { ...ref('orders', false, 'CASCADE'), unique: true },
      package_snapshot_json: { type: DataTypes.JSON, allowNull: false },
      scene_json: { type: DataTypes.JSON, allowNull: false },
      published_scene_json: { type: DataTypes.JSON, allowNull: true },
      brief: { type: DataTypes.TEXT, allowNull: false },
      status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'DRAFT' },
      version: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 1 },
      approved_version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      public_token: { type: DataTypes.STRING(48), unique: true, allowNull: false },
      preview_token: { type: DataTypes.STRING(48), unique: true, allowNull: true },
      preview_expires_at: { type: DataTypes.DATE, allowNull: true },
      starts_at: { type: DataTypes.DATE, allowNull: true },
      expires_at: { type: DataTypes.DATE, allowNull: true },
      assigned_to: ref('users'),
      revisions_used: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 0 },
      customer_feedback: { type: DataTypes.STRING(1000), allowNull: true },
      ...dates(),
    });
  if (!(await tableExists(q, 'experience_events')))
    await q.createTable('experience_events', {
      id: id(),
      project_id: ref('experience_projects', false, 'CASCADE'),
      actor_id: ref('users'),
      action: { type: DataTypes.STRING(40), allowNull: false },
      version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      note: { type: DataTypes.STRING(1000), allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
    });
  const now = new Date();
  for (const [code, description] of [
    ['experience.read', 'Ver experiencias QR'],
    ['experience.write', 'Crear y editar experiencias QR'],
    ['experience.publish', 'Publicar experiencias QR'],
  ]) {
    const [rows] = await q.sequelize.query('SELECT id FROM permissions WHERE code = :code', {
      replacements: { code },
    });
    if (!rows.length)
      await q.bulkInsert('permissions', [
        { code, description, module: 'experiences', created_at: now, updated_at: now },
      ]);
  }
  const scene = {
    content: 'ALIEN',
    title: 'Un momento fuera de este mundo',
    message: 'Gracias por celebrar con nosotros.',
    color: '#8ba959',
    scale: 1,
    position: { x: 0, y: 0, z: 0 },
    rotation: 0,
    modelAssetId: null,
    videoAssetId: null,
    audioAssetId: null,
    targetImageAssetId: null,
    targetAssetId: null,
    animationIndex: 0,
    videoOnTarget: false,
  };
  const [templates] = await q.sequelize.query('SELECT id FROM experience_templates LIMIT 1');
  if (!templates.length)
    await q.bulkInsert('experience_templates', [
      {
        name: 'Alien de celebración',
        scene_json: JSON.stringify(scene),
        is_active: true,
        version: 1,
        created_at: now,
        updated_at: now,
      },
    ]);
  const [packages] = await q.sequelize.query('SELECT id FROM experience_packages LIMIT 1');
  if (!packages.length)
    await q.bulkInsert(
      'experience_packages',
      [
        {
          name: 'Video personalizado',
          description: 'Video y dedicatoria accesibles mediante un QR.',
          mode: 'VIDEO',
        },
        {
          name: 'Experiencia AR con 3D y video',
          description: 'Escena animada sobre una tarjeta, video y dedicatoria.',
          mode: 'AR',
        },
      ].map((value) => ({
        ...value,
        price: 0,
        validity_days: 90,
        revisions_included: 1,
        min_lead_hours: 48,
        payment_requirement: 'FULL',
        template_id: null,
        is_active: false,
        version: 1,
        sort_order: 0,
        created_at: now,
        updated_at: now,
      })),
    );
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>) => {
  for (const table of [
    'experience_events',
    'experience_projects',
    'experience_assets',
    'experience_packages',
    'experience_templates',
  ])
    await q.dropTable(table);
  await q.removeColumn('order_items', 'item_kind');
};
