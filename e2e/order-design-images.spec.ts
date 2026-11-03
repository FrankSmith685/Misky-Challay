import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const actor = { id: 999, email: 'kitchen@example.test', firstName: 'Cocina', lastName: 'Prueba', roles: ['STAFF'], permissions: ['kitchen.read', 'kitchen.operate', 'inventory.read'], branchIds: [1], isSuperAdmin: false };
const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1sAAAAASUVORK5CYII=', 'base64');
const designImages = [{ id: 51, kind: 'CUSTOMER_REFERENCE', position: 0 }, { id: 52, kind: 'AI_PROPOSAL', position: 0 }];

async function prepare(page: Page) {
  const requests: Array<{ path: string; authenticated: boolean }> = [];
  const item = { id: 21, name: 'Torta para Ana', quantity: 1, description: 'Marmoleado con manjar', specialInstructions: 'Flores azules para Ana', customizations: [], allergens: [], designImages };
  const order = { id: 1, orderNumber: 'IMAGE-ORDER', status: 'CONFIRMED', scheduledAt: null, contactName: 'Ana', notes: null, deliveryType: 'PICKUP', paymentDueOnDelivery: false, serviceMode: 'ASAP', items: [item] };
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path.includes('/items/21/images/')) {
      requests.push({ path, authenticated: route.request().headers().authorization === 'Bearer images-test' });
      return route.fulfill({ contentType: 'image/png', body: imageBytes });
    }
    let data: unknown = [];
    if (path === '/auth/me') data = actor;
    if (path === '/locations/branches') data = [{ id: 1, name: 'Local de prueba', isActive: true, acceptsPickup: true }];
    if (path === '/settings/public') data = { business: { commercialName: 'Misky Challay' } };
    if (path === '/account/notifications/feed') data = { items: [], unreadCount: 0, newestId: 0, totalPages: 1 };
    if (path === '/account/purchase-context') data = { source: 'EMPTY' };
    if (path === '/operations/kitchen/board') data = { tickets: [{ id: 11, status: 'QUEUED', priority: 0, createdAt: new Date().toISOString(), acceptedAt: null, targetAt: new Date(Date.now() + 600000).toISOString(), isLate: false, notes: null, order }], scheduled: [], stats: { queued: 1, preparing: 0, ready: 0, late: 0, scheduled: 0 } };
    if (path === '/cakes/tasks') data = [{ id: 31, orderId: 1, branchId: 1, station: 'DECORATING', workDate: '2026-11-10', plannedMinutes: 30, sequence: 1, status: 'PENDING', assignedTo: null, checklistJson: {}, materialPlanJson: {}, materialConsumedJson: {}, materialWasteJson: {}, evidenceUrl: null, evidenceMime: null, order: { ...order, items: [{ ...item, productNameSnapshot: item.name, variantNameSnapshot: 'Pequeña', requestedServings: null, descriptionSnapshot: item.description, allergenSnapshotJson: [] }] } }];
    if (path === '/cakes/recipes') data = { variants: [], inventoryItems: [] };
    await route.fulfill({ json: { success: true, data } });
  });
  await page.addInitScript((actor) => {
    localStorage.setItem('verde-bowl:accessToken', 'images-test');
    localStorage.setItem('verde-bowl:analytics-consent', 'rejected');
    localStorage.setItem('verde-bowl.admin.active-branch', '1');
    localStorage.setItem('verde-bowl:state', JSON.stringify({ auth: { user: actor, isAuthenticated: true, status: 'succeeded', error: null }, cart: { items: [] }, favorites: { items: [] } }));
  }, actor);
  return requests;
}

for (const mode of ['Cocina', 'Producción']) test(`${mode} puede consultar y ampliar referencia y propuesta con IA del mismo producto`, async ({ page }) => {
  const requests = await prepare(page);
  await page.goto(mode === 'Cocina' ? '/admin/cocina?branchId=1' : '/admin/tortas?branchId=1&seccion=production');
  if (mode === 'Producción') await page.getByText(/Ficha de producción/).click();
  const button = page.getByRole('button', { name: 'Ver imágenes del diseño (2)', exact: true });
  await expect(button).toBeVisible();
  expect(requests).toHaveLength(0);
  await button.click();
  await expect(page.getByAltText('Referencia del cliente', { exact: true })).toBeVisible();
  await expect(page.getByAltText('Propuesta con IA', { exact: true })).toBeVisible();
  expect(new Set(requests.map((request) => request.path)).size).toBe(2);
  expect(requests.every((request) => request.authenticated)).toBe(true);
  await page.getByRole('button', { name: 'Ampliar propuesta con ia', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /^Propuesta con IA/ })).toBeVisible();
  await expect(page.getByRole('dialog').getByAltText('Propuesta con IA')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Cerrar imágenes del diseño', exact: true }).click();
  await expect(page.getByAltText('Propuesta con IA', { exact: true })).toHaveCount(0);
});
