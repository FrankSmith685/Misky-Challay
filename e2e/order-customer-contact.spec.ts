import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
async function prepare(page: Page, status = 'CONFIRMED') {
  const actor = { id: 999, email: 'staff@example.test', firstName: 'Equipo', lastName: 'Prueba', roles: ['STAFF'], permissions: ['order.read', 'order.update_status'], branchIds: [1], isSuperAdmin: false };
  const detail = { id: 1, orderNumber: 'CONTACT-1', status, source: 'WEB', deliveryType: 'PICKUP', serviceMode: 'SCHEDULED', scheduledAt: new Date(Date.now() + 96 * 3600000).toISOString(), grandTotal: 100, subtotal: 100, placedAt: new Date().toISOString(), contactName: 'Ana', contactPhone: '999888777', customerEmail: 'ana@example.test', customerContactJson: null as object | null, branch: { id: 1, name: 'Local de prueba', prepMinutes: 30 }, items: [], detailItems: [], statusHistory: [], payments: [], taxRate: 0.18, taxTotal: 15.25, taxableBase: 84.75, walletAmount: 0, discountTotal: 0, deliveryFee: 0, currency: 'PEN', receiptMode: 'INTERNAL_ONLY', receiptSettings: { mode: 'INTERNAL_ONLY' }, internalReceiptPrintCount: 0, documentType: 'BOLETA', invoiceStatus: 'PENDING', notes: null, cancelReason: null };
  const records: Array<Record<string, unknown>> = [];
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let data: unknown = [];
    if (path === '/auth/me') data = actor;
    if (path === '/locations/branches') data = [{ id: 1, name: 'Local de prueba', isActive: true }];
    if (path === '/settings/public') data = { business: { commercialName: 'Misky Challay' }, receipts: { mode: 'INTERNAL_ONLY' } };
    if (path === '/account/purchase-context') data = { source: 'EMPTY' };
    if (path === '/account/notifications/feed') data = { items: [], unreadCount: 0, newestId: 0, totalPages: 1 };
    if (path === '/admin/orders') return route.fulfill({ json: { success: true, data: [detail], meta: { total: 1, totalPages: 1, page: 1, pageSize: 20 } } });
    if (path === '/admin/orders/CONTACT-1') data = detail;
    if (path === '/admin/orders/CONTACT-1/customer-contact') {
      const input = route.request().postDataJSON(); records.push(input);
      detail.customerContactJson = { ...input, actorId: actor.id, contactedAt: new Date().toISOString() };
      data = detail.customerContactJson;
    }
    await route.fulfill({ json: { success: true, data } });
  });
  await page.addInitScript((actor) => {
    localStorage.setItem('verde-bowl:accessToken', 'contact-test');
    localStorage.setItem('verde-bowl:analytics-consent', 'rejected');
    localStorage.setItem('verde-bowl.admin.active-branch', '1');
    localStorage.setItem('verde-bowl:state', JSON.stringify({ auth: { user: actor, isAuthenticated: true, status: 'succeeded', error: null }, cart: { items: [] }, favorites: { items: [] } }));
  }, actor);
  await page.goto('/admin/pedidos?branchId=1&pedido=CONTACT-1');
  return records;
}

test('el equipo inicia contacto por WhatsApp o correo y registra la coordinación expresamente', async ({ page }) => {
  const records = await prepare(page);
  const contact = page.getByRole('region', { name: 'Coordinación con el cliente', exact: true });
  await expect(contact.getByText('Contacto inicial pendiente', { exact: true })).toBeVisible();
  const whatsapp = contact.getByRole('link', { name: 'Contactar por WhatsApp', exact: true });
  await expect(whatsapp).toHaveAttribute('href', /^https:\/\/wa.me\/51999888777\?text=/);
  const message = new URL((await whatsapp.getAttribute('href'))!).searchParams.get('text');
  expect(message).toContain('coordinar contigo el diseño');
  expect(message).not.toContain('Gracias por confiar');
  await expect(contact.getByRole('link', { name: 'Escribir correo' })).toHaveAttribute('href', /^mailto:ana@example.test/);
  expect(records).toHaveLength(0);
  await contact.getByRole('button', { name: 'Registrar contacto realizado' }).click();
  await contact.getByLabel('Acuerdos de coordinación (opcional)', { exact: true }).fill('Confirmó flores azules y recojo en el taller.');
  await contact.getByRole('button', { name: 'Guardar contacto', exact: true }).click();
  await expect(contact.getByText('Contacto inicial registrado', { exact: true })).toBeVisible();
  await expect(contact.getByText('Confirmó flores azules y recojo en el taller.', { exact: true })).toBeVisible();
  expect(records).toEqual([{ channel: 'WHATSAPP', note: 'Confirmó flores azules y recojo en el taller.' }]);
  await expect(contact.getByRole('button', { name: 'Registrar contacto realizado' })).toHaveCount(0);
});

test('el agradecimiento del contacto manual aparece cuando el pedido ya fue entregado', async ({ page }) => {
  await prepare(page, 'DELIVERED');
  const whatsapp = page.getByRole('link', { name: 'Contactar por WhatsApp', exact: true });
  await expect(whatsapp).toBeVisible();
  const message = new URL((await whatsapp.getAttribute('href'))!).searchParams.get('text');
  expect(message).toContain('fue entregado. Gracias por confiar');
});
