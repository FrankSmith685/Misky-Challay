import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import type { Transaction } from 'sequelize';
import { CheckoutTerms } from '../database/models/checkoutTerms.model';
import { Order, Payment, Product, CakeProductProfile, sequelize } from '../database/models';
import { checkoutTermsService, checkoutTermsUpdateSchema } from '../modules/settings/checkoutTerms.service';
import { checkoutService, type CheckoutInput } from '../modules/checkout/checkout.service';
import { placeSchema, quoteSchema } from '../modules/checkout/checkout.validation';
import { geoService } from '../modules/geo/geo.service';
import { pricingService } from '../modules/pricing/pricing.service';
import { inventoryService } from '../modules/operations/inventory.service';
import { settingsService } from '../modules/settings/settings.service';

afterEach(() => mock.restoreAll());
const transaction = { LOCK: { UPDATE: 'UPDATE', SHARE: 'SHARE' } } as Transaction;
const published = () => CheckoutTerms.build({ id: 1, version: 3, title: 'Condiciones de compra', content: 'Condiciones publicadas para pedidos y pagos de prueba. Conservamos el texto aceptado.', acceptanceLabel: 'He leído y acepto las condiciones de mi compra.', updatedAt: new Date('2026-11-02T15:00:00Z') });
const input: CheckoutInput = { items: [{ productId: 1, variantId: 1, quantity: 1 }], deliveryType: 'PICKUP', serviceMode: 'ASAP', branchId: 1, userId: 7, idempotencyKey: 'terms-attempt-test', termsAccepted: true, termsVersion: 3 };

test('cotizar no implica aceptar; confirmar exige una aceptación explícita y versión válida', () => {
  const body = { ...input };
  delete body.termsAccepted; delete body.termsVersion;
  assert.equal(quoteSchema.safeParse({ body }).success, true);
  for (const consent of [{}, { termsAccepted: false, termsVersion: 3 }, { termsAccepted: 'true', termsVersion: 3 }, { termsAccepted: true }, { termsAccepted: true, termsVersion: 0 }]) {
    assert.equal(placeSchema.safeParse({ body: { ...body, ...consent } }).success, false);
  }
  assert.equal(placeSchema.safeParse({ body: input }).success, true);
});

test('el servicio impide aceptar implícitamente incluso sin pasar por HTTP', async () => {
  const read = mock.method(CheckoutTerms, 'findByPk', async () => published());
  for (const consent of [{}, { termsAccepted: false, termsVersion: 3 }, { termsAccepted: true, termsVersion: 0 }]) {
    await assert.rejects(checkoutTermsService.accept(consent, transaction), /Debes aceptar/);
  }
  assert.equal(read.mock.callCount(), 0);
});

test('una versión reemplazada se rechaza con bloqueo compartido que impide una publicación concurrente', async () => {
  const read = mock.method(CheckoutTerms, 'findByPk', async () => published());
  await assert.rejects(checkoutTermsService.accept({ termsAccepted: true, termsVersion: 2 }, transaction), (error: unknown) => (error as { code: string }).code === 'TERMS_CHANGED');
  assert.equal(read.mock.calls[0].arguments[1]?.lock, transaction.LOCK.SHARE);
});

test('guarda una copia del texto, casilla, versión, canal y fecha del servidor', async () => {
  const row = published();
  mock.method(CheckoutTerms, 'findByPk', async () => row);
  const before = Date.now();
  const accepted = await checkoutTermsService.accept({ termsAccepted: true, termsVersion: 3, client: 'MOBILE' }, transaction);
  row.content = 'Texto nuevo'; row.version = 4;
  assert.equal(accepted.version, 3);
  assert.match(accepted.content, /Conservamos el texto aceptado/);
  assert.match(accepted.acceptanceLabel, /He leído/);
  assert.equal(accepted.channel, 'MOBILE');
  assert.ok(Date.parse(accepted.acceptedAt) >= before);
});

test('un reintento recupera el pedido original aunque ya se publicaron otras condiciones', async () => {
  const order = Order.build({ id: 31, orderNumber: 'TERMS-ORIGINAL', userId: 7, branchId: 1, subtotal: 10, grandTotal: 10, deliveryType: 'PICKUP' });
  mock.method(Order, 'findOne', async () => order);
  mock.method(Payment, 'findOne', async () => null);
  const acceptance = mock.method(checkoutTermsService, 'accept', async () => { throw new Error('No debe cambiar el consentimiento original'); });
  const result = await checkoutService.place(input);
  assert.equal(result.reused, true);
  assert.equal(result.order.id, 31);
  assert.equal(acceptance.mock.callCount(), 0);
});

test('el pedido incorpora la aceptación dentro de su propia transacción antes de persistir', async () => {
  mock.method(Order, 'findOne', async () => null);
  mock.method(geoService, 'getBranchOrFail', async () => ({ id: 1, name: 'Prueba', acceptsPickup: true, prepMinutes: 20 }));
  mock.method(geoService, 'isBranchOpenNow', () => true);
  mock.method(inventoryService, 'assertCartAvailability', async () => undefined);
  mock.method(CakeProductProfile, 'count', async () => 0);
  mock.method(CakeProductProfile, 'findAll', async () => []);
  mock.method(Product, 'findAll', async () => []);
  mock.method(pricingService, 'quoteOrder', async () => ({ items: [], subtotal: 10, grandTotal: 10, meetsMinimum: true, walletAmount: 0, discounts: [], taxRate: 0.18, taxableBase: 8.47, taxTotal: 1.53, currency: 'PEN' }));
  mock.method(settingsService, 'getReceiptSettings', async () => ({ mode: 'INTERNAL_ONLY', autoPrintKitchenTicket: false, autoPrintCustomerTicket: false, paperWidth: 80 }));
  mock.method(CheckoutTerms, 'findByPk', async () => published());
  mock.method(sequelize, 'transaction', async (callback: (tx: Transaction) => unknown) => callback(transaction));
  const create = mock.method(Order, 'create', async () => { throw new Error('STOP_AFTER_SNAPSHOT'); });
  await assert.rejects(checkoutService.place(input), /STOP_AFTER_SNAPSHOT/);
  const values = create.mock.calls[0].arguments[0];
  assert.equal(values?.termsAcceptanceJson?.version, 3);
  assert.match(values?.termsAcceptanceJson?.content ?? '', /Conservamos el texto aceptado/);
  assert.equal(create.mock.calls[0].arguments[1]?.transaction, transaction);
});

test('publicar aumenta la versión y no altera el borrador de otra sesión ante un conflicto', async () => {
  const row = published();
  mock.method(CheckoutTerms, 'findByPk', async () => row);
  mock.method(sequelize, 'transaction', async (callback: (tx: Transaction) => unknown) => callback(transaction));
  mock.method(row, 'update', async (values: object) => { Object.assign(row, values); return row; });
  const result = await checkoutTermsService.update({ version: 3, title: row.title, content: `${row.content} Nueva condición.`, acceptanceLabel: row.acceptanceLabel }, 9);
  assert.equal(result.after.version, 4);
  assert.equal(row.updatedBy, 9);
  await assert.rejects(checkoutTermsService.update({ version: 3, title: row.title, content: row.content, acceptanceLabel: row.acceptanceLabel }, 10), /Otra persona publicó/);
});

test('no publica contenido vacío ni inventa un documento cuando falta la configuración', async () => {
  assert.equal(checkoutTermsUpdateSchema.safeParse({ body: { version: 3, title: 'OK', content: ' ', acceptanceLabel: '' } }).success, false);
  mock.method(CheckoutTerms, 'findByPk', async () => null);
  await assert.rejects(checkoutTermsService.get(), (error: unknown) => (error as { statusCode: number }).statusCode === 503);
});
