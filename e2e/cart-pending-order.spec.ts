import path from 'node:path';
import { config } from 'dotenv';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

config({ path: path.resolve(process.cwd(), 'backend/.env') });

/**
 * Al pulsar "Pagar" el pedido se crea y el carrito se vacia. Si el pago no se
 * completa, el carrito queda vacio con un pedido vivo detras: la pantalla tiene
 * que explicar ESA situacion, no invitar a "agregar tus bowls favoritos" como si
 * no hubiera pasado nada.
 */
const ORDER_NUMBER = 'VB-TEST0001-9999';

const pendingOrder = {
  order: {
    id: 9999,
    orderNumber: ORDER_NUMBER,
    status: 'PENDING_PAYMENT',
    deliveryType: 'PICKUP',
    grandTotal: 28.9,
    currency: 'PEN',
    subtotal: 28.9,
    deliveryFee: 0,
    discountTotal: 0,
    walletAmount: 0,
    taxTotal: 4.41,
    createdAt: '2026-08-03T12:00:00.000Z',
    items: [],
    discounts: [],
    branch: { id: 1, name: 'Verde Bowl Miraflores' },
    cancelReason: null,
  },
  payment: {
    id: 1,
    status: 'CREATED',
    provider: 'stripe',
    checkoutUrl: 'https://checkout.stripe.com/c/pay/test-session',
    amount: 28.9,
    currency: 'PEN',
  },
};

const prepare = async (page: Page, request: APIRequestContext) => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  test.skip(!email || !password, 'La prueba requiere las credenciales locales configuradas');

  const login = await request.post('http://127.0.0.1:4000/api/v1/auth/login', {
    data: { email, password },
  });
  expect(login.ok()).toBeTruthy();
  const payload = await login.json();

  await page.route(`**/api/v1/orders/${ORDER_NUMBER}`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: pendingOrder }),
  }));

  await page.addInitScript(({ auth, orderNumber }) => {
    localStorage.setItem('verde-bowl:accessToken', auth.accessToken);
    localStorage.setItem('verde-bowl:refreshToken', auth.refreshToken);
    localStorage.setItem('verde-bowl:state', JSON.stringify({
      auth: { user: auth.user, isAuthenticated: true, status: 'succeeded', error: null },
      // Carrito vacio: es justo lo que deja "Pagar" al crear el pedido.
      cart: { items: [], couponCode: null, subtotal: 0, discountTotal: 0, deliveryFee: 0, walletAmount: 0, grandTotal: 0 },
      favorites: { items: [] },
    }));
    localStorage.setItem('verde-bowl:pending-order:v1', JSON.stringify({
      orderNumber, createdAt: Date.now(),
    }));
  }, { auth: payload.data, orderNumber: ORDER_NUMBER });
};

test('el carrito vacio con un pedido sin pagar explica el porque y ofrece salidas', async ({ page, request }) => {
  await prepare(page, request);
  await page.goto('/carrito');

  await expect(page.getByText('Tienes un pedido sin pagar')).toBeVisible();
  await expect(page.getByText(ORDER_NUMBER)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reanudar pago' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancelar pedido' })).toBeVisible();

  // El estado vacio ya no se contradice con el aviso de arriba.
  await expect(page.getByText('Tu carrito está vacío porque el pedido ya está creado')).toBeVisible();
  await expect(page.getByText('Tu carrito está listo para tu próxima elección')).toHaveCount(0);
  await expect(page.getByText('Agrega tus bowls favoritos')).toHaveCount(0);

  // Y el aviso se lee antes que el estado vacio.
  const bannerBox = await page.getByText('Tienes un pedido sin pagar').boundingBox();
  const emptyBox = await page
    .getByText('Tu carrito está vacío porque el pedido ya está creado')
    .boundingBox();
  expect(bannerBox!.y).toBeLessThan(emptyBox!.y);

  await page.screenshot({ path: 'playwright-report/carrito-pedido-pendiente.png', fullPage: false });
});

test('sin pedido pendiente el carrito vacio mantiene su invitacion de siempre', async ({ page, request }) => {
  await prepare(page, request);
  // Se borra la referencia: no hay pedido a medias que explicar.
  await page.addInitScript(() => localStorage.removeItem('verde-bowl:pending-order:v1'));
  await page.goto('/carrito');

  await expect(page.getByText('Tu carrito está listo para tu próxima elección')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Armar mi bowl' })).toBeVisible();
  await expect(page.getByText('Tienes un pedido sin pagar')).toHaveCount(0);
});
