import path from 'node:path';
import { config } from 'dotenv';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

config({ path: path.resolve(process.cwd(), 'backend/.env') });

/**
 * El selector de metodo de pago vive en la barra lateral del checkout (380 px).
 * "Efectivo al recibir" no cabe al lado de "Tarjeta" a ese ancho: se partia en dos
 * lineas y el grupo quedaba descuadrado. Estas pruebas fijan que cada opcion se
 * queda dentro de su caja y en una sola linea, tanto en escritorio como en movil.
 */

/** Total pequeño y con saldo a cero: obliga a elegir medio de pago. */
const quote = {
  items: [], subtotal: 32.9, deliveryFee: 0, discountTotal: 0,
  walletAmount: 0, walletBalance: 0, taxRate: 0.18,
  taxableBase: 27.88, taxTotal: 5.02, grandTotal: 32.9,
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

  await page.addInitScript(({ accessToken, refreshToken, user }) => {
    localStorage.setItem('verde-bowl:accessToken', accessToken);
    localStorage.setItem('verde-bowl:refreshToken', refreshToken);
    localStorage.setItem('verde-bowl:state', JSON.stringify({
      auth: { user, isAuthenticated: true, status: 'succeeded', error: null },
      cart: {
        items: [
          { id: 'pay-1', productId: 1, variantId: 1, name: 'Bowl de pollo teriyaki', variantName: 'Regular', imageUrl: null, quantity: 1, unitPrice: 32.9, extrasTotal: 0, lineTotal: 32.9, selections: [], nutrition: null },
        ],
        couponCode: null, subtotal: 32.9, discountTotal: 0, deliveryFee: 0, walletAmount: 0, grandTotal: 32.9,
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

/** Ninguna opcion desborda su grupo, y ninguna parte la etiqueta en dos lineas. */
const assertOptionsFit = async (page: Page) => {
  const group = page.getByRole('group', { name: 'Método de pago' });
  await expect(group).toBeVisible();

  const groupBox = await group.boundingBox();
  expect(groupBox).not.toBeNull();

  const options = group.getByRole('button');
  const count = await options.count();
  expect(count).toBeGreaterThanOrEqual(2);

  for (let index = 0; index < count; index += 1) {
    const box = await options.nth(index).boundingBox();
    expect(box).not.toBeNull();
    // Dentro del grupo, sin desbordar por ningun lado.
    expect(box!.x).toBeGreaterThanOrEqual(groupBox!.x - 1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(groupBox!.x + groupBox!.width + 1);
    // Una sola linea: py-3 + text-sm ronda los 46 px; dos lineas se pasan de 60.
    expect(box!.height).toBeLessThan(60);
  }
};

test('el metodo de pago cabe en la barra lateral con efectivo disponible', async ({ page, request }) => {
  await prepareCheckout(page, request);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/checkout');

  const cash = page.getByRole('button', { name: 'Efectivo al recibir' });
  await expect(cash).toBeVisible();

  // Con tarjeta seleccionada (por defecto) y tras cambiar a efectivo: el cambio de
  // seleccion no debe mover ni deformar el grupo.
  await assertOptionsFit(page);
  await cash.click();
  await expect(cash).toHaveAttribute('aria-pressed', 'true');
  await assertOptionsFit(page);

  await page.getByRole('group', { name: 'Método de pago' })
    .screenshot({ path: 'playwright-report/metodo-pago-desktop.png' });
});

test('el metodo de pago tambien cabe en movil', async ({ page, request }) => {
  await prepareCheckout(page, request);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/checkout');

  const cash = page.getByRole('button', { name: 'Efectivo al recibir' });
  await expect(cash).toBeVisible();
  await cash.click();
  await assertOptionsFit(page);
});
