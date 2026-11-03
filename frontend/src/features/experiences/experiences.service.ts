import { api } from '@services/api/client';
import type { ApiSuccess } from '@/types/api';

export interface ExperienceScene {
  content: 'ALIEN' | 'MODEL' | 'VIDEO' | 'COMBINED';
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
}
export const demoScene: ExperienceScene = {
  content: 'ALIEN',
  title: '¡Una celebración de otro planeta!',
  message:
    'Un pequeño visitante llegó para desearte un día extraordinario. Gracias por celebrar con Misky Challay.',
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
  customerFeedback: string | null;
  revisionsUsed: number;
  publicToken: string;
  startsAt: string | null;
  expiresAt: string | null;
  order?: { orderNumber: string; status: string };
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
    status: string;
    depositPaidAt: string | null;
    balancePaidAt: string | null;
  };
  history: Array<{ id: number; action: string; version: number; note: string; createdAt: string }>;
}
const get = async <T>(path: string) =>
  (await api.get<ApiSuccess<T>>(`/experiences${path}`)).data.data;
const post = async <T>(path: string, value: unknown) =>
  (await api.post<ApiSuccess<T>>(`/experiences${path}`, value)).data.data;
export const experiencesApi = {
  packages: () => get<ExperiencePackage[]>('/packages'),
  config: () =>
    get<{
      packages: ExperiencePackage[];
      templates: ExperienceTemplate[];
      assets: ExperienceAsset[];
    }>('/admin/config'),
  projects: () => get<ExperienceProject[]>('/admin/projects'),
  project: (id: number) => get<ProjectDetail>(`/admin/projects/${id}`),
  saveProject: (id: number, body: unknown) =>
    post<ExperienceProject>(`/admin/projects/${id}`, body),
  action: (id: number, body: unknown) =>
    post<ExperienceProject>(`/admin/projects/${id}/action`, body),
  savePackage: (body: unknown) => post<ExperiencePackage>('/admin/packages', body),
  saveTemplate: (body: unknown) => post<ExperienceTemplate>('/admin/templates', body),
  customer: (number: string) =>
    get<ExperienceCustomer | null>(`/orders/${encodeURIComponent(number)}`),
  review: (number: string, body: unknown) =>
    post(`/orders/${encodeURIComponent(number)}/review`, body),
  public: (token: string) =>
    get<{ scene: ExperienceScene; expiresAt: string }>(`/public/${encodeURIComponent(token)}`),
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
};
