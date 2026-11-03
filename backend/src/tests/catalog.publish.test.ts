import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import type { Transaction } from 'sequelize';
import { Allergen, CakeProductProfile, CustomizationGroup, CustomizationOption, Product, ProductAllergen, ProductCustomizationGroup, ProductNutrition, ProductVariant, Recipe, RecipeItem, sequelize } from '@database/models';
import { catalogAdminService } from '../modules/admin/catalogAdmin.service';

afterEach(() => mock.restoreAll());

test('un producto sin presentaciones activas no se puede publicar', async () => {
  mock.method(Product, 'findByPk', async () => ({ id: 12, status: 'DRAFT' }) as Product);
  mock.method(ProductVariant, 'count', async () => 0);

  await assert.rejects(
    catalogAdminService.changeStatus(12, 'ACTIVE'),
    /Activa al menos una presentación/,
  );
});

test('una revisión sin alérgenos marcados queda confirmada cuando existe una lista para revisar', async () => {
  const product = { id: 12, allergensReviewedAt: null, save: async () => undefined } as unknown as Product;
  mock.method(catalogAdminService, 'getProductOrFail', async () => product);
  mock.method(CakeProductProfile, 'findByPk', async () => null);
  mock.method(Allergen, 'findAll', async () => [{ id: 1, name: 'Gluten' }] as Allergen[]);
  mock.method(ProductAllergen, 'findAll', async () => []);
  mock.method(ProductAllergen, 'destroy', async () => 0);
  mock.method(sequelize, 'transaction', async (callback: (transaction: Transaction) => Promise<unknown>) => callback({} as Transaction));

  await catalogAdminService.setAllergens(12, []);

  assert.ok(product.allergensReviewedAt);
});

test('no se confirma una revisión si faltan todas las opciones de alérgenos', async () => {
  mock.method(catalogAdminService, 'getProductOrFail', async () => ({ id: 12 }) as Product);
  mock.method(CakeProductProfile, 'findByPk', async () => null);
  mock.method(Allergen, 'findAll', async () => []);

  await assert.rejects(catalogAdminService.setAllergens(12, []), /No hay opciones de alérgenos configuradas/);
});

test('no se puede desactivar la última presentación de un producto publicado', async () => {
  mock.method(ProductVariant, 'findByPk', async () => ({ id: 7, productId: 12, isActive: true }) as ProductVariant);
  mock.method(Product, 'findByPk', async () => ({ id: 12, status: 'ACTIVE' }) as Product);
  mock.method(ProductVariant, 'count', async () => 1);

  await assert.rejects(
    catalogAdminService.updateVariant(7, { isActive: false }),
    /Retira primero el producto o activa otra presentación/,
  );
});

test('una presentación nueva de torta publicada espera su receta antes de ofrecerse', async () => {
  mock.method(Product, 'findByPk', async () => ({ id: 12, status: 'ACTIVE', slug: 'torta' }) as Product);
  mock.method(ProductVariant, 'count', async () => 1);
  mock.method(CakeProductProfile, 'findOne', async () => ({ productId: 12, isActive: true }) as CakeProductProfile);
  mock.method(sequelize, 'transaction', async (callback: (transaction: Transaction) => Promise<unknown>) => callback({} as Transaction));
  let createdIsActive: boolean | undefined;
  mock.method(ProductVariant, 'create', async (input: { isActive?: boolean }) => {
    createdIsActive = input.isActive;
    return { id: 99 } as ProductVariant;
  });
  mock.method(ProductNutrition, 'create', async () => ({}) as ProductNutrition);

  await catalogAdminService.addVariant(12, { name: 'Grande', basePrice: 45 });

  assert.equal(createdIsActive, false);
});

test('una presentación inactiva de torta publicada necesita receta para activarse', async () => {
  mock.method(ProductVariant, 'findByPk', async () => ({ id: 7, productId: 12, isActive: false }) as ProductVariant);
  mock.method(Product, 'findByPk', async () => ({ id: 12, status: 'ACTIVE' }) as Product);
  mock.method(CakeProductProfile, 'findOne', async () => ({ productId: 12, isActive: true }) as CakeProductProfile);
  mock.method(Recipe, 'findOne', async () => null);

  await assert.rejects(
    catalogAdminService.updateVariant(7, { isActive: true }),
    /Completa la receta de esta presentación/,
  );
});

test('una torta personalizable necesita opciones activas antes de publicarse', async () => {
  mock.method(Product, 'findByPk', async () => ({ id: 12, status: 'DRAFT', allergensReviewedAt: new Date() }) as Product);
  mock.method(ProductVariant, 'count', async () => 1);
  mock.method(CakeProductProfile, 'findByPk', async () => ({
    productId: 12, isActive: true, saleMode: 'SEMI_CUSTOM', baseEffortJson: { BAKING: 60 },
  }) as CakeProductProfile);
  mock.method(ProductVariant, 'findAll', async () => [{ id: 7, name: '12 porciones' }] as ProductVariant[]);
  mock.method(Recipe, 'findOne', async () => ({ id: 20 }) as Recipe);
  mock.method(RecipeItem, 'count', async () => 1);
  mock.method(ProductCustomizationGroup, 'findAll', async () => [{ groupId: 3, minSelectionOverride: null }] as ProductCustomizationGroup[]);
  mock.method(CustomizationGroup, 'findOne', async () => ({ id: 3, isActive: true, minSelection: 1 }) as CustomizationGroup);
  mock.method(CustomizationOption, 'count', async () => 0);

  await assert.rejects(catalogAdminService.changeStatus(12, 'ACTIVE'), /opciones activas/);
});
