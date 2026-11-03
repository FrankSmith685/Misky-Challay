import type { CakeSizeGuide } from '@database/models/cakeProduction.model';
import { ApiError } from '@shared/errors/ApiError';

interface ActiveVariant { id: number; servingSize: number | null; servingUnit: string | null }

/** Keep displayed ranges aligned with each presentation's declared yield. */
export const validateCakeSizeGuides = (
  guides: CakeSizeGuide[], variants: ActiveVariant[], baseVariantId: number, customEnabled: boolean, customMinServings: number,
) => {
  if (!guides.length) return;
  if (guides.length !== variants.length || new Set(guides.map((guide) => guide.variantId)).size !== guides.length) {
    throw ApiError.unprocessable('Configura un diámetro y rango para cada presentación activa');
  }
  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  for (const guide of guides) {
    const variant = byId.get(guide.variantId);
    if (!variant || variant.servingUnit !== 'porciones' || !Number.isSafeInteger(Number(variant.servingSize)) || guide.maxServings !== Number(variant.servingSize)) {
      throw ApiError.unprocessable('El máximo de cada rango debe coincidir con el rendimiento registrado de esa presentación');
    }
    if (guide.minServings > guide.maxServings) throw ApiError.unprocessable('El mínimo no puede superar el máximo de porciones');
  }
  const ordered = [...guides].sort((a, b) => a.diameterCm - b.diameterCm);
  for (let index = 1; index < ordered.length; index++) {
    if (ordered[index].diameterCm <= ordered[index - 1].diameterCm || ordered[index].minServings <= ordered[index - 1].maxServings || ordered[index].maxServings <= ordered[index - 1].maxServings) {
      throw ApiError.unprocessable('Los diámetros y sus rangos deben crecer sin superponerse');
    }
  }
  const largest = ordered[ordered.length - 1];
  if (largest.variantId !== baseVariantId) throw ApiError.unprocessable('Usa la presentación de mayor diámetro como base para porciones adicionales');
  if (customEnabled && customMinServings !== largest.maxServings + 1) throw ApiError.unprocessable('Las porciones adicionales deben comenzar justo después del rango mayor');
};
