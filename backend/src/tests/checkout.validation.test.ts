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

test('rechaza un delivery con una sola coordenada', () => {
  const result = quoteSchema.safeParse({ body: {
    items: [item], deliveryType: 'DELIVERY', serviceMode: 'ASAP',
    address: { line1: 'Av. Arequipa 1234', districtId: 1, latitude: -12.09 },
  } });
  assert.equal(result.success, false);
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

test('acepta el canal movil sin permitir una URL de retorno enviada por el cliente', () => {
  const result = placeSchema.safeParse({ body: {
    items: [item], deliveryType: 'PICKUP', serviceMode: 'ASAP', branchId: 1,
    client: 'MOBILE', successUrl: 'https://sitio-malicioso.example/robar-sesion',
    idempotencyKey: 'checkout-mobile-key',
  } });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.body.client, 'MOBILE');
    assert.equal('successUrl' in result.data.body, false);
  }
});

test('rechaza canales de retorno desconocidos', () => {
  const result = quoteSchema.safeParse({ body: {
    items: [item], deliveryType: 'PICKUP', serviceMode: 'ASAP', branchId: 1,
    client: 'EXTERNAL',
  } });
  assert.equal(result.success, false);
});

test('cotiza Yape sin exigir el codigo antes de conocer el total', () => {
  const result = quoteSchema.safeParse({ body: {
    items: [item], deliveryType: 'PICKUP', serviceMode: 'ASAP', branchId: 1,
    paymentMethod: 'YAPE',
  } });
  assert.equal(result.success, true);
});

test('al confirmar Yape exige una operacion verificable', () => {
  const missing = placeSchema.safeParse({ body: {
    items: [item], deliveryType: 'PICKUP', serviceMode: 'ASAP', branchId: 1,
    paymentMethod: 'YAPE', idempotencyKey: 'checkout-yape-missing',
  } });
  assert.equal(missing.success, false);

  const valid = placeSchema.safeParse({ body: {
    items: [item], deliveryType: 'PICKUP', serviceMode: 'ASAP', branchId: 1,
    paymentMethod: 'YAPE', mobilePayment: { operationCode: 'YP-123456', payerPhone: '999888777' },
    idempotencyKey: 'checkout-yape-valid',
  } });
  assert.equal(valid.success, true);
});

test('rechaza codigos locales demasiado cortos y celulares incompletos', () => {
  const result = placeSchema.safeParse({ body: {
    items: [item], deliveryType: 'PICKUP', serviceMode: 'ASAP', branchId: 1,
    paymentMethod: 'PLIN', mobilePayment: { operationCode: '12', payerPhone: '123' },
    idempotencyKey: 'checkout-plin-invalid',
  } });
  assert.equal(result.success, false);
});
