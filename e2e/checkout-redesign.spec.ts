import path from 'node:path';
import { config } from 'dotenv';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

config({ path: path.resolve(process.cwd(), 'backend/.env') });

const quote = {
  items: [], subtotal: 77, deliveryFee: 0, discountTotal: 7.7,
  walletAmount: 69.3, walletBalance: 120, taxRate: 0.18,
  taxableBase: 65.25, taxTotal: 11.75, grandTotal: 0,
  currency: 'PEN', minimumOrder: 20, meetsMinimum: true,
  branchId: 1, branchName: 'Verde Bowl Miraflores', isOpenNow: true,
  etaMinutes: 20, demandLevel: 'LOW', etaSource: 'ESTIMATE', discounts: [],
};

const prepareCheckout = async (page: Page, request: APIRequestContext) => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  test.skip(!email || !password, 'La prueba requiere las credenciales locales configuradas');

  const login = await request.post('http://127.0.0.1:4000/api/v1/auth/login', {
    data: { email, password },
  });
  expect(login.ok()).toBeTruthy();
  const payload = await login.json();

  await page.route('**/api/v1/checkout/quote', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: quote }),
  }));
  await page.route('**/api/v1/locations/slots**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: [
      { id: 1, startsAt: '2026-08-03T17:00:00.000Z', endsAt: '2026-08-03T18:00:00.000Z', available: 20 },
      { id: 2, startsAt: '2026-08-03T18:00:00.000Z', endsAt: '2026-08-03T19:00:00.000Z', available: 16 },
    ] }),
  }));

  await page.addInitScript(({ accessToken, refreshToken, user }) => {
    localStorage.setItem('verde-bowl:accessToken', accessToken);
    localStorage.setItem('verde-bowl:refreshToken', refreshToken);
    localStorage.setItem('verde-bowl:state', JSON.stringify({
      auth: { user, isAuthenticated: true, status: 'succeeded', error: null },
      cart: {
        items: [
          { id: 'checkout-1', productId: 1, variantId: 1, name: 'Bowl de pollo teriyaki', variantName: 'Regular', imageUrl: null, quantity: 1, unitPrice: 28, extrasTotal: 0, lineTotal: 28, selections: [], nutrition: null },
          { id: 'checkout-2', productId: 2, variantId: 2, name: 'Arma tu bowl', variantName: 'Regular', imageUrl: null, quantity: 1, unitPrice: 49, extrasTotal: 0, lineTotal: 49, selections: [], nutrition: null },
        ],
        couponCode: null, subtotal: 77, discountTotal: 0, deliveryFee: 0, walletAmount: 0, grandTotal: 77,
      },
      favorites: { items: [] },
    }));
    localStorage.setItem('verde-bowl:purchase-context:v2', JSON.stringify({
      cityId: 1, branchId: 1, deliveryType: 'PICKUP', serviceMode: 'ASAP', scheduledSlotId: null,
      address: null,
      pickupBranch: { id: 1, name: 'Verde Bowl Miraflores', addressLine: 'Av. José Larco 345, Miraflores' },
    }));
  }, payload.data);
};

test('checkout tiene jerarquía, separación y resumen profesional en desktop', async ({ page, request }) => {
  await prepareCheckout(page, request);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/checkout');

  await expect(page.getByRole('heading', { level: 1, name: 'Finaliza tu pedido' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: '¿Cuándo lo quieres?' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Resumen de tu pedido' })).toBeVisible();

  await page.getByRole('button', { name: 'Programar horario' }).click();
  await expect(page.getByLabel('Franja de entrega')).toBeVisible();

  const description = page.getByText('Elige preparación inmediata o reserva una franja disponible.');
  const scheduleButton = page.getByRole('button', { name: 'Programar horario' });
  const select = page.getByLabel('Franja de entrega');
  const [descriptionBox, buttonBox, selectBox] = await Promise.all([
    description.boundingBox(), scheduleButton.boundingBox(), select.boundingBox(),
  ]);
  expect(descriptionBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  expect(selectBox).not.toBeNull();
  expect(buttonBox!.y - (descriptionBox!.y + descriptionBox!.height)).toBeGreaterThanOrEqual(20);
  expect(selectBox!.y - (buttonBox!.y + buttonBox!.height)).toBeGreaterThanOrEqual(20);
});

test('checkout móvil apila opciones y no genera desbordamiento horizontal', async ({ page, request }) => {
  await prepareCheckout(page, request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/checkout');

  const asap = page.getByRole('button', { name: 'Lo antes posible' });
  const scheduled = page.getByRole('button', { name: 'Programar horario' });
  const [asapBox, scheduledBox] = await Promise.all([asap.boundingBox(), scheduled.boundingBox()]);
  expect(asapBox).not.toBeNull();
  expect(scheduledBox).not.toBeNull();
  expect(Math.abs(asapBox!.x - scheduledBox!.x)).toBeLessThanOrEqual(1);
  expect(scheduledBox!.y).toBeGreaterThan(asapBox!.y + asapBox!.height);

  const layout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewport + 1);

  const excessiveRadius = await page.locator('main *').evaluateAll((elements) =>
    elements.flatMap((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2 || Math.abs(rect.width - rect.height) <= 1) return [];
      const styles = getComputedStyle(element);
      const radius = Math.max(
        Number.parseFloat(styles.borderTopLeftRadius) || 0,
        Number.parseFloat(styles.borderTopRightRadius) || 0,
        Number.parseFloat(styles.borderBottomRightRadius) || 0,
        Number.parseFloat(styles.borderBottomLeftRadius) || 0,
      );
      return radius > 5.1 ? [{ tag: element.tagName, className: element.className, radius }] : [];
    }),
  );
  expect(excessiveRadius).toEqual([]);
});
