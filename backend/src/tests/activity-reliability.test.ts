import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { AppEvent, Branch, BranchSchedule, CakeProductProfile, CakeProductionTask, Delivery, DeliverySlot, MobileDevice, Notification, Order, PushDelivery, sequelize } from '@database/models';
import { checkoutService, type CheckoutInput } from '../modules/checkout/checkout.service';
import { geoService } from '../modules/geo/geo.service';
import { carTransport } from '../modules/delivery/carTransport.service';
import { cakeProductionService } from '../modules/cakes/cakeProduction.service';
import { inventoryService } from '../modules/operations/inventory.service';
import { mobilePushService } from '../modules/notifications/mobilePush.service';
import { processPushQueue } from '../modules/notifications/pushQueue.service';
import { activityIsCurrent, activityVisible, installActivityHooks } from '../modules/notifications/activity.service';
import type { TokenPayload } from '../shared/utils/jwt';
import { diningService } from '../modules/operations/dining.service';
import { pricingService } from '../modules/pricing/pricing.service';

afterEach(() => mock.restoreAll());
const transaction = { LOCK: { UPDATE: 'UPDATE' } };
const input: CheckoutInput = { branchId: 1, deliveryType: 'PICKUP', serviceMode: 'SCHEDULED', items: [{ productId: 1, variantId: 1, quantity: 1 }], userId: 7, idempotencyKey: 'availability-test' };

function availability() {
  const branch = { id: 1, name: 'Prueba', within: true, acceptsPickup: true, get: () => [] };
  mock.method(geoService, 'getBranchOrFail', async () => branch);
  mock.method(inventoryService, 'assertCartAvailability', async () => undefined);
  mock.method(CakeProductProfile, 'findAll', async () => [{ productId: 1, minLeadHours: 72 }]);
  mock.method(carTransport, 'requiresCar', async () => false);
  const startsAt = new Date(Date.now() + 5 * 86400000);
  mock.method(DeliverySlot, 'findAll', async () => [{ id: 3, startsAt, endsAt: new Date(startsAt.getTime() + 3600000), availableCount: 5, coverageZoneId: null, orderCutoffAt: new Date(startsAt.getTime() - 3600000) }]);
  mock.method(geoService, 'slotWithinSchedule', () => branch.within);
  mock.method(cakeProductionService, 'estimateOrder', async () => [{ station: 'BAKING', workDate: '2026-11-10', minutes: 20 }]);
  return branch;
}

test('la disponibilidad explica la ausencia de flota sin ofrecer una franja inválida', async () => {
  availability();
  mock.method(carTransport, 'requiresCar', async () => true);
  mock.method(carTransport, 'hasFleet', async () => false);
  const result = await checkoutService.availability(input);
  assert.equal(result.slots.length, 0);
  assert.equal(result.reasons[0].code, 'NO_CAR_FLEET');
});

test('la capacidad de una estación bloquea la franja antes de elegirla', async () => {
  availability();
  mock.method(cakeProductionService, 'availabilityForNeeds', async () => ({ available: false, stations: [{ configured: true, available: false }] }));
  const result = await checkoutService.availability(input);
  assert.deepEqual(result.slots, []);
  assert.equal(result.reasons[0].code, 'PRODUCTION_CAPACITY');
  assert.ok(result.days >= 37);
});

test('un cierre de atención excluye la franja aunque tenga cupos generales', async () => {
  const branch = availability(); branch.within = false;
  const result = await checkoutService.availability(input);
  assert.equal(result.reasons[0].code, 'BRANCH_HOURS');
  assert.equal(result.slots.length, 0);
});

test('una franja que cruza el cierre del local no puede reservarse', () => {
  const schedule = BranchSchedule.build({ branchId: 1, weekday: 1, exceptionDate: null, opensAt: '10:00', closesAt: '18:00', isClosed: false });
  const branch = { get: () => [schedule] } as unknown as Branch;
  assert.equal(geoService.slotWithinSchedule(branch, { startsAt: new Date('2026-11-02T22:00Z'), endsAt: new Date('2026-11-02T23:00Z') }), true);
  assert.equal(geoService.slotWithinSchedule(branch, { startsAt: new Date('2026-11-02T22:30Z'), endsAt: new Date('2026-11-02T23:30Z') }), false);
});

test('un borrador de materiales desactualizado no modifica inventario', async () => {
  mock.method(sequelize, 'transaction', async (run: (tx: unknown) => unknown) => run(transaction));
  mock.method(CakeProductionTask, 'findOne', async () => ({ id: 1, status: 'IN_PROGRESS', materialPlanJson: { '4': 1 }, materialConsumedJson: { '4': 1.5 }, materialWasteJson: {} }));
  const correction = mock.method(inventoryService, 'correctOrderMaterial', async () => undefined);
  await assert.rejects(cakeProductionService.recordMaterials(1, 1, 7, { '4': 1.8 }, {}, { consumed: { '4': 1 }, waste: {} }), /Otra persona/);
  assert.equal(correction.mock.callCount(), 0);
});

test('repetir el guardado de las mismas cantidades no descuenta dos veces', async () => {
  mock.method(sequelize, 'transaction', async (run: (tx: unknown) => unknown) => run(transaction));
  const task = { id: 1, orderId: 2, status: 'IN_PROGRESS', materialPlanJson: { '4': 1 }, materialConsumedJson: {} as Record<string, number>, materialWasteJson: {}, save: async () => undefined };
  mock.method(CakeProductionTask, 'findOne', async () => task);
  mock.method(CakeProductionTask, 'findByPk', async () => task);
  mock.method(Order, 'findByPk', async () => ({ id: 2, status: 'PREPARING' }));
  const correction = mock.method(inventoryService, 'correctOrderMaterial', async () => undefined);
  await cakeProductionService.recordMaterials(1, 1, 7, { '4': 1.5 }, {});
  await cakeProductionService.recordMaterials(1, 1, 7, { '4': 1.5 }, {});
  assert.equal(correction.mock.callCount(), 1);
});

test('guardar un cambio registra su evento dentro de la misma transacción', async () => {
  installActivityHooks();
  const row = Order.build({ id: 1, orderNumber: 'TEST-ORDER', branchId: 2, userId: 7, status: 'CONFIRMED', deliveryType: 'PICKUP', subtotal: 1, grandTotal: 1 }, { isNewRecord: false });
  row.set('status', 'PREPARING');
  const create = mock.method(AppEvent, 'create', async () => ({}));
  await (Order as typeof Order & { runHooks: (name: string, row: Order, options: unknown) => Promise<void> }).runHooks('afterUpdate', row, { transaction });
  assert.equal(create.mock.callCount(), 1);
  assert.equal(create.mock.calls[0].arguments[1]?.transaction, transaction);
  assert.equal(create.mock.calls[0].arguments[0]?.state, 'PENDING');
});

test('los eventos privados respetan usuario y sucursal', () => {
  const actor = { sub: 7, branchIds: [2], permissions: ['order.read'], isSuperAdmin: false } as TokenPayload;
  assert.equal(activityVisible(actor, { topic: 'orders', branchId: 3, userId: 8 }), false);
  assert.equal(activityVisible(actor, { topic: 'orders', branchId: 2, userId: 8 }), true);
  assert.equal(activityVisible(actor, { topic: 'notifications', branchId: 2, userId: 8 }), false);
  assert.equal(activityVisible(actor, { topic: 'notifications', branchId: 3, userId: 7 }), true);
});

test('una asignación pendiente deja de ser válida si el reparto cambió de conductor', async () => {
  const delivery = Delivery.build({ id: 4, orderId: 1, branchId: 2, status: 'ASSIGNED', driverId: 8 });
  mock.method(Delivery, 'findByPk', async () => delivery);
  const event = AppEvent.build({ topic: 'delivery', model: 'Delivery', entityId: 4, payload: { status: 'ASSIGNED', driverId: 7 } });
  assert.equal(await activityIsCurrent(event), false);
  event.payload = { status: 'ASSIGNED', driverId: 8 };
  assert.equal(await activityIsCurrent(event), true);
});

test('leer el aviso antes del envío evita un push pendiente redundante', async () => {
  mock.method(Notification, 'findByPk', async () => Notification.build({ userId: 7, template: 'TEST', recipient: 'user:7', subject: 'Prueba', idempotencyKey: 'read-test', readAt: new Date(), status: 'SENT' }));
  const event = AppEvent.build({ topic: 'notifications', model: 'Notification', entityId: 1, payload: { status: 'SENT' } });
  assert.equal(await activityIsCurrent(event), false);
});

test('poner un push en cola no lo registra como entregado ni llama al proveedor', async () => {
  mock.method(MobileDevice, 'findAll', async () => [{ id: 1 }]);
  mock.method(Notification, 'findOne', async () => null);
  const stored = new Map<string, object>();
  mock.method(PushDelivery, 'findOrCreate', async (options: { where: { idempotencyKey: string }; defaults: object }) => {
    const key = options.where.idempotencyKey;
    if (!stored.has(key)) stored.set(key, { ...options.defaults, state: 'QUEUED' });
    return [stored.get(key), false];
  });
  const fetch = mock.method(globalThis, 'fetch', async () => { throw new Error('No debe enviar desde la petición'); });
  const message = { userId: 7, title: 'Pago', body: 'Revisar', actionUrl: '/cuenta/pedidos', idempotencyKey: 'same-event' };
  await mobilePushService.sendToUser(message); await mobilePushService.sendToUser(message);
  assert.equal(stored.size, 1);
  assert.equal(fetch.mock.callCount(), 0);
});

test('un cobro concurrente recupera la venta bajo bloqueo antes de comprobar stock otra vez', async () => {
  mock.method(sequelize, 'transaction', async (run: (tx: unknown) => unknown) => run(transaction));
  mock.method(Branch, 'findByPk', async () => ({ id: 1 }));
  let lookups = 0;
  mock.method(Order, 'findOne', async () => ++lookups === 1 ? null : { orderNumber: 'TEST-SALE', status: 'CONFIRMED', grandTotal: 15 });
  const price = mock.method(pricingService, 'quoteOrder', async () => { throw new Error('El primer intento ya consumió el último producto'); });
  const result = await diningService.createCounterSale({ branchId: 1, actorId: 7, paymentMethod: 'cash', items: [{ productId: 1, variantId: 1, quantity: 1 }], idempotencyKey: 'same-sale-key' });
  assert.equal(result.orderNumber, 'TEST-SALE');
  assert.equal(result.reused, true);
  assert.equal(price.mock.callCount(), 0);
});

function queue() {
  const row = { id: 1, state: 'QUEUED', attempts: 0, userId: 7, deviceId: 1, idempotencyKey: 'queue-test', payload: { title: 'Prueba', body: 'Prueba', actionUrl: '/plans', template: 'TEST' }, update: async (values: object) => Object.assign(row, values) };
  mock.method(sequelize, 'transaction', async (run: (tx: unknown) => unknown) => run(transaction));
  mock.method(PushDelivery, 'update', async () => [0]);
  mock.method(PushDelivery, 'findOne', async () => row.state === 'QUEUED' ? row : null);
  mock.method(PushDelivery, 'findAll', async () => []);
  mock.method(MobileDevice, 'findByPk', async () => ({ userId: 7, isActive: true, expoPushToken: 'ExponentPushToken[TEST]' }));
  mock.method(Notification, 'findOrCreate', async () => [{ update: async () => undefined }, true]);
  return row;
}

test('el ticket de Expo queda aceptado hasta que llegue su receipt', async () => {
  const row = queue();
  mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ data: { status: 'ok', id: 'test-ticket' } }), { status: 200 }));
  const marker = mock.method(Notification, 'create', async () => { throw new Error('No se debe marcar SENT'); });
  await processPushQueue();
  assert.equal(row.state, 'ACCEPTED');
  assert.equal(marker.mock.callCount(), 0);
});

test('una respuesta perdida queda incierta y no se reenvía automáticamente', async () => {
  const row = queue();
  const fetch = mock.method(globalThis, 'fetch', async () => { throw new Error('Conexión perdida después de aceptar'); });
  await processPushQueue(); await processPushQueue();
  assert.equal(row.state, 'UNKNOWN');
  assert.equal(fetch.mock.callCount(), 1);
});

test('un receipt exitoso confirma el proveedor sin afirmar lectura en el teléfono', async () => {
  mock.method(sequelize, 'transaction', async (run: (tx: unknown) => unknown) => run(transaction));
  mock.method(PushDelivery, 'findOne', async () => null);
  const row = PushDelivery.build({ id: 9, userId: 7, deviceId: 1, idempotencyKey: 'receipt-test', state: 'ACCEPTED', ticketId: 'ticket-test', payload: { title: 'Prueba', body: 'Prueba', template: 'TEST', actionUrl: '/plans' } });
  mock.method(PushDelivery, 'findAll', async () => [row]);
  mock.method(PushDelivery, 'update', async (_values: unknown, options: { where: { state: string } }) => [options.where.state === 'ACCEPTED' ? 1 : 0]);
  mock.method(MobileDevice, 'findByPk', async () => ({ expoPushToken: 'ExponentPushToken[TEST]', update: async () => undefined }));
  const marker = mock.method(Notification, 'findOrCreate', async () => [{}, true]);
  mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ data: { 'ticket-test': { status: 'ok' } } }), { status: 200 }));
  await processPushQueue();
  assert.equal(row.state, 'PROVIDER_CONFIRMED');
  assert.equal(marker.mock.calls[0].arguments[0]?.defaults?.deliveryState, 'PROVIDER_CONFIRMED');
});
