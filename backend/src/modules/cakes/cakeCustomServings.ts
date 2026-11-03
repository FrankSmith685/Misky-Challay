import { CakeProductProfile, ProductVariant, Recipe } from '@database/models';
import { ApiError } from '@shared/errors/ApiError';

/** Same serving rule is used by pricing, inventory and production. */
export const resolveCakeCustomServings = async (productId: number, variantId: number, requestedServings?: number | null) => {
  if (requestedServings == null) return { scale: 1, extraPrice: 0, requestedServings: null };
  const profile = await CakeProductProfile.findByPk(productId);
  const rule = profile?.customServingsJson;
  const variant = await ProductVariant.findByPk(variantId);
  const base = Number(variant?.servingSize);
  if (!profile?.isActive || profile.saleMode !== 'SEMI_CUSTOM' || !rule?.enabled
    || !variant?.isActive || variant.productId !== productId || rule.baseVariantId !== variantId
    || variant.servingUnit !== 'porciones' || !Number.isSafeInteger(base) || base < 1
    || !Number.isSafeInteger(requestedServings) || requestedServings <= base
    || requestedServings < rule.minServings
    || (rule.sizeGuides?.length && (rule.sizeGuides.find((guide) => guide.variantId === variantId)?.maxServings !== base || rule.minServings !== base + 1))
    || !Number.isFinite(rule.pricePerExtraServing) || rule.pricePerExtraServing <= 0) {
    throw ApiError.unprocessable('Estas porciones no tienen precio automatico. Solicita una cotizacion a medida.');
  }
  if (requestedServings > rule.maxServings) {
    throw ApiError.unprocessable(`El límite es de ${rule.maxServings} porciones para esta presentación.`);
  }
  if (!await Recipe.count({ where: { variantId, isActive: true } })) throw ApiError.unprocessable('La receta base ya no esta disponible para estas porciones');
  return {
    scale: requestedServings / base,
    extraPrice: Math.round((requestedServings - base) * rule.pricePerExtraServing * 100) / 100,
    requestedServings,
  };
};
