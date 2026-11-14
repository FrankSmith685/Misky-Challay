import { SCENES } from './scenes';
import type { SceneData } from '../types/video';
import type { ExperienceArtifactConfig } from '../../experiences.service';

/**
 * The experience content lives in one place so the same artifact can be
 * duplicated for another celebration without changing the presentation code.
 */
export const RENZO_TEMPLATE = {
  slug: 'renzo',
  recipient: 'Renzo',
  duration: 10,
  hero: {
    eyebrow: 'Homenaje de Amor en Acuarela 2D',
    headline: 'El mejor regalo es tener una gran familia',
    greeting: '¡Feliz Cumpleaños, Renzo!',
    description:
      'Una animación cinematográfica inspirada en el universo nostálgico de Studio Ghibli, acompañada por piano acústico y cuerdas, rindiendo homenaje al amor incondicional entre padre, madre e hija.',
  },
  dedication: {
    eyebrow: 'Dedicatoria Especial para Renzo',
    headline: 'Gracias por cada abrazo, por enseñarme a sonreír y por caminar siempre a mi lado.',
    body:
      'Los mejores recuerdos no solo se quedan en fotografías; se guardan en el corazón para siempre. Esta animación celebra tu entrega, tu ternura como papá y el amor infinito de nuestra familia.',
  },
  card: {
    headline: 'El mejor regalo es tener una gran familia',
    message:
      'Para el mejor papá del mundo: Gracias por cada mirada llena de ternura desde el primer día en que me sostuviste, por cada risa compartida en el parque, y por guiarnos siempre con amor incondicional. Eres el corazón de nuestro hogar y nuestra mayor bendición. ¡Que este nuevo año de vida te traiga toda la alegría que mereces!',
    signature: 'Con todo nuestro amor infinito, tu familia ♥',
  },
  scenes: SCENES,
  features: {
    directCardOnQr: true,
    showInternalHeader: false,
    showSharing: false,
    showDownloads: false,
    showDedicationActions: false,
  },
} as const;

export type RenzoTemplate = typeof RENZO_TEMPLATE;
export type RenzoRuntimeTemplate = {
  slug: string;
  recipient: string;
  duration: number;
  hero: { eyebrow: string; headline: string; greeting: string; description: string };
  dedication: { eyebrow: string; headline: string; body: string };
  card: { headline: string; message: string; signature: string };
  scenes: SceneData[];
  features: {
    directCardOnQr: boolean;
    showInternalHeader: boolean;
    showSharing: boolean;
    showDownloads: boolean;
    showDedicationActions: boolean;
  };
};

export const toArtifactConfig = (): ExperienceArtifactConfig => ({
  recipient: RENZO_TEMPLATE.recipient,
  duration: RENZO_TEMPLATE.duration,
  hero: { ...RENZO_TEMPLATE.hero },
  dedication: { ...RENZO_TEMPLATE.dedication },
  card: { ...RENZO_TEMPLATE.card },
  scenes: RENZO_TEMPLATE.scenes.map(({ id, title, subtitle, startTime, endTime, description, quote }) => ({
    id, title, subtitle, startTime, endTime, description, quote, ghibliAssetId: null, realAssetId: null,
  })),
  features: { ...RENZO_TEMPLATE.features },
});

export const mergeArtifactTemplate = (
  slug: string,
  remote: ExperienceArtifactConfig | null | undefined,
  assetUrl: (assetId: number) => string,
): RenzoRuntimeTemplate => {
  if (!remote) return { ...RENZO_TEMPLATE, slug } as RenzoRuntimeTemplate;
  const scenes = remote.scenes.map((scene) => {
    const fallback = RENZO_TEMPLATE.scenes.find((item) => item.id === scene.id) ?? RENZO_TEMPLATE.scenes[0];
    return {
      ...fallback,
      ...scene,
      ...(scene.ghibliAssetId ? { ghibliImg: assetUrl(scene.ghibliAssetId) } : {}),
      ...(scene.realAssetId ? { realImg: assetUrl(scene.realAssetId) } : {}),
    };
  });
  return { ...RENZO_TEMPLATE, ...remote, slug, scenes };
};

export const buildArtifactUrl = (origin: string, slug: string, view: 'experience' | 'card' = 'experience') => {
  const base = `${origin.replace(/\/$/, '')}/experiencias/plantillas/${slug}`;
  return view === 'card' ? `${base}?vista=tarjeta` : base;
};

export const buildRenzoUrl = (origin: string, view: 'experience' | 'card' = 'experience') => {
  const base = `${origin.replace(/\/$/, '')}/experiencias/${RENZO_TEMPLATE.slug}`;
  return view === 'card' ? `${base}?vista=tarjeta` : base;
};
