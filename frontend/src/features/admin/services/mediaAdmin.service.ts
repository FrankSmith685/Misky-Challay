import { api } from '@services/api/client';
import type { ApiSuccess } from '@/types/api';

export interface MediaAsset {
  id: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  altText: string | null;
  category: string;
  createdAt: string;
  deletedAt: string | null;
  usage: {
    products: Array<{ id: number; name: string }>;
    options: Array<{ id: number; name: string }>;
    presets: Array<{ id: number; name: string }>;
    categories: Array<{ id: number; name: string }>;
    inventoryItems: Array<{ id: number; name: string }>;
    themes?: Array<{ id: number; name: string }>;
  };
}

export interface MediaListParams {
  category?: string;
  includeDeleted?: boolean;
  page?: number;
  limit?: number;
  /** Busca en el nombre original y en el texto alternativo (LIKE en el servidor). */
  search?: string;
}

export interface SavedMediaImage {
  id: number;
  url: string;
  altText: string | null;
  category: string;
}

export interface GeneratedMediaImage {
  dataUrl: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export const mediaAdminApi = {
  async generationStatus(): Promise<{ configured: boolean }> {
    const { data } = await api.get<ApiSuccess<{ configured: boolean }>>('/media/generation-status');
    return data.data;
  },
  async generateImage(prompt: string): Promise<GeneratedMediaImage> {
    const { data } = await api.post<ApiSuccess<GeneratedMediaImage>>('/media/generate', { prompt }, { timeout: 75_000 });
    return data.data;
  },
  /**
   * Biblioteca PAGINADA. El servidor cortaba en 250 por categoria sin avisar, y con
   * "Mostrar papelera" era peor: los borrados consumian del mismo cupo. El contador
   * "{n} recursos" mostraba un 250 enganoso.
   *
   * `total` es el conteo real; la paginacion en servidor la implementa el paquete K
   * junto con la pantalla.
   */
  async list(params: MediaListParams = {}): Promise<{ items: MediaAsset[]; total: number }> {
    const { data } = await api.get<ApiSuccess<MediaAsset[]>>('/media', { params });
    return { items: data.data, total: data.meta?.total ?? data.data.length };
  },
  async upload(input: {
    fileName: string;
    mimeType: 'image/webp' | 'image/jpeg' | 'image/png';
    dataUrl: string;
    altText?: string | null;
    category?: string;
  }): Promise<SavedMediaImage> {
    const { data } = await api.post<ApiSuccess<SavedMediaImage>>('/media', input);
    return data.data;
  },
  async importFromUrl(input: {
    sourceUrl: string;
    altText?: string | null;
    category?: string;
  }): Promise<{ id: number; url: string; altText: string | null; category: string }> {
    const { data } = await api.post<ApiSuccess<{ id: number; url: string; altText: string | null; category: string }>>('/media/import-url', input);
    return data.data;
  },
  async update(id: number, input: { altText?: string | null; category?: string }): Promise<void> {
    await api.patch(`/media/${id}`, input);
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/media/${id}`);
  },
  async restore(id: number): Promise<void> {
    await api.post(`/media/${id}/restore`);
  },
  async replace(id: number, replacementId: number): Promise<void> {
    await api.post(`/media/${id}/replace`, { replacementId });
  },
};

/** Recorta al centro y reduce antes de subir: menos espera y archivos consistentes. */
export const optimizeImage = async (
  file: File,
  aspect = 1,
  maxSize = 1200,
  focus = { x: 50, y: 50 },
): Promise<{ dataUrl: string; mimeType: 'image/webp'; fileName: string }> => {
  const bitmap = await createImageBitmap(file);
  const sourceAspect = bitmap.width / bitmap.height;
  let sx = 0;
  let sy = 0;
  let sw = bitmap.width;
  let sh = bitmap.height;
  if (sourceAspect > aspect) {
    sw = bitmap.height * aspect;
    sx = (bitmap.width - sw) * Math.max(0, Math.min(100, focus.x)) / 100;
  } else {
    sh = bitmap.width / aspect;
    sy = (bitmap.height - sh) * Math.max(0, Math.min(100, focus.y)) / 100;
  }
  const width = Math.min(maxSize, Math.round(sw));
  const height = Math.round(width / aspect);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Tu navegador no pudo procesar la imagen');
  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
  bitmap.close();
  return {
    dataUrl: canvas.toDataURL('image/webp', 0.84),
    mimeType: 'image/webp',
    fileName: file.name.replace(/\.[^.]+$/, '') + '.webp',
  };
};
