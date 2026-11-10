import { PRODUCT_TYPE } from '@config/constants';
import { logger } from '@config/logger';
import {
  Branch, BranchInventory, BranchSchedule, CakeProductProfile, CakeStationCapacity, Category, CustomizationGroup,
  CustomizationOption, InventoryItem, Product, ProductCustomizationGroup, ProductVariant, Recipe, RecipeItem,
} from '../models';
import { SELECTION_TYPE } from '../models/customizationGroup.model';
import type { CakeEffort, CakeOffsets, CakeStation } from '../models/cakeProduction.model';

/** Datos editables de demostración. Confirmar precios, tiempos y turnos antes de vender en producción. */
const CAKES: Array<{
  slug: string; name: string; description: string; mode: 'STANDARD' | 'SEMI_CUSTOM' | 'ADVANCED';
  type: 'FIXED' | 'CUSTOMIZABLE'; lead: number; image: string;
  variants: Array<{ sku: string; name: string; price: number; servings: number; effort: CakeEffort }>;
}> = [
  {
    slug: 'torta-clasica-vainilla', name: 'Torta clásica de vainilla',
    description: 'Bizcocho de vainilla y relleno suave. Precio y porciones de demostración; confirma la receta antes de publicar.',
    mode: 'STANDARD', type: 'FIXED', lead: 48, image: '/images/cakes/vanilla.svg',
    variants: [
      { sku: 'DF-CLASICA-12', name: '12 porciones', price: 120, servings: 12, effort: { BAKING: 45, COOLING: 30, FILLING: 35, DECORATING: 20, QA: 15, DISPATCH: 10 } },
      { sku: 'DF-CLASICA-24', name: '24 porciones', price: 180, servings: 24, effort: { BAKING: 70, COOLING: 45, FILLING: 55, DECORATING: 35, QA: 20, DISPATCH: 15 } },
    ],
  },
  {
    slug: 'torta-a-tu-gusto', name: 'Torta a tu gusto',
    description: 'Elige ocasión, bizcocho, relleno, cobertura y decoración. Precio inicial de demostración.',
    mode: 'SEMI_CUSTOM', type: 'CUSTOMIZABLE', lead: 72, image: '/images/cakes/custom.png',
    variants: [
      { sku: 'DF-PERSONAL-12', name: '12 porciones', price: 180, servings: 12, effort: { BAKING: 55, COOLING: 35, FILLING: 45, DECORATING: 55, QA: 20, DISPATCH: 10 } },
      { sku: 'DF-PERSONAL-24', name: '24 porciones', price: 260, servings: 24, effort: { BAKING: 80, COOLING: 50, FILLING: 70, DECORATING: 85, QA: 25, DISPATCH: 15 } },
    ],
  },
  {
    slug: 'torta-diseno-especial', name: 'Torta de diseño especial',
    description: 'Para bodas, figuras y acabados especiales. Envía una referencia; el equipo revisará precio y fecha antes del pago.',
    mode: 'ADVANCED', type: 'CUSTOMIZABLE', lead: 96, image: '/images/cakes/special.png',
    variants: [{ sku: 'DF-ESPECIAL-24', name: 'Desde 24 porciones', price: 280, servings: 24, effort: { DESIGN: 60, BAKING: 80, COOLING: 50, FILLING: 70, DECORATING: 150, QA: 30, DISPATCH: 20 } }],
  },
];

const GROUPS: Array<{
  code: string; name: string; order: number; choices: Array<{ name: string; price: number; effort: CakeEffort }>;
}> = [
  { code: 'df_ocasion', name: 'Ocasión', order: 1, choices: [
    { name: 'Cumpleaños', price: 0, effort: {} }, { name: 'Aniversario', price: 0, effort: {} },
    { name: 'Boda', price: 0, effort: { DESIGN: 20 } }, { name: 'Celebración', price: 0, effort: {} },
  ] },
  { code: 'df_bizcocho', name: 'Bizcocho', order: 2, choices: [
    { name: 'Vainilla', price: 0, effort: {} }, { name: 'Chocolate', price: 15, effort: { BAKING: 10 } },
    { name: 'Red velvet', price: 25, effort: { BAKING: 15 } },
  ] },
  { code: 'df_relleno', name: 'Relleno', order: 3, choices: [
    { name: 'Manjar blanco', price: 0, effort: {} }, { name: 'Ganache', price: 18, effort: { FILLING: 10 } },
    { name: 'Frutos rojos', price: 22, effort: { FILLING: 15 } },
  ] },
  { code: 'df_cobertura', name: 'Cobertura', order: 4, choices: [
    { name: 'Crema', price: 0, effort: {} }, { name: 'Fondant', price: 35, effort: { DECORATING: 35 } },
    { name: 'Ganache exterior', price: 20, effort: { DECORATING: 15 } },
  ] },
  { code: 'df_decoracion', name: 'Decoración', order: 5, choices: [
    { name: 'Clásica', price: 0, effort: {} }, { name: 'Flores', price: 35, effort: { DECORATING: 30 } },
    { name: 'Topper', price: 25, effort: { DECORATING: 15 } },
  ] },
];

const OFFSETS: CakeOffsets = { DESIGN: 2, BAKING: 1, COOLING: 1, FILLING: 1, DECORATING: 0, QA: 0, DISPATCH: 0 };
const DEFAULT_CAPACITY: Record<CakeStation, number> = { DESIGN: 120, BAKING: 180, COOLING: 180, FILLING: 180, DECORATING: 180, QA: 90, DISPATCH: 90 };
const MATERIALS = [
  { code: 'DF-HARINA', name: 'Harina de repostería', unit: 'g', stock: 25000 },
  { code: 'DF-HUEVOS', name: 'Huevos', unit: 'und', stock: 240 },
  { code: 'DF-AZUCAR', name: 'Azúcar', unit: 'g', stock: 20000 },
  { code: 'DF-VAINILLA', name: 'Esencia de vainilla', unit: 'ml', stock: 2000 },
  { code: 'DF-CACAO', name: 'Cacao', unit: 'g', stock: 7000 },
  { code: 'DF-MANJAR', name: 'Manjar blanco', unit: 'g', stock: 9000 },
  { code: 'DF-GANACHE', name: 'Ganache', unit: 'g', stock: 9000 },
  { code: 'DF-FRUTOS', name: 'Frutos rojos', unit: 'g', stock: 6000 },
  { code: 'DF-CREMA', name: 'Crema para cobertura', unit: 'g', stock: 14000 },
  { code: 'DF-FONDANT', name: 'Fondant', unit: 'g', stock: 10000 },
  { code: 'DF-FLORES', name: 'Flores comestibles', unit: 'und', stock: 100 },
  { code: 'DF-TOPPER', name: 'Topper de torta', unit: 'und', stock: 100 },
] as const;
const OPTION_MATERIALS: Record<string, { code: string; quantity: number }> = {
  'df_bizcocho:Vainilla': { code: 'DF-VAINILLA', quantity: 20 },
  'df_bizcocho:Chocolate': { code: 'DF-CACAO', quantity: 160 },
  'df_bizcocho:Red velvet': { code: 'DF-CACAO', quantity: 90 },
  'df_relleno:Manjar blanco': { code: 'DF-MANJAR', quantity: 450 },
  'df_relleno:Ganache': { code: 'DF-GANACHE', quantity: 450 },
  'df_relleno:Frutos rojos': { code: 'DF-FRUTOS', quantity: 450 },
  'df_cobertura:Crema': { code: 'DF-CREMA', quantity: 550 },
  'df_cobertura:Fondant': { code: 'DF-FONDANT', quantity: 600 },
  'df_cobertura:Ganache exterior': { code: 'DF-GANACHE', quantity: 550 },
  'df_decoracion:Flores': { code: 'DF-FLORES', quantity: 8 },
  'df_decoracion:Topper': { code: 'DF-TOPPER', quantity: 1 },
};

export const seedCakeCapacities = async (branchId: number, days = 14): Promise<void> => {
  const schedules = await BranchSchedule.findAll({
    where: { branchId },
    attributes: ['weekday', 'exceptionDate', 'isClosed'],
  });
  for (let day = 0; day <= days; day += 1) {
    const date = new Date(Date.now() + day * 24 * 60 * 60_000);
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    const workDate = `${get('year')}-${get('month')}-${get('day')}`;
    const weekday = new Date(`${workDate}T12:00:00-05:00`).getDay();
    const schedule = schedules.find((entry) => String(entry.exceptionDate ?? '') === workDate)
      ?? schedules.find((entry) => entry.exceptionDate === null && entry.weekday === weekday);
    const isClosed = Boolean(schedule?.isClosed);
    for (const [station, capacityMinutes] of Object.entries(DEFAULT_CAPACITY) as Array<[CakeStation, number]>) {
      await CakeStationCapacity.findOrCreate({ where: { branchId, workDate, station }, defaults: { branchId, workDate, station, capacityMinutes: isClosed ? 0 : capacityMinutes } });
    }
  }
};

export const seedCakes = async (): Promise<void> => {
  const materialIds = new Map<string, number>();
  for (const material of MATERIALS) {
    const [item] = await InventoryItem.findOrCreate({ where: { code: material.code }, defaults: { code: material.code, name: material.name, unit: material.unit, minLevel: 0 } });
    materialIds.set(material.code, item.id);
  }
  const [category] = await Category.findOrCreate({ where: { slug: 'tortas' }, defaults: { slug: 'tortas', name: 'Tortas', sortOrder: 1, isActive: true } });
  for (const cake of CAKES) {
    const [product] = await Product.findOrCreate({ where: { slug: cake.slug }, defaults: {
      categoryId: category.id, type: cake.type === 'FIXED' ? PRODUCT_TYPE.FIXED : PRODUCT_TYPE.CUSTOMIZABLE,
      name: cake.name, slug: cake.slug, description: cake.description, imageUrl: cake.image,
      imageAlt: cake.name, isFeatured: cake.mode !== 'ADVANCED', sortOrder: 1,
    } });
    await CakeProductProfile.findOrCreate({ where: { productId: product.id }, defaults: {
      productId: product.id, saleMode: cake.mode, minLeadHours: cake.lead,
      baseEffortJson: cake.variants[0].effort, stationOffsetsJson: OFFSETS,
    } });
    for (const [index, variant] of cake.variants.entries()) {
      const [variantRow] = await ProductVariant.findOrCreate({ where: { sku: variant.sku }, defaults: {
        productId: product.id, sku: variant.sku, name: variant.name, basePrice: variant.price,
        servingSize: variant.servings, servingUnit: 'porciones', productionMinutesJson: variant.effort,
        isDefault: index === 0, sortOrder: index,
      } });
      const [recipe] = await Recipe.findOrCreate({ where: { variantId: variantRow.id }, defaults: { productId: product.id, variantId: variantRow.id, yieldQuantity: 1 } });
      const factor = variant.servings / 12;
      for (const [code, quantity] of [['DF-HARINA', 600], ['DF-HUEVOS', 6], ['DF-AZUCAR', 450]] as const) {
        await RecipeItem.findOrCreate({ where: { recipeId: recipe.id, inventoryItemId: materialIds.get(code)! }, defaults: { recipeId: recipe.id, inventoryItemId: materialIds.get(code)!, quantity: quantity * factor, wastePercent: 5 } });
      }
      if (cake.mode === 'STANDARD') {
        for (const [code, quantity] of [['DF-VAINILLA', 20], ['DF-MANJAR', 450], ['DF-CREMA', 550]] as const) {
          await RecipeItem.findOrCreate({ where: { recipeId: recipe.id, inventoryItemId: materialIds.get(code)! }, defaults: { recipeId: recipe.id, inventoryItemId: materialIds.get(code)!, quantity: quantity * factor, wastePercent: 5 } });
        }
      }
    }
    if (cake.type === 'FIXED') continue;
    for (const group of GROUPS) {
      const [groupRow] = await CustomizationGroup.findOrCreate({ where: { code: group.code }, defaults: {
        code: group.code, name: group.name, selectionType: SELECTION_TYPE.SINGLE,
        minSelection: 1, maxSelection: 1, freeQuantity: 1, sortOrder: group.order, isActive: true,
      } });
      await ProductCustomizationGroup.findOrCreate({ where: { productId: product.id, groupId: groupRow.id, variantId: null }, defaults: {
        productId: product.id, groupId: groupRow.id, variantId: null, sortOrder: group.order, isActive: true,
      } });
      for (const [index, option] of group.choices.entries()) {
        const material = OPTION_MATERIALS[`${group.code}:${option.name}`];
        const [optionRow] = await CustomizationOption.findOrCreate({ where: { groupId: groupRow.id, name: option.name }, defaults: {
          groupId: groupRow.id, name: option.name, priceDelta: option.price, chargeAlways: option.price > 0,
          productionMinutesJson: option.effort, sortOrder: index, maxPerItem: 1,
          inventoryItemId: material ? materialIds.get(material.code)! : null,
          consumptionQuantity: material?.quantity ?? 0,
        } });
        if (material && !optionRow.inventoryItemId) {
          optionRow.inventoryItemId = materialIds.get(material.code)!;
          optionRow.consumptionQuantity = material.quantity;
          await optionRow.save();
        }
      }
    }
  }
  const branch = await Branch.findOne({ where: { slug: 'dulceflow-miraflores' } });
  if (branch) {
    await seedCakeCapacities(branch.id);
    for (const material of MATERIALS) {
      await BranchInventory.findOrCreate({ where: { branchId: branch.id, inventoryItemId: materialIds.get(material.code)! }, defaults: { branchId: branch.id, inventoryItemId: materialIds.get(material.code)!, onHand: material.stock } });
    }
  }
  logger.info('Catálogo y capacidad inicial de Misky Challay cargados como datos editables');
};
