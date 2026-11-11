import { api } from '@services/api/client';
import type { ApiSuccess } from '@/types/api';

export interface ExperienceLayer {
  id: string;
  kind: 'TEXT' | 'BUTTON' | 'HOTSPOT';
  name: string;
  text: string;
  action: 'NONE' | 'PLAY_VIDEO' | 'PLAY_AUDIO' | 'SHARE';
  position: { x: number; y: number; z: number };
  scale: number;
  visible: boolean;
}
export interface ExperienceAppearance {
  preset: 'PASTRY' | 'ELEGANT' | 'NIGHT' | 'NATURAL';
  exposure: number;
  ambientIntensity: number;
  keyIntensity: number;
  roughness: number;
  metalness: number;
  environment: 'ROOM' | 'NONE';
  toneMapping: 'ACES' | 'NONE';
}
export interface ExperienceCameraSettings {
  autoRotate: boolean;
  autoRotateSpeed: number;
  fov: number;
  distance: number;
}
export interface ExperienceQrSettings {
  dark: string;
  light: string;
  frame: 'NONE' | 'LIGHT' | 'DARK';
  label: string;
  logo: 'BRAND' | 'NONE';
  background: 'SOLID' | 'SOFT';
}
export interface ExperienceMarker {
  id: string;
  name: string;
  imageAssetId: number;
  targetAssetId: number;
  enabled: boolean;
}
export interface ExperienceScene {
  content: 'ALIEN' | 'CAKE' | 'MODEL' | 'VIDEO' | 'COMBINED';
  title: string;
  message: string;
  color: string;
  scale: number;
  position: { x: number; y: number; z: number };
  rotation: number;
  modelAssetId: number | null;
  videoAssetId: number | null;
  audioAssetId: number | null;
  targetImageAssetId: number | null;
  targetAssetId: number | null;
  animationIndex: number;
  videoOnTarget: boolean;
  recognitionLabel?: string;
  appearance: ExperienceAppearance;
  camera: ExperienceCameraSettings;
  qr: ExperienceQrSettings;
  markers: ExperienceMarker[];
  layers?: ExperienceLayer[];
}
export const demoScene: ExperienceScene = {
  content: 'CAKE',
  title: 'Una torta hecha para celebrar',
  message:
    'Tu torta cobra vida con una sorpresa especial. Gracias por celebrar con Misky Challay.',
  color: '#b15a83',
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
  appearance: {
    preset: 'PASTRY', exposure: 1, ambientIntensity: 1.8, keyIntensity: 2.3,
    roughness: 0.62, metalness: 0, environment: 'ROOM', toneMapping: 'ACES',
  },
  camera: { autoRotate: true, autoRotateSpeed: 0.65, fov: 38, distance: 2.4 },
  qr: { dark: '#003a60', light: '#ffffff', frame: 'LIGHT', label: 'Escanea y descubre', logo: 'BRAND', background: 'SOFT' },
  markers: [],
  layers: [
    {
      id: 'dedication',
      kind: 'TEXT',
      name: 'Dedicatoria',
      text: 'Hecho para celebrar contigo',
      action: 'NONE',
      position: { x: 0, y: 1.25, z: 0 },
      scale: 1,
      visible: true,
    },
    {
      id: 'share-demo',
      kind: 'BUTTON',
      name: 'Compartir demo',
      text: 'Compartir demostración',
      action: 'SHARE',
      position: { x: 0, y: -1, z: 0 },
      scale: 1,
      visible: true,
    },
  ],
};
export const demoVideoScene: ExperienceScene = {
  ...demoScene,
  content: 'VIDEO',
  title: 'Un saludo horizontal para tu celebración',
  message: 'Un video corto, una dedicatoria y un recuerdo para compartir después de la torta.',
};
export interface ExperiencePackage {
  id: number;
  version: number;
  name: string;
  description: string;
  mode: 'VIDEO' | 'AR';
  price: number;
  validityDays: number;
  revisionsIncluded: number;
  minLeadHours: number;
  paymentRequirement: 'FULL' | 'DEPOSIT';
  isActive: boolean;
  templateId: number | null;
  sortOrder: number;
}
export interface ExperienceTemplate {
  id: number;
  version: number;
  name: string;
  sceneJson: ExperienceScene;
  isActive: boolean;
}
export interface ExperienceAsset {
  id: number;
  name: string;
  kind: 'VIDEO' | 'MODEL' | 'AUDIO' | 'IMAGE' | 'TARGET';
  size: number;
  sourceImageId: number | null;
}
export interface ExperienceProject {
  id: number;
  orderId: number;
  brief: string;
  status: string;
  version: number;
  sceneJson: ExperienceScene;
  packageSnapshotJson: ExperiencePackage;
  assignedTo: number | null;
  draftSceneJson: ExperienceScene | null;
  draftAssignedTo: number | null;
  draftUpdatedAt: string | null;
  customerFeedback: string | null;
  revisionsUsed: number;
  publicToken: string;
  startsAt: string | null;
  expiresAt: string | null;
  order?: { orderNumber: string; branchId: number; status: string; branch?: { id: number; name: string } };
}
export interface ExperienceCustomer {
  id: number;
  status: string;
  version: number;
  package: ExperiencePackage;
  revisionsUsed: number;
  feedback: string | null;
  scene: ExperienceScene | null;
  publicToken: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  previewExpiresAt: string | null;
}
export interface ProjectDetail {
  staff?: Array<{ id: number; firstName: string; lastName: string }>;
  assets?: ExperienceAsset[];
  project: ExperienceProject;
  order: {
    orderNumber: string;
    branchId: number;
    status: string;
    depositPaidAt: string | null;
    balancePaidAt: string | null;
  };
  history: Array<{
    id: number;
    action: string;
    version: number;
    note: string;
    createdAt: string;
    snapshotJson?: ExperienceScene | null;
    assignedToSnapshot?: number | null;
  }>;
}
const get = async <T>(path: string) =>
  (await api.get<ApiSuccess<T>>(`/experiences${path}`)).data.data;
const post = async <T>(path: string, value: unknown, idempotencyKey?: string) =>
  (
    await api.post<ApiSuccess<T>>(`/experiences${path}`, value, {
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    })
  ).data.data;
export const experiencesApi = {
  packages: () => get<ExperiencePackage[]>('/packages'),
  config: () =>
    get<{
      packages: ExperiencePackage[];
      templates: ExperienceTemplate[];
      assets: ExperienceAsset[];
    }>('/admin/config'),
  projects: (params?: { branchId?: number | null; status?: string; from?: string; to?: string; page?: number; pageSize?: number }) => {
    const query = new URLSearchParams();
    if (params?.branchId) query.set('branchId', String(params.branchId));
    if (params?.status && params.status !== 'ALL') query.set('status', params.status);
    if (params?.from) query.set('from', new Date(`${params.from}T00:00:00`).toISOString());
    if (params?.to) query.set('to', new Date(`${params.to}T23:59:59.999`).toISOString());
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    return get<ExperienceProject[]>(`/admin/projects${query.toString() ? `?${query}` : ''}`);
  },
  project: (id: number) => get<ProjectDetail>(`/admin/projects/${id}`),
  saveProject: (id: number, body: unknown, idempotencyKey?: string) =>
    post<ExperienceProject>(`/admin/projects/${id}`, body, idempotencyKey),
  saveDraft: (id: number, body: unknown) =>
    post<ExperienceProject>(`/admin/projects/${id}/draft`, body),
  discardDraft: async (id: number) =>
    (await api.delete<ApiSuccess<ExperienceProject>>(`/experiences/admin/projects/${id}/draft`)).data.data,
  action: (id: number, body: unknown, idempotencyKey?: string) =>
    post<ExperienceProject>(`/admin/projects/${id}/action`, body, idempotencyKey),
  restore: (id: number, body: unknown, idempotencyKey?: string) =>
    post<ExperienceProject>(`/admin/projects/${id}/restore`, body, idempotencyKey),
  rotateToken: (id: number, body: unknown, idempotencyKey?: string) =>
    post<ExperienceProject>(`/admin/projects/${id}/rotate-token`, body, idempotencyKey),
  savePackage: (body: unknown) => post<ExperiencePackage>('/admin/packages', body),
  saveTemplate: (body: unknown) => post<ExperienceTemplate>('/admin/templates', body),
  customer: (number: string) =>
    get<ExperienceCustomer | null>(`/orders/${encodeURIComponent(number)}`),
  review: (number: string, body: unknown) =>
    post(`/orders/${encodeURIComponent(number)}/review`, body),
  public: (token: string) =>
    get<{ scene: ExperienceScene; expiresAt: string }>(`/public/${encodeURIComponent(token)}`),
  campaign: () =>
    get<{ scene: ExperienceScene; campaign: { packageId: number; packageName: string; templateId: number; version: number } }>('/public/campaign'),
  upload: async (
    file: File,
    kind: ExperienceAsset['kind'],
    sourceImageId?: number,
    projectId?: number,
  ) => {
    const query = new URLSearchParams({
      kind,
      name: file.name,
      ...(sourceImageId ? { sourceImageId: String(sourceImageId) } : {}),
      ...(projectId ? { projectId: String(projectId) } : {}),
    });
    const mime =
      kind === 'MODEL'
        ? 'model/gltf-binary'
        : kind === 'TARGET'
          ? 'application/octet-stream'
          : file.type;
    return (
      await api.post<ApiSuccess<ExperienceAsset>>(`/experiences/admin/assets?${query}`, file, {
        timeout: 60000,
        headers: { 'Content-Type': mime },
      })
    ).data.data;
  },
};
export const EXPERIENCE_LABELS: Record<string, string> = {
  EXPIRED: 'Vencida',
  DRAFT: 'Borrador',
  IN_PROGRESS: 'En creación',
  AWAITING_APPROVAL: 'Pendiente de revisión',
  APPROVED: 'Aprobada',
  PUBLISHED: 'Publicada',
  PAUSED: 'Pausada',
};
export const assetIds = (scene: ExperienceScene) => [
  ...new Set(
    [
      scene.modelAssetId,
      scene.videoAssetId,
      scene.audioAssetId,
      scene.targetAssetId,
      scene.targetImageAssetId,
      ...(scene.markers ?? []).flatMap((marker) => [marker.imageAssetId, marker.targetAssetId]),
    ].filter((id): id is number => Boolean(id)),
  ),
];

export const EXPERIENCE_EVENT_LABELS: Record<string, string> = {
  CREATED: 'Servicio añadido al pedido',
  EDITED: 'Nueva versión guardada',
  REVIEW: 'Propuesta enviada al cliente',
  APPROVED: 'Versión aprobada por el cliente',
  CHANGES_REQUESTED: 'Cambios solicitados',
  PUBLISH: 'Publicación guardada',
  PAUSE: 'Publicación pausada',
  RESTORED: 'Versión restaurada',
  EXPIRED: 'Experiencia vencida',
  TOKEN_ROTATED: 'Enlace QR renovado',
};
