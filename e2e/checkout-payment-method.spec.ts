import { checkoutTermsFixture, acceptCheckoutTerms } from './fixtures/checkoutTerms';
import { expect, test, type Page } from '@playwright/test';

const user = { id: 999, email: 'payment@example.test', firstName: 'Cliente', lastName: 'Prueba', phone: '999888777', roles: ['CUSTOMER'], permissions: [], isSuperAdmin: false, branchIds: [] };
const quote = {
  items: [], subtotal: 32.9, deliveryFee: 0, discountTotal: 0,
  walletAmount: 0, walletBalance: 0, taxRate: 0.18,
  taxableBase: 27.88, taxTotal: 5.02, grandTotal: 32.9,
  currency: 'PEN', minimumOrder: 0, meetsMinimum: true,
  branchId: 1, branchName: 'Local de prueba', isOpenNow: true,
  etaMinutes: 20, demandLevel: 'LOW', etaSource: 'ESTIMATE', discounts: [],
};

async function prepareCheckout(page: Page, legacyCash = false, directEnabled = true) {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let data: unknown = [];
    if (path === '/auth/me') data = user;
    if (path === '/settings/terms') data = checkoutTermsFixture;
    if (path === '/settings/public') data = {
      business: { legalName: 'Prueba', commercialName: 'Misky Challay', ruc: '20600000000', address: 'Lima', phone: '999888777', email: 'test@example.test', supportEmail: 'test@example.test', complaintResponseDays: 15 },
      cod: { enabled: true, maxAmount: 300 }, // Una configuración antigua no reactiva efectivo.
      payments: { onlineEnabled: true, onlineProvider: 'mercadopago' },
      localPayments: {
        yapeEnabled: directEnabled, plinEnabled: directEnabled,
        yapePhone: '999111222', plinPhone: '999111222',
        yapeRecipient: 'Cuenta de prueba', plinRecipient: 'Cuenta de prueba',
        yapeQrImageUrl: '', plinQrImageUrl: '', instructions: 'Verifica el destinatario.',
      }, receipts: { mode: 'INTERNAL_ONLY' },
    };
    if (path === '/locations/branches') data = [{ id: 1, name: 'Local de prueba', addressLine: 'Av. Prueba 123', acceptsPickup: true }];
    if (path === '/account/purchase-context') data = { source: 'EMPTY' };
    if (path === '/checkout/quote') data = quote;
    await route.fulfill({ json: { success: true, data } });
  });
  await page.addInitScript(({ user, legacyCash }) => {
    localStorage.setItem('verde-bowl:accessToken', 'payment-test-token');
    localStorage.setItem('verde-bowl:state', JSON.stringify({
      auth: { user, isAuthenticated: true, status: 'succeeded', error: null },
      cart: { items: [{ id: 'pay-1', productId: 1, variantId: 1, name: 'Torta de prueba', variantName: 'Individual', imageUrl: null, quantity: 1, unitPrice: 32.9, extrasTotal: 0, lineTotal: 32.9, selections: [], nutrition: null }], couponCode: null, subtotal: 32.9, discountTotal: 0, deliveryFee: 0, walletAmount: 0, grandTotal: 32.9 },
      favorites: { items: [] },
    }));
    localStorage.setItem('verde-bowl:purchase-context:v2', JSON.stringify({
      cityId: null, branchId: 1, deliveryType: 'PICKUP', serviceMode: 'ASAP', scheduledSlotId: null,
      address: null, pickupBranch: { id: 1, name: 'Local de prueba', addressLine: 'Av. Prueba 123', acceptsPickup: true },
    }));
    if (legacyCash) localStorage.setItem('verde-bowl:checkout-draft:v1', JSON.stringify({ paymentMethod: 'CASH' }));
  }, { user, legacyCash });
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Solo necesario', exact: true }).click();
  return page.getByRole('group', { name: 'Método de pago' });
}

for (const width of [1440, 390])
  test(`Mercado Pago, Yape y Plin caben y se eligen por separado sin efectivo (${width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const group = await prepareCheckout(page);
    await expect(group.getByRole('button')).toHaveCount(3);
    await expect(group.getByRole('button', { name: /Efectivo/ })).toHaveCount(0);
    for (const method of ['Yape', 'Plin', 'Mercado Pago']) {
      const option = group.getByRole('button', { name: new RegExp(`^${method}`) });
      await option.click();
      await expect(option).toHaveAttribute('aria-pressed', 'true');
      const box = await option.boundingBox();
      const groupBox = await group.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(groupBox!.x - 1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(groupBox!.x + groupBox!.width + 1);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await group.screenshot({ path: testInfo.outputPath('payment-options.png') });
  });

test('un borrador antiguo con efectivo se restaura con Mercado Pago disponible', async ({ page }) => {
  const group = await prepareCheckout(page, true);
  await expect(group.getByRole('button', { name: /^Mercado Pago/ })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('verde-bowl:checkout-draft:v1')!).paymentMethod)).toBe('ONLINE');
});

test('los métodos directos deshabilitados muestran disponibilidad y no pueden elegirse', async ({ page }) => {
  const group = await prepareCheckout(page, false, false);
  for (const method of ['Yape', 'Plin'])
    await expect(group.getByRole('button', { name: new RegExp(`^${method} Temporalmente no disponible`) })).toBeDisabled();
  await expect(group.getByRole('button', { name: /^Mercado Pago/ })).toHaveAttribute('aria-pressed', 'true');
});

test('vaciar el carrito al crear el pedido no interrumpe la salida a Mercado Pago', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await prepareCheckout(page);
  const origin = new URL(page.url()).origin;
  await page.route('https://payments.example.test/pending', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Pasarela de prueba</h1>' }),
  );
  await page.route('**/api/v1/checkout/place', (route) => route.fulfill({ json: {
    success: true, data: { orderNumber: 'ONLINE-RETURN', orderId: 991, status: 'PENDING_PAYMENT',
      grandTotal: 32.9, currency: 'PEN', provider: 'mercadopago', reused: false,
      checkoutUrl: 'https://payments.example.test/pending' },
  } }));
  const button = page.locator('aside').getByRole('button', { name: 'Pagar S/ 32.90', exact: true });
  await button.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await acceptCheckoutTerms(page);
  await button.click();
  await expect(page).toHaveURL('https://payments.example.test/pending');
  await expect(page.getByRole('heading', { name: 'Pasarela de prueba' })).toBeVisible();
  const storage = (await page.context().storageState()).origins.find((item) => item.origin === origin)!.localStorage;
  expect(JSON.parse(storage.find((item) => item.name === 'verde-bowl:state')!.value).cart.items).toEqual([]);
  expect(JSON.parse(storage.find((item) => item.name === 'verde-bowl:pending-order:v1')!.value).orderNumber).toBe('ONLINE-RETURN');
});
