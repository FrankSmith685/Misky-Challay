import test from 'node:test';
import assert from 'node:assert/strict';
import { configSchema, quoteSchema } from '@modules/customization/customization.validation';

test('acepta branchId nulo cuando el cliente aun no eligio direccion', () => {
  const result = quoteSchema.safeParse({
    body: {
      productId: 1,
      variantId: 2,
      quantity: 1,
      branchId: null,
      selections: [{ optionId: 10, quantity: 1 }],
    },
  });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.body.branchId, undefined);
});

test('rechaza cantidades de ingredientes fuera del limite', () => {
  const result = quoteSchema.safeParse({
    body: {
      productId: 1,
      variantId: 2,
      quantity: 1,
      selections: [{ optionId: 10, quantity: 11 }],
    },
  });
  assert.equal(result.success, false);
});

test('acepta configurar el builder sin sucursal y transforma ids numericos', () => {
  const result = configSchema.safeParse({ params: { productId: '9' }, query: { branchId: null } });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.params.productId, 9);
    assert.equal(result.data.query.branchId, undefined);
  }
});

test('rechaza opciones sin identificador positivo', () => {
  const result = quoteSchema.safeParse({
    body: { productId: 1, variantId: 2, quantity: 1, selections: [{ optionId: 0, quantity: 1 }] },
  });
  assert.equal(result.success, false);
});
