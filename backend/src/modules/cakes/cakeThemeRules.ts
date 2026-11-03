import type { Transaction } from 'sequelize';
import { CakeTheme, CakeProductProfile, Product, InventoryItem, CustomizationOption } from '@database/models';
import type { CakeThemeRule, CakeThemeSnapshot } from '@database/models/cakeTheme.model';
import { ApiError } from '@shared/errors/ApiError';

export interface ThemeSelection {
  themeId?: number;
  themeVersion?: number;
  productId: number;
  variantId: number;
  requestedServings?: number;
  selections?: Array<{ optionId: number; quantity: number }>;
}

export const themeMaterials = async (rule: CakeThemeRule, transaction?: Transaction) => {
  const ids = rule.materials.map((line) => line.inventoryItemId);
  const items = ids.length ? await InventoryItem.findAll({ where: { id: ids, isActive: true }, transaction }) : [];
  if (new Set(ids).size !== ids.length || items.length !== ids.length || items.some((item) => item.allergens === null)) {
    throw ApiError.unprocessable('Revisa los materiales y alérgenos de este diseño antes de ofrecerlo');
  }
  return [...new Set(items.flatMap((item) => item.allergens ?? []))].sort();
};

export const loadThemeForProduct = async (themeId: number, themeVersion: number | undefined, productId: number, transaction?: Transaction) => {
  const theme = await CakeTheme.findByPk(themeId, { transaction });
  const [product, profile] = await Promise.all([Product.findByPk(productId, { transaction }), CakeProductProfile.findByPk(productId, { transaction })]);
  if (!theme?.isActive || theme.productId !== productId || !product || product.family !== 'CAKE' || product.status !== 'ACTIVE' || !product.allergensReviewedAt || !profile?.isActive || profile.saleMode !== 'SEMI_CUSTOM') {
    throw ApiError.unprocessable('Este diseño ya no está disponible para la torta elegida');
  }
  if (!themeVersion || theme.version !== themeVersion) throw ApiError.conflict('El diseño se actualizó. Vuelve a abrir su ficha para revisar los cambios');
  return { theme, minLeadHours: Math.max(theme.minLeadHours, profile.minLeadHours) };
};

export const snapshotTheme = (theme: CakeTheme, rule?: CakeThemeRule, allergens: string[] = []): CakeThemeSnapshot => ({
  id: theme.id, version: theme.version, name: theme.name, slug: theme.slug, theme: theme.theme, imageUrl: theme.imageUrlsJson[0] ?? null,
  priceDelta: Number(rule?.priceDelta ?? 0), materials: rule?.materials.map((line) => ({ ...line })) ?? [], effort: { ...rule?.effort }, allergens,
});

/** Se ejecuta también en checkout: nunca recibe precios ni cantidades del navegador. */
export const resolveCakeTheme = async (input: ThemeSelection, transaction?: Transaction) => {
  if (!input.themeId) {
    if (input.themeVersion) throw ApiError.badRequest('Selecciona el diseño correspondiente');
    return null;
  }
  const { theme, minLeadHours } = await loadThemeForProduct(input.themeId, input.themeVersion, input.productId, transaction);
  if (theme.saleMode !== 'CONFIGURED') throw ApiError.unprocessable('Este diseño requiere una cotización aprobada');
  if (input.requestedServings != null) throw ApiError.unprocessable('Solicita una cotización para adaptar este diseño a otras porciones');
  const rule = theme.variantRulesJson.find((entry) => entry.variantId === input.variantId);
  if (!rule) throw ApiError.unprocessable('Este diseño no se ofrece en esa presentación. Elige otra o solicita una adaptación');
  if (input.selections?.some((entry) => rule.excludedOptionIds.includes(entry.optionId))) throw ApiError.unprocessable('Una de las opciones elegidas no es compatible con este diseño');
  if (input.selections?.length && rule.hiddenGroupIds?.length) {
    const options = await CustomizationOption.findAll({ where: { id: [...new Set(input.selections.map((entry) => entry.optionId))] }, attributes: ['id', 'groupId'], transaction });
    if (options.some((option) => rule.hiddenGroupIds?.includes(option.groupId))) throw ApiError.unprocessable('Este diseño ya incluye uno de los acabados elegidos');
  }
  const allergens = await themeMaterials(rule, transaction);
  return { theme, rule, minLeadHours, snapshot: snapshotTheme(theme, rule, allergens) };
};
