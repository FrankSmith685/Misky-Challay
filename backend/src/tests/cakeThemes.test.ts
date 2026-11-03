import { beforeEach, afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { CakeTheme, CakeProductProfile, CustomizationOption, InventoryItem, Product } from '../database/models';
import { resolveCakeTheme } from '../modules/cakes/cakeThemeRules';

let theme: CakeTheme;
let product: Product;
let profile: CakeProductProfile;
let material: InventoryItem;
const input = { productId: 1, variantId: 2, themeId: 3, themeVersion: 1, selections: [{ optionId: 8, quantity: 1 }] };
beforeEach(() => {
  theme = CakeTheme.build({ id: 3, productId: 1, name: 'Modelo floral', slug: 'modelo-floral', theme: 'Flores', description: '', imageUrlsJson: ['/image.png'], saleMode: 'CONFIGURED', minLeadHours: 96, minServings: 1, maxServings: 500, isActive: true, version: 1,
    variantRulesJson: [{ variantId: 2, priceDelta: 35, materials: [{ inventoryItemId: 4, quantity: 2 }], effort: { DECORATING: 20 }, excludedOptionIds: [9] }],
  });
  product = Product.build({ id: 1, categoryId: 1, name: 'Base', slug: 'base', family: 'CAKE', status: 'ACTIVE', allergensReviewedAt: new Date() });
  profile = CakeProductProfile.build({ productId: 1, saleMode: 'SEMI_CUSTOM', minLeadHours: 72, baseEffortJson: {}, stationOffsetsJson: {}, isActive: true });
  material = InventoryItem.build({ id: 4, code: 'TEST-THEME', name: 'Decoración', unit: 'g', allergens: ['sesamo'] });
  mock.method(CakeTheme, 'findByPk', async () => theme);
  mock.method(Product, 'findByPk', async () => product);
  mock.method(CakeProductProfile, 'findByPk', async () => profile);
  mock.method(InventoryItem, 'findAll', async () => [material]);
});
afterEach(() => mock.restoreAll());

test('la compra sin diseño conserva el comportamiento anterior', async () => {
  assert.equal(await resolveCakeTheme({ productId: 1, variantId: 2 }), null);
});
test('el diseño conserva recargo, materiales, alérgenos y anticipación', async () => {
  const result = await resolveCakeTheme(input);
  assert.equal(result?.snapshot.priceDelta, 35);
  assert.deepEqual(result?.snapshot.allergens, ['sesamo']);
  assert.equal(result?.minLeadHours, 96);
  assert.equal(result?.snapshot.materials[0].quantity, 2);
});
test('la fotografía del pedido no cambia al editar el diseño', async () => {
  const result = await resolveCakeTheme(input);
  theme.variantRulesJson[0].materials[0].quantity = 500;
  theme.variantRulesJson[0].effort.DECORATING = 500;
  assert.equal(result?.snapshot.materials[0].quantity, 2);
  assert.equal(result?.snapshot.effort.DECORATING, 20);
});
test('exige revisar la versión del diseño antes de comprar', async () => {
  await assert.rejects(resolveCakeTheme({ ...input, themeVersion: 2 }), /actualizó/);
  await assert.rejects(resolveCakeTheme({ ...input, themeVersion: undefined }), /actualizó/);
});
test('no se puede comprar directamente un diseño por cotización', async () => {
  theme.saleMode = 'QUOTE';
  await assert.rejects(resolveCakeTheme(input), /cotización aprobada/);
});
test('otras porciones y presentaciones requieren una adaptación', async () => {
  await assert.rejects(resolveCakeTheme({ ...input, requestedServings: 70 }), /otras porciones/);
  await assert.rejects(resolveCakeTheme({ ...input, variantId: 99 }), /presentación/);
});
test('respeta las opciones no compatibles definidas por el negocio', async () => {
  await assert.rejects(resolveCakeTheme({ ...input, selections: [{ optionId: 9, quantity: 1 }] }), /compatible/);
});
test('rechaza opciones de un paso ya definido por el diseño', async () => {
  theme.variantRulesJson[0].hiddenGroupIds = [7];
  mock.method(CustomizationOption, 'findAll', async () => [CustomizationOption.build({ id: 8, groupId: 7, name: 'Acabado' })]);
  await assert.rejects(resolveCakeTheme(input), /ya incluye/);
});
test('no permite diseños retirados ni una receta base diferente', async () => {
  theme.isActive = false;
  await assert.rejects(resolveCakeTheme(input), /disponible/);
  theme.isActive = true;
  theme.productId = 99;
  await assert.rejects(resolveCakeTheme(input), /disponible/);
});
test('bloquea materiales sin clasificación de alérgenos', async () => {
  material.allergens = null;
  await assert.rejects(resolveCakeTheme(input), /alérgenos/);
});
test('los materiales retirados bloquean la compra del diseño', async () => {
  mock.restoreAll();
  mock.method(CakeTheme, 'findByPk', async () => theme);
  mock.method(Product, 'findByPk', async () => product);
  mock.method(CakeProductProfile, 'findByPk', async () => profile);
  mock.method(InventoryItem, 'findAll', async () => []);
  await assert.rejects(resolveCakeTheme(input), /materiales/);
});
