import { z } from 'zod';
import { ApiError } from '@shared/errors/ApiError';

export const sceneLayerSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  kind: z.enum(['TEXT', 'BUTTON', 'HOTSPOT']),
  name: z.string().trim().min(1).max(80),
  text: z.string().trim().max(240).default(''),
  action: z.enum(['NONE', 'PLAY_VIDEO', 'PLAY_AUDIO', 'SHARE']).default('NONE'),
  position: z
    .object({
      x: z.number().min(-2).max(2),
      y: z.number().min(-2).max(2),
      z: z.number().min(-2).max(2),
    })
    .default({ x: 0, y: 0, z: 0 }),
  scale: z.number().min(0.25).max(3).default(1),
  visible: z.boolean().default(true),
});

export const sceneAppearanceSchema = z.object({
  preset: z.enum(['PASTRY', 'ELEGANT', 'NIGHT', 'NATURAL']).default('PASTRY'),
  exposure: z.number().min(0.4).max(2).default(1),
  ambientIntensity: z.number().min(0).max(5).default(1.8),
  keyIntensity: z.number().min(0).max(6).default(2.3),
  roughness: z.number().min(0).max(1).default(0.62),
  metalness: z.number().min(0).max(1).default(0),
  environment: z.enum(['ROOM', 'NONE']).default('ROOM'),
  toneMapping: z.enum(['ACES', 'NONE']).default('ACES'),
});

export const sceneCameraSchema = z.object({
  autoRotate: z.boolean().default(true),
  autoRotateSpeed: z.number().min(0).max(3).default(0.65),
  fov: z.number().min(25).max(70).default(38),
  distance: z.number().min(1.2).max(12).default(2.4),
});

export const sceneMarkerSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  name: z.string().trim().min(1).max(100),
  imageAssetId: z.number().int().positive(),
  targetAssetId: z.number().int().positive(),
  enabled: z.boolean().default(true),
});

export const sceneQrSchema = z.object({
  dark: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#003a60'),
  light: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffffff'),
  frame: z.enum(['NONE', 'LIGHT', 'DARK']).default('LIGHT'),
  label: z.string().trim().max(80).default('Escanea y descubre'),
  logo: z.enum(['BRAND', 'NONE']).default('BRAND'),
  background: z.enum(['SOLID', 'SOFT']).default('SOFT'),
});

export const sceneSchema = z.object({
  content: z.enum(['ALIEN', 'CAKE', 'MODEL', 'VIDEO', 'COMBINED']).default('ALIEN'),
  title: z.string().trim().min(1).max(100).default('Una torta hecha para celebrar'),
  message: z
    .string()
    .trim()
    .max(400)
    .default('Tu torta cobra vida con una sorpresa especial. Gracias por celebrar con Misky Challay.'),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#b15a83'),
  scale: z.number().min(0.1).max(3).default(1),
  position: z
    .object({
      x: z.number().min(-2).max(2),
      y: z.number().min(-2).max(2),
      z: z.number().min(-2).max(2),
    })
    .default({ x: 0, y: 0, z: 0 }),
  rotation: z.number().min(-180).max(180).default(0),
  modelAssetId: z.number().int().positive().nullable().default(null),
  videoAssetId: z.number().int().positive().nullable().default(null),
  audioAssetId: z.number().int().positive().nullable().default(null),
  targetImageAssetId: z.number().int().positive().nullable().default(null),
  targetAssetId: z.number().int().positive().nullable().default(null),
  animationIndex: z.number().int().min(0).max(100).default(0),
  videoOnTarget: z.boolean().default(false),
  /** Texto que se muestra al cliente para indicar qué debe enfocar. */
  recognitionLabel: z.string().trim().min(1).max(80).default('la tarjeta'),
  appearance: sceneAppearanceSchema.default({}),
  camera: sceneCameraSchema.default({}),
  qr: sceneQrSchema.default({}),
  markers: z.array(sceneMarkerSchema).max(8).default([]),
  layers: z.array(sceneLayerSchema).max(8).default([]),
});
export type ExperienceScene = z.infer<typeof sceneSchema>;
export type ExperienceSceneLayer = z.infer<typeof sceneLayerSchema>;
export const packageSchema = z
  .object({
    name: z.string().trim().min(3).max(100),
    description: z.string().trim().max(600),
    mode: z.enum(['VIDEO', 'AR']),
    price: z.number().min(0).max(10000).multipleOf(0.01),
    validityDays: z.number().int().min(1).max(365),
    revisionsIncluded: z.number().int().min(0).max(20),
    minLeadHours: z.number().int().min(0).max(720),
    isActive: z.boolean(),
    paymentRequirement: z.enum(['FULL', 'DEPOSIT']).default('FULL'),
    templateId: z.number().int().positive().nullable(),
    sortOrder: z.number().int().min(0).max(10000).default(0),
  })
  .refine(
    (value) => !value.isActive || value.price > 0,
    'Configura un precio mayor a cero antes de ofrecer el servicio.',
  );
export type PackageSnapshot = Omit<
  z.infer<typeof packageSchema>,
  'isActive' | 'templateId' | 'sortOrder'
> & { id: number; version: number };
export const EXPERIENCE_STATUSES = [
  'DRAFT',
  'IN_PROGRESS',
  'AWAITING_APPROVAL',
  'APPROVED',
  'PUBLISHED',
  'PAUSED',
  'EXPIRED',
] as const;
export type ExperienceStatus = (typeof EXPERIENCE_STATUSES)[number];
export const sceneAssetIds = (scene: ExperienceScene): number[] => [
  ...new Set(
    [
      scene.modelAssetId,
      scene.videoAssetId,
      scene.audioAssetId,
      scene.targetAssetId,
      scene.targetImageAssetId,
      ...(scene.markers ?? []).flatMap((marker) => [marker.imageAssetId, marker.targetAssetId]),
    ].filter((id): id is number => id !== null),
  ),
];
export const paymentAllows = (
  order: {
    status: string;
    depositPaidAt?: Date | string | null;
    balancePaidAt?: Date | string | null;
  },
  requirement: 'FULL' | 'DEPOSIT',
) =>
  !['PENDING_PAYMENT', 'CANCELLED', 'REFUNDED'].includes(order.status) &&
  Boolean(requirement === 'FULL' ? order.balancePaidAt : order.depositPaidAt);
export const publicExperienceAvailable = (
  project: { status: string; startsAt: Date | null; expiresAt: Date | null },
  order: Parameters<typeof paymentAllows>[0],
  requirement: 'FULL' | 'DEPOSIT',
  now = new Date(),
) =>
  project.status === 'PUBLISHED' &&
  Boolean(
    project.startsAt && project.expiresAt && project.startsAt <= now && project.expiresAt > now,
  ) &&
  paymentAllows(order, requirement);
export const validateAsset = (kind: string, mime: string, bytes: Buffer) => {
  const limit = { VIDEO: 20, MODEL: 10, AUDIO: 8, IMAGE: 3, TARGET: 5 }[kind] ?? 0;
  if (!limit || !bytes.length || bytes.length > limit * 1024 * 1024)
    throw ApiError.badRequest(`El archivo supera el límite permitido de ${limit} MB o está vacío.`);
  const ftyp = bytes.length > 12 && bytes.toString('ascii', 4, 8) === 'ftyp';
  if (
    kind === 'IMAGE' &&
    !(
      (mime === 'image/png' &&
        bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216)
    )
  )
    throw ApiError.badRequest('Sube una imagen PNG o JPEG válida.');
  if (
    kind === 'VIDEO' &&
    !(
      (mime === 'video/mp4' && ftyp) ||
      (mime === 'video/webm' && bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])))
    )
  )
    throw ApiError.badRequest('Sube un video MP4 o WebM válido.');
  if (
    kind === 'AUDIO' &&
    !(
      (mime === 'audio/mpeg' &&
        (bytes.toString('ascii', 0, 3) === 'ID3' ||
          (bytes[0] === 255 && (bytes[1] & 224) === 224))) ||
      (mime === 'audio/mp4' && ftyp)
    )
  )
    throw ApiError.badRequest('Sube audio MP3 o M4A válido.');
  if (kind === 'MODEL') {
    if (
      mime !== 'model/gltf-binary' ||
      bytes.length < 20 ||
      bytes.toString('ascii', 0, 4) !== 'glTF' ||
      bytes.readUInt32LE(4) !== 2 ||
      bytes.readUInt32LE(8) !== bytes.length ||
      bytes.toString('ascii', 16, 20) !== 'JSON'
    )
      throw ApiError.badRequest('Sube un modelo GLB 2.0 válido.');
    try {
      const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)).trim());
      if (
        [...(gltf.buffers ?? []), ...(gltf.images ?? [])].some(
          (entry: { uri?: string }) => entry.uri,
        )
      )
        throw new Error('external');
    } catch {
      throw ApiError.badRequest('El GLB debe incluir sus texturas y datos dentro del archivo.');
    }
  }
  if (kind === 'TARGET' && mime !== 'application/octet-stream')
    throw ApiError.badRequest('Archivo de reconocimiento inválido.');
};
