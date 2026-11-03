import { checkoutTermsFixture, acceptCheckoutTerms } from './fixtures/checkoutTerms';
import { expect, test, type Page } from '@playwright/test';

const user = {
  id: 999,
  email: 'minimum@example.test',
  firstName: 'Cliente',
  lastName: 'Prueba',
  phone: '999888777',
  avatarUrl: null,
  roles: ['CUSTOMER'],
  permissions: [],
  isSuperAdmin: false,
  branchIds: [],
};
const address = {
  id: 1,
  label: 'Ventanilla',
  line1: 'Calle 10',
  reference: 'Puerta verde',
  latitude: -11.88,
  longitude: -77.13,
  hasHouseNumber: false,
};

async function prepare(page: Page, width = 1440, minimumOrder = 25) {
  const requests = {
    quotes: [] as Array<Record<string, unknown>>,
    placed: [] as Array<Record<string, unknown>>,
  };
  let failNext = false;
  let held: Promise<void> | null = null;
  let release = () => {};
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let data: unknown = [];
    if (path === '/auth/me') data = user;
    if (path === '/settings/terms') data = checkoutTermsFixture;
    if (path === '/settings/public')
      data = {
        business: {
          legalName: 'Prueba',
          commercialName: 'Misky Challay',
          ruc: '20600000000',
          address: 'Lima',
          phone: '999888777',
          email: 'test@example.test',
          supportEmail: 'test@example.test',
          complaintResponseDays: 15,
        },
        cod: { enabled: false, maxAmount: 300 },
        payments: { onlineEnabled: true, onlineProvider: 'mercadopago' },
        localPayments: {
          yapeEnabled: true, plinEnabled: true, yapePhone: '999111222', plinPhone: '999111222',
          yapeRecipient: 'CUENTA DE PRUEBA', plinRecipient: 'CUENTA DE PRUEBA',
          yapeQrImageUrl: '', plinQrImageUrl: '', instructions: 'Verifica el destinatario.',
        },
        receipts: { mode: 'INTERNAL_ONLY' },
      };
    if (path === '/locations/branches')
      data = [
        { id: 1, name: 'Local de prueba', addressLine: 'Av. Principal 123', acceptsPickup: true },
      ];
    if (path === '/locations/coverage')
      data = {
        covered: true,
        branch: { id: 1, name: 'Local de prueba', isOpenNow: true },
        zone: { deliveryFee: 44.16, minimumOrder, name: 'Zona de prueba' },
        etaMinutes: 65,
      };
    if (path === '/account/addresses') data = [{ ...address, isDefault: true, districtId: null }];
    if (path === '/account/purchase-context') data = { source: 'EMPTY' };
    if (path === '/catalog/products') data = [];
    if (path === '/checkout/quote') {
      const input = route.request().postDataJSON();
      requests.quotes.push(input);
      const waitFor = held;
      held = null;
      if (waitFor) await waitFor;
      if (failNext) {
        failNext = false;
        await route.fulfill({
          status: 503,
          json: { success: false, message: 'No se pudo consultar la disponibilidad' },
        });
        return;
      }
      const quantity = input.items[0].quantity;
      const subtotal = quantity * 18;
      data = {
        items: [
          {
            productId: 1,
            variantId: 1,
            quantity,
            unitPrice: 18,
            lineTotal: subtotal,
            description: 'Individual',
          },
        ],
        subtotal,
        deliveryFee: 44.16,
        discountTotal: 0,
        walletAmount: 0,
        walletBalance: 0,
        taxRate: 0.18,
        taxableBase: (subtotal + 44.16) / 1.18,
        taxTotal: ((subtotal + 44.16) * 0.18) / 1.18,
        grandTotal: subtotal + 44.16,
        currency: 'PEN',
        minimumOrder,
        meetsMinimum: subtotal >= minimumOrder,
        branchId: 1,
        branchName: 'Local de prueba',
        isOpenNow: true,
        etaMinutes: 65,
        demandLevel: 'MEDIUM',
        etaSource: 'ESTIMATE',
        discounts: [],
      };
    }
    if (path === '/checkout/place') {
      requests.placed.push(route.request().postDataJSON());
      await route.fulfill({
        status: 422,
        json: { success: false, message: 'Solicitud capturada sin crear un cobro' },
      });
      return;
    }
    await route.fulfill({ json: { success: true, data } });
  });
  await page.addInitScript(
    ({ user, address }) => {
      if (sessionStorage.getItem('minimum-test-seeded')) return;
      sessionStorage.setItem('minimum-test-seeded', '1');
      localStorage.setItem('verde-bowl:accessToken', 'minimum-test-token');
      localStorage.setItem(
        'verde-bowl:state',
        JSON.stringify({
          auth: { user, isAuthenticated: true, status: 'succeeded', error: null },
          cart: {
            items: [
              {
                id: 'minimum-item',
                productId: 1,
                variantId: 1,
                name: 'Fatia de tiramisú',
                variantName: 'Individual',
                imageUrl: null,
                quantity: 1,
                unitPrice: 18,
                extrasTotal: 0,
                lineTotal: 18,
                selections: [],
                nutrition: null,
              },
            ],
            subtotal: 18,
            grandTotal: 18,
            discountTotal: 0,
            deliveryFee: 0,
            walletAmount: 0,
            couponCode: null,
          },
          favorites: { items: [] },
        }),
      );
      localStorage.setItem(
        'verde-bowl:purchase-context:v2',
        JSON.stringify({
          address,
          branchId: 1,
          deliveryType: 'DELIVERY',
          serviceMode: 'ASAP',
          cityId: null,
          pickupBranch: null,
          scheduledSlotId: null,
        }),
      );
    },
    { user, address },
  );
  await page.setViewportSize({ width, height: width < 600 ? 844 : 1100 });
  await page.goto('/checkout');
  await expect(
    page.getByRole('heading', { name: 'Finaliza tu pedido', exact: true }),
  ).toBeVisible();
  if (minimumOrder > 0) {
    await expect(
      page.locator('aside').getByText('Faltan S/ 7.00 en productos.', { exact: true }),
    ).toBeVisible();
  } else {
    await expect(page.locator('aside').getByText('S/ 62.16', { exact: true })).toBeVisible();
  }
  return {
    requests,
    failNext: () => {
      failNext = true;
    },
    holdNext: () => {
      held = new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    release: () => release(),
  };
}

const minimumAction = (page: Page, mobile = false) =>
  mobile
    ? page.getByRole('button', { name: 'Completar mínimo', exact: true })
    : page.locator('aside').getByRole('button', { name: 'Completar pedido mínimo', exact: true });

for (const width of [1440, 390])
  test(`permite comprar S/18 más envío sin exigir productos adicionales (${width}px)`, async ({ page }) => {
    const fixture = await prepare(page, width, 0);
    await page.getByRole('group', { name: 'Método de pago' })
      .getByRole('button', { name: /^Yape/ }).click();
    await expect(page.getByText(/Faltan .* en productos/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Completar .*mínimo/ })).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Completa el pedido mínimo' })).toHaveCount(0);
    expect(fixture.requests.placed).toHaveLength(0);
    const pay = page.locator('aside').getByRole('button', { name: 'Continuar con Yape', exact: true });
    await pay.scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await acceptCheckoutTerms(page);
    await pay.click();
    await expect.poll(() => fixture.requests.placed.length).toBe(1);
    expect(fixture.requests.placed[0]).toMatchObject({
      paymentMethod: 'YAPE',
      items: [{ productId: 1, variantId: 1, quantity: 1 }],
    });
    await expect(page).toHaveURL(/\/checkout$/);
  });

for (const width of [1440, 390])
  test(`completa el mínimo dentro del checkout y conserva datos y pago (${width}px)`, async ({
    page,
  }, testInfo) => {
    const fixture = await prepare(page, width);
    await page.getByLabel('Nombre', { exact: true }).fill('Persona que recibe');
    await page.getByLabel('Indicaciones para cocina', { exact: true }).fill('Empacar por separado');
    await page
      .getByRole('group', { name: 'Método de pago' })
      .getByRole('button', { name: /^Yape/ })
      .click();
    await minimumAction(page, width < 600).click();
    const dialog = page.getByRole('dialog', { name: 'Completa el pedido mínimo' });
    await expect(dialog).toBeVisible();
    expect(await dialog.locator('.MuiDialogContent-root').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath('minimum-dialog.png') });
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(dialog.getByText(/El costo de delivery no cuenta/)).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Continuar con mi pedido', exact: true }),
    ).toBeDisabled();
    expect(fixture.requests.placed).toHaveLength(0);
    fixture.holdNext();
    try {
      await dialog
        .getByRole('button', { name: 'Agregar uno Fatia de tiramisú', exact: true })
        .click();
      await expect(
        dialog.getByText('Actualizando importes y disponibilidad…', { exact: true }),
      ).toBeVisible();
      await expect(
        dialog.getByRole('button', { name: 'Continuar con mi pedido', exact: true }),
      ).toBeDisabled();
      expect(fixture.requests.placed).toHaveLength(0);
    } finally {
      fixture.release();
    }
    await expect(
      dialog.getByText('Ya alcanzaste el pedido mínimo.', { exact: false }),
    ).toBeVisible();
    await expect(dialog.getByText('S/ 36.00', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Continuar con mi pedido', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Persona que recibe');
    await expect(page.getByLabel('Indicaciones para cocina', { exact: true })).toHaveValue(
      'Empacar por separado',
    );
    await expect(
      page
        .getByRole('group', { name: 'Método de pago' })
        .getByRole('button', { name: /^Yape/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem('verde-bowl:purchase-context:v2')!).address.line1,
      ),
    ).toBe('Calle 10');
    await expect(page.locator('aside').getByText('S/ 80.16', { exact: true })).toBeVisible();
    expect(fixture.requests.placed).toHaveLength(0);
    const pay = page.locator('aside').getByRole('button', { name: 'Continuar con Yape', exact: true });
    await pay.scrollIntoViewIfNeeded();
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await acceptCheckoutTerms(page);
    await pay.click();
    await expect.poll(() => fixture.requests.placed.length).toBe(1);
    expect(fixture.requests.placed[0]).toMatchObject({
      paymentMethod: 'YAPE',
      contactName: 'Persona que recibe',
      items: [{ productId: 1, variantId: 1, quantity: 2 }],
    });
  });

test('si falla la nueva cotización no permite continuar y conserva las cantidades para reintentar', async ({
  page,
}) => {
  const fixture = await prepare(page);
  await minimumAction(page).click();
  const dialog = page.getByRole('dialog', { name: 'Completa el pedido mínimo' });
  fixture.failNext();
  await dialog.getByRole('button', { name: 'Agregar uno Fatia de tiramisú', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('No se pudo consultar la disponibilidad');
  await expect(
    dialog.getByRole('button', { name: 'Continuar con mi pedido', exact: true }),
  ).toBeDisabled();
  expect(fixture.requests.placed).toHaveLength(0);
  expect(fixture.requests.quotes.at(-1)).toMatchObject({ items: [{ quantity: 2 }] });
  await dialog.getByRole('button', { name: 'Reintentar cálculo', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Continuar con mi pedido', exact: true }),
  ).toBeEnabled();
  expect(fixture.requests.quotes.at(-1)).toMatchObject({ items: [{ quantity: 2 }] });
  await expect(page).toHaveURL(/\/checkout$/);
});

test('solo abre el catálogo al elegir explícitamente otros productos y guarda el borrador', async ({
  page,
}) => {
  const fixture = await prepare(page);
  await page.getByLabel('Indicaciones para cocina', { exact: true }).fill('Mantener este detalle');
  await minimumAction(page).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await page
    .getByRole('dialog')
    .getByRole('link', { name: 'Elegir otros productos en el catálogo', exact: true })
    .click();
  await expect(page).toHaveURL(/\/menu$/);
  expect(fixture.requests.placed).toHaveLength(0);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('verde-bowl:checkout-draft:v1')!).kitchenNotes,
    ),
  ).toBe('Mantener este detalle');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('verde-bowl:state')!).cart.items[0].quantity,
    ),
  ).toBe(1);
});
