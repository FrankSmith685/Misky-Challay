import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) test(`gestiona autos y cupos por horario desde Reparto (${width}px)`, async ({ page }) => {
  const user = { id: 999, email: 'fleet@example.test', firstName: 'Equipo', lastName: 'Prueba', roles: ['CUSTOMER'], permissions: [], branchIds: [], isSuperAdmin: true };
  let vehicleType = 'UNSPECIFIED';
  let defaultCarCapacity = 10;
  const slot = { id: 1, startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 93600000).toISOString(), capacity: 20, carCapacity: 10, booked: 0 };
  let saved = false;
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    let data: unknown = [];
    if (path === '/auth/me') data = user;
    if (path.endsWith('/branches')) data = [{ id: 1, name: 'Taller de prueba', addressLine: 'Av. Prueba 123', isActive: true, acceptsPickup: true, acceptsDelivery: true }];
    if (path === '/delivery/drivers') data = [{ id: 10, fullName: 'Conductor de prueba', phone: '999111222', vehicle: '', vehicleType, status: 'AVAILABLE' }];
    if (path === '/delivery/drivers/10') { vehicleType = route.request().postDataJSON().vehicleType; data = { id: 10, vehicleType }; }
    if (path === '/delivery/transport') {
      if (route.request().method() === 'PUT') { const input = route.request().postDataJSON(); slot.carCapacity = input.slots[0].carCapacity; defaultCarCapacity = input.defaultCarCapacity; saved = true; }
      data = { hasCars: vehicleType === 'CAR', defaultCarCapacity, instructions: 'Transportar la torta en su caja sobre una base nivelada.', slots: [slot] };
    }
    if (path === '/settings/public') data = { business: { commercialName: 'Misky Challay' } };
    await route.fulfill({ json: { success: true, data } });
  });
  await page.addInitScript((user) => {
    localStorage.setItem('verde-bowl:accessToken', 'fleet-test');
    localStorage.setItem('verde-bowl:analytics-consent', 'rejected');
    localStorage.setItem('verde-bowl:state', JSON.stringify({ auth: { user, isAuthenticated: true, status: 'succeeded', error: null }, cart: { items: [] }, favorites: { items: [] } }));
  }, user);
  await page.setViewportSize({ width, height: 950 });
  await page.goto('/admin/reparto');
  await page.getByText('Entrega en auto para todas las tortas', { exact: true }).click();
  await expect(page.getByText(/Registra un conductor con auto/)).toBeVisible();
  await page.getByRole('combobox', { name: 'Vehículo de Conductor de prueba', exact: true }).click();
  await page.getByRole('option', { name: 'Auto', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar vehículo', exact: true }).click();
  await expect.poll(() => vehicleType).toBe('CAR');
  const defaults = page.getByRole('spinbutton', { name: 'Cupos de auto predeterminados', exact: true });
  await expect(defaults).toHaveValue('10');
  await defaults.fill('4');
  await page.getByRole('button', { name: 'Aplicar a franjas abiertas', exact: true }).click();
  const count = page.getByRole('spinbutton', { name: /Cupos de auto (?!predeterminados)/ });
  await expect(count).toHaveValue('4');
  await count.fill('2');
  await page.getByRole('button', { name: 'Guardar cupos e indicaciones', exact: true }).click();
  await expect.poll(() => saved).toBe(true);
  expect(slot.carCapacity).toBe(2);
  expect(defaultCarCapacity).toBe(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});
