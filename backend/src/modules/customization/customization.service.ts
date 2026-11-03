import {
  BranchOptionAvailability,
  CakeProductProfile,
  BuilderPreset,
  BuilderPresetItem,
  CustomizationGroup,
  CustomizationOption,
  InventoryItem,
  Allergen,
  OptionIncompatibility,
  Product,
  ProductCustomizationGroup,
  ProductVariant,
} from '@database/models';
import { Op } from 'sequelize';
import { OPTION_STATUS } from '@database/models/customizationOption.model';
import { PRODUCT_TYPE } from '@config/constants';
import { PRODUCT_STATUS } from '@database/models/product.model';
import { ApiError } from '@shared/errors/ApiError';
import { resolveCakeCustomServings } from '@modules/cakes/cakeCustomServings';
import { resolveCakeTheme } from '@modules/cakes/cakeThemeRules';
import type { CakeThemeSnapshot } from '@database/models/cakeTheme.model';

export interface OptionDto {
  id: number;
  name: string;
  /** Opción que se propone al abrir un configurador nuevo. */
  isDefault: boolean;
  description: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  imagePosition: string;
  dietaryTags: string[];
  allergens: string[];
  spiceLevel: number;
  priceDelta: number;
  /** Suplemento: se cobra siempre, aunque el grupo tenga unidades incluidas. */
  chargeAlways: boolean;
  cakeScaleWithServings: boolean;
  maxPerItem: number;
  isAvailable: boolean;
  incompatibleWith: number[];
  incompatibilities: Array<{ optionId: number; reason: string | null }>;
}

export interface GroupDto {
  id: number;
  /** Variante a la que aplica el paso. null significa que aplica a todas. */
  variantId: number | null;
  code: string;
  name: string;
  description: string | null;
  selectionType: string;
  minSelection: number;
  maxSelection: number;
  freeQuantity: number;
  sortOrder: number;
  options: OptionDto[];
}

export interface BuilderConfig {
  customServings: import('@database/models/cakeProduction.model').CakeCustomServings | null;
  product: {
    id: number;
    name: string;
    slug: string;
    type: string;
    imageUrl: string | null;
    imageAlt: string | null;
    imagePosition: string;
  };
  variants: Array<{
    id: number;
    name: string;
    basePrice: number;
    servingSize: number | null;
    servingUnit: string | null;
    isDefault: boolean;
  }>;
  groups: GroupDto[];
  presets: Array<{
    id: number;
    code: string;
    name: string;
    description: string | null;
    imageUrl: string | null;
    badge: string | null;
    isFeatured: boolean;
    selections: QuoteSelection[];
  }>;
}

export interface QuoteSelection {
  optionId: number;
  quantity: number;
}

export interface QuoteInput {
  themeId?: number;
  themeVersion?: number;
  productId: number;
  variantId: number;
  quantity: number;
  branchId?: number;
  requestedServings?: number;
  selections: QuoteSelection[];
}

export interface QuoteLine {
  groupId: number;
  groupName: string;
  optionId: number;
  optionName: string;
  quantity: number;
  /** Unidades cobradas: las que exceden la cantidad incluida del grupo. */
  chargedQuantity: number;
  priceDelta: number;
  lineExtra: number;
  cakeScaleWithServings: boolean;
}

export interface QuoteResult {
  allergenCodes?: string[];
  theme?: CakeThemeSnapshot | null;
  productId: number;
  variantId: number;
  /** Nombre corto de la presentaciÃ³n: Regular, Grande, etc. */
  variantName: string;
  requestedServings?: number | null;
  quantity: number;
  basePrice: number;
  extrasTotal: number;
  unitPrice: number;
  lineTotal: number;
  selections: QuoteLine[];
  /** Texto legible que se guarda en el carrito y en el pedido. */
  description: string;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

const variantLabel = (variant: ProductVariant): string =>
  variant.servingSize !== null && variant.servingSize !== undefined && variant.servingUnit === 'porciones'
    ? `${variant.name} · ${Number(variant.servingSize)} porciones`
    : variant.name;

/** Las reglas del producto (si existen) mandan sobre las del grupo reutilizable. */
const effectiveRules = (group: CustomizationGroup, link?: ProductCustomizationGroup) => ({
  minSelection: link?.minSelectionOverride ?? group.minSelection,
  maxSelection: link?.maxSelectionOverride ?? group.maxSelection,
  freeQuantity: link?.freeQuantityOverride ?? group.freeQuantity,
  sortOrder: link?.sortOrder ?? group.sortOrder,
});

const loadProductOrFail = async (productId: number): Promise<Product> => {
  const product = await Product.findByPk(productId, {
    include: [
      { model: Allergen, as: 'allergens', through: { attributes: [] } },
      {
        model: ProductVariant,
        as: 'variants',
        where: { isActive: true },
        required: false,
        include: [],
      },
    ],
  });
  if (!product) throw ApiError.notFound('Producto no encontrado');
  const cakeProfile = await CakeProductProfile.findByPk(productId);
  if (cakeProfile && (product.status !== PRODUCT_STATUS.ACTIVE || !cakeProfile.isActive || !product.allergensReviewedAt)) {
    throw ApiError.notFound('Torta no disponible');
  }
  return product;
};

/** Grupos configurados del producto, con opciones, precios y disponibilidad de la sucursal. */
const loadGroups = async (productId: number, branchId?: number, variantId?: number): Promise<GroupDto[]> => {
  const links = await ProductCustomizationGroup.findAll({
    where: {
      productId,
      isActive: true,
      ...(variantId ? { [Op.or]: [{ variantId: null }, { variantId }] } : {}),
    },
    include: [
      {
        model: CustomizationGroup,
        as: 'group',
        where: { isActive: true },
        include: [{ model: CustomizationOption, as: 'options', required: false }],
      },
    ],
  });

  if (links.length === 0) return [];

  const optionIds = links.flatMap(
    (link) =>
      (link.get('group') as CustomizationGroup | undefined)?.options?.map((option) => option.id) ??
      [],
  );
  const inventoryItemIds = [...new Set(links.flatMap((link) =>
    (link.get('group') as CustomizationGroup | undefined)?.options
      ?.map((option) => option.inventoryItemId).filter((id): id is number => id !== null) ?? [],
  ))];
  const inventoryItems = inventoryItemIds.length ? await InventoryItem.findAll({
    where: { id: inventoryItemIds }, attributes: ['id', 'allergens'],
  }) : [];
  const inventoryAllergens = new Map(inventoryItems.map((item) => [item.id, item.allergens]));

  // Disponibilidad/precio por sucursal (RN-005) en una sola consulta.
  const branchRows = branchId
    ? await BranchOptionAvailability.findAll({ where: { branchId, optionId: optionIds } })
    : [];
  const branchByOption = new Map(branchRows.map((row) => [row.optionId, row]));

  // Incompatibilidades, tratadas como simetricas (A-B implica B-A).
  const incompatibilities = await OptionIncompatibility.findAll({ where: { optionId: optionIds } });
  const incompatibleByOption = new Map<number, Array<{ optionId: number; reason: string | null }>>();
  for (const row of incompatibilities) {
    incompatibleByOption.set(row.optionId, [
      ...(incompatibleByOption.get(row.optionId) ?? []),
      { optionId: row.incompatibleOptionId, reason: row.reason },
    ]);
    incompatibleByOption.set(row.incompatibleOptionId, [
      ...(incompatibleByOption.get(row.incompatibleOptionId) ?? []),
      { optionId: row.optionId, reason: row.reason },
    ]);
  }

  const groups: GroupDto[] = links.map((link) => {
    const group = link.get('group') as CustomizationGroup;
    const rules = effectiveRules(group, link);

    const options: OptionDto[] = (group.options ?? [])
      .filter((option) => option.status !== OPTION_STATUS.INACTIVE)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((option) => {
        const branchRow = branchByOption.get(option.id);
        const now = new Date();
        const withinSchedule =
          (!branchRow?.availableFrom || branchRow.availableFrom <= now) &&
          (!branchRow?.availableUntil || branchRow.availableUntil >= now);
        const isAvailable =
          option.status === OPTION_STATUS.ACTIVE &&
          (branchRow ? branchRow.isAvailable && withinSchedule : true);
        const incompatibilityDetails = incompatibleByOption.get(option.id) ?? [];
        const linkedAllergens = option.inventoryItemId === null ? null : inventoryAllergens.get(option.inventoryItemId);

        return {
          id: option.id,
          name: option.name,
          isDefault: false,
          description: option.description,
          imageUrl: option.imageUrl,
          imageAlt: option.imageAlt,
          imagePosition: option.imagePosition,
          dietaryTags: Array.isArray(option.dietaryTags) ? option.dietaryTags : [],
          allergens: [...new Set([
            ...(Array.isArray(option.allergens) ? option.allergens : []),
            ...(Array.isArray(linkedAllergens) ? linkedAllergens : []),
          ])],
          spiceLevel: option.spiceLevel,
          priceDelta: Number(branchRow?.priceOverride ?? option.priceDelta),
          chargeAlways: option.chargeAlways,
          cakeScaleWithServings: option.cakeScaleWithServings,
          maxPerItem: option.maxPerItem,
          isAvailable,
          incompatibleWith: incompatibilityDetails.map((entry) => entry.optionId),
          incompatibilities: incompatibilityDetails,
        };
      });
    const firstAvailableIndex = options.findIndex((option) => option.isAvailable);

    return {
      id: group.id,
      variantId: link.variantId ?? null,
      code: group.code,
      name: group.name,
      description: group.description,
      selectionType: group.selectionType,
      minSelection: rules.minSelection,
      maxSelection: rules.maxSelection,
      freeQuantity: rules.freeQuantity,
      sortOrder: rules.sortOrder,
      options: options.map((option, index) => ({
        ...option,
        isDefault: index === firstAvailableIndex,
      })),
    };
  });

  return groups.sort((a, b) => a.sortOrder - b.sortOrder);
};

export const customizationService = {
  /** Configuracion del constructor: pasos, opciones, limites y precios de esa sucursal. */
  async getConfig(productId: number, branchId?: number): Promise<BuilderConfig> {
    const product = await loadProductOrFail(productId);

    if (product.type !== PRODUCT_TYPE.CUSTOMIZABLE) {
      throw ApiError.badRequest('Este producto no es personalizable');
    }

    return {
      customServings: (await CakeProductProfile.findByPk(product.id))?.customServingsJson ?? null,
      product: {
        id: product.id,
        name: product.name,
        slug: product.slug,
        type: product.type,
        imageUrl: product.imageUrl,
        imageAlt: product.imageAlt,
        imagePosition: product.imagePosition,
      },
      variants: (product.variants ?? []).map((variant) => ({
        id: variant.id,
        name: variant.name,
        basePrice: Number(variant.basePrice),
        servingSize: variant.servingSize === null ? null : Number(variant.servingSize),
        servingUnit: variant.servingUnit,
        isDefault: variant.isDefault,
      })),
      groups: await loadGroups(product.id, branchId),
      presets: (
        await BuilderPreset.findAll({
          where: { productId: product.id, isActive: true },
          include: [{ model: BuilderPresetItem, as: 'items', required: false }],
          order: [['sortOrder', 'ASC']],
        })
      ).map((preset) => ({
        id: preset.id,
        code: preset.code,
        name: preset.name,
        description: preset.description,
        imageUrl: preset.imageUrl,
        badge: preset.badge,
        isFeatured: preset.isFeatured,
        selections: (preset.items ?? [])
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((item) => ({ optionId: item.optionId, quantity: item.quantity })),
      })),
    };
  },

  /**
   * Cotiza una seleccion. El backend es la fuente de verdad (RN-007):
   * valida limites (RN-006), incompatibilidades y disponibilidad, y calcula
   * precio final. La UI puede mostrar el resultado, pero el servidor es la autoridad.
   */
  async quote(input: QuoteInput): Promise<QuoteResult> {
    const product = await loadProductOrFail(input.productId);
    const variant = (product.variants ?? []).find((entry) => entry.id === input.variantId);
    if (!variant) throw ApiError.badRequest('La presentacion elegida no existe o no esta activa');

    const quantity = Math.max(1, input.quantity);
    const servingRule = await resolveCakeCustomServings(product.id, variant.id, input.requestedServings);
    const theme = await resolveCakeTheme(input);
    const baseAllergens = (typeof product.get === 'function' ? product.get('allergens') as Allergen[] | undefined : undefined)?.map((allergen) => allergen.code) ?? [];
    const basePrice = round2(Number(variant.basePrice) + servingRule.extraPrice);
    const displayVariantName = servingRule.requestedServings ? `Personalizado · ${servingRule.requestedServings} porciones` : variantLabel(variant);

    // Producto fijo: no admite selecciones.
    if (product.type === PRODUCT_TYPE.FIXED) {
      if (input.selections.length > 0) {
        throw ApiError.badRequest('Este producto no admite personalizacion');
      }

      return {
        productId: product.id,
        variantId: variant.id,
        variantName: displayVariantName,
        quantity,
        basePrice,
        extrasTotal: 0,
        unitPrice: basePrice,
        lineTotal: round2(basePrice * quantity),
        selections: [],
        allergenCodes: baseAllergens,
        description: displayVariantName,
      };
    }

    const allGroups = await loadGroups(product.id, input.branchId, input.variantId);
    const hiddenGroupIds = new Set(theme?.rule.hiddenGroupIds ?? []);
    const groups = allGroups.filter((group) => !hiddenGroupIds.has(group.id));
    const optionIndex = new Map<number, { group: GroupDto; option: OptionDto }>();
    groups.forEach((group) =>
      group.options.forEach((option) => optionIndex.set(option.id, { group, option })),
    );

    // 1) Cada opcion debe pertenecer al producto, estar disponible y respetar su tope.
    for (const selection of input.selections) {
      const entry = optionIndex.get(selection.optionId);
      if (!entry) throw ApiError.badRequest(`La opcion ${selection.optionId} no existe`);
      if (selection.quantity < 1) throw ApiError.badRequest('Cantidad invalida');
      if (!entry.option.isAvailable) {
        throw ApiError.unprocessable(`"${entry.option.name}" no esta disponible ahora`);
      }
      if (selection.quantity > entry.option.maxPerItem) {
        throw ApiError.unprocessable(
          `"${entry.option.name}" admite hasta ${entry.option.maxPerItem} por plato`,
        );
      }
    }

    // 2) Incompatibilidades (RN-006).
    const selectedIds = new Set(input.selections.map((selection) => selection.optionId));
    for (const selection of input.selections) {
      const entry = optionIndex.get(selection.optionId);
      const conflict = entry?.option.incompatibleWith.find((id) => selectedIds.has(id));
      if (conflict) {
        const other = optionIndex.get(conflict)?.option.name ?? 'otra opcion';
        throw ApiError.unprocessable(`"${entry?.option.name}" no se puede combinar con "${other}"`);
      }
    }

    // 3) Minimos/maximos por grupo (RN-006) y cobro de lo que excede la cantidad incluida.
    const lines: QuoteLine[] = [];
    let extrasTotal = theme?.snapshot.priceDelta ?? 0;

    for (const group of groups) {
      const chosen = input.selections
        .map((selection) => {
          const entry = optionIndex.get(selection.optionId);
          return entry && entry.group.id === group.id
            ? { option: entry.option, quantity: selection.quantity }
            : null;
        })
        .filter((entry): entry is { option: OptionDto; quantity: number } => entry !== null);

      const units = chosen.reduce((total, entry) => total + entry.quantity, 0);

      if (units < group.minSelection) {
        throw ApiError.unprocessable(
          `"${group.name}": elige al menos ${group.minSelection} opcion(es)`,
        );
      }
      if (units > group.maxSelection) {
        throw ApiError.unprocessable(`"${group.name}": maximo ${group.maxSelection} opcion(es)`);
      }
      if (group.selectionType === 'SINGLE' && chosen.length > 1) {
        throw ApiError.unprocessable(`"${group.name}": solo se puede elegir una opcion`);
      }

      // Cobro dentro del grupo:
      //  - Los suplementos (chargeAlways) se cobran siempre y NO gastan unidades incluidas.
      //  - El resto compite por las unidades incluidas; las gratis se asignan a las mas
      //    caras, asi el cliente siempre sale beneficiado y el calculo es determinista.
      const chargedByOption = new Map<number, number>();

      const supplements = chosen.filter((entry) => entry.option.chargeAlways);
      supplements.forEach((entry) => chargedByOption.set(entry.option.id, entry.quantity));

      const freeEligible = chosen
        .filter((entry) => !entry.option.chargeAlways)
        .flatMap((entry) => Array.from({ length: entry.quantity }, () => entry.option))
        .sort((a, b) => b.priceDelta * (b.cakeScaleWithServings ? servingRule.scale : 1) - a.priceDelta * (a.cakeScaleWithServings ? servingRule.scale : 1));

      freeEligible.forEach((option, index) => {
        if (index >= group.freeQuantity) {
          chargedByOption.set(option.id, (chargedByOption.get(option.id) ?? 0) + 1);
        }
      });

      for (const entry of chosen) {
        const charged = chargedByOption.get(entry.option.id) ?? 0;
        const effectivePrice = round2(entry.option.priceDelta * (entry.option.cakeScaleWithServings ? servingRule.scale : 1));
        const lineExtra = round2(charged * effectivePrice);
        extrasTotal += lineExtra;

        lines.push({
          groupId: group.id,
          groupName: group.name,
          optionId: entry.option.id,
          optionName: entry.option.name,
          quantity: entry.quantity,
          chargedQuantity: charged,
          priceDelta: effectivePrice,
          lineExtra,
          cakeScaleWithServings: entry.option.cakeScaleWithServings,
        });
      }
    }

    const unitPrice = round2(basePrice + extrasTotal);
    const byGroup = new Map<string, string[]>();
    lines.forEach((line) => {
      const label = line.quantity > 1 ? `${line.optionName} x${line.quantity}` : line.optionName;
      byGroup.set(line.groupName, [...(byGroup.get(line.groupName) ?? []), label]);
    });

    const description = [
      displayVariantName,
      ...(theme ? [`Diseño: ${theme.theme.name}`] : []),
      ...[...byGroup.entries()].map(([group, names]) => `${group}: ${names.join(', ')}`),
    ].join(' Â· ');

    return {
      productId: product.id,
      variantId: variant.id,
      variantName: displayVariantName,
      requestedServings: servingRule.requestedServings,
      theme: theme?.snapshot ?? null,
      quantity,
      basePrice,
      extrasTotal: round2(extrasTotal),
      unitPrice,
      lineTotal: round2(unitPrice * quantity),
      selections: lines,
      allergenCodes: [...new Set([...baseAllergens, ...(theme?.snapshot.allergens ?? []), ...input.selections.flatMap((selection) => optionIndex.get(selection.optionId)?.option.allergens ?? [])])],
      description,
    };
  },
};

export type CustomizationService = typeof customizationService;
