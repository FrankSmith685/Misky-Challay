import { test, expect, type Page } from '@playwright/test';
import { checkoutTermsFixture } from './fixtures/checkoutTerms';
test.use({ serviceWorkers: 'block' });
const actor = {
  id: 999,
  email: 'journey@example.test',
  firstName: 'Cliente',
  lastName: 'Prueba',
  phone: '999888777',
  roles: ['CUSTOMER'],
  permissions: [],
  isSuperAdmin: false,
  branchIds: [],
};
const business = {
  legalName: 'Negocio de prueba',
  commercialName: 'Misky Challay',
  ruc: '20600000000',
  address: 'Prueba 123',
  phone: '999888777',
  email: 'test@example.test',
  supportEmail: 'test@example.test',
  complaintResponseDays: 15,
};
const cartItem = {
  id: 'original-line',
  productId: 1,
  variantId: 1,
  name: 'Torta original',
  variantName: 'Individual',
  imageUrl: null,
  quantity: 1,
  unitPrice: 32.9,
  extrasTotal: 0,
  lineTotal: 32.9,
  selections: [],
};
const quote = {
  items: [],
  subtotal: 32.9,
  deliveryFee: 0,
  discountTotal: 0,
  walletAmount: 0,
  walletBalance: 0,
  taxRate: 0.18,
  taxableBase: 27.88,
  taxTotal: 5.02,
  grandTotal: 32.9,
  currency: 'PEN',
  minimumOrder: 0,
  meetsMinimum: true,
  branchId: 1,
  branchName: 'Local de prueba',
  isOpenNow: true,
  etaMinutes: 20,
  demandLevel: 'LOW',
  etaSource: 'ESTIMATE',
  discounts: [],
};
const order = {
  id: 31,
  orderNumber: 'JOURNEY-ORDER',
  status: 'CONFIRMED',
  placedAt: '2026-11-02T15:00:00Z',
  ...quote,
  deliveryType: 'PICKUP',
  serviceMode: 'ASAP',
  contactName: 'Cliente',
  addressSnapshotJson: null,
  branch: { id: 1, name: 'Local de prueba', addressLine: 'Prueba 123' },
  items: [
    {
      id: 1,
      productId: 1,
      variantId: 1,
      productNameSnapshot: 'Torta original',
      quantity: 1,
      unitPrice: 32.9,
      lineTotal: 32.9,
      extrasTotal: 0,
      customizations: [],
      allergenSnapshotJson: [],
    },
  ],
};

async function setup(
  page: Page,
  options: { loseResponse?: boolean; cloud?: boolean; image?: boolean; pending?: boolean } = {},
) {
  const state = {
    attempts: [] as Record<string, unknown>[],
    cloudWrites: [] as Record<string, unknown>[],
    recoveryRequests: 0,
    pendingFailure: Boolean(options.pending),
    approvals: [] as Record<string, unknown>[],
    workspace: {
      revision: 1,
      cart: [] as unknown[],
      favorites: [],
      drafts: {},
      channels: { email: true, whatsapp: true, push: true },
    },
    entry: {
      id: 7,
      kind: 'DESIGN',
      status: 'AWAITING_CUSTOMER',
      version: 3,
      payloadJson: { proposal: 'Texto exacto: Feliz cumpleaños, Ana', priceDifference: 0 },
      messagesJson: [
        {
          id: 'msg1',
          author: 'STAFF',
          text: 'Texto exacto: Feliz cumpleaños, Ana',
          createdAt: '2026-11-02T16:00:00Z',
        },
      ],
    },
  };
  const mediaId = '13fb87c0-26e6-4c7b-9de5-04691fe3480a';
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const method = route.request().method();
    let data: unknown = [];
    if (path === '/auth/me') data = actor;
    if (path === '/settings/public')
      data = {
        business,
        receipts: { mode: 'INTERNAL_ONLY' },
        payments: { onlineEnabled: true, onlineProvider: 'mercadopago' },
      };
    if (path === '/settings/business') data = { business, isConfigured: true };
    if (path === '/settings/local-payments')
      data = { localPayments: { yapeEnabled: false, plinEnabled: false } };
    if (path === '/settings/receipts') data = { receipts: { mode: 'INTERNAL_ONLY' } };
    if (path === '/settings/terms') data = checkoutTermsFixture;
    if (path === '/account/purchase-context') data = { source: 'EMPTY' };
    if (path === '/locations/branches')
      data = [{ id: 1, name: 'Local de prueba', addressLine: 'Prueba 123', acceptsPickup: true }];
    if (path === '/account/notifications/feed')
      data = { items: [], unreadCount: 0, newestId: 0, totalPages: 1 };
    if (path === '/checkout/quote') data = quote;
    if (path === '/customizations/quote')
      data = { ...cartItem, basePrice: 32.9, description: 'Individual' };
    if (path === '/checkout/place') {
      const input = route.request().postDataJSON();
      state.attempts.push(input);
      if (options.loseResponse && state.attempts.length === 1) return route.abort('failed');
      data = {
        orderNumber: order.orderNumber,
        orderId: 31,
        status: 'CONFIRMED',
        grandTotal: 32.9,
        currency: 'PEN',
        checkoutUrl: null,
        provider: 'mercadopago',
        reused: state.attempts.length > 1,
      };
    }
    if (path === '/orders/JOURNEY-ORDER') {
      if (state.pendingFailure)
        return route.fulfill({ status: 503, json: { success: false, message: 'Fallo temporal' } });
      data = {
        order: options.pending ? { ...order, status: 'PENDING_PAYMENT' } : order,
        payment: {
          id: 1,
          status: options.pending ? 'PENDING' : 'SUCCEEDED',
          provider: 'mercadopago',
          amount: 32.9,
          checkoutUrl: 'https://expired.example.test/pay',
          checkoutUrlIsLive: false,
        },
      };
    }
    if (path === '/orders/JOURNEY-ORDER/payment/retry') {
      state.recoveryRequests++;
      data = { checkoutUrl: '/checkout/confirmacion?pedido=JOURNEY-ORDER' };
    }
    if (path === '/customer/orders/JOURNEY-ORDER')
      data = {
        cases: [state.entry],
        care: { content: 'Consulta al equipo las instrucciones de conservación.', products: [] },
      };
    if (path === '/customer/orders/JOURNEY-ORDER/cases/7') {
      const input = route.request().postDataJSON();
      state.approvals.push(input);
      state.entry.status = 'ACCEPTED';
      state.entry.version++;
      data = state.entry;
    }
    if (path.startsWith('/experiences/orders/')) data = null;
    if (path === '/customer/workspace') {
      if (!options.cloud)
        return route.fulfill({
          status: 503,
          json: { success: false, message: 'Sin nube en esta prueba' },
        });
      if (method === 'PUT') {
        const input = route.request().postDataJSON();
        state.cloudWrites.push(input);
        state.workspace = { ...state.workspace, ...input, revision: state.workspace.revision + 1 };
      }
      data = state.workspace;
    }
    if (path === '/customer/media') data = { mediaId };
    if (path === `/customer/media/${mediaId}`) data = { dataUrl: image };
    if (path.startsWith('/customer/gifts/'))
      data = {
        recipientName: 'Ana',
        message: 'Que tengas un lindo día',
        status: 'CONFIRMED',
        items: [{ productNameSnapshot: 'Torta de regalo', quantity: 1 }],
      };
    await route.fulfill({
      json: {
        success: true,
        data,
        ...(path === '/orders'
          ? { meta: { totalPages: 1, counts: { ALL: 0, ACTIVE: 0, DELIVERED: 0, CANCELLED: 0 } } }
          : {}),
      },
    });
  });
  await page.addInitScript(
    ({ actor, item, image, options }) => {
      if (sessionStorage.getItem('journey-seeded')) return;
      sessionStorage.setItem('journey-seeded', 'yes');
      localStorage.setItem('verde-bowl:accessToken', 'journey-test');
      localStorage.setItem('verde-bowl:analytics-consent', 'rejected');
      localStorage.setItem(
        'verde-bowl:state',
        JSON.stringify({
          persistenceVersion: 1,
          ownerUserId: actor.id,
          auth: { user: actor, isAuthenticated: true, status: 'succeeded', error: null },
          cart: {
            items: [{ ...item, ...(options.image ? { referenceDataUrl: image } : {}) }],
            subtotal: 32.9,
            grandTotal: 32.9,
          },
          favorites: { items: [] },
        }),
      );
      localStorage.setItem(
        'verde-bowl:purchase-context:v2',
        JSON.stringify({
          cityId: null,
          branchId: 1,
          deliveryType: 'PICKUP',
          serviceMode: 'ASAP',
          address: null,
          pickupBranch: {
            id: 1,
            name: 'Local de prueba',
            addressLine: 'Prueba 123',
            acceptsPickup: true,
          },
        }),
      );
      if (options.pending)
        localStorage.setItem(
          'verde-bowl:pending-order:v1',
          JSON.stringify({ orderNumber: 'JOURNEY-ORDER', createdAt: Date.now() }),
        );
    },
    { actor, item: cartItem, image, options },
  );
  return state;
}

test('recupera la misma compra tras perder la respuesta y conserva las líneas nuevas', async ({
  page,
}) => {
  const state = await setup(page, { loseResponse: true });
  await page.goto('/checkout');
  await page.locator('#checkout-terms-checkbox').check();
  await page.locator('aside').getByRole('button', { name: 'Pagar S/ 32.90', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Recuperar compra anterior' })).toBeVisible();
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('verde-bowl:state')!);
    state.cart.items.push({ ...state.cart.items[0], id: 'new-line', name: 'Compra nueva' });
    localStorage.setItem('verde-bowl:state', JSON.stringify(state));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Recuperar compra anterior' }).click();
  await expect(page.getByText('Pedido confirmado', { exact: true })).toBeVisible();
  expect(state.attempts).toHaveLength(2);
  expect(state.attempts[0].idempotencyKey).toBe(state.attempts[1].idempotencyKey);
  expect(state.attempts[0].items).toEqual(state.attempts[1].items);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('verde-bowl:state')!).cart.items.map(
        (item: { id: string }) => item.id,
      ),
    ),
  ).toEqual(['new-line']);
});
test('consultar una confirmación anterior mantiene el carrito', async ({ page }) => {
  await setup(page);
  await page.goto('/checkout/confirmacion?pedido=JOURNEY-ORDER');
  await expect(page.getByText('Pedido confirmado', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('verde-bowl:state')!).cart.items.length,
    ),
  ).toBe(1);
});
test('conserva el pendiente ante un 503 y recupera el pago con un enlace revalidado', async ({
  page,
}) => {
  const state = await setup(page, { pending: true });
  await page.goto('/carrito');
  await expect(
    page.getByRole('button', { name: 'Reintentar recuperación del pedido' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('verde-bowl:pending-order:v1')!).orderNumber,
    ),
  ).toBe('JOURNEY-ORDER');
  state.pendingFailure = false;
  await page.getByRole('button', { name: 'Reintentar recuperación del pedido' }).click();
  await page.getByRole('button', { name: 'Reanudar pago', exact: true }).click();
  await expect.poll(() => state.recoveryRequests).toBe(1);
});
test('el cliente revisa y acepta la versión publicada del diseño', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/cuenta/pedidos/JOURNEY-ORDER');
  await expect(
    page.getByText('Texto exacto: Feliz cumpleaños, Ana', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Aceptar propuesta vigente' }).click();
  await expect.poll(() => state.approvals.length).toBe(1);
  expect(state.approvals[0]).toMatchObject({ version: 3, action: 'ACCEPT' });
  await expect(page.getByRole('button', { name: 'Aceptar propuesta vigente' })).toHaveCount(0);
});
test('guarda adjuntos privados por identificador y restaura el carrito de la cuenta', async ({
  page,
}) => {
  const state = await setup(page, { cloud: true, image: true });
  await page.goto('/carrito');
  await expect.poll(() => state.cloudWrites.length, { timeout: 12000 }).toBeGreaterThan(0);
  expect(JSON.stringify(state.cloudWrites[0])).toContain('$media');
  expect(JSON.stringify(state.cloudWrites[0])).not.toContain('data:image');
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('verde-bowl:state')!);
    state.cart.items = [];
    localStorage.setItem('verde-bowl:state', JSON.stringify(state));
    localStorage.removeItem('dulceflow:customer-workspace:v1');
  });
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('verde-bowl:state')!).cart.items.length),
    )
    .toBe(1);
  await expect(page.getByAltText('Referencia adjunta a la torta')).toBeVisible();
});
test('la ficha del regalo oculta importes y datos de pago', async ({ page }) => {
  await setup(page);
  await page.goto('/regalos/13fb87c0-26e6-4c7b-9de5-04691fe3480a');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Un regalo para Ana' })).toBeVisible();
  await expect(main).not.toContainText('S/');
  await expect(main).not.toContainText(actor.email);
});
