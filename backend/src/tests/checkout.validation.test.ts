import assert from 'node:assert/strict';
import test from 'node:test';
import { placeSchema, quoteSchema } from '../modules/checkout/checkout.validation';

const item = { productId: 1, variantId: 1, quantity: 1, selections: [{ optionId: 1, quantity: 1 }] };

test('acepta delivery con pin exacto y sin branchId enviado por el cliente', () => {
  const result = quoteSchema.safeParse({ body: {
    items: [item], deliveryType: 'DELIVERY', serviceMode: 'ASAP',
    address: { label: 'Casa', line1: 'Av. Arequipa 1234', districtId: 1, latitude: -12.09, longitude: -77.03 },
  } });
  assert.equal(result.success, true);
});

test('acepta instrucciones separadas completas sin producir datos invalidos', () => {
  const notes = `COCINA: ${'a'.repeat(250)}\nREPARTO: ${'b'.repeat(250)}`;
  const result = placeSchema.safeParse({ body: {
    items: [item], deliveryType: 'PICKUP', serviceMode: 'ASAP', branchId: 1,
    contactName: 'Frank', contactPhone: '999888777', notes, idempotencyKey: 'checkout-test-key',
  } });
  assert.equal(result.success, true);
});

test('explica cuando falta la direccion de delivery', () => {
  const result = quoteSchema.safeParse({ body: { items: [item], deliveryType: 'DELIVERY', serviceMode: 'ASAP' } });
  assert.equal(result.success, false);
  if (!result.success) assert.match(result.error.issues[0]?.message ?? '', /direccion/i);
});
