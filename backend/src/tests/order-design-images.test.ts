import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import type { CreationAttributes, Transaction } from 'sequelize';
import { CakeDesignQuote, CakeDesignRequest, CakeDesignReference, Order, OrderItem, OrderItemReference, registerModels } from '@database/models';
import { cakeOrderImagesService, orderDesignImages } from '../modules/cakes/cakeOrderImages.service';
import { placeSchema } from '../modules/checkout/checkout.validation';
import type { TokenPayload } from '../shared/utils/jwt';

registerModels();
afterEach(() => mock.restoreAll());
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1sAAAAASUVORK5CYII=';
const transaction = { LOCK: { UPDATE: 'UPDATE' } } as Transaction;
const customer: TokenPayload = { sub: 7, email: null, roles: ['CUSTOMER'], permissions: [], branchIds: [], isSuperAdmin: false, tv: 0 };

test('guarda la foto y la propuesta de IA separadas y en la transacción del producto', async () => {
  const create = mock.method(OrderItemReference, 'create', async (values: CreationAttributes<OrderItemReference>) => values);
  await cakeOrderImagesService.save(21, { referenceDataUrl: image, aiProposalDataUrl: image }, 'CAKE', transaction);
  assert.equal(create.mock.callCount(), 2);
  assert.deepEqual(create.mock.calls.map((call) => call.arguments[0]?.kind), ['CUSTOMER_REFERENCE', 'AI_PROPOSAL']);
  for (const call of create.mock.calls) {
    assert.equal(call.arguments[0]?.orderItemId, 21);
    assert.equal(call.arguments[0]?.mime, 'image/png');
    assert.ok(Buffer.isBuffer(call.arguments[0]?.bytes));
    assert.equal(call.arguments[1]?.transaction, transaction);
  }
});

test('una torta puede guardar propuesta de IA aunque el cliente no suba una referencia', async () => {
  const create = mock.method(OrderItemReference, 'create', async (values: CreationAttributes<OrderItemReference>) => values);
  await cakeOrderImagesService.save(21, { aiProposalDataUrl: image }, 'CAKE', transaction);
  assert.equal(create.mock.callCount(), 1);
  assert.equal(create.mock.calls[0].arguments[0]?.kind, 'AI_PROPOSAL');
});

test('no acepta imágenes para otros productos ni URLs externas, SVG o MIME falso', async () => {
  const create = mock.method(OrderItemReference, 'create', async () => undefined);
  await assert.rejects(cakeOrderImagesService.save(21, { aiProposalDataUrl: image }, 'PASTRY', transaction), /solo corresponden a tortas/);
  for (const data of ['https://example.test/private.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,YWJj', `data:image/png;base64,${'A'.repeat(300001)}`]) {
    await assert.rejects(cakeOrderImagesService.save(21, { aiProposalDataUrl: data }, 'CAKE', transaction));
  }
  assert.equal(create.mock.callCount(), 0);
});

test('una cotización aprobada copia todas sus referencias e ignora reemplazos no aprobados del carrito', async () => {
  mock.method(CakeDesignQuote, 'findByPk', async () => ({ requestId: 9 }));
  mock.method(CakeDesignRequest, 'findByPk', async () => ({ id: 9, referenceMime: 'image/png', referenceBytes: Buffer.from('original') }));
  mock.method(CakeDesignReference, 'findAll', async () => [{ mime: 'image/jpeg', bytes: Buffer.from('segunda') }, { mime: 'image/webp', bytes: Buffer.from('tercera') }]);
  const create = mock.method(OrderItemReference, 'create', async (values: CreationAttributes<OrderItemReference>) => values);
  await cakeOrderImagesService.save(21, { designQuoteId: 13, referenceDataUrl: 'reemplazo', aiProposalDataUrl: 'no aprobada' }, 'CAKE', transaction);
  assert.equal(create.mock.callCount(), 3);
  assert.deepEqual(create.mock.calls.map((call) => call.arguments[0]?.position), [0, 1, 2]);
  assert.ok(create.mock.calls.every((call) => call.arguments[0]?.kind === 'CUSTOMER_REFERENCE'));
  assert.equal(create.mock.calls[0].arguments[0]?.bytes?.toString(), 'original');
});

test('los metadatos de las vistas no incluyen binarios de las imágenes', () => {
  const item = OrderItem.build({ orderId: 1, productId: 2, variantId: 3, productNameSnapshot: 'Torta', quantity: 1, unitPrice: 1, lineTotal: 1 });
  item.setDataValue('designImages' as never, [OrderItemReference.build({ id: 11, orderItemId: 21, kind: 'AI_PROPOSAL', position: 0, mime: 'image/png', bytes: Buffer.from('privado') })] as never);
  assert.deepEqual(orderDesignImages(item), [{ id: 11, kind: 'AI_PROPOSAL', position: 0 }]);
  assert.equal(JSON.stringify(orderDesignImages(item)).includes('privado'), false);
});

function readable() {
  mock.method(Order, 'findOne', async () => ({ id: 1, userId: 7, branchId: 2 }));
  const item = mock.method(OrderItem, 'findOne', async () => ({ id: 21 }));
  const read = mock.method(OrderItemReference, 'findOne', async () => ({ id: 45, bytes: Buffer.from('private'), mime: 'image/png' }));
  return { item, read };
}

test('el propietario puede leer y la consulta exige que imagen, producto y pedido coincidan', async () => {
  const { item, read } = readable();
  await cakeOrderImagesService.read('ORDER-1', 21, customer, 45);
  assert.deepEqual(item.mock.calls[0].arguments[0]?.where, { id: 21, orderId: 1 });
  assert.deepEqual(read.mock.calls[0].arguments[0]?.where, { orderItemId: 21, id: 45 });
});

test('otro cliente o personal de otra sede no puede leer imágenes privadas', async () => {
  const { read } = readable();
  for (const actor of [{ ...customer, sub: 8 }, { ...customer, sub: 8, permissions: ['kitchen.read'], branchIds: [3] }, { ...customer, sub: 8, permissions: ['inventory.read'], branchIds: [2] }]) {
    await assert.rejects(cakeOrderImagesService.read('ORDER-1', 21, actor, 45), /Pedido no encontrado/);
  }
  assert.equal(read.mock.callCount(), 0);
});

test('cocina de la sede y personal con alcance global sí pueden consultar las imágenes', async () => {
  const { read } = readable();
  for (const branchIds of [[2], []]) await cakeOrderImagesService.read('ORDER-1', 21, { ...customer, sub: 8, permissions: ['kitchen.read'], branchIds }, 45);
  assert.equal(read.mock.callCount(), 2);
});

test('la ruta anterior sigue devolviendo la referencia principal y nunca la imagen de IA', async () => {
  const { read } = readable();
  await cakeOrderImagesService.read('ORDER-1', 21, customer);
  assert.deepEqual(read.mock.calls[0].arguments[0]?.where, { orderItemId: 21, kind: 'CUSTOMER_REFERENCE', position: 0 });
});

test('el contrato de checkout conserva ambas imágenes y limita el tamaño de la propuesta', () => {
  const body = { items: [{ productId: 1, variantId: 1, quantity: 1, referenceDataUrl: image, aiProposalDataUrl: image }], deliveryType: 'PICKUP', branchId: 1, termsAccepted: true, termsVersion: 1, idempotencyKey: 'order-images-test' };
  const parsed = placeSchema.parse({ body });
  assert.equal(parsed.body.items[0].aiProposalDataUrl, image);
  assert.equal(parsed.body.items[0].referenceDataUrl, image);
  assert.equal(placeSchema.safeParse({ body: { ...body, items: [{ ...body.items[0], aiProposalDataUrl: 'a'.repeat(300001) }] } }).success, false);
});
