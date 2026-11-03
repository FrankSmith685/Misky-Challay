import { expect, test, type Page } from '@playwright/test';
import defaults from '../frontend/src/features/home/content/storefront.defaults.json';

test.use({ serviceWorkers: 'block' });
const user = { id: 999, email: 'review@example.test', firstName: 'Equipo', lastName: 'Prueba', roles: ['CUSTOMER'], permissions: ['kitchen.read', 'kitchen.operate', 'inventory.read'], branchIds: [1], isSuperAdmin: false };

async function session(page: Page, actor = user) {
  await page.addInitScript((account) => {
    localStorage.setItem('verde-bowl:accessToken', 'reliability-test');
    localStorage.setItem('verde-bowl:analytics-consent', 'rejected');
    localStorage.setItem('verde-bowl.admin.active-branch', '1');
    localStorage.setItem('verde-bowl:state', JSON.stringify({ auth: { user: account, isAuthenticated: true, status: 'succeeded', error: null }, cart: { items: [] }, favorites: { items: [] } }));
  }, actor);
}

const shared = (path: string, actor = user): unknown => {
  if (path === '/auth/me') return actor;
  if (path === '/locations/branches') return [{ id: 1, name: 'Sucursal de prueba', isActive: true, acceptsPickup: true }];
  if (path === '/settings/public') return { business: { commercialName: 'Misky Challay' } };
  if (path === '/settings/storefront') return { content: defaults, version: 1 };
  if (path === '/account/notifications/feed') return { items: [], unreadCount: 0, newestId: 0, totalPages: 1 };
  if (path === '/account/purchase-context') return { source: 'EMPTY', deliveryType: 'DELIVERY', cityId: null, branch: null, address: null };
  return [];
};

test('Producción conserva cantidades durante dos refrescos y detecta un cambio concurrente', async ({ page }) => {
  let reads = 0;
  const requested: string[] = [];
  const task = { id: 51, orderId: 80, branchId: 1, station: 'BAKING', workDate: '2026-11-10', plannedMinutes: 30, sequence: 1, status: 'IN_PROGRESS', assignedTo: 2, checklistJson: {}, materialPlanJson: { '4': 1 }, materialConsumedJson: { '4': 1 }, materialWasteJson: {}, evidenceUrl: null, evidenceMime: null, order: { orderNumber: 'TEST-ORDER', status: 'PREPARING', scheduledAt: null, contactName: 'Prueba', notes: null, deliveryType: 'PICKUP', items: [] } };
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', ''); requested.push(path);
    let data = shared(path);
    if (path === '/cakes/tasks') { reads++; data = [task]; }
    if (path === '/cakes/staff') data = [{ id: 2, firstName: 'Responsable', lastName: 'Elegible' }];
    if (path === '/cakes/recipes') data = { variants: [], inventoryItems: [{ id: 4, name: 'Harina', unit: 'kg' }] };
    await route.fulfill({ json: { success: true, data } });
  });
  await session(page);
  await page.goto('/admin/tortas?branchId=1&seccion=production');
  const quantity = page.getByRole('spinbutton', { name: 'Usado Harina', exact: true });
  await expect(quantity).toHaveValue('1');
  await expect(page.getByRole('option', { name: 'Responsable Elegible' })).toBeAttached();
  await quantity.fill('1.5');
  for (let count = 0; count < 2; count++) {
    const before = reads;
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('dulceflow:data-changed', { detail: ['production'] })));
    await expect.poll(() => reads).toBeGreaterThan(before);
    await expect(quantity).toHaveValue('1.5');
  }
  task.materialConsumedJson['4'] = 1.2;
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('dulceflow:data-changed', { detail: ['production'] })));
  await expect(page.getByText(/Otra persona actualizó los materiales/)).toBeVisible();
  await expect(quantity).toHaveValue('1.5');
  await expect(page.getByRole('button', { name: 'Guardar materiales', exact: true })).toBeDisabled();
  expect(requested).not.toContain('/access/staff');
});

test('Punto de venta recupera la misma operación tras perder la respuesta y recargar', async ({ page }) => {
  const actor = { ...user, permissions: [], branchIds: [], isSuperAdmin: true };
  const keys: string[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let data = shared(path, actor);
    if (path === '/operations/pos/catalog') data = [{ productId: 1, variantId: 2, name: 'Producto de prueba', price: 15, imageUrl: null }];
    if (path === '/operations/pos/sales') {
      keys.push(route.request().postDataJSON().idempotencyKey);
      if (keys.length === 1) return route.abort('failed');
      data = { orderNumber: 'TEST-SALE', status: 'CONFIRMED', total: 15, reused: true };
    }
    await route.fulfill({ json: { success: true, data } });
  });
  await session(page, actor);
  await page.goto('/admin/punto-venta');
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  await page.getByRole('button', { name: 'Cobrar S/ 15.00', exact: true }).click();
  await expect.poll(() => keys.length).toBe(1);
  await expect(page.getByRole('button', { name: 'Recuperar venta pendiente' })).toBeEnabled();
  await page.reload();
  await page.getByRole('button', { name: 'Recuperar venta pendiente' }).click();
  await expect(page.getByText('Venta registrada', { exact: true })).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
});

test('la campana conserva no leídos al abrir y dirige el pago al panel correcto', async ({ page }) => {
  const actor = { ...user, permissions: [], branchIds: [], isSuperAdmin: true };
  const reads: unknown[] = [];
  const item = { id: 101, subject: 'Revisar transferencia de prueba', template: 'PAYMENT_REVIEW_REQUIRED', body: 'Verifica el ingreso.', status: 'SENT', actionUrl: '/admin/pagos-directos?branchId=1&pedido=TEST-ORDER', readAt: null as string | null, createdAt: new Date().toISOString(), sentAt: new Date().toISOString() };
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let data = shared(path, actor);
    if (path === '/account/notifications/feed') data = { items: [item], unreadCount: item.readAt ? 0 : 41, newestId: 101, totalPages: 3 };
    if (path === '/account/notifications/read') { reads.push(route.request().postDataJSON()); item.readAt = new Date().toISOString(); }
    if (path === '/payments/mobile') data = { items: [], total: 0, page: 1, pageSize: 20 };
    await route.fulfill({ json: { success: true, data } });
  });
  await session(page, actor);
  await page.goto('/admin/punto-venta');
  await page.getByRole('button', { name: 'Ver notificaciones (41 nuevas)' }).click();
  await expect(page.getByText('Revisar transferencia de prueba')).toBeVisible();
  expect(reads).toHaveLength(0);
  await page.getByRole('menuitem', { name: /Revisar transferencia de prueba/ }).click();
  await expect(page).toHaveURL(/\/admin\/pagos-directos\?branchId=1&pedido=TEST-ORDER/);
  await expect.poll(() => reads.length).toBe(1);
  expect(reads[0]).toEqual({ ids: [101], audience: 'STAFF' });
});
