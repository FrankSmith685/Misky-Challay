import { api } from '@services/api/client';
import type { ApiSuccess } from '@/types/api';
import { storefrontSchema, type StorefrontContent } from './storefront.schema';

export interface StorefrontState {
  content: StorefrontContent;
  version: number;
  updatedAt: string | null;
}
export interface StorefrontDraftState {
  content: StorefrontContent;
  baseVersion: number;
  status: 'DRAFT' | 'SCHEDULED';
  publishAt: string | null;
  updatedAt: string | null;
  ownerUserId: number;
}
export interface StorefrontAdminState {
  published: StorefrontState;
  draft: StorefrontDraftState | null;
}
export interface StorefrontHistoryEntry {
  id: number;
  action: string;
  actorId: number | null;
  createdAt: string;
  before: StorefrontState | null;
  after: StorefrontState | null;
}

// Algunas versiones antiguas guardaron vocales acentuadas como `?` dentro del
// JSON publicado. Normalizamos esos textos al leer para que la portada y el
// editor no vuelvan a mostrar caracteres dañados.
const repairLegacyText = (value: unknown): unknown => {
  if (typeof value === 'string') {
    const replacements: Array<[RegExp, string]> = [
      [/m\?s/g, 'más'],
      [/M\?s/g, 'Más'],
      [/a\?ade/g, 'añade'],
      [/A\?ade/g, 'Añade'],
      [/d\?nde/g, 'dónde'],
      [/D\?nde/g, 'Dónde'],
      [/c\?mo/g, 'cómo'],
      [/C\?mo/g, 'Cómo'],
      [/tama\?o/g, 'tamaño'],
      [/Tama\?o/g, 'Tamaño'],
      [/opci\?n/g, 'opción'],
      [/Opci\?n/g, 'Opción'],
      [/selecci\?n/g, 'selección'],
      [/Selecci\?n/g, 'Selección'],
      [/celebraci\?n/g, 'celebración'],
      [/Celebraci\?n/g, 'Celebración'],
      [/combinaci\?n/g, 'combinación'],
      [/Combinaci\?n/g, 'Combinación'],
      [/orientaci\?n/g, 'orientación'],
      [/Orientaci\?n/g, 'Orientación'],
      [/preparaci\?n/g, 'preparación'],
      [/Preparaci\?n/g, 'Preparación'],
    ];
    return replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
  }
  if (Array.isArray(value)) return value.map(repairLegacyText);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, repairLegacyText(entry)]));
  }
  return value;
};

const LEGACY_PROMO_REPLACEMENTS: Record<string, StorefrontContent['hero']['slides'][number]> = {
  '/images/promotions/promo-celebracion-familiar.png': {
    enabled: true,
    eyebrow: 'Promoción especial',
    title: '15% de descuento en turrones premium',
    description: 'Compra ahora y disfruta una selección especial de turrones premium.',
    imageUrl: '/images/promotions/promo-turrones-15-descuento.jpg',
    imageAlt: 'Promoción de 15% de descuento en turrones premium Misky Challay',
  },
  '/images/promotions/promo-torta-regalo.png': {
    enabled: true,
    eyebrow: 'Oferta para compartir',
    title: '35% de descuento por la segunda torta',
    description: 'Aprovecha la promoción en cualquier categoría y celebra con más sabor.',
    imageUrl: '/images/promotions/promo-segunda-torta-35.jpg',
    imageAlt: 'Promoción de 35% de descuento por la segunda torta en cualquier categoría',
  },
};

const parseContent = (value: unknown): StorefrontContent => {
  const parsed = storefrontSchema.parse(repairLegacyText(value));
  const slides = parsed.hero.slides.map((slide) => {
    const replacement = LEGACY_PROMO_REPLACEMENTS[slide.imageUrl];
    return replacement ? { ...replacement, enabled: slide.enabled } : slide;
  });
  const normalized = slides.every((slide, index) => slide === parsed.hero.slides[index])
    ? parsed
    : { ...parsed, hero: { ...parsed.hero, slides } };
  const firstPromo = LEGACY_PROMO_REPLACEMENTS['/images/promotions/promo-celebracion-familiar.png'];
  if (normalized.hero.imageUrl === '/images/promotions/promo-torta-artesanal.png' && normalized.hero.slides.some((slide) => slide.imageUrl === firstPromo.imageUrl)) {
    return {
      ...normalized,
      hero: {
        ...normalized.hero,
        ...firstPromo,
        slides: normalized.hero.slides.filter((slide) => slide.imageUrl !== firstPromo.imageUrl),
      },
    };
  }
  return normalized;
};

export const storefrontApi = {
  async get(): Promise<StorefrontState> {
    const { data } = await api.get<ApiSuccess<StorefrontState>>('/settings/storefront');
    const result = data.data;
    if (!result || !Number.isInteger(result.version) || result.version < 0)
      throw new Error('No se pudo leer el contenido de la portada.');
    return { ...result, content: parseContent(result.content) };
  },
  async save(state: Pick<StorefrontState, 'content' | 'version'>): Promise<StorefrontState> {
    const { data } = await api.put<ApiSuccess<StorefrontState>>('/settings/storefront', state);
    return { ...data.data, content: parseContent(data.data.content) };
  },
  async getAdmin(): Promise<StorefrontAdminState> {
    const { data } = await api.get<ApiSuccess<StorefrontAdminState>>('/settings/storefront/admin');
    const result = data.data;
    return {
      published: { ...result.published, content: parseContent(result.published.content) },
      draft: result.draft ? { ...result.draft, content: parseContent(result.draft.content) } : null,
    };
  },
  async saveDraft(input: { content: StorefrontContent; version: number; publishAt?: string | null }): Promise<StorefrontAdminState> {
    const { data } = await api.put<ApiSuccess<StorefrontAdminState>>('/settings/storefront/draft', input);
    const result = data.data;
    return {
      published: { ...result.published, content: parseContent(result.published.content) },
      draft: result.draft ? { ...result.draft, content: parseContent(result.draft.content) } : null,
    };
  },
  async publishDraft(idempotencyKey: string): Promise<StorefrontState> {
    const { data } = await api.post<ApiSuccess<StorefrontState>>('/settings/storefront/publish', { idempotencyKey });
    return { ...data.data, content: parseContent(data.data.content) };
  },
  async discardDraft(): Promise<StorefrontAdminState> {
    const { data } = await api.delete<ApiSuccess<StorefrontAdminState>>('/settings/storefront/draft');
    const result = data.data;
    return { published: { ...result.published, content: parseContent(result.published.content) }, draft: null };
  },
  async history(limit = 20): Promise<StorefrontHistoryEntry[]> {
    const { data } = await api.get<ApiSuccess<StorefrontHistoryEntry[]>>('/settings/storefront/history', { params: { limit } });
    return data.data;
  },
  async rollback(auditId: number, idempotencyKey: string): Promise<StorefrontState> {
    const { data } = await api.post<ApiSuccess<StorefrontState>>(`/settings/storefront/rollback/${auditId}`, { idempotencyKey });
    return { ...data.data, content: parseContent(data.data.content) };
  },
};
