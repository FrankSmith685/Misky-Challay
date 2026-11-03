import { checkoutTermsFixture, acceptCheckoutTerms } from './fixtures/checkoutTerms';
import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('el adicional QR suma su precio, respeta su anticipación y exige una idea antes de pagar', async ({ page }) => {
  const fixture = await prepare(page, 1440, { cake: false, pickup: true, experience: true });
  const aside = page.locator('aside');
  await page.getByRole('combobox', { name: 'Experiencia digital', exact: true }).click();
  await page.getByRole('option', { name: 'Video personalizado · S/ 35.00', exact: true }).click();
  await expect(aside.getByText('S/ 53.00', { exact: true })).toBeVisible();
  await expect(aside.getByText('Video personalizado', { exact: true })).toBeVisible();
  await schedule(page).getByRole('button', { name: /12:00.*0?2:00/ }).click();
  await expect(aside.getByRole('button', { name: 'Completar idea', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Cuéntanos tu idea y dedicatoria' }).fill('Un saludo de cumpleaños para mi equipo.');
  await page.getByRole('group', { name: 'Método de pago' }).getByRole('button', { name: /^Yape/ }).click();
  await acceptCheckoutTerms(page);
  await aside.getByRole('button', { name: 'Continuar con Yape', exact: true }).click();
  await expect.poll(() => fixture.requests.placed.length).toBe(1);
  expect(fixture.requests.placed[0]).toMatchObject({ experience: { packageId: 1, expectedVersion: 2, brief: 'Un saludo de cumpleaños para mi equipo.' }, deliverySlotId: 1, paymentMethod: 'YAPE' });
});

const user = { id: 999, email: 'prices@example.test', firstName: 'Cliente', lastName: 'Prueba',
  phone: '999888777', avatarUrl: null, roles: ['CUSTOMER'], permissions: [], isSuperAdmin: false, branchIds: [] };

for (const width of [1440, 390]) test(`entrega en auto: tarifa única y recojo disponible sin cupos (${width}px)`, async ({ page }) => {
  const fixture = await prepare(page, width, { car: true, noCarSlots: true });
  await expect(destination(page).getByRole('button', { name: 'Entrega en auto', exact: true })).toBeVisible();
  await expect(page.getByText('Tu torta viaja en auto', { exact: true })).toBeVisible();
  await expect(page.locator('aside').getByText('Entrega en auto', { exact: true })).toBeVisible();
  await expect.poll(() => fixture.requests.vehicles).toContain('CAR');
  await expect(schedule(page).getByText('No hay horarios con cupo por ahora', { exact: true })).toBeVisible();
  await expect(schedule(page).getByText('No quedan cupos de entrega en auto. Puedes elegir recojo o consultar otra fecha.', { exact: true })).toBeVisible();
  expect(fixture.requests.placed).toHaveLength(0);
  await destination(page).getByRole('button', { name: 'Recojo en taller', exact: true }).click();
  await destination(page).getByRole('button', { name: /^Local de prueba Av/ }).click();
  await expect(page.locator('aside').getByText('S/ 18.00', { exact: true }).last()).toBeVisible();
  await expect(schedule(page).getByRole('button', { name: /12:00.*0?2:00/ })).toBeVisible();
  expect(fixture.requests.vehicles.at(-1)).toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});
const far = { id: 1, label: 'Ventanilla', line1: 'Calle 10', reference: '', latitude: -11.88, longitude: -77.13 };
const near = { id: 2, label: 'Casa', line1: 'Calle Los Pinos 123', reference: '', latitude: -12.1, longitude: -77.03 };
const destination = (page: Page) => page.locator('[data-ui-form-section]').filter({ has: page.getByRole('heading', { name: '¿Cómo quieres recibirlo?', exact: true }) });
const schedule = (page: Page) => page.locator('[data-ui-form-section]').filter({ has: page.getByRole('heading', { name: '¿Cuándo lo quieres?', exact: true }) });

async function prepare(page: Page, width = 1440, options: { open?: boolean; cake?: boolean; legacyCart?: boolean; minimumLeadHours?: number; pickup?: boolean; experience?: boolean; car?: boolean; noCarSlots?: boolean } = {}) {
  let open = options.open ?? true;
  const cake = options.cake ?? true;
  const minimumLeadHours = options.minimumLeadHours ?? 2;
  const requests = { quotes: [] as Array<Record<string, unknown>>, placed: [] as Array<Record<string, unknown>>, vehicles: [] as Array<string | null> };
  let failNext = false;
  let held: Promise<void> | null = null;
  let release = () => {};
  const startsAt = new Date(Date.now() + 96 * 3600000);
  startsAt.setUTCHours(17, 0, 0, 0);
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path.endsWith('/slots')) requests.vehicles.push(new URL(route.request().url()).searchParams.get('vehicleType'));
    const input = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
    let data: unknown = [];
    if (path === '/experiences/packages' && options.experience) data = [{ id: 1, version: 2, name: 'Video personalizado', description: 'Saludo preparado por el equipo.', mode: 'VIDEO', price: 35, validityDays: 90, revisionsIncluded: 1, minLeadHours: 48, paymentRequirement: 'FULL', isActive: true, templateId: null, sortOrder: 0 }];
    if (path === '/auth/me') data = user;
    if (path === '/settings/terms') data = checkoutTermsFixture;
    if (path === '/settings/public') data = {
      business: { legalName: 'Prueba', commercialName: 'Misky Challay', ruc: '20600000000', address: 'Lima', phone: '999888777', email: 'test@example.test', supportEmail: 'test@example.test', complaintResponseDays: 15 },
      cod: { enabled: false, maxAmount: 300 }, receipts: { mode: 'INTERNAL_ONLY' },
      payments: { onlineEnabled: true, onlineProvider: 'mercadopago' },
      localPayments: {
        yapeEnabled: true, plinEnabled: true, yapePhone: '999111222', plinPhone: '999111222',
        yapeRecipient: 'CUENTA DE PRUEBA', plinRecipient: 'CUENTA DE PRUEBA',
        yapeQrImageUrl: '', plinQrImageUrl: '', instructions: 'Verifica el destinatario.',
      },
    };
    if (path === '/account/addresses') data = [far, near].map((address) => ({ ...address, isDefault: address.id === 1, districtId: null }));
    if (path === '/account/purchase-context') data = { source: 'EMPTY' };
    if (path === '/locations/branches') data = [{ id: 1, name: 'Local de prueba', addressLine: 'Av. Principal 123', acceptsPickup: true }];
    if (path.endsWith('/slots')) data = [
      ...(options.legacyCart ? [{ id: 2, startsAt: new Date(startsAt.getTime() - 72 * 3600000).toISOString(), endsAt: new Date(startsAt.getTime() - 70 * 3600000).toISOString(), available: 5 }] : []),
      { id: 1, startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + 2 * 3600000).toISOString(), available: 5 },
    ];
    if (path === '/checkout/availability') {
      const vehicle = options.car && input.deliveryType === 'DELIVERY' ? 'CAR' : null;
      requests.vehicles.push(vehicle);
      data = { branchId: 1, slots: vehicle && options.noCarSlots ? [] : [
        ...(options.legacyCart ? [{ id: 2, startsAt: new Date(startsAt.getTime() - 72 * 3600000).toISOString(), endsAt: new Date(startsAt.getTime() - 70 * 3600000).toISOString(), available: 5 }] : []),
        { id: 1, startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + 2 * 3600000).toISOString(), available: 5 },
      ], reasons: vehicle && options.noCarSlots ? [{ code: 'CAR_CAPACITY', message: 'No quedan cupos de entrega en auto. Puedes elegir recojo o consultar otra fecha.' }] : [] };
    }
    if (path === '/locations/coverage') data = {
      covered: true, branch: { id: 1, name: 'Local de prueba', isOpenNow: open },
      zone: { id: 1, deliveryFee: 6.9, minimumOrder: 0, name: 'Zona de prueba' },
      extraDeliveryFee: input.latitude === far.latitude ? 37.26 : 0, etaMinutes: 65,
    };
    if (path === '/checkout/quote') {
      requests.quotes.push(input);
      const waitFor = held;
      held = null;
      if (waitFor) await waitFor;
      if (failNext) {
        failNext = false;
        await route.fulfill({ status: 503, json: { success: false, message: 'No se pudo calcular el importe. Reintenta.' } });
        return;
      }
      const deliveryFee = input.deliveryType === 'PICKUP' ? 0 : input.address.latitude === far.latitude ? 44.16 : 6.9;
      const digital = input.experience ? 35 : 0;
      const grandTotal = Math.round((18 + digital + deliveryFee) * 100) / 100;
      data = { items: [], subtotal: 18 + digital, productSubtotal: 18, experience: digital ? { name: 'Video personalizado', price: digital } : null, deliveryFee, extraDeliveryFee: Math.max(0, deliveryFee - 6.9),
        deliveryVehicleType: options.car && input.deliveryType === 'DELIVERY' ? 'CAR' : null,
        grandTotal, discountTotal: 0, walletAmount: 0, walletBalance: 0, taxRate: 0.18,
        taxableBase: grandTotal / 1.18, taxTotal: grandTotal * 0.18 / 1.18, currency: 'PEN', discounts: [],
        minimumOrder: 0, meetsMinimum: true, branchId: 1, branchName: 'Local de prueba', isOpenNow: open,
        requiresScheduledDelivery: cake || Boolean(input.experience), minimumLeadHours: input.experience ? 48 : cake ? minimumLeadHours : 0,
        etaMinutes: 65, demandLevel: 'LOW', etaSource: 'ESTIMATE',
        schedulePending: (cake || input.experience || !open || input.serviceMode === 'SCHEDULED') && (input.serviceMode !== 'SCHEDULED' || !input.deliverySlotId) };
    }
    if (path === '/checkout/place') {
      requests.placed.push(input);
      await route.fulfill({ status: 422, json: { success: false, message: 'Solicitud capturada sin generar cobros' } });
      return;
    }
    if (path.endsWith('/slots') && options.noCarSlots && new URL(route.request().url()).searchParams.get('vehicleType') === 'CAR') data = [];
    await route.fulfill({ json: { success: true, data } });
  });
  await page.addInitScript(({ user, far, cake, options }) => {
    localStorage.setItem('verde-bowl:accessToken', 'prices-test-token');
    localStorage.setItem('verde-bowl:state', JSON.stringify({
      auth: { user, isAuthenticated: true, status: 'succeeded', error: null },
      cart: { persistenceVersion: 1, ownerUserId: user.id, items: [{ id: 'prices-item', productId: 1, variantId: 1, name: options.legacyCart ? 'Crea tu torta' : 'Fatia de tiramisú', variantName: 'Individual',
        imageUrl: null, quantity: 1, unitPrice: 18, extrasTotal: 0, lineTotal: 18, selections: [], nutrition: null, requiresScheduledDelivery: cake && !options.legacyCart, requiresCarDelivery: options.car }],
        subtotal: 18, grandTotal: 18, discountTotal: 0, deliveryFee: 0, walletAmount: 0, couponCode: null },
      favorites: { items: [] },
    }));
    localStorage.setItem('verde-bowl:purchase-context:v2', JSON.stringify({ address: far, branchId: 1, deliveryType: options.pickup ? 'PICKUP' : 'DELIVERY',
      serviceMode: 'ASAP', cityId: null, pickupBranch: options.pickup ? { id: 1, name: 'Local de prueba', addressLine: 'Av. Principal 123' } : null, scheduledSlotId: null }));
  }, { user, far, cake, options });
  await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
  await page.goto('/checkout');
  await page.getByRole('button', { name: 'Solo necesario', exact: true }).click();
  await expect(page.locator('aside').getByText(options.pickup ? 'S/ 18.00' : 'S/ 62.16', { exact: true }).last()).toBeVisible();
  return {
    requests,
    setOpen: (value: boolean) => { open = value; },
    failNext: () => { failNext = true; },
    holdNext: () => { held = new Promise<void>((resolve) => { release = resolve; }); },
    release: () => release(),
  };
}

for (const width of [1440, 390])
  test(`muestra productos, envío y total antes del horario y espera a elegirlo para confirmar (${width}px)`, async ({ page }, testInfo) => {
    const fixture = await prepare(page, width);
    const aside = page.locator('aside');
    await expect(aside.getByText('Productos', { exact: true })).toBeVisible();
    await expect(aside.getByText('Delivery', { exact: true })).toBeVisible();
    await expect(aside.getByText('Total estimado', { exact: true })).toBeVisible();
    await expect(aside.getByText('S/ 44.16', { exact: true })).toBeVisible();
    await expect(destination(page).getByText('Delivery: S/ 44.16', { exact: false })).toBeVisible();
    expect(fixture.requests.quotes.at(-1)).toMatchObject({ serviceMode: 'SCHEDULED' });
    expect(fixture.requests.quotes.at(-1)).not.toHaveProperty('deliverySlotId');
    if (width < 600) await expect(page.getByRole('region', { name: 'Resumen del pedido' }).getByText('S/ 62.16', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('early-prices.png'), fullPage: true });
    await aside.getByRole('button', { name: 'Elegir horario', exact: true }).click();
    expect(fixture.requests.placed).toHaveLength(0);
    await page.getByRole('group', { name: 'Método de pago' }).getByRole('button', { name: /^Yape/ }).click();
    await schedule(page).getByRole('button', { name: /12:00.*0?2:00/ }).click();
    await expect(aside.getByText('Total estimado', { exact: true })).toHaveCount(0);
    const pay = aside.getByRole('button', { name: 'Continuar con Yape', exact: true });
    await pay.scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await acceptCheckoutTerms(page);
    await pay.click();
    await expect.poll(() => fixture.requests.placed.length).toBe(1);
    expect(fixture.requests.placed[0]).toMatchObject({ deliverySlotId: 1, paymentMethod: 'YAPE', address: { line1: 'Calle 10' } });
  });

test('al cambiar de dirección oculta la tarifa anterior y recalcula; el recojo queda sin costo', async ({ page }) => {
  const fixture = await prepare(page);
  fixture.holdNext();
  await page.getByRole('button', { name: 'Casa · Calle Los Pinos 123', exact: true }).click();
  await expect(destination(page).getByText('Calculando delivery…', { exact: true })).toBeVisible();
  await expect(page.locator('aside').getByText('S/ 62.16', { exact: true })).toHaveCount(0);
  fixture.release();
  await expect(page.locator('aside').getByText('S/ 24.90', { exact: true })).toBeVisible();
  await expect(destination(page).getByText('Delivery: S/ 6.90', { exact: true })).toBeVisible();
  await page.getByRole('group', { name: 'Cómo quieres recibirlo' }).getByRole('button', { name: 'Recojo en taller', exact: true }).click();
  await page.getByRole('button', { name: /Local de prueba Av\. Principal 123/ }).click();
  await expect(page.locator('aside').getByText('Sin costo', { exact: true })).toBeVisible();
  await expect(page.locator('aside dl').getByText('S/ 18.00', { exact: true })).toHaveCount(2);
  expect(fixture.requests.placed).toHaveLength(0);
});

test('una respuesta tardía de otra dirección no reemplaza el precio actual', async ({ page }) => {
  const fixture = await prepare(page);
  fixture.holdNext();
  await page.getByRole('button', { name: 'Casa · Calle Los Pinos 123', exact: true }).click();
  await expect(destination(page).getByText('Calculando delivery…', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ventanilla · Calle 10', exact: true }).click();
  await expect(page.locator('aside').getByText('S/ 62.16', { exact: true })).toBeVisible();
  const staleResponse = page.waitForResponse((response) => response.url().includes('/checkout/quote') && response.request().postDataJSON()?.address?.latitude === near.latitude);
  fixture.release();
  await staleResponse;
  await expect(page.locator('aside').getByText('S/ 62.16', { exact: true })).toBeVisible();
  await expect(page.locator('aside').getByText('S/ 24.90', { exact: true })).toHaveCount(0);
});

test('si falla el precio de una dirección nueva permite reintentar sin mostrar el total anterior', async ({ page }) => {
  const fixture = await prepare(page);
  fixture.failNext();
  await page.getByRole('button', { name: 'Casa · Calle Los Pinos 123', exact: true }).click();
  const aside = page.locator('aside');
  await expect(aside.getByRole('alert')).toContainText('No se pudo calcular el importe');
  await expect(aside.getByText('S/ 62.16', { exact: true })).toHaveCount(0);
  await aside.getByRole('button', { name: 'Reintentar', exact: true }).first().click();
  await expect(aside.getByText('S/ 24.90', { exact: true })).toBeVisible();
  await expect(aside.getByRole('button', { name: 'Elegir horario', exact: true })).toBeVisible();
  expect(fixture.requests.placed).toHaveLength(0);
});

for (const width of [1440, 390]) {
  for (const pickup of [false, true]) {
    test(`fuera de horario permite reservar con precios y sin reintentos (${width}px, ${pickup ? 'recojo' : 'delivery'})`, async ({ page }) => {
      const fixture = await prepare(page, width, { open: false, cake: false, pickup });
      const timing = schedule(page);
      await expect(timing.getByText(/Puedes reservar tu pedido ahora/)).toBeVisible();
      await expect(timing.getByRole('button', { name: 'Lo antes posible', exact: true })).toBeDisabled();
      await expect(timing.getByRole('button', { name: 'Programar horario', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('aside').getByRole('button', { name: 'Reintentar', exact: true })).toHaveCount(0);
      await expect(page.locator('aside').getByRole('button', { name: 'Elegir horario', exact: true })).toBeVisible();
      expect(fixture.requests.placed).toHaveLength(0);
      await timing.getByRole('button', { name: /12:00.*0?2:00/ }).click();
      await page.getByRole('group', { name: 'Método de pago' }).getByRole('button', { name: /^Yape/ }).click();
      if (width < 1024) {
        const summary = page.getByRole('region', { name: 'Resumen del pedido', exact: true }).getByRole('button').first();
        if (await summary.getAttribute('aria-expanded') !== 'true') await summary.click();
      }
      await acceptCheckoutTerms(page);
      await page.locator('aside').getByRole('button', { name: 'Continuar con Yape', exact: true }).click();
      await expect.poll(() => fixture.requests.placed.length).toBe(1);
      expect(fixture.requests.placed[0]).toMatchObject({ serviceMode: 'SCHEDULED', deliverySlotId: 1, deliveryType: pickup ? 'PICKUP' : 'DELIVERY' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    });
  }
}

test('recupera el plazo de una torta antigua, oculta ASAP y descarta las fechas demasiado próximas', async ({ page }) => {
  const fixture = await prepare(page, 1440, { legacyCart: true, minimumLeadHours: 72 });
  const timing = schedule(page);
  await expect(timing.getByText(/al menos 72 horas de anticipación/)).toBeVisible();
  await expect(timing.getByRole('button', { name: 'Lo antes posible', exact: true })).toHaveCount(0);
  await expect(timing.getByText('1 fecha disponible', { exact: true })).toBeVisible();
  await timing.getByRole('button', { name: /12:00.*0?2:00/ }).click();
  await expect.poll(() => fixture.requests.quotes.at(-1)?.deliverySlotId).toBe(1);
  expect(fixture.requests.quotes.at(-1)).toMatchObject({ serviceMode: 'SCHEDULED' });
});

test('una dirección nueva recupera ASAP cuando su sede está abierta', async ({ page }) => {
  const fixture = await prepare(page, 1440, { open: false, cake: false });
  await expect(schedule(page).getByRole('button', { name: 'Lo antes posible', exact: true })).toBeDisabled();
  fixture.setOpen(true);
  await page.getByRole('button', { name: 'Casa · Calle Los Pinos 123', exact: true }).click();
  await expect(schedule(page).getByRole('button', { name: 'Lo antes posible', exact: true })).toBeEnabled();
  await schedule(page).getByRole('button', { name: 'Lo antes posible', exact: true }).click();
  await expect.poll(() => fixture.requests.quotes.at(-1)?.serviceMode).toBe('ASAP');
  await expect(page.locator('aside').getByRole('button', { name: /Pagar S\/ 24.90/ })).toBeVisible();
});
