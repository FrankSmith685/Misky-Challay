import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { CakeProductProfile, ProductVariant, Recipe } from '@database/models';
import { resolveCakeCustomServings } from '../modules/cakes/cakeCustomServings';
import { validateCakeSizeGuides } from '../modules/cakes/cakeSizeGuides';
import { workshopContent, workshopWording } from '../shared/utils/workshopWording';

afterEach(() => mock.restoreAll());
const variants = [8, 14, 25, 35].map((servingSize, index) => ({
  id: index + 1,
  servingSize,
  servingUnit: 'porciones',
}));
const guides = [
  { variantId: 1, diameterCm: 14, minServings: 6, maxServings: 8 },
  { variantId: 2, diameterCm: 18, minServings: 12, maxServings: 14 },
  { variantId: 3, diameterCm: 28, minServings: 24, maxServings: 25 },
  { variantId: 4, diameterCm: 32, minServings: 26, maxServings: 35 },
];
const prepare = (maximum = 60) => {
  mock.method(CakeProductProfile, 'findByPk', async () =>
    CakeProductProfile.build({
      productId: 101,
      isActive: true,
      saleMode: 'SEMI_CUSTOM',
      minLeadHours: 2,
      baseEffortJson: {},
      stationOffsetsJson: {},
      customServingsJson: {
        enabled: true,
        baseVariantId: 4,
        minServings: 36,
        maxServings: maximum,
        pricePerExtraServing: 7.5,
        sizeGuides: guides,
      },
    }),
  );
  mock.method(ProductVariant, 'findByPk', async () =>
    ProductVariant.build({
      id: 4,
      productId: 101,
      name: 'Cuarta presentación',
      sku: 'SERVINGS-TEST',
      servingSize: 35,
      servingUnit: 'porciones',
      isActive: true,
      basePrice: 250,
    }),
  );
  return mock.method(Recipe, 'count', async () => 1);
};

test('cuatro tamaños admiten 26–35 y las adicionales comienzan en 36 sin solaparse', () => {
  assert.doesNotThrow(() => validateCakeSizeGuides(guides, variants, 4, true, 36));
  assert.throws(
    () =>
      validateCakeSizeGuides(
        [{ ...guides[0] }, { ...guides[1] }, { ...guides[2], maxServings: 26 }, guides[3]],
        [{ ...variants[0] }, { ...variants[1] }, { ...variants[2], servingSize: 26 }, variants[3]],
        4,
        true,
        36,
      ),
    /superponerse/,
  );
});
test('60 porciones escalan precio, receta y producción con la misma regla', async () => {
  prepare();
  assert.deepEqual(await resolveCakeCustomServings(101, 4, 60), {
    scale: 60 / 35,
    extraPrice: 187.5,
    requestedServings: 60,
  });
});
test('el servidor rechaza 61 aunque el cliente intente saltarse el formulario', async () => {
  const recipe = prepare();
  await assert.rejects(
    resolveCakeCustomServings(101, 4, 61),
    (error: unknown) =>
      error instanceof Error &&
      /límite.*60/.test(error.message) &&
      'statusCode' in error &&
      error.statusCode === 422,
  );
  assert.equal(recipe.mock.callCount(), 0);
});
test('el máximo sigue siendo configurable por producto', async () => {
  prepare(75);
  assert.equal((await resolveCakeCustomServings(101, 4, 61)).requestedServings, 61);
});
test('cantidades fraccionarias, vacías o inferiores a la base no se pueden cotizar', async () => {
  prepare();
  for (const count of [0, 35, 36.5, NaN, Infinity])
    await assert.rejects(resolveCakeCustomServings(101, 4, count));
});
test('taller conserva contactos, identificadores y referencias a tiendas de aplicaciones', () => {
  const source = {
    deliveryType: 'PICKUP',
    email: 'tienda@example.test',
    imageUrl: '/images/tienda.png',
    secretReference: 'token_123',
    description: 'Recojo en tienda. La tienda verificará el pago; contacta con la tienda.',
    application: 'Descarga la app desde la tienda de aplicaciones.',
  };
  const result = workshopContent(source) as typeof source;
  assert.equal(
    result.description,
    'Recojo en taller. El taller verificará el pago; contacta con el taller.',
  );
  for (const key of [
    'deliveryType',
    'email',
    'imageUrl',
    'secretReference',
    'application',
  ] as const)
    assert.equal(result[key], source[key]);
  assert.deepEqual(workshopContent(result), result);
  assert.equal(
    workshopWording('Recoge tu pedido en toda la tienda'),
    'Recoge tu pedido en todo el taller',
  );
});
