import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import {
  BuilderPreset,
  CakeProductProfile,
  CustomizationGroup,
  OptionIncompatibility,
  Product,
  ProductCustomizationGroup,
  InventoryItem,
} from '@database/models';
import { customizationService } from '../modules/customization/customization.service';

afterEach(() => mock.restoreAll());

test('el constructor público respeta el orden configurado por el administrador', async () => {
  mock.method(
    Product,
    'findByPk',
    async () =>
      ({
        id: 26,
        name: 'Crea tu torta',
        slug: 'torta-a-tu-gusto',
        type: 'CUSTOMIZABLE',
        status: 'ACTIVE',
        allergensReviewedAt: new Date(),
        variants: [],
      }) as unknown as Product,
  );
  mock.method(
    CakeProductProfile,
    'findByPk',
    async () => ({ isActive: true, customServingsJson: null }) as unknown as CakeProductProfile,
  );
  const option = (id: number, name: string, sortOrder: number) => ({
    id,
    name,
    sortOrder,
    status: 'ACTIVE',
    description: null,
    imageUrl: null,
    imageAlt: null,
    imagePosition: '50% 50%',
    dietaryTags: [],
    allergens: [],
    inventoryItemId: null,
    spiceLevel: 0,
    priceDelta: 0,
    chargeAlways: false,
    cakeScaleWithServings: true,
    maxPerItem: 1,
  });
  const group = {
    id: 10,
    code: 'sabores',
    name: 'Sabores',
    description: null,
    isActive: true,
    selectionType: 'SINGLE',
    minSelection: 1,
    maxSelection: 1,
    freeQuantity: 1,
    sortOrder: 0,
    options: [option(3, 'Arándanos', 2), option(1, 'Vainilla', 0), option(2, 'Chocolate', 1)],
  } as unknown as CustomizationGroup;
  mock.method(
    ProductCustomizationGroup,
    'findAll',
    async () =>
      [
        {
          variantId: null,
          sortOrder: 0,
          minSelectionOverride: null,
          maxSelectionOverride: null,
          freeQuantityOverride: null,
          get: () => group,
        },
      ] as unknown as ProductCustomizationGroup[],
  );
  mock.method(OptionIncompatibility, 'findAll', async () => []);
  mock.method(BuilderPreset, 'findAll', async () => []);

  const config = await customizationService.getConfig(26);
  assert.deepEqual(
    config.groups[0].options.map((entry) => entry.name),
    ['Vainilla', 'Chocolate', 'Arándanos'],
  );
});

test('la cotización conserva los alérgenos del adicional y del insumo vinculado', async () => {
  const option = {
    id: 8,
    name: 'Relleno de maní',
    sortOrder: 0,
    status: 'ACTIVE',
    description: null,
    imageUrl: null,
    imageAlt: null,
    imagePosition: '50% 50%',
    dietaryTags: [],
    allergens: ['PEANUTS'],
    inventoryItemId: 44,
    spiceLevel: 0,
    priceDelta: 5,
    chargeAlways: false,
    cakeScaleWithServings: true,
    maxPerItem: 1,
  };
  const group = {
    id: 11,
    code: 'rellenos',
    name: 'Rellenos',
    description: null,
    isActive: true,
    selectionType: 'SINGLE',
    minSelection: 1,
    maxSelection: 1,
    freeQuantity: 1,
    sortOrder: 0,
    options: [option],
  } as unknown as CustomizationGroup;
  const product = {
    id: 27,
    name: 'Torta',
    slug: 'torta',
    type: 'CUSTOMIZABLE',
    status: 'ACTIVE',
    allergensReviewedAt: new Date(),
    variants: [
      { id: 5, name: 'Mediana', basePrice: 100, servingSize: 12, servingUnit: 'porciones' },
    ],
    get: (key: string) => (key === 'allergens' ? [{ code: 'MILK' }] : undefined),
  } as unknown as Product;
  mock.method(Product, 'findByPk', async () => product);
  mock.method(CakeProductProfile, 'findByPk', async () => null);
  mock.method(
    ProductCustomizationGroup,
    'findAll',
    async () =>
      [
        {
          variantId: null,
          sortOrder: 0,
          minSelectionOverride: 1,
          maxSelectionOverride: 1,
          freeQuantityOverride: 1,
          get: () => group,
        },
      ] as unknown as ProductCustomizationGroup[],
  );
  mock.method(
    InventoryItem,
    'findAll',
    async () => [{ id: 44, allergens: ['TREE_NUTS'] }] as unknown as InventoryItem[],
  );
  mock.method(OptionIncompatibility, 'findAll', async () => []);
  const result = await customizationService.quote({
    productId: 27,
    variantId: 5,
    quantity: 1,
    selections: [{ optionId: 8, quantity: 1 }],
  });
  assert.deepEqual(result.allergenCodes?.sort(), ['MILK', 'PEANUTS', 'TREE_NUTS']);
});
