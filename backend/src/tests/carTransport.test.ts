import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { Op } from 'sequelize';
import { Branch, Delivery, DeliverySlot, Driver, Order, Product, sequelize } from '@database/models';
import { carTransport } from '@modules/delivery/carTransport.service';
import { deliveryService } from '@modules/delivery/delivery.service';
import { deliveryEvidenceService } from '@modules/delivery/deliveryEvidence.service';
import { geoService } from '@modules/geo/geo.service';
import { commercialAdminService } from '@modules/admin/commercialAdmin.service';
beforeEach(() => {
  mock.method(geoService, 'getBranchOrFail', async () => ({ id: 2 }));
  mock.method(geoService, 'slotWithinSchedule', () => true);
});
afterEach(() => mock.restoreAll());
const transaction = { LOCK: { UPDATE: 'UPDATE' } };
const slot = () => DeliverySlot.build({ id: 4, branchId: 2, startsAt: new Date(Date.now() + 86400000), endsAt: new Date(Date.now() + 90000000), orderCutoffAt: new Date(Date.now() + 3600000), capacity: 10, carCapacity: 1 });

test('cualquier torta, incluida en un carrito mixto, exige auto y el recojo no lo exige', async () => {
  const count = mock.method(Product, 'count', async () => 1);
  assert.equal(await carTransport.requiresCar([10, 20, 10], 'DELIVERY'), true);
  assert.deepEqual(count.mock.calls[0].arguments[0]?.where, { id: [10, 20], family: 'CAKE' });
  assert.equal(await carTransport.requiresCar([10], 'PICKUP'), false);
  assert.equal(count.mock.callCount(), 1);
});
test('un carrito sin tortas conserva el transporte habitual', async () => {
  mock.method(Product, 'count', async () => 0);
  assert.equal(await carTransport.requiresCar([10], 'DELIVERY'), false);
});
test('el último cupo se puede reservar y el siguiente pedido se rechaza', async () => {
  mock.method(Driver, 'count', async () => 1);
  const booked = mock.method(Order, 'count', async () => 0);
  await carTransport.assertSlot(slot(), 2);
  booked.mock.mockImplementation(async () => 1);
  await assert.rejects(carTransport.assertSlot(slot(), 2), /Se agotaron los cupos/);
});
test('los cupos en cero y la flota sin autos bloquean el pago de delivery', async () => {
  const fleet = mock.method(Driver, 'count', async () => 1);
  mock.method(Order, 'count', async () => 0);
  const full = slot(); full.carCapacity = 0;
  await assert.rejects(carTransport.assertSlot(full, 2), /Se agotaron/);
  fleet.mock.mockImplementation(async () => 0);
  await assert.rejects(carTransport.assertSlot(slot(), 2), /No hay transporte en auto/);
});
test('los pedidos cancelados y reembolsados liberan el cupo y los pendientes lo ocupan', async () => {
  const count = mock.method(Order, 'count', async () => 2);
  assert.equal(await carTransport.booked(4), 2);
  const where = count.mock.calls[0].arguments[0]?.where as Record<string, unknown>;
  assert.equal(where.deliverySlotId, 4);
  assert.deepEqual(where.status, { [Op.notIn]: ['CANCELLED', 'REFUNDED'] });
});
test('el calendario conserva recojo cuando no hay autos', async () => {
  mock.method(DeliverySlot, 'findAll', async () => [slot()]);
  mock.method(Driver, 'count', async () => 0);
  assert.equal((await geoService.listSlots(2)).length, 1);
  assert.deepEqual(await geoService.listSlots(2, new Date(), 7, 'CAR'), []);
});
test('la capacidad de autos reduce los horarios mostrados sin consumir cupos de recojo', async () => {
  mock.method(DeliverySlot, 'findAll', async () => [slot()]);
  mock.method(Driver, 'count', async () => 1);
  mock.method(Order, 'count', async () => 1);
  assert.deepEqual(await geoService.listSlots(2, new Date(), 7, 'CAR'), []);
  assert.equal((await geoService.listSlots(2))[0].available, 10);
});
test('la asignación directa de una moto a una torta se rechaza en backend', async () => {
  const delivery = Delivery.build({ id: 1, orderId: 5, branchId: 2, status: 'PENDING' });
  const driver = Driver.build({ id: 7, branchId: 2, fullName: 'Prueba', vehicleType: 'MOTORCYCLE' });
  mock.method(Delivery, 'findByPk', async () => delivery);
  mock.method(Driver, 'findOne', async () => driver);
  mock.method(Driver, 'findByPk', async () => driver);
  mock.method(Order, 'findByPk', async () => ({ deliveryVehicleType: 'CAR' }));
  mock.method(sequelize, 'transaction', async (run: (tx: unknown) => unknown) => run(transaction));
  await assert.rejects(deliveryService.assignDriver(1, 7, 99), /requiere un conductor con auto/);
});
test('los proveedores externos también deben confirmar auto', async () => {
  mock.method(Delivery, 'findByPk', async () => Delivery.build({ id: 1, orderId: 5, branchId: 2 }));
  mock.method(Order, 'findByPk', async () => ({ deliveryVehicleType: 'CAR' }));
  mock.method(sequelize, 'transaction', async (run: (tx: unknown) => unknown) => run(transaction));
  await assert.rejects(deliveryService.assignExternal(1, 'Proveedor', 'R-1', 99), /proveedor externo/);
});
test('no se puede bajar el cupo por debajo de los pedidos reservados', async () => {
  mock.method(sequelize, 'transaction', async (run: (tx: unknown) => unknown) => run(transaction));
  mock.method(Branch, 'findByPk', async () => ({ id: 2 }));
  mock.method(DeliverySlot, 'findOne', async () => slot());
  mock.method(Order, 'count', async () => 1);
  await assert.rejects(carTransport.updateSettings(2, { slots: [{ id: 4, carCapacity: 0 }] }), /más entregas/);
});
test('las fotos respetan la propiedad del reparto y el alcance de taller', async () => {
  mock.method(Delivery, 'findByPk', async () => Delivery.build({ id: 1, branchId: 2, orderId: 5, driverId: 7 }));
  await assert.rejects(deliveryEvidenceService.authorize(1, () => {}, [8]), /no está asignado/);
  await assert.rejects(deliveryEvidenceService.authorize(1, () => { throw new Error('Otro taller'); }), /Otro taller/);
});

test('el cupo predeterminado se guarda por taller y lo heredan los nuevos horarios', async () => {
  const branch = Branch.build({ id: 2, cityId: 1, name: 'Taller de prueba', slug: 'default-car-test', addressLine: 'Prueba', defaultCarCapacity: 10 });
  mock.method(sequelize, 'transaction', async (run: (tx: unknown) => unknown) => run(transaction));
  mock.method(Branch, 'findByPk', async () => branch);
  const save = mock.method(branch, 'save', async () => branch);
  await carTransport.updateSettings(2, { defaultCarCapacity: 4 });
  assert.equal(branch.defaultCarCapacity, 4);
  assert.equal(save.mock.callCount(), 1);
  const created = mock.method(DeliverySlot, 'findOrCreate', async () => [slot(), true]);
  await commercialAdminService.generateSlots({ branchId: 2, days: 2, capacity: 20, cutoffHours: 0, windows: [{ startHour: 12, endHour: 14 }] });
  assert(created.mock.callCount() > 0);
  assert(created.mock.calls.every((call) => call.arguments[0]?.defaults?.carCapacity === 4));
});

test('generar franjas respeta el cierre explícito y la capacidad total', async () => {
  mock.method(Branch, 'findByPk', async () => Branch.build({ id: 2, cityId: 1, name: 'Prueba', slug: 'car-capacity-test', addressLine: 'Prueba', defaultCarCapacity: 10 }));
  const created = mock.method(DeliverySlot, 'findOrCreate', async () => [slot(), true]);
  const input = { branchId: 2, days: 2, capacity: 5, cutoffHours: 0, windows: [{ startHour: 12, endHour: 14 }] };
  await commercialAdminService.generateSlots(input);
  const initialCalls = created.mock.callCount();
  assert(initialCalls > 0);
  assert(created.mock.calls.every((call) => call.arguments[0]?.defaults?.carCapacity === 5));
  await commercialAdminService.generateSlots({ ...input, carCapacity: 0 });
  assert(created.mock.calls.slice(initialCalls).every((call) => call.arguments[0]?.defaults?.carCapacity === 0));
});
