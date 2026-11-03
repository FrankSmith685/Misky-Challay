import assert from 'node:assert/strict';
import test from 'node:test';
import { placeSchema, quoteSchema } from '../modules/checkout/checkout.validation';

const item = { productId: 1, variantId: 1, quantity: 1, selections: [{ optionId: 1, quantity: 1 }] };

test('checkout solo acepta pago en línea, Yape o Plin y rechaza efectivo heredado', () => {
  const body = { items: [item], deliveryType: 'PICKUP', branchId: 1, termsAccepted: true, termsVersion: 1, idempotencyKey: 'checkout-payment-method' };
  for (const paymentMethod of ['ONLINE', 'YAPE', 'PLIN']) {
    assert.equal(placeSchema.safeParse({ body: { ...body, paymentMethod } }).success, true);
  }
  for (const schema of [quoteSchema, placeSchema]) {
    const result = schema.safeParse({ body: { ...body, paymentMethod: 'CASH' } });
    assert.equal(result.success, false);
    if (!result.success) assert.match(result.error.issues[0]?.message ?? '', /efectivo/i);
  }
});

test('permite cotizar sin horario pero no confirmar un pedido programado sin franja', () => {
  const body = { items: [item], deliveryType: 'PICKUP', serviceMode: 'SCHEDULED', branchId: 1, termsAccepted: true, termsVersion: 1, idempotencyKey: 'scheduled-price-preview' };
  assert.equal(quoteSchema.safeParse({ body }).success, true);
  const placed = placeSchema.safeParse({ body });
  assert.equal(placed.success, false);
  if (!placed.success) assert.ok(placed.error.issues.some((issue) => issue.path.includes('deliverySlotId')));
  assert.equal(placeSchema.safeParse({ body: { ...body, deliverySlotId: 1 } }).success, true);
});

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

test('rechaza delivery sin pin para no omitir el recargo por distancia', () => {
  const result = quoteSchema.safeParse({ body: {
    items: [item], deliveryType: 'DELIVERY', serviceMode: 'ASAP',
    address: { line1: 'Av. Miguel Grau 123', districtId: 1 },
  } });
  assert.equal(result.success, false);
  if (!result.success) assert.match(result.error.issues[0]?.message ?? '', /ubicacion exacta/i);
});

test('acepta instrucciones separadas completas sin producir datos invalidos', () => {
  const notes = `COCINA: ${'a'.repeat(250)}\nREPARTO: ${'b'.repeat(250)}`;
  const result = placeSchema.safeParse({ body: {
    items: [item], deliveryType: 'PICKUP', serviceMode: 'ASAP', branchId: 1,
    contactName: 'Frank', contactPhone: '999888777', notes, termsAccepted: true, termsVersion: 1, idempotencyKey: 'checkout-test-key',
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
    termsAccepted: true, termsVersion: 1, idempotencyKey: 'checkout-mobile-key',
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

test('crea un pedido Yape antes de transferir y conserva compatibilidad con reportes anteriores', () => {
  const missing = placeSchema.safeParse({ body: {
    items: [item], deliveryType: 'PICKUP', serviceMode: 'ASAP', branchId: 1,
    paymentMethod: 'YAPE', termsAccepted: true, termsVersion: 1, idempotencyKey: 'checkout-yape-missing',
  } });
  assert.equal(missing.success, true);

  const valid = placeSchema.safeParse({ body: {
    items: [item], deliveryType: 'PICKUP', serviceMode: 'ASAP', branchId: 1,
    paymentMethod: 'YAPE', mobilePayment: { operationCode: 'YP-123456', payerPhone: '999888777' },
    termsAccepted: true, termsVersion: 1, idempotencyKey: 'checkout-yape-valid',
  } });
  assert.equal(valid.success, true);
});

test('rechaza codigos locales demasiado cortos y celulares incompletos', () => {
  const result = placeSchema.safeParse({ body: {
    items: [item], deliveryType: 'PICKUP', serviceMode: 'ASAP', branchId: 1,
    paymentMethod: 'PLIN', mobilePayment: { operationCode: '12', payerPhone: '123' },
    termsAccepted: true, termsVersion: 1, idempotencyKey: 'checkout-plin-invalid',
  } });
  assert.equal(result.success, false);
});

test('cotiza una dirección sin número ni referencia con pin exacto', () => {
  const result = quoteSchema.safeParse({ body: {
    items: [item], deliveryType: 'DELIVERY',
    address: { line1: 'Calle 10', latitude: -11.88, longitude: -77.13, hasHouseNumber: false },
  } });
  assert.equal(result.success, true);
});

test('permite confirmar delivery con pin exacto sin obligar número ni referencia', () => {
  for (const reference of [undefined, '', '    ', 'abc']) {
    const result = placeSchema.safeParse({ body: {
      items: [item], deliveryType: 'DELIVERY', termsAccepted: true, termsVersion: 1, idempotencyKey: 'reference-missing',
      address: { line1: 'Calle 10', latitude: -11.88, longitude: -77.13, hasHouseNumber: false, reference },
    } });
    assert.equal(result.success, true);
  }
});

test('conserva la referencia de entrega y permite omitirla si hay número', () => {
  const withoutNumber = placeSchema.parse({ body: {
    items: [item], deliveryType: 'DELIVERY', termsAccepted: true, termsVersion: 1, idempotencyKey: 'reference-saved',
    address: { line1: 'Calle 10', latitude: -11.88, longitude: -77.13, hasHouseNumber: false, reference: '  puerta verde  ' },
  } });
  assert.equal(withoutNumber.body.address?.reference, 'puerta verde');
  const withNumber = placeSchema.safeParse({ body: {
    items: [item], deliveryType: 'DELIVERY', termsAccepted: true, termsVersion: 1, idempotencyKey: 'reference-optional',
    address: { line1: 'Calle 10 123', latitude: -11.88, longitude: -77.13, hasHouseNumber: true },
  } });
  assert.equal(withNumber.success, true);
});
