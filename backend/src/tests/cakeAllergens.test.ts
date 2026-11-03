import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import type { Transaction } from 'sequelize';
import {
  Allergen, CakeProductProfile, CustomizationGroup, CustomizationOption, InventoryItem, Product,
  ProductAllergen, ProductCustomizationGroup, ProductDietaryTag, ProductVariant,
  Recipe, RecipeItem, sequelize,
} from '@database/models';
import { refreshCakeAllergens } from '../modules/catalog/cakeAllergens.service';

afterEach(() => mock.restoreAll());

const setup = (ingredientAllergens: string[] | null, hasActiveOption = true) => {
  mock.method(CakeProductProfile, 'findByPk', async () => ({ productId: 12, saleMode: 'SEMI_CUSTOM' }) as CakeProductProfile);
  mock.method(ProductVariant, 'findAll', async () => [{ id: 7 }] as ProductVariant[]);
  mock.method(Recipe, 'findAll', async () => [{ id: 8, variantId: 7 }] as Recipe[]);
  mock.method(RecipeItem, 'findAll', async () => [{ recipeId: 8, inventoryItemId: 5 }] as RecipeItem[]);
  mock.method(ProductCustomizationGroup, 'findAll', async () => [{ groupId: 3, minSelectionOverride: null }] as ProductCustomizationGroup[]);
  mock.method(CustomizationGroup, 'findAll', async () => [{ id: 3, minSelection: 1 }] as CustomizationGroup[]);
  mock.method(CustomizationOption, 'findAll', async () => (hasActiveOption ? [{ groupId: 3, inventoryItemId: null, allergens: ['huevo'] }] : []) as CustomizationOption[]);
  mock.method(InventoryItem, 'findAll', async () => [{ id: 5, name: 'Harina', allergens: ingredientAllergens }] as InventoryItem[]);
  mock.method(Allergen, 'findAll', async () => [{ id: 1, code: 'gluten' }, { id: 2, code: 'huevo' }] as Allergen[]);
  mock.method(ProductAllergen, 'findAll', async () => []);
  mock.method(ProductAllergen, 'destroy', async () => 0);
  mock.method(ProductDietaryTag, 'destroy', async () => 0);
  mock.method(sequelize, 'transaction', async (callback: (transaction: Transaction) => Promise<unknown>) => callback({} as Transaction));
};

test('calcula la unión de la receta y las opciones activas', async () => {
  setup(['gluten']);
  let savedIds: number[] = [];
  let reviewedAt: Date | null = null;
  mock.method(ProductAllergen, 'bulkCreate', async (rows: Array<{ allergenId: number }>) => {
    savedIds = rows.map((row) => row.allergenId);
    return [];
  });
  mock.method(Product, 'update', async (values: { allergensReviewedAt: Date | null }) => {
    reviewedAt = values.allergensReviewedAt;
    return [1];
  });

  const result = await refreshCakeAllergens(12);
  assert.equal(result.complete, true);
  assert.deepEqual(savedIds, [1, 2]);
  assert.ok(reviewedAt);
});

test('un insumo sin clasificar impide completar el cálculo', async () => {
  setup(null);
  let reviewedAt: Date | null | undefined;
  mock.method(Product, 'update', async (values: { allergensReviewedAt: Date | null }) => {
    reviewedAt = values.allergensReviewedAt;
    return [1];
  });

  const result = await refreshCakeAllergens(12);
  assert.equal(result.complete, false);
  assert.deepEqual(result.missingItems, ['Harina']);
  assert.equal(reviewedAt, null);
});

test('una torta personalizable sin opciones activas queda pendiente', async () => {
  setup(['gluten'], false);
  let reviewedAt: Date | null | undefined;
  mock.method(Product, 'update', async (values: { allergensReviewedAt: Date | null }) => {
    reviewedAt = values.allergensReviewedAt;
    return [1];
  });

  const result = await refreshCakeAllergens(12);
  assert.equal(result.complete, false);
  assert.equal(reviewedAt, null);
});
