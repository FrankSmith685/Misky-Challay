import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import type { Transaction } from 'sequelize';
import { CakeProductProfile, Category, InventoryItem, Product, ProductVariant, Recipe, RecipeItem, sequelize } from '@database/models';
import { catalogAdminService } from '../modules/admin/catalogAdmin.service';
import { cakeProductionService } from '../modules/cakes/cakeProduction.service';

afterEach(() => mock.restoreAll());

test('un postre crea presentación por unidad y reglas de preparación en el mismo borrador', async () => {
  mock.method(Category, 'findOne', async () => ({ id: 4 }) as Category);
  mock.method(Product, 'findOne', async () => null);
  mock.method(sequelize, 'transaction', async (callback: (tx: Transaction) => Promise<unknown>) => callback({} as Transaction));
  const writes: Record<string, unknown>[] = [];
  mock.method(Product, 'create', async (input: Record<string, unknown>) => { writes.push(input); return { ...input, id: 901 } as Product; });
  mock.method(ProductVariant, 'create', async (input: Record<string, unknown>) => { writes.push(input); return { id: 902 } as ProductVariant; });
  mock.method(CakeProductProfile, 'create', async (input: Record<string, unknown>) => { writes.push(input); return input as unknown as CakeProductProfile; });
  await catalogAdminService.createProduct({ name: 'Fatia de tiramisú', categoryId: 4, type: 'FIXED', family: 'DESSERT', preparationMode: 'READY_STOCK', minLeadHours: 2, variantName: 'Individual', servingSize: 1, servingUnit: 'unidades', basePrice: 18 });
  assert.equal(writes[0].status, 'DRAFT');
  assert.equal(writes[0].family, 'DESSERT');
  assert.equal(writes[1].servingUnit, 'unidades');
  assert.equal(writes[2].minLeadHours, 2);
  assert.equal(writes[2].saleMode, 'STANDARD');
});

test('un producto preparado no se crea con personalización', async () => {
  mock.method(Category, 'findOne', async () => ({ id: 4 }) as Category);
  await assert.rejects(catalogAdminService.createProduct({ name: 'Caja de bocaditos', categoryId: 4, type: 'CUSTOMIZABLE', family: 'BITES', preparationMode: 'READY_STOCK', variantName: 'Caja', basePrice: 25 }), /sin personalización/);
});

test('un producto preparado exige existencias terminadas y no acepta ingredientes como sustituto', async () => {
  mock.method(Product, 'findByPk', async () => ({ id: 901, status: 'DRAFT', preparationMode: 'READY_STOCK' }) as Product);
  mock.method(ProductVariant, 'count', async () => 1);
  mock.method(ProductVariant, 'findAll', async () => [{ id: 902, name: 'Caja de 25' }] as ProductVariant[]);
  mock.method(CakeProductProfile, 'findByPk', async () => ({ isActive: true, saleMode: 'STANDARD', baseEffortJson: {} }) as CakeProductProfile);
  mock.method(Recipe, 'findOne', async () => ({ id: 903 }) as Recipe);
  mock.method(RecipeItem, 'count', async () => 1);
  mock.method(RecipeItem, 'findAll', async () => [{ inventoryItemId: 10 }] as RecipeItem[]);
  mock.method(InventoryItem, 'count', async () => 0);
  await assert.rejects(catalogAdminService.changeStatus(901, 'ACTIVE'), /Producto terminado/);
});

test('un producto por encargo necesita tiempos de elaboración antes de publicarse', async () => {
  mock.method(Product, 'findByPk', async () => ({ id: 901, status: 'DRAFT', preparationMode: 'MADE_TO_ORDER' }) as Product);
  mock.method(ProductVariant, 'count', async () => 1);
  mock.method(CakeProductProfile, 'findByPk', async () => ({ isActive: true, saleMode: 'STANDARD', baseEffortJson: {} }) as CakeProductProfile);
  await assert.rejects(catalogAdminService.changeStatus(901, 'ACTIVE'), /tiempos de producción/);
});

test('activar otra presentación preparada también exige una receta de producto terminado', async () => {
  mock.method(ProductVariant, 'findByPk', async () => ({ id: 902, productId: 901, isActive: false }) as ProductVariant);
  mock.method(Product, 'findByPk', async () => ({ id: 901, status: 'ACTIVE', preparationMode: 'READY_STOCK' }) as Product);
  mock.method(CakeProductProfile, 'findOne', async () => ({ isActive: true }) as CakeProductProfile);
  mock.method(Recipe, 'findOne', async () => ({ id: 903 }) as Recipe);
  mock.method(RecipeItem, 'count', async () => 1);
  mock.method(RecipeItem, 'findAll', async () => [{ inventoryItemId: 10 }] as RecipeItem[]);
  mock.method(InventoryItem, 'count', async () => 0);
  await assert.rejects(catalogAdminService.updateVariant(902, { isActive: true }), /Producto terminado/);
});

test('24 horas es anticipación mínima y no permite comprar para una fecha anterior', async () => {
  mock.method(CakeProductProfile, 'findOne', async () => ({ productId: 901, isActive: true, saleMode: 'STANDARD', minLeadHours: 24 }) as CakeProductProfile);
  await assert.rejects(cakeProductionService.estimateItem({ productId: 901, variantId: 902, quantity: 1 }, new Date(Date.now() + 23 * 3600000)), /24 horas de anticipación/);
});

test('los productos preparados respetan anticipación y no reservan horneado ni decoración', async () => {
  mock.method(CakeProductProfile, 'findOne', async () => ({ productId: 901, isActive: true, saleMode: 'STANDARD', minLeadHours: 2 }) as CakeProductProfile);
  mock.method(ProductVariant, 'findByPk', async () => ({ id: 902, productId: 901 }) as ProductVariant);
  mock.method(Product, 'findByPk', async () => ({ id: 901, preparationMode: 'READY_STOCK' }) as Product);
  assert.deepEqual(await cakeProductionService.estimateItem({ productId: 901, variantId: 902, quantity: 3 }, new Date(Date.now() + 3 * 3600000)), []);
  await assert.rejects(cakeProductionService.estimateItem({ productId: 901, variantId: 902, quantity: 1, selections: [{ optionId: 1, quantity: 1 }] }, new Date(Date.now() + 3 * 3600000)), /sin personalización/);
});

test('cambiar la forma de preparación exige retirar primero un producto publicado', async () => {
  mock.method(Product, 'findByPk', async () => ({ id: 901, status: 'ACTIVE', family: 'DESSERT', preparationMode: 'MADE_TO_ORDER' }) as Product);
  await assert.rejects(catalogAdminService.updateProduct(901, { preparationMode: 'READY_STOCK' }), /Retira primero el producto/);
});
