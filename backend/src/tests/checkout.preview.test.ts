import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { Branch, BranchSchedule, CakeProductProfile, CakeTheme, DeliverySlot, Order, Product } from '@database/models';
import { geoService } from '../modules/geo/geo.service';
import { pricingService } from '../modules/pricing/pricing.service';
import { inventoryService } from '../modules/operations/inventory.service';
import { cakeProductionService } from '../modules/cakes/cakeProduction.service';
import { checkoutService, type CheckoutInput } from '../modules/checkout/checkout.service';

afterEach(() => mock.restoreAll());

const input: CheckoutInput = {
  items: [{ productId: 1, variantId: 1, quantity: 1 }],
  deliveryType: 'DELIVERY', serviceMode: 'SCHEDULED',
  address: { line1: 'Calle 10', latitude: -11.88, longitude: -77.13 },
  userId: 7, idempotencyKey: 'price-preview-only',
};

function prepare({ open = false, cake = true } = {}) {
  mock.method(geoService, 'getBranchOrFail', async () => ({ id: 1 }));
  mock.method(geoService, 'slotWithinSchedule', () => true);
  mock.method(geoService, 'checkCoverage', async () => ({
    covered: true,
    zone: { id: 1, deliveryFee: 6.9, estimatedMinutes: 35 },
    branch: { id: 1, name: 'Local de prueba', isOpenNow: open, prepMinutes: 30 },
    extraDeliveryFee: 37.26,
  }));
  mock.method(inventoryService, 'assertCartAvailability', async () => undefined);
  mock.method(CakeProductProfile, 'count', async () => cake ? 1 : 0);
  mock.method(CakeProductProfile, 'findAll', async () => cake ? [{ productId: 1, minLeadHours: 72 }] : []);
  mock.method(Product, 'findAll', async () => [{ id: 1, preparationMode: cake ? 'MADE_TO_ORDER' : 'READY_STOCK' }] as Product[]);
  const price = mock.method(pricingService, 'quoteOrder', async () => ({
    items: [], subtotal: 18, deliveryFee: 44.16, grandTotal: 62.16, discountTotal: 0,
    walletAmount: 0, walletBalance: 0, taxRate: 0.18, taxableBase: 52.68, taxTotal: 9.48,
    currency: 'PEN', discounts: [], minimumOrder: 0, meetsMinimum: true,
  }));
  const capacity = mock.method(cakeProductionService, 'availability', async () => ({ available: true, stations: [] }));
  const createOrder = mock.method(Order, 'create', async () => { throw new Error('No se debe crear un pedido durante la cotización'); });
  return { price, capacity, createOrder };
}

test('cotiza productos y delivery con recargo antes del horario, incluso si la tienda está cerrada ahora', async () => {
  const { price, capacity, createOrder } = prepare();
  const result = await checkoutService.quote(input);
  assert.equal(result.subtotal, 18);
  assert.equal(result.deliveryFee, 44.16);
  assert.equal(result.grandTotal, 62.16);
  assert.equal(result.schedulePending, true);
  assert.equal(price.mock.calls[0].arguments[0]?.extraDeliveryFee, 37.26);
  assert.equal(capacity.mock.callCount(), 0);
  assert.equal(createOrder.mock.callCount(), 0);
});

test('al elegir la franja valida su capacidad y deja de ser una cotización con horario pendiente', async () => {
  const { capacity } = prepare();
  mock.method(DeliverySlot, 'findOne', async () => ({
    id: 1, branchId: 1, isActive: true,
    startsAt: new Date(Date.now() + 72 * 3600000),
    orderCutoffAt: new Date(Date.now() + 48 * 3600000),
  }));
  const result = await checkoutService.quote({ ...input, deliverySlotId: 1 });
  assert.equal(result.schedulePending, false);
  assert.equal(capacity.mock.callCount(), 1);
  assert.equal(result.grandTotal, 62.16);
});

test('una franja sin capacidad sigue bloqueando la cotización definitiva', async () => {
  const { price } = prepare();
  mock.method(DeliverySlot, 'findOne', async () => ({
    startsAt: new Date(Date.now() + 72 * 3600000), orderCutoffAt: new Date(Date.now() + 48 * 3600000),
  }));
  mock.method(cakeProductionService, 'availability', async () => ({
    available: false, stations: [{ station: 'BAKING', workDate: '2026-11-03', available: false }],
  }));
  await assert.rejects(checkoutService.quote({ ...input, deliverySlotId: 1 }), /No hay capacidad/);
  assert.equal(price.mock.callCount(), 0);
});

test('una cotización previa no permite crear ni cobrar un pedido sin elegir franja', async () => {
  const { createOrder, price } = prepare();
  mock.method(Order, 'findOne', async () => null);
  await checkoutService.quote(input);
  mock.method(CakeProductProfile, 'count', async () => 0);
  await assert.rejects(checkoutService.place(input), /Elige una fecha y franja/);
  assert.equal(price.mock.callCount(), 1);
  assert.equal(createOrder.mock.callCount(), 0);
});

test('el domingo se evalúa por horario de Lima: cerrado a las 7 y abierto desde las 10', () => {
  const schedule = BranchSchedule.build({ branchId: 1, weekday: 0, exceptionDate: null, opensAt: '10:00', closesAt: '22:00', isClosed: false });
  const branch = { get: () => [schedule] } as unknown as Branch;
  assert.equal(geoService.isBranchOpenNow(branch, new Date('2026-11-01T12:00:00Z')), false);
  assert.equal(geoService.isBranchOpenNow(branch, new Date('2026-11-01T15:00:00Z')), true);
  assert.equal(geoService.isBranchOpenNow(branch, new Date('2026-11-02T02:59:00Z')), true);
  assert.equal(geoService.isBranchOpenNow(branch, new Date('2026-11-02T03:00:00Z')), false);
});

for (const deliveryType of ['DELIVERY', 'PICKUP'] as const) {
  test(`${deliveryType}: cotiza fuera de horario aun si el carrito pidió ASAP, sin crear pedidos`, async () => {
    const { createOrder } = prepare({ cake: false });
    mock.method(geoService, 'getBranchOrFail', async () => ({ id: 1, name: 'Local de prueba', acceptsPickup: true, prepMinutes: 30 }));
    mock.method(geoService, 'isBranchOpenNow', () => false);
    const result = await checkoutService.quote({ ...input, deliveryType, branchId: 1, serviceMode: 'ASAP' });
    assert.equal(result.isOpenNow, false);
    assert.equal(result.schedulePending, true);
    assert.equal(result.requiresScheduledDelivery, false);
    assert.equal(result.grandTotal, 62.16);
    assert.equal(createOrder.mock.callCount(), 0);
  });
}

test('el servidor recupera las 72 horas de una torta aunque el carrito antiguo pida ASAP', async () => {
  const { capacity } = prepare({ open: true });
  const result = await checkoutService.quote({ ...input, serviceMode: 'ASAP' });
  assert.equal(result.requiresScheduledDelivery, true);
  assert.equal(result.minimumLeadHours, 72);
  assert.equal(result.schedulePending, true);
  assert.equal(capacity.mock.callCount(), 0);
});

test('la anticipación del diseño también se incluye al ofrecer las franjas', async () => {
  prepare();
  mock.method(CakeTheme, 'findAll', async () => [{ productId: 1, minLeadHours: 96 }]);
  const result = await checkoutService.quote({ ...input, items: [{ ...input.items[0], themeId: 1 }] });
  assert.equal(result.minimumLeadHours, 96);
});

test('un producto inmediato sigue disponible mientras la sede está abierta', async () => {
  prepare({ open: true, cake: false });
  const result = await checkoutService.quote({ ...input, serviceMode: 'ASAP' });
  assert.equal(result.schedulePending, false);
  assert.equal(result.isOpenNow, true);
});

test('la confirmación mantiene el bloqueo de preparación inmediata fuera de horario', async () => {
  const { createOrder } = prepare({ cake: false });
  mock.method(Order, 'findOne', async () => null);
  await assert.rejects(checkoutService.place({ ...input, serviceMode: 'ASAP' }), /Elige una fecha y franja para reservar/);
  assert.equal(createOrder.mock.callCount(), 0);
});

test('reservar fuera de horario llega a la validación de producción y conserva el control de capacidad', async () => {
  const { createOrder } = prepare();
  mock.method(Order, 'findOne', async () => null);
  mock.method(DeliverySlot, 'findOne', async () => ({ startsAt: new Date(Date.now() + 96 * 3600000), orderCutoffAt: new Date(Date.now() + 48 * 3600000) }));
  mock.method(cakeProductionService, 'availability', async () => ({ available: false, stations: [] }));
  await assert.rejects(checkoutService.place({ ...input, deliverySlotId: 1 }), /No hay capacidad/);
  assert.equal(createOrder.mock.callCount(), 0);
});
