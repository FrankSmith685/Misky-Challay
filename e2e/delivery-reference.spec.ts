import { checkoutTermsFixture, acceptCheckoutTerms } from './fixtures/checkoutTerms';
import { expect, test, type Page } from '@playwright/test';
import { getDeliveryReferenceError } from '../frontend/src/features/geo/utils/deliveryAddress';

const selectedAddress = {
  id: 1, label: 'Ventanilla', line1: 'Calle 10', reference: 'puerta verde',
  latitude: -11.88, longitude: -77.13, hasHouseNumber: false,
};
const user = {
  id: 999, email: 'reference@example.test', firstName: 'Cliente', lastName: 'Prueba',
  phone: '999888777', avatarUrl: null, roles: ['CUSTOMER'], permissions: [], isSuperAdmin: false, branchIds: [],
};
const quote = {
  items: [], subtotal: 18, deliveryFee: 6, discountTotal: 0, walletAmount: 24, walletBalance: 100,
  taxRate: 0.18, taxableBase: 20.34, taxTotal: 3.66, grandTotal: 0, currency: 'PEN',
  minimumOrder: 0, meetsMinimum: true, branchId: 1, branchName: 'Local de prueba', isOpenNow: true,
  etaMinutes: 30, demandLevel: 'LOW', etaSource: 'ESTIMATE', discounts: [],
};

const prepare = async (page: Page, address = selectedAddress) => {
  const requests = { quotes: 0, placed: [] as Array<Record<string, unknown>> };
  await page.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let data: unknown = [];
    if (pathname === '/auth/me') data = user;
    if (pathname === '/settings/terms') data = checkoutTermsFixture;
    if (pathname === '/settings/public') data = { business: {
      legalName: 'Prueba', commercialName: 'Misky Challay', ruc: '20600000000', address: 'Lima',
      phone: '999888777', email: 'test@example.test', supportEmail: 'test@example.test', complaintResponseDays: 15,
    } };
    if (pathname === '/checkout/quote') { requests.quotes += 1; data = quote; }
    if (pathname === '/checkout/place') {
      requests.placed.push(route.request().postDataJSON());
      // Capture the final request without creating an order or opening a payment flow.
      await route.fulfill({ status: 422, json: { success: false, message: 'Solicitud capturada para la prueba' } });
      return;
    }
    if (pathname === '/account/addresses') data = [
      { ...selectedAddress, isDefault: true, districtId: null },
      { id: 2, label: 'Casa', line1: 'Calle Los Pinos 123', reference: 'Frente al colegio', latitude: -12.01, longitude: -77.04, districtId: null },
    ];
    if (pathname === '/locations/coverage') data = { covered: true, branch: { id: 1, name: 'Local de prueba', isOpenNow: true }, zone: { deliveryFee: 6, minimumOrder: 0, name: 'Zona de prueba' }, etaMinutes: 30 };
    if (pathname === '/locations/branches') data = [{ id: 1, name: 'Local de prueba', addressLine: 'Av. Principal 123', acceptsPickup: true }];
    if (pathname === '/account/purchase-context') data = { source: 'EMPTY' };
    await route.fulfill({ json: { success: true, data } });
  });
  await page.addInitScript(({ address, user }) => {
    if (sessionStorage.getItem('delivery-reference-test-seeded')) return;
    sessionStorage.setItem('delivery-reference-test-seeded', 'yes');
    localStorage.setItem('verde-bowl:accessToken', 'mock-reference-test');
    localStorage.setItem('verde-bowl:state', JSON.stringify({
      auth: { user, isAuthenticated: true, status: 'succeeded', error: null },
      cart: { items: [{
        id: 'reference-test-item', productId: 1, variantId: 1, name: 'Fatia de tiramisú', variantName: 'Individual',
        imageUrl: null, quantity: 1, unitPrice: 18, extrasTotal: 0, lineTotal: 18, selections: [], nutrition: null,
      }], subtotal: 18, grandTotal: 18, discountTotal: 0, deliveryFee: 0, walletAmount: 0, couponCode: null },
      favorites: { items: [] },
    }));
    localStorage.setItem('verde-bowl:purchase-context:v2', JSON.stringify({
      address, branchId: 1, deliveryType: 'DELIVERY', serviceMode: 'ASAP', cityId: null,
      pickupBranch: null, scheduledSlotId: null,
    }));
  }, { address, user });
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { level: 1, name: 'Finaliza tu pedido' })).toBeVisible();
  await expect.poll(() => requests.quotes).toBeGreaterThan(0);
  return requests;
};

const submit = async (page: Page) => {
  const button = page.locator('aside').getByRole('button', { name: 'Pagar con mi saldo', exact: true });
  await button.scrollIntoViewIfNeeded();
  // Let the summary's IntersectionObserver register that the total was visible.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await acceptCheckoutTerms(page);
  await button.click();
};

test('la referencia del mapa se muestra, se conserva al recargar y se envía en la dirección del pedido', async ({ page }) => {
  const requests = await prepare(page);
  const reference = page.locator('#checkout-address-reference');
  await expect(reference).toHaveValue('puerta verde');
  await expect(reference).toHaveAttribute('maxlength', '200');
  const initialQuotes = requests.quotes;
  await reference.fill('Puerta azul, frente al parque');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('verde-bowl:purchase-context:v2')!).address.reference)).toBe('Puerta azul, frente al parque');
  expect(requests.quotes).toBe(initialQuotes);
  await page.reload();
  await expect(reference).toHaveValue('Puerta azul, frente al parque');
  await page.getByLabel('Indicaciones adicionales para la entrega (opcional)', { exact: true }).fill('Llamar al llegar');
  await submit(page);
  await expect.poll(() => requests.placed.length).toBe(1);
  expect(requests.placed[0].address).toMatchObject({ line1: 'Calle 10', reference: 'Puerta azul, frente al parque', hasHouseNumber: false });
  expect(requests.placed[0].notes).toBe('REPARTO: Llamar al llegar');
});

test('la referencia es opcional sin número y cambia con la dirección elegida', async ({ page }) => {
  const requests = await prepare(page, { ...selectedAddress, reference: '' });
  const reference = page.locator('#checkout-address-reference');
  await expect(reference).not.toHaveAttribute('required', '');
  await expect(page.locator('aside').getByRole('button', { name: 'Pagar con mi saldo', exact: true })).toBeVisible();
  await reference.fill('abc');
  await reference.blur();
  await expect(reference).toHaveAttribute('aria-invalid', 'false');
  await reference.fill('');
  await submit(page);
  await expect.poll(() => requests.placed.length).toBe(1);
  expect(requests.placed[0].address).toMatchObject({ line1: 'Calle 10', hasHouseNumber: false });
  expect((requests.placed[0].address as { reference?: string }).reference).toBeUndefined();
  await expect(page.locator('aside').getByRole('button', { name: 'Pagar con mi saldo', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Casa · Calle Los Pinos 123', exact: true }).click();
  await expect(reference).toHaveValue('Frente al colegio');
  await expect(reference).not.toHaveAttribute('required', '');
  await reference.fill('');
  await expect(page.locator('aside').getByRole('button', { name: 'Pagar con mi saldo', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ventanilla · Calle 10', exact: true }).click();
  await expect(reference).toHaveValue('puerta verde');
});

test('al pasar a recojo no envía la referencia ni las instrucciones de delivery', async ({ page }) => {
  const requests = await prepare(page);
  await page.getByLabel('Indicaciones adicionales para la entrega (opcional)', { exact: true }).fill('Llamar al llegar');
  await page.getByRole('button', { name: 'Recojo en taller', exact: true }).click();
  await page.getByRole('button', { name: /Local de prueba Av\. Principal 123/ }).click();
  await expect(page.locator('#checkout-address-reference')).toHaveCount(0);
  await submit(page);
  await expect.poll(() => requests.placed.length).toBe(1);
  expect(requests.placed[0].deliveryType).toBe('PICKUP');
  expect(requests.placed[0].address).toBeUndefined();
  expect(requests.placed[0].notes).toBeUndefined();
});

test('acepta referencias vacías o breves y mantiene el límite admitido por el servidor', () => {
  expect(getDeliveryReferenceError(selectedAddress)).toBeUndefined();
  expect(getDeliveryReferenceError({ ...selectedAddress, reference: '   ' })).toBeUndefined();
  expect(getDeliveryReferenceError({ ...selectedAddress, reference: 'abc' })).toBeUndefined();
  expect(getDeliveryReferenceError({ ...selectedAddress, reference: 'a'.repeat(201) })).toBeTruthy();
});

test('el modal permite comprobar cobertura con la entrada marcada y sin detalles opcionales', async ({ page }, testInfo) => {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: -11.88, longitude: -77.13 });
  await prepare(page);
  await page.setViewportSize({ width: 1920, height: 940 });
  await page.route('**/api/v1/locations/reverse-address', (route) => route.fulfill({ json: {
    success: true, data: {
      id: 'pin-test', label: 'Calle 11, Ventanilla', line1: 'Calle 11', district: 'Ventanilla', districtId: null,
      ubigeoCode: '070106', province: 'Callao', region: 'Callao', city: 'Callao',
      latitude: -11.88, longitude: -77.13, hasHouseNumber: false, source: 'openstreetmap', precision: 'exact',
    },
  } }));
  await page.getByRole('button', { name: 'Dirección de entrega: Ventanilla. Cambiar', exact: true }).click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByLabel('Dirección exacta', { exact: true })).toHaveValue('Calle 11');
  await expect(modal.getByLabel('Número de puerta (si tiene)', { exact: true })).toHaveValue('');
  const reference = modal.getByLabel('Referencia para el repartidor (opcional)', { exact: true });
  await expect(reference).toHaveValue('');
  await expect(reference).not.toHaveAttribute('required', '');
  await expect(modal.getByText(/No encontramos.*número de puerta/)).toHaveCount(0);
  const check = modal.getByRole('button', { name: 'Comprobar zona de entrega', exact: true });
  await expect(check).toBeEnabled();
  await check.click();
  await expect(modal.getByRole('button', { name: 'Guardar y usar esta dirección', exact: true })).toBeVisible();

  const section = (name: string) => modal.locator('[data-ui-form-section]').filter({ has: page.getByRole('heading', { name, exact: true }) });
  const zone = section('1. Ubicación confirmada');
  const address = section('2. Busca tu dirección');
  const map = section('3. Confirma el punto exacto');
  const result = modal.locator('section[role="status"]').filter({ has: page.getByRole('heading', { name: 'Te atenderá Local de prueba', exact: true }) });
  const [zoneBox, addressBox, mapBox, resultBox] = await Promise.all([zone.boundingBox(), address.boundingBox(), map.boundingBox(), result.boundingBox()]);
  expect(Math.abs(mapBox!.y - zoneBox!.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(mapBox!.y + mapBox!.height - addressBox!.y - addressBox!.height)).toBeLessThanOrEqual(48);
  const resultGap = resultBox!.y - Math.max(mapBox!.y + mapBox!.height, addressBox!.y + addressBox!.height);
  expect(resultGap).toBeGreaterThanOrEqual(16);
  expect(resultGap).toBeLessThanOrEqual(32);
  await modal.screenshot({ path: testInfo.outputPath('coverage-desktop.png') });

  await page.setViewportSize({ width: 390, height: 844 });
  await map.scrollIntoViewIfNeeded();
  await modal.screenshot({ path: testInfo.outputPath('coverage-mobile.png') });
  const widths = await modal.locator('.MuiDialogContent-root').evaluate((content) => ({ width: content.clientWidth, scroll: content.scrollWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.width + 1);
});
