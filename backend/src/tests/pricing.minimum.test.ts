import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { Branch, CakeProductProfile, CoverageZone } from '@database/models';
import { customizationService } from '../modules/customization/customization.service';
import { pricingService } from '../modules/pricing/pricing.service';
import { commercialAdminService } from '../modules/admin/commercialAdmin.service';
import { carTransport } from '../modules/delivery/carTransport.service';

afterEach(() => mock.restoreAll());

function prepare(minimumOrder = 0) {
  mock.method(carTransport, 'requiresCar', async () => false);
  mock.method(CakeProductProfile, 'findByPk', async () => ({ isActive: true }));
  mock.method(customizationService, 'quote', async () => ({
    productId: 1, variantId: 1, variantName: 'Individual', quantity: 1,
    basePrice: 18, extrasTotal: 0, unitPrice: 18, lineTotal: 18,
    selections: [], description: 'Fatia de tiramisú',
  }));
  const zone = CoverageZone.build({ cityId: 1, name: 'Zona de prueba', deliveryFee: 6.9, minimumOrder });
  const lookup = mock.method(CoverageZone, 'findOne', async () => zone);
  return { zone, lookup };
}

const input = {
  items: [{ productId: 1, variantId: 1, quantity: 1 }],
  branchId: 1, coverageZoneId: 1, deliveryType: 'DELIVERY' as const,
};

test('una unidad de S/18 se puede comprar dentro de zona cobrando el delivery base', async () => {
  prepare();
  const quote = await pricingService.quoteOrder(input);
  assert.equal(quote.subtotal, 18);
  assert.equal(quote.minimumOrder, 0);
  assert.equal(quote.meetsMinimum, true);
  assert.equal(quote.deliveryFee, 6.9);
  assert.equal(quote.grandTotal, 24.9);
});

test('sin mínimo, el envío fuera de zona conserva el recargo por distancia', async () => {
  prepare();
  const quote = await pricingService.quoteOrder({ ...input, extraDeliveryFee: 37.26 });
  assert.equal(quote.subtotal, 18);
  assert.equal(quote.meetsMinimum, true);
  assert.equal(quote.deliveryFee, 44.16);
  assert.equal(quote.grandTotal, 62.16);
});

test('la entrega en auto usa una sola tarifa de zona y conserva el recargo por distancia', async () => {
  prepare();
  mock.method(carTransport, 'requiresCar', async () => true);
  mock.method(Branch, 'findByPk', async () => ({ carDeliveryInstructions: 'Mantener la caja sobre una superficie nivelada.' }));
  const quote = await pricingService.quoteOrder({ ...input, extraDeliveryFee: 37.26 });
  assert.equal(quote.deliveryVehicleType, 'CAR');
  assert.equal(quote.deliveryFee, 44.16);
  assert.equal(quote.grandTotal, 62.16);
  assert.equal(quote.deliveryHandlingInstructions, 'Mantener la caja sobre una superficie nivelada.');
});

test('un mínimo activado por administración se respeta y no se completa con el delivery', async () => {
  prepare(25);
  const quote = await pricingService.quoteOrder({ ...input, extraDeliveryFee: 37.26 });
  assert.equal(quote.minimumOrder, 25);
  assert.equal(quote.meetsMinimum, false);
  assert.equal(quote.grandTotal, 62.16);
});

test('desactivar el mínimo permite continuar sin variar el costo del envío', async () => {
  const { zone } = prepare(25);
  const blocked = await pricingService.quoteOrder(input);
  zone.minimumOrder = 0;
  const allowed = await pricingService.quoteOrder(input);
  assert.equal(blocked.meetsMinimum, false);
  assert.equal(allowed.meetsMinimum, true);
  assert.equal(allowed.deliveryFee, blocked.deliveryFee);
  assert.equal(allowed.grandTotal, blocked.grandTotal);
});

test('el recojo no exige mínimo ni cobra envío aunque la zona tenga esas condiciones', async () => {
  const { lookup } = prepare(25);
  const quote = await pricingService.quoteOrder({ ...input, deliveryType: 'PICKUP', extraDeliveryFee: 37.26 });
  assert.equal(quote.minimumOrder, 0);
  assert.equal(quote.meetsMinimum, true);
  assert.equal(quote.deliveryFee, 0);
  assert.equal(quote.grandTotal, 18);
  assert.equal(lookup.mock.callCount(), 0);
});

test('las zonas nuevas quedan sin mínimo y permiten configurar uno explícitamente', async () => {
  const create = mock.method(CoverageZone, 'create', async (values: Record<string, unknown>) => values);
  const zone = { cityId: 1, name: 'Nueva zona', deliveryFee: 6.9, estimatedMinutes: 35, priority: 1 };
  await commercialAdminService.createZone(zone);
  await commercialAdminService.createZone({ ...zone, minimumOrder: 25 });
  assert.equal(create.mock.calls[0].arguments[0]?.minimumOrder, 0);
  assert.equal(create.mock.calls[1].arguments[0]?.minimumOrder, 25);
});
