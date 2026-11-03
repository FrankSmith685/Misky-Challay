import { api } from '@services/api/client';
import type { ApiSuccess } from '@/types/api';

export interface CakeReconstructionJob {
  token: string;
  sourceHash: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED';
  stage: 'queued' | 'preparing' | 'background' | 'shape' | 'texture' | 'download' | 'ready' | 'failed';
  progress: number | null;
  createdAt: string;
  expiresAt: string;
  error?: string;
}
export const cakeReconstructionApi = {
  capabilities: async () => (await api.get<ApiSuccess<{ enabled: boolean; provider: string | null }>>('/cakes/reconstructions/capabilities')).data.data,
  create: async (referenceDataUrl: string, requestId: string) => (await api.post<ApiSuccess<CakeReconstructionJob>>('/cakes/reconstructions', { referenceDataUrl, requestId })).data.data,
  get: async (token: string) => (await api.get<ApiSuccess<CakeReconstructionJob>>(`/cakes/reconstructions/${encodeURIComponent(token)}`)).data.data,
  model: async (token: string, signal: AbortSignal) => (await api.get<ArrayBuffer>(`/cakes/reconstructions/${encodeURIComponent(token)}/model`, { responseType: 'arraybuffer', timeout: 90_000, signal })).data,
};

export const hashCakeReference = async (source: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))))
  .map((byte) => byte.toString(16).padStart(2, '0')).join('');
