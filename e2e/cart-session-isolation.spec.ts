import { expect, test, type Page, type Route } from '@playwright/test';

const user = {
  id: 7101, email: 'cliente@example.test', phone: '999000001',
  firstName: 'Cliente', lastName: 'Uno', avatarUrl: null,
  roles: ['customer'], permissions: [], isSuperAdmin: false, branchIds: [],
};
const otherUser = { ...user, id: 7102, firstName: 'Cliente', lastName: 'Dos', email: 'otro@example.test' };
const privateName = 'Torta de la cuenta anterior';
const stateKey = 'verde-bowl:state';
const personalKeys = [
  'verde-bowl:checkout-draft:v1', 'verde-bowl:checkout-billing:v1',
  'verde-bowl:purchase-context:v2', 'verde-bowl:pending-order:v1',
  'verde-bowl.active-order.dismissed', 'dulceflow:cake-builder:1:v1',
];
type SetupOptions = {
  emptyCart?: boolean;
  pendingOrder?: 'PENDING_PAYMENT' | 'CONFIRMED';
  waitForPending?: Promise<void>;
  authenticated?: boolean;
  tokens?: boolean;
  knownOwner?: boolean;
  owner?: number | null;
  meStatus?: number;
  serverUser?: typeof user;
  waitForMe?: Promise<void>;
  refreshSucceeds?: boolean;
  waitForRefresh?: Promise<void>;
};
const ok = (route: Route, data: unknown) => route.fulfill({
  contentType: 'application/json', body: JSON.stringify({ success: true, data, message: 'OK' }),
});

async function setup(page: Page, options: SetupOptions = {}) {
  const { authenticated = true, tokens = true, knownOwner = true, owner = authenticated ? user.id : null } = options;
  let loginFails = false;
  const requests: string[] = [];
  await page.context().route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.replace('/api/v1', '');
    requests.push(endpoint);
    if (endpoint === '/auth/me') {
      await options.waitForMe;
      if (options.refreshSucceeds && route.request().headers().authorization === 'Bearer renewed-access') return ok(route, user);
      if (options.meStatus && options.meStatus !== 200) return route.fulfill({
        status: options.meStatus, contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'La cuenta no existe' }),
      });
      return ok(route, options.serverUser ?? user);
    }
    if (endpoint === '/auth/refresh' && options.refreshSucceeds) {
      await options.waitForRefresh;
      return ok(route, { accessToken: 'renewed-access', refreshToken: 'renewed-refresh' });
    }
    if (endpoint === '/auth/refresh' || (endpoint === '/auth/login' && loginFails)) return route.fulfill({
      status: 401, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Credenciales incorrectas' }),
    });
    if (endpoint === '/auth/login') return ok(route, { user, accessToken: 'new-access', refreshToken: 'new-refresh' });
    if (endpoint === '/auth/register') return ok(route, { user, accessToken: 'new-access', refreshToken: 'new-refresh' });
    if (endpoint === '/orders/AUTH-PENDING') {
      await options.waitForPending;
      return ok(route, {
        order: { id: 991, orderNumber: 'AUTH-PENDING', status: options.pendingOrder,
          grandTotal: 18, currency: 'PEN', deliveryType: 'PICKUP', items: [], discounts: [],
          branch: { id: 1, name: 'Sucursal de prueba' } },
        payment: { id: 991, provider: 'mercadopago', status: 'PENDING', amount: 18,
          currency: 'PEN', checkoutUrl: 'https://payments.example.test/pending' },
      });
    }
    if (endpoint === '/settings/public') return ok(route, {
      business: { commercialName: 'Misky Challay', legalName: 'Prueba', ruc: '20600000000',
        address: 'Lima', phone: '999000000', email: 'hola@example.test', supportEmail: 'hola@example.test', complaintResponseDays: 15 },
      receipts: { mode: 'INTERNAL_ONLY' },
    });
    if (endpoint === '/account/purchase-context') return ok(route, { source: 'EMPTY' });
    if (endpoint.includes('/wallet')) return ok(route, { balance: 0 });
    return ok(route, []);
  });
  await page.addInitScript(({ current, signedIn, hasTokens, known, ownerId, privateItem, keys, emptyCart, pendingOrder }) => {
    if (sessionStorage.getItem('session-isolation-seeded')) return;
    sessionStorage.setItem('session-isolation-seeded', 'true');
    localStorage.setItem('verde-bowl:analytics-consent', 'rejected');
    if (hasTokens) {
      localStorage.setItem('verde-bowl:accessToken', 'old-access');
      localStorage.setItem('verde-bowl:refreshToken', 'old-refresh');
    }
    const auth = { user: signedIn ? current : null, isAuthenticated: signedIn, status: 'idle', error: null };
    const item = { id: 'private-line', productId: 1, variantId: 1, name: privateItem, variantName: 'Individual',
      quantity: 1, unitPrice: 18, extrasTotal: 0, lineTotal: 18, selections: [] };
    localStorage.setItem('verde-bowl:state', JSON.stringify({
      ...(known ? { persistenceVersion: 1, ownerUserId: ownerId } : {}),
      auth, cart: { items: emptyCart ? [] : [item], couponCode: null, subtotal: emptyCart ? 0 : 18, discountTotal: 0,
        deliveryFee: 0, walletAmount: 0, grandTotal: emptyCart ? 0 : 18, editingItemId: null },
      favorites: { items: [{ productId: 1, name: 'Favorito privado', slug: 'privado', priceFrom: 18, type: 'FIXED' }] },
    }));
    if (!signedIn) return;
    for (const key of keys) localStorage.setItem(key, JSON.stringify({ private: true }));
    if (pendingOrder) localStorage.setItem('verde-bowl:pending-order:v1', JSON.stringify({
      orderNumber: 'AUTH-PENDING', createdAt: Date.now(),
    }));
    localStorage.setItem('verde-bowl:purchase-context:v2', JSON.stringify({
      cityId: 1, branchId: 1, address: null, deliveryType: 'PICKUP',
      pickupBranch: { id: 1, name: 'Local privado', addressLine: 'Dirección anterior 123' },
      serviceMode: 'SCHEDULED', scheduledSlotId: 7,
    }));
    sessionStorage.setItem('verde-bowl:checkout-idempotency:v1', 'private-request');
    sessionStorage.setItem('cake-visual:v1:private', 'private-reference');
    sessionStorage.setItem('cake-reconstruction:v1:private', 'private-reconstruction');
  }, { current: user, signedIn: authenticated, hasTokens: tokens, known: knownOwner, ownerId: owner,
    privateItem: privateName, keys: personalKeys, emptyCart: options.emptyCart, pendingOrder: options.pendingOrder });
  return { requests, failLogin: () => { loginFails = true; }, changeAccount: () => { options.serverUser = otherUser; } };
}

async function expectClean(page: Page) {
  await expect(page.getByRole('link', { name: 'Ver carrito, 0 productos' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tu carrito está listo para tu próxima elección' })).toBeVisible();
  await expect(page.getByText(privateName, { exact: true })).toHaveCount(0);
  const remaining = await page.evaluate((keys) => ({
    local: keys.filter((key) => localStorage.getItem(key) !== null),
    session: ['verde-bowl:checkout-idempotency:v1', 'cake-visual:v1:private', 'cake-reconstruction:v1:private']
      .filter((key) => sessionStorage.getItem(key) !== null),
    favorites: JSON.parse(localStorage.getItem('verde-bowl:state') ?? 'null')?.favorites?.items?.length ?? 0,
  }), personalKeys);
  expect(remaining).toEqual({ local: [], session: [], favorites: 0 });
}

for (const width of [1440, 390]) {
  test(`cuenta eliminada limpia carrito y datos privados antes de mostrarlos (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const { requests } = await setup(page, { meStatus: 401 });
    await page.goto('/carrito');
    await expectClean(page);
    expect(requests).not.toContain('/account/purchase-context');
    expect(requests).not.toContain('/orders');
    await page.reload();
    await expectClean(page);
  });
}

test('sin tokens descarta el carrito de una cuenta guardada', async ({ page }) => {
  const { requests } = await setup(page, { tokens: false });
  await page.goto('/carrito');
  await expectClean(page);
  expect(requests).not.toContain('/auth/me');
});

test('descarta el carrito anónimo antiguo cuyo propietario se desconoce', async ({ page }) => {
  await setup(page, { authenticated: false, tokens: false, knownOwner: false });
  await page.goto('/carrito');
  await expectClean(page);
});

test('un fallo al validar la sesión también limpia los datos de esa cuenta', async ({ page }) => {
  await setup(page, { meStatus: 503 });
  await page.goto('/carrito');
  await expectClean(page);
  expect(await page.evaluate(() => localStorage.getItem('verde-bowl:accessToken'))).toBeNull();
});

test('una sesión válida conserva su carrito al recargar', async ({ page }) => {
  await setup(page);
  await page.goto('/carrito');
  await expect(page.getByText(privateName, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(privateName, { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver carrito, 1 productos' })).toBeVisible();
});

test('si el token corresponde a otro cliente no hereda el carrito ni la dirección', async ({ page }) => {
  await setup(page, { serverUser: otherUser });
  await page.goto('/carrito');
  await expectClean(page);
  await expect(page.getByRole('button', { name: 'Mi cuenta · Cliente Dos' })).toBeVisible();
  await expect(page.getByText('Recojo · Local privado')).toHaveCount(0);
});

test('al cerrar sesión se limpian el carrito y los borradores', async ({ page }) => {
  await setup(page);
  await page.goto('/carrito');
  await page.getByRole('button', { name: 'Mi cuenta · Cliente Uno' }).click();
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('link', { name: 'Ingresar', exact: true })).toBeVisible();
  await page.goto('/carrito');
  await expectClean(page);
});

test('cerrar sesión en otra pestaña limpia inmediatamente la pestaña abierta', async ({ page, context }) => {
  await setup(page);
  await page.goto('/carrito');
  await expect(page.getByText(privateName, { exact: true })).toBeVisible();
  const other = await context.newPage();
  await other.goto('/terminos');
  await other.evaluate(() => {
    localStorage.removeItem('verde-bowl:accessToken');
    localStorage.removeItem('verde-bowl:refreshToken');
  });
  await expectClean(page);
  await other.close();
});

test('cambiar de cuenta en otra pestaña no hereda datos del cliente anterior', async ({ page, context }) => {
  const { changeAccount } = await setup(page);
  await page.goto('/carrito');
  await expect(page.getByText(privateName, { exact: true })).toBeVisible();
  const other = await context.newPage();
  await other.goto('/terminos');
  await expect(other.getByRole('button', { name: 'Mi cuenta · Cliente Uno' })).toBeVisible();
  changeAccount();
  await other.evaluate(() => {
    localStorage.setItem('verde-bowl:accessToken', 'other-access');
    localStorage.setItem('verde-bowl:refreshToken', 'other-refresh');
  });
  await expectClean(page);
  await expect(page.getByRole('button', { name: 'Mi cuenta · Cliente Dos' })).toBeVisible();
  await other.close();
});

test('un error de contraseña no elimina la selección hecha como visitante', async ({ page }) => {
  const { requests, failLogin } = await setup(page, { authenticated: false, tokens: false });
  failLogin();
  await page.goto('/carrito');
  await page.getByRole('button', { name: 'Inicia sesión para continuar' }).click();
  await page.getByLabel('Correo electrónico').fill('cliente@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('incorrect-password');
  await page.getByRole('button', { name: 'Ingresar a mi cuenta' }).click();
  await expect(page.getByRole('alert')).toContainText('Credenciales incorrectas');
  expect(requests).not.toContain('/auth/refresh');
  await page.goto('/carrito');
  await expect(page.getByText(privateName, { exact: true })).toBeVisible();
});

test('la selección nueva del visitante se conserva al identificarse', async ({ page }) => {
  await setup(page, { authenticated: false, tokens: false });
  await page.goto('/carrito');
  await expect(page.getByText(privateName, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(privateName, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Inicia sesión para continuar' }).click();
  await page.getByLabel('Correo electrónico').fill(user.email);
  await page.getByLabel('Contraseña', { exact: true }).fill('correct-password');
  await page.getByRole('button', { name: 'Ingresar a mi cuenta' }).click();
  await expect(page.getByRole('button', { name: 'Mi cuenta · Cliente Uno' })).toBeVisible();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole('heading', { name: 'Finaliza tu pedido', exact: true })).toBeVisible();
  await page.goto('/carrito');
  await expect(page.getByText(privateName, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('verde-bowl:state')!).ownerUserId)).toBe(user.id);
});

for (const width of [1440, 390]) {
  test(`iniciar sesión descarta el retorno a un checkout vacío (${width}px)`, async ({ page }) => {
    await setup(page, { authenticated: false, tokens: false, emptyCart: true });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/ingresar?returnTo=%2Fcheckout');
    await page.getByLabel('Correo electrónico').fill(user.email);
    await page.getByLabel('Contraseña', { exact: true }).fill('correct-password');
    await page.getByRole('button', { name: 'Ingresar a mi cuenta' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Tortas personalizadas para tus celebraciones', exact: true })).toBeVisible();
    await expect(page.getByText('Tu carrito está vacío.', { exact: true })).toHaveCount(0);
  });
}

test('una sesión ya abierta también descarta el retorno a checkout sin productos', async ({ page }) => {
  await setup(page, { emptyCart: true });
  await page.goto('/ingresar?returnTo=%2Fcheckout%3Fpaso%3Dpago');
  await expect(page).toHaveURL(/\/$/);
});

test('registrarse desde un retorno antiguo a checkout vacío lleva al inicio', async ({ page }) => {
  await setup(page, { authenticated: false, tokens: false, emptyCart: true });
  await page.goto('/crear-cuenta?returnTo=%2Fcheckout');
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Cliente');
  await page.getByRole('textbox', { name: 'Apellido', exact: true }).fill('Uno');
  await page.getByLabel('Correo electrónico').fill(user.email);
  await page.getByLabel('Contraseña', { exact: true }).fill('Prueba12345');
  await page.getByLabel('Confirma tu contraseña', { exact: true }).fill('Prueba12345');
  await page.getByRole('checkbox', { name: /He leído y acepto/ }).check();
  await page.getByRole('button', { name: 'Crear mi cuenta', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('conserva el retorno a Mis pedidos al iniciar sesión sin productos', async ({ page }) => {
  await setup(page, { authenticated: false, tokens: false, emptyCart: true });
  await page.goto('/ingresar?returnTo=%2Fcuenta%2Fpedidos');
  await page.getByLabel('Correo electrónico').fill(user.email);
  await page.getByLabel('Contraseña', { exact: true }).fill('correct-password');
  await page.getByRole('button', { name: 'Ingresar a mi cuenta' }).click();
  await expect(page).toHaveURL(/\/cuenta\/pedidos$/);
  await expect(page.getByRole('heading', { name: 'Mis pedidos', exact: true })).toBeVisible();
});

test('entrar directamente a checkout sin compra muestra el carrito estándar', async ({ page }) => {
  await setup(page, { emptyCart: true });
  await page.goto('/checkout');
  await expect(page).toHaveURL(/\/carrito$/);
  await expect(page.getByRole('heading', { name: 'Tu carrito está listo para tu próxima elección' })).toBeVisible();
});

test('espera a consultar un pago pendiente y conserva su recuperación con el carrito vacío', async ({ page }) => {
  let release!: () => void;
  const waitForPending = new Promise<void>((resolve) => { release = resolve; });
  const fixture = await setup(page, { emptyCart: true, pendingOrder: 'PENDING_PAYMENT', waitForPending });
  await page.goto('/checkout');
  await expect.poll(() => fixture.requests.includes('/orders/AUTH-PENDING')).toBe(true);
  await expect(page).toHaveURL(/\/checkout$/);
  release();
  await expect(page.getByText('Tienes un pedido sin pagar', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reanudar pago', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/checkout$/);
});

test('un pedido ya confirmado no deja un checkout vacío al volver del pago', async ({ page }) => {
  await setup(page, { emptyCart: true, pendingOrder: 'CONFIRMED' });
  await page.goto('/checkout');
  await expect(page).toHaveURL(/\/carrito$/);
  await expect(page.getByRole('heading', { name: 'Tu carrito está listo para tu próxima elección' })).toBeVisible();
  await expect(page.getByText('Tu carrito está vacío.', { exact: true })).toHaveCount(0);
});

test('una respuesta tardía de sesión no recupera la cuenta después de salir', async ({ page }) => {
  let finish!: () => void;
  const waitForMe = new Promise<void>((resolve) => { finish = resolve; });
  await setup(page, { waitForMe });
  await page.goto('/carrito', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Verificando tu sesion...')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('auth:logout')));
  finish();
  await expectClean(page);
  await expect(page.getByRole('link', { name: 'Ingresar', exact: true })).toBeVisible();
});

test('renovar una sesión válida conserva el carrito de su propietario', async ({ page }) => {
  const { requests } = await setup(page, { meStatus: 401, refreshSucceeds: true });
  await page.goto('/carrito');
  await expect(page.getByText(privateName, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mi cuenta · Cliente Uno' })).toBeVisible();
  expect(requests).toContain('/auth/refresh');
  expect(await page.evaluate(() => localStorage.getItem('verde-bowl:accessToken'))).toBe('renewed-access');
});

test('un refresh tardío no restaura los tokens después de cerrar sesión', async ({ page }) => {
  let finish!: () => void;
  const waitForRefresh = new Promise<void>((resolve) => { finish = resolve; });
  const { requests } = await setup(page, { meStatus: 401, refreshSucceeds: true, waitForRefresh });
  await page.goto('/carrito', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => requests.includes('/auth/refresh')).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('auth:logout')));
  const response = page.waitForResponse((r) => r.url().endsWith('/auth/refresh'));
  finish();
  await response;
  await expectClean(page);
  const tokens = await page.evaluate(() => [localStorage.getItem('verde-bowl:accessToken'), localStorage.getItem('verde-bowl:refreshToken')]);
  expect(tokens).toEqual([null, null]);
});
