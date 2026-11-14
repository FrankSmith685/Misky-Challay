import { DataTypes, type QueryInterface } from 'sequelize';
import type { MigrationParams } from 'umzug';

const DEFAULT_SCENE = {
  content: 'VIDEO',
  title: 'Video personalizado',
  message: 'Video y dedicatoria accesibles mediante un QR.',
  color: '#0b75b5',
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
  recognitionLabel: 'la tarjeta',
  appearance: { preset: 'PASTRY', exposure: 1, ambientIntensity: 1.8, keyIntensity: 2.3, roughness: 0.62, metalness: 0, environment: 'ROOM', toneMapping: 'ACES' },
  camera: { autoRotate: true, autoRotateSpeed: 0.65, fov: 38, distance: 2.4 },
  qr: { dark: '#003a60', light: '#ffffff', frame: 'LIGHT', label: 'Escanea y descubre', logo: 'BRAND', background: 'SOFT' },
  markers: [],
  layers: [],
};

export const up = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  const columns = await q.describeTable('experience_templates');
  if (!columns.artifact_slug) {
    await q.addColumn('experience_templates', 'artifact_slug', {
      type: DataTypes.STRING(80),
      allowNull: true,
    });
  }
  if (!columns.artifact_json) {
    await q.addColumn('experience_templates', 'artifact_json', {
      type: DataTypes.JSON,
      allowNull: true,
    });
  }

  const [rows] = await q.sequelize.query(
    "SELECT id FROM experience_templates WHERE artifact_slug = 'renzo' LIMIT 1",
  );
  if (!(rows as Array<{ id: number }>).length) {
    await q.bulkInsert('experience_templates', [{
      name: 'Video personalizado Renzo',
      scene_json: JSON.stringify(DEFAULT_SCENE),
      artifact_slug: 'renzo',
      artifact_json: null,
      is_active: true,
      version: 1,
      created_at: new Date(),
      updated_at: new Date(),
    }]);
  }
};

export const down = async ({ context: q }: MigrationParams<QueryInterface>): Promise<void> => {
  const columns = await q.describeTable('experience_templates');
  if (columns.artifact_json) await q.removeColumn('experience_templates', 'artifact_json');
  if (columns.artifact_slug) await q.removeColumn('experience_templates', 'artifact_slug');
};
