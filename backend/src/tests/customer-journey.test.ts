import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { Order, OrderItem, CakeProductionTask, Payment, Refund, sequelize } from '@database/models';
import {
  CustomerOrderCase,
  CustomerWorkspace,
  CustomerMedia,
} from '@database/models/customerJourney.model';
import { customerJourneyService, createCaseSchema } from '@modules/orders/customerJourney.service';
import { cancellationPolicy, customerOrderSummary } from '@modules/orders/customerOrderSummary';
import {
  customerWorkspaceService,
  channelsSchema,
} from '@modules/account/customerWorkspace.service';
import { checkoutTermsService } from '@modules/settings/checkoutTerms.service';
import { CheckoutTerms } from '@database/models/checkoutTerms.model';
import type { Transaction } from 'sequelize';
afterEach(() => mock.restoreAll());
const transaction = { LOCK: { UPDATE: 'UPDATE', SHARE: 'SHARE' } } as unknown as Transaction;
function setup() {
  const order = Order.build({
    id: 14,
    orderNumber: 'CUSTOMER-14',
    userId: 7,
    branchId: 2,
    deliveryType: 'PICKUP',
    status: 'CONFIRMED',
    subtotal: 100,
    grandTotal: 100,
    updatedAt: new Date('2026-11-02T12:00:00Z'),
  });
  mock.method(sequelize, 'transaction', async (fn: (tx: Transaction) => unknown) =>
    fn(transaction),
  );
  mock.method(Order, 'findOne', async () => order);
  mock.method(CakeProductionTask, 'count', async () => 0);
  return order;
}
const key = '13fb87c0-26e6-4c7b-9de5-04691fe3480a';
test('una consulta exige propiedad del pedido aunque se conozca su número', async () => {
  setup();
  await assert.rejects(
    customerJourneyService.create('CUSTOMER-14', 8, {
      kind: 'SUPPORT',
      text: 'Necesito ayuda',
      requestKey: key,
    }),
    /no es tuyo/,
  );
});
test('el alcance de la sede se comprueba antes de mostrar atención al personal', async () => {
  setup();
  await assert.rejects(
    customerJourneyService.list('CUSTOMER-14', 99, () => {
      throw new Error('Sucursal ajena');
    }),
    /Sucursal ajena/,
  );
});
test('reintentar una consulta después de perder la respuesta no crea otra', async () => {
  setup();
  const entry = CustomerOrderCase.build({
    id: 1,
    orderId: 14,
    userId: 7,
    branchId: 2,
    kind: 'SUPPORT',
    payloadJson: { requestKey: key },
    messagesJson: [],
  });
  mock.method(CustomerOrderCase, 'findAll', async () => [entry]);
  const create = mock.method(CustomerOrderCase, 'create', async () => {
    throw new Error('No debe duplicar');
  });
  assert.equal(
    await customerJourneyService.create('CUSTOMER-14', 7, {
      kind: 'SUPPORT',
      text: 'Necesito ayuda',
      requestKey: key,
    }),
    entry,
  );
  assert.equal(create.mock.callCount(), 0);
});
test('un cliente no puede publicar una propuesta ni el personal aceptarla por él', async () => {
  setup();
  const entry = CustomerOrderCase.build({
    id: 1,
    orderId: 14,
    userId: 7,
    branchId: 2,
    kind: 'DESIGN',
    version: 2,
    status: 'AWAITING_CUSTOMER',
    payloadJson: {},
    messagesJson: [],
  });
  mock.method(CustomerOrderCase, 'findOne', async () => entry);
  await assert.rejects(
    customerJourneyService.act('CUSTOMER-14', 1, 7, {
      action: 'PROPOSE',
      version: 2,
      text: 'Cambio de diseño',
    }),
    /Solo el equipo/,
  );
  await assert.rejects(
    customerJourneyService.act(
      'CUSTOMER-14',
      1,
      99,
      { action: 'ACCEPT', version: 2, text: '' },
      () => undefined,
    ),
    /Solo el cliente/,
  );
});
test('una respuesta atrasada no sobrescribe una propuesta más reciente', async () => {
  setup();
  mock.method(CustomerOrderCase, 'findOne', async () =>
    CustomerOrderCase.build({
      orderId: 14,
      userId: 7,
      branchId: 2,
      kind: 'SUPPORT',
      payloadJson: {},
      messagesJson: [],
      version: 3,
    }),
  );
  await assert.rejects(
    customerJourneyService.act('CUSTOMER-14', 1, 7, { action: 'ACCEPT', version: 2, text: '' }),
    /consulta cambió/,
  );
});
test('el cliente acepta exactamente la versión propuesta y queda registrado', async () => {
  setup();
  const entry = CustomerOrderCase.build({
    id: 1,
    orderId: 14,
    userId: 7,
    branchId: 2,
    kind: 'DESIGN',
    version: 2,
    status: 'AWAITING_CUSTOMER',
    payloadJson: { proposal: 'Texto exacto: Feliz cumpleaños' },
    messagesJson: [],
  });
  mock.method(CustomerOrderCase, 'findOne', async () => entry);
  mock.method(entry, 'save', async () => entry);
  await customerJourneyService.act('CUSTOMER-14', 1, 7, { action: 'ACCEPT', version: 2, text: '' });
  assert.equal(entry.status, 'ACCEPTED');
  assert.equal(entry.version, 3);
  assert.equal(entry.messagesJson[0].author, 'CUSTOMER');
  assert.match(entry.messagesJson[0].text, /aceptada/);
});
test('un cambio de contacto no requiere reservar ingredientes de nuevo', async () => {
  setup();
  mock.method(OrderItem, 'findAll', async () => []);
  mock.method(CustomerOrderCase, 'findAll', async () => []);
  const create = mock.method(CustomerOrderCase, 'create', async (values: object) => values);
  await customerJourneyService.create('CUSTOMER-14', 7, {
    kind: 'CHANGE',
    changes: { contactName: 'Otra persona' },
    text: 'Cambiar quien recibe',
    requestKey: key,
  });
  assert.equal(create.mock.callCount(), 1);
  assert.equal(
    (create.mock.calls[0].arguments[0] as { payloadJson: { priceDifference: number } }).payloadJson
      .priceDifference,
    0,
  );
});
test('producción iniciada impide cambiar el pedido, pero permite pedir atención', async () => {
  setup();
  mock.method(CakeProductionTask, 'count', async () => 1);
  mock.method(CustomerOrderCase, 'findAll', async () => []);
  await assert.rejects(
    customerJourneyService.create('CUSTOMER-14', 7, {
      kind: 'CHANGE',
      changes: { contactName: 'Otra persona' },
      text: 'Cambiar quien recibe',
      requestKey: key,
    }),
    /preparación ya comenzó/,
  );
});
test('la elegibilidad considera producción y el plazo del anticipo', () => {
  const now = Date.parse('2026-11-02T12:00:00Z');
  assert.equal(
    cancellationPolicy({ status: 'CONFIRMED', paymentPlan: 'FULL', scheduledAt: null }, false, now)
      .allowed,
    true,
  );
  assert.equal(
    cancellationPolicy({ status: 'CONFIRMED', paymentPlan: 'FULL', scheduledAt: null }, true, now)
      .allowed,
    false,
  );
  assert.equal(
    cancellationPolicy(
      {
        status: 'CONFIRMED',
        paymentPlan: 'DEPOSIT_BALANCE',
        scheduledAt: new Date(now + 24 * 3600000),
      },
      false,
      now,
    ).allowed,
    false,
  );
});
test('el resumen distingue lo pagado, lo devuelto y una devolución manual pendiente', async () => {
  const order = setup();
  order.status = 'CANCELLED';
  order.walletAmount = 10;
  mock.method(Payment, 'findAll', async () => [
    Payment.build({
      id: 1,
      payableId: 14,
      idempotencyKey: 'financial-test',
      amount: 100,
      status: 'SUCCEEDED',
      provider: 'yape',
    }),
  ]);
  mock.method(Refund, 'findAll', async () => [
    Refund.build({ paymentId: 1, reason: 'test', amount: 30, status: 'SUCCEEDED' }),
    Refund.build({ paymentId: 1, reason: 'test', amount: 20, status: 'FAILED' }),
  ]);
  const result = await customerOrderSummary(order);
  assert.equal(result.financial.paid, 110);
  assert.equal(result.financial.refunded, 40);
  assert.equal(result.financial.refundPending, 70);
});
test('un borrador con revisión vieja no reemplaza el de otro dispositivo', async () => {
  setup();
  mock.method(CustomerWorkspace, 'findByPk', async () =>
    CustomerWorkspace.build({ userId: 7, revision: 4 }),
  );
  await assert.rejects(
    customerWorkspaceService.save(7, { revision: 3, cart: [], favorites: [], drafts: {} }),
    /otro dispositivo/,
  );
});
test('el borrador no puede vincular adjuntos privados de otra cuenta', async () => {
  setup();
  mock.method(CustomerWorkspace, 'findByPk', async () =>
    CustomerWorkspace.build({ userId: 7, revision: 4 }),
  );
  mock.method(CustomerMedia, 'findAll', async () => [
    CustomerMedia.build({
      id: key,
      userId: 8,
      hash: 'abc',
      mime: 'image/png',
      bytes: Buffer.from('test'),
    }),
  ]);
  await assert.rejects(
    customerWorkspaceService.save(7, {
      revision: 4,
      cart: [{ reference: { $media: key } }],
      favorites: [],
      drafts: {},
    }),
    /no pertenece/,
  );
});
test('los adjuntos se leen por identificador y propietario juntos', async () => {
  let filter: unknown;
  mock.method(CustomerMedia, 'findOne', async (options: { where: unknown }) => {
    filter = options.where;
    return null;
  });
  await assert.rejects(customerWorkspaceService.media(7, key), /Adjunto no encontrado/);
  assert.deepEqual(filter, { id: key, userId: 7 });
});
test('el canal requiere booleanos y la solicitud conserva un identificador válido', () => {
  assert.equal(
    channelsSchema.safeParse({ email: 'false', whatsapp: true, push: true }).success,
    false,
  );
  assert.equal(
    createCaseSchema.safeParse({ kind: 'SUPPORT', text: 'Ayuda', requestKey: 'nuevo' }).success,
    false,
  );
});
test('las condiciones de suscripción se publican en su documento independiente', async () => {
  const row = CheckoutTerms.build({
    id: 2,
    version: 3,
    title: 'Suscripción',
    content: 'Condiciones vigentes',
    acceptanceLabel: 'Acepto las condiciones',
    updatedAt: new Date('2026-11-02T12:00:00Z'),
  });
  const find = mock.method(CheckoutTerms, 'findByPk', async () => row);
  const terms = await checkoutTermsService.get(transaction, 2);
  assert.equal(find.mock.calls[0].arguments[0], 2);
  assert.equal(terms.version, 3);
  assert.equal(terms.title, 'Suscripción');
});

test('publicar condiciones de suscripción no modifica las condiciones de compra', async () => {
  const purchase = CheckoutTerms.build({
    id: 1,
    version: 4,
    title: 'Compra',
    content: 'Condiciones de compra vigentes',
    acceptanceLabel: 'Acepto la compra',
    updatedAt: new Date(),
  });
  const subscription = CheckoutTerms.build({
    id: 2,
    version: 3,
    title: 'Suscripción',
    content: 'Condiciones de suscripción vigentes',
    acceptanceLabel: 'Acepto la suscripción',
    updatedAt: new Date(),
  });
  mock.method(CheckoutTerms, 'findByPk', async (id: number) =>
    id === 1 ? purchase : subscription,
  );
  mock.method(subscription, 'update', async (values: Record<string, unknown>) => {
    Object.assign(subscription, values);
    return subscription;
  });
  await checkoutTermsService.update(
    {
      version: 3,
      title: 'Suscripción renovada',
      content: 'Condiciones de suscripción actualizadas y publicadas para el cliente.',
      acceptanceLabel: 'Acepto las condiciones de suscripción',
    },
    9,
    2,
  );
  assert.equal(purchase.version, 4);
  assert.equal(subscription.version, 4);
  assert.equal(subscription.title, 'Suscripción renovada');
});
