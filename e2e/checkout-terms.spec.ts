import { expect, test, type Page } from '@playwright/test';
import { acceptCheckoutTerms, checkoutTermsFixture } from './fixtures/checkoutTerms';

test.use({ serviceWorkers: 'block' });
const user = { id: 999, email: 'terms@example.test', firstName: 'Cliente', lastName: 'Prueba', phone: '999888777', roles: ['CUSTOMER'], permissions: [], isSuperAdmin: false, branchIds: [] };
const business = { legalName: 'Negocio de prueba', commercialName: 'Misky Challay', ruc: '20600000000', address: 'Av. Principal 123', phone: '999888777', email: 'test@example.test', supportEmail: 'test@example.test', complaintResponseDays: 15 };
const quote = { items: [], subtotal: 32.9, deliveryFee: 0, discountTotal: 0, walletAmount: 0, walletBalance: 0, taxRate: 0.18, taxableBase: 27.88, taxTotal: 5.02, grandTotal: 32.9, currency: 'PEN', minimumOrder: 0, meetsMinimum: true, branchId: 1, branchName: 'Local de prueba', isOpenNow: true, etaMinutes: 20, demandLevel: 'LOW', etaSource: 'ESTIMATE', discounts: [] };

async function prepare(page: Page, admin = false) {
  const state = { terms: { ...checkoutTermsFixture }, unavailable: false, conflict: false, placed: [] as Record<string, unknown>[], publications: [] as Record<string, unknown>[] };
  const actor = { ...user, isSuperAdmin: admin, roles: admin ? ['SUPER_ADMIN'] : ['CUSTOMER'] };
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let data: unknown = [];
    if (path === '/auth/me') data = actor;
    if (path === '/settings/terms') {
      if (state.unavailable) return route.fulfill({ status: 503, json: { success: false, message: 'Condiciones no disponibles', code: 'TERMS_UNAVAILABLE' } });
      if (route.request().method() === 'PUT') {
        const input = route.request().postDataJSON(); state.publications.push(input);
        if (input.version !== state.terms.version) return route.fulfill({ status: 409, json: { success: false, message: 'Otra persona publicó cambios. Recarga los términos antes de publicar tu versión.', code: 'CONFLICT' } });
        state.terms = { ...input, version: input.version + 1, publishedAt: new Date().toISOString() };
      }
      data = state.terms;
    }
    if (path === '/settings/public') data = { business, receipts: { mode: 'INTERNAL_ONLY' }, payments: { onlineEnabled: true, onlineProvider: 'mercadopago' } };
    if (path === '/settings/business') data = { business, isConfigured: true, updatedAt: null };
    if (path === '/settings/communication') data = { communication: { deliveryMode: 'console' } };
    if (path === '/settings/local-payments') data = { localPayments: { yapeEnabled: false, plinEnabled: false } };
    if (path === '/settings/receipts') data = { receipts: { mode: 'INTERNAL_ONLY' } };
    if (path === '/locations/branches') data = [{ id: 1, name: 'Local de prueba', addressLine: 'Av. Prueba 123', acceptsPickup: true }];
    if (path === '/account/purchase-context') data = { source: 'EMPTY' };
    if (path === '/checkout/quote') data = quote;
    if (path === '/checkout/place') {
      const input = route.request().postDataJSON(); state.placed.push(input);
      if (state.conflict) { state.conflict = false; return route.fulfill({ status: 409, json: { success: false, code: 'TERMS_CHANGED', message: 'Los términos y condiciones cambiaron. Revisa y acepta la versión vigente antes de confirmar.' } }); }
      data = { orderNumber: 'TERMS-ORDER', orderId: 31, status: 'PENDING_PAYMENT', grandTotal: 32.9, currency: 'PEN', checkoutUrl: null, provider: 'yape', reused: false };
    }
    if (path === '/account/notifications/feed') data = { items: [], unreadCount: 0, newestId: 0, totalPages: 1 };
    await route.fulfill({ json: { success: true, data } });
  });
  await page.addInitScript((actor) => {
    if (sessionStorage.getItem('terms-seeded')) return;
    sessionStorage.setItem('terms-seeded', 'yes');
    localStorage.setItem('verde-bowl:accessToken', 'terms-test');
    localStorage.setItem('verde-bowl:analytics-consent', 'rejected');
    localStorage.setItem('verde-bowl:state', JSON.stringify({ auth: { user: actor, isAuthenticated: true, status: 'succeeded', error: null }, cart: { items: [{ id: 'terms-1', productId: 1, variantId: 1, name: 'Torta de prueba', variantName: 'Individual', imageUrl: null, quantity: 1, unitPrice: 32.9, extrasTotal: 0, lineTotal: 32.9, selections: [], nutrition: null }], subtotal: 32.9, grandTotal: 32.9 }, favorites: { items: [] } }));
    localStorage.setItem('verde-bowl:purchase-context:v2', JSON.stringify({ cityId: null, branchId: 1, deliveryType: 'PICKUP', serviceMode: 'ASAP', address: null, pickupBranch: { id: 1, name: 'Local de prueba', addressLine: 'Av. Prueba 123', acceptsPickup: true } }));
  }, actor);
  return state;
}

async function submit(page: Page) {
  const pay = page.locator('aside').getByRole('button', { name: 'Pagar S/ 32.90', exact: true });
  await pay.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await pay.click();
}

for (const width of [1440, 390]) test(`exige aceptación desmarcada justo antes de crear el pedido (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const state = await prepare(page);
  await page.goto('/checkout');
  const checkbox = page.locator('#checkout-terms-checkbox');
  await expect(checkbox).not.toBeChecked();
  const link = page.getByRole('link', { name: /Leer Términos y Condiciones/ });
  await expect(link).toHaveAttribute('href', '/terminos');
  await expect(link).toHaveAttribute('target', '_blank');
  await submit(page);
  if (!await page.locator('#checkout-terms-error').isVisible()) await submit(page);
  await expect(page.locator('#checkout-terms-error')).toHaveText(/Acepta los términos/);
  expect(state.placed).toHaveLength(0);
  await acceptCheckoutTerms(page);
  await submit(page);
  await expect.poll(() => state.placed.length).toBe(1);
  expect(state.placed[0]).toMatchObject({ termsAccepted: true, termsVersion: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('publicar mientras el checkout está abierto exige volver a aceptar y recargar no conserva consentimiento', async ({ page }) => {
  const state = await prepare(page);
  await page.goto('/checkout');
  await acceptCheckoutTerms(page);
  state.terms = { ...state.terms, version: 2, content: `${state.terms.content} Nuevas condiciones.` };
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('dulceflow:data-changed', { detail: ['settings'] })));
  await expect(page.locator('#checkout-terms-checkbox')).not.toBeChecked();
  await expect(page.getByRole('link', { name: /Leer.*versión 2/ })).toBeVisible();
  await expect(page.getByText('Las condiciones se actualizaron. Revisa y acepta la nueva versión.')).toBeVisible();
  expect(state.placed).toHaveLength(0);
  await acceptCheckoutTerms(page);
  await page.reload();
  await expect(page.locator('#checkout-terms-checkbox')).not.toBeChecked();
});

test('un cambio detectado por el servidor obliga a revisar la nueva versión', async ({ page }) => {
  const state = await prepare(page);
  await page.goto('/checkout');
  await acceptCheckoutTerms(page);
  state.terms = { ...state.terms, version: 2 };
  state.conflict = true;
  await submit(page);
  await expect.poll(() => state.placed.length).toBe(1);
  await expect(page.locator('#checkout-terms-checkbox')).not.toBeChecked();
  await expect(page.getByRole('link', { name: /Leer.*versión 2/ })).toBeVisible();
  await acceptCheckoutTerms(page);
  await submit(page);
  await expect.poll(() => state.placed.length).toBe(2);
  expect(state.placed[1]).toMatchObject({ termsAccepted: true, termsVersion: 2 });
});

test('no confirma sin cargar los términos y permite reintentar', async ({ page }) => {
  const state = await prepare(page);
  state.unavailable = true;
  await page.goto('/checkout');
  await expect(page.getByText('No pudimos cargar las condiciones de compra.')).toBeVisible();
  await submit(page);
  expect(state.placed).toHaveLength(0);
  state.unavailable = false;
  await page.locator('#checkout-terms').getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.locator('#checkout-terms-checkbox')).not.toBeChecked();
});

test('el checkout envía la referencia y la propuesta de IA en el mismo producto del pedido', async ({ page }) => {
  const state = await prepare(page);
  await page.goto('/checkout');
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('verde-bowl:state')!);
    const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1sAAAAASUVORK5CYII=';
    saved.cart.items[0].referenceDataUrl = image;
    saved.cart.items[0].cakeAiProposal = { dataUrl: image, recipe: { flavor: 'Marmoleado', filling: 'Manjar', addons: '', description: 'Flores azules' } };
    localStorage.setItem('verde-bowl:state', JSON.stringify(saved));
  });
  await page.reload();
  await expect(page.getByAltText('Propuesta con IA que acompañará el pedido')).toBeVisible();
  await expect(page.getByAltText('Referencia de la torta', { exact: true })).toBeVisible();
  await acceptCheckoutTerms(page);
  await submit(page);
  await expect.poll(() => state.placed.length).toBe(1);
  const item = (state.placed[0].items as Array<Record<string, unknown>>)[0];
  expect(item.referenceDataUrl).toMatch(/^data:image\/png;base64,/);
  expect(item.aiProposalDataUrl).toBe(item.referenceDataUrl);
});

test('el superadmin publica título, contenido y casilla; los conflictos conservan su borrador', async ({ page }) => {
  const state = await prepare(page, true);
  await page.goto('/admin/configuracion-negocio?tab=terms');
  await page.getByLabel('Título del documento', { exact: true }).fill('Condiciones actualizadas');
  const content = page.getByLabel('Contenido de los términos', { exact: true });
  await content.fill(`${state.terms.content}\nNueva condición visible en web y app.`);
  await page.getByLabel('Texto de la casilla de aceptación', { exact: true }).fill('Acepto las condiciones actualizadas de mi pedido.');
  await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Condiciones actualizadas', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Publicar nueva versión', exact: true }).click();
  await expect.poll(() => state.terms.version).toBe(2);
  await expect(page.getByText(/Versión publicada: 2/)).toBeVisible();
  await content.fill('Borrador que otra publicación no debe borrar. Conserva estas condiciones pendientes de publicar.');
  state.terms = { ...state.terms, version: 3 };
  await page.getByRole('button', { name: 'Publicar nueva versión', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Otra persona publicó' })).toBeVisible();
  await expect(content).toHaveValue(/Borrador que otra publicación no debe borrar/);
  await page.goto('/terminos');
  await expect(page.getByRole('heading', { name: 'Condiciones actualizadas', exact: true })).toBeVisible();
  await expect(page.locator('article')).toHaveText(/Nueva condición visible en web y app/);
});
