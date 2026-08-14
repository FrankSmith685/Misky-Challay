import path from 'node:path';
import { config } from 'dotenv';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

config({ path: path.resolve(process.cwd(), 'backend/.env') });

const authenticate = async (page: Page, request: APIRequestContext) => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  test.skip(!email || !password, 'La prueba requiere las credenciales locales configuradas');

  const login = await request.post('http://127.0.0.1:4000/api/v1/auth/login', {
    data: { email, password },
  });
  expect(login.ok()).toBeTruthy();
  const payload = await login.json();
  await page.addInitScript(({ accessToken, refreshToken }) => {
    localStorage.setItem('verde-bowl:accessToken', accessToken);
    localStorage.setItem('verde-bowl:refreshToken', refreshToken);
  }, payload.data);
};

test('direcciones ofrece un flujo guiado, seguro y responsive', async ({ page, request }) => {
  await authenticate(page, request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/cuenta/direcciones');

  await expect(page.getByRole('heading', { level: 1, name: 'Mis direcciones' })).toBeVisible();

  const createButton = page
    .getByRole('button', {
      name: /Nueva dirección|Guardar mi primera dirección/,
    })
    .first();
  await createButton.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Nueva dirección' })).toBeVisible();
  await expect(dialog.getByText('Progreso de la dirección')).toBeVisible();
  await expect(dialog.getByText('1/3')).toBeVisible();
  await expect(dialog.getByLabel('Departamento')).toBeVisible();
  await expect(dialog.getByLabel('Provincia')).toBeVisible();
  await expect(dialog.getByLabel('Distrito')).toBeVisible();
  await expect(dialog.getByText(/Igual que en Cobertura/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Mi ubicación' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Guardar dirección' })).toBeDisabled();

  const deliveryDetails = dialog
    .getByRole('heading', { name: 'Detalles para el repartidor' })
    .locator('xpath=ancestor::section[1]')
    .locator('[data-form-stack]');
  await deliveryDetails.scrollIntoViewIfNeeded();
  const fieldGaps = await deliveryDetails.locator(':scope > *').evaluateAll((elements) =>
    elements.slice(1).map((element, index) => {
      const previous = elements[index].getBoundingClientRect();
      const current = element.getBoundingClientRect();
      return current.top - previous.bottom;
    }),
  );
  expect(fieldGaps.length).toBeGreaterThanOrEqual(2);
  expect(fieldGaps.every((gap) => gap >= 16)).toBeTruthy();

  const layout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewport + 1);

  const excessiveRadius = await dialog.locator('*').evaluateAll((elements) =>
    elements.flatMap((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2 || Math.abs(rect.width - rect.height) <= 1) return [];
      const styles = getComputedStyle(element);
      const radius = Math.max(
        Number.parseFloat(styles.borderTopLeftRadius) || 0,
        Number.parseFloat(styles.borderTopRightRadius) || 0,
        Number.parseFloat(styles.borderBottomRightRadius) || 0,
        Number.parseFloat(styles.borderBottomLeftRadius) || 0,
      );
      return radius > 5.1 ? [{ tag: element.tagName, className: element.className, radius }] : [];
    }),
  );
  expect(excessiveRadius).toEqual([]);
});

test('el GPS reemplaza la zona elegida por el UBIGEO detectado en el pin', async ({
  page,
  request,
  context,
}) => {
  await authenticate(page, request);
  await context.grantPermissions(['geolocation'], { origin: 'http://localhost:5173' });
  await context.setGeolocation({ latitude: -12.0566, longitude: -77.1181 });
  await page.route('**/api/v1/locations/reverse-address', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          id: 'gps-callao',
          label: 'Av. Sáenz Peña 123, Callao',
          line1: 'Av. Sáenz Peña 123',
          district: 'Callao',
          districtId: null,
          ubigeoCode: '070101',
          city: 'Callao',
          province: 'Callao',
          region: 'Callao',
          postcode: '07001',
          latitude: -12.0566,
          longitude: -77.1181,
          source: 'openstreetmap',
          precision: 'exact',
          hasHouseNumber: true,
        },
      }),
    });
  });

  await page.goto('/cuenta/direcciones');
  await page
    .getByRole('button', { name: /Nueva dirección|Guardar mi primera dirección/ })
    .first()
    .click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Zona obtenida desde las coordenadas')).toBeVisible();
  await expect(dialog.getByText('UBIGEO 070101')).toBeVisible();
  await expect(dialog.getByText('Callao', { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText(/Puedes guardar esta dirección/)).toBeVisible();
  await expect(dialog.getByText('3/3')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Guardar dirección' })).toBeEnabled();
});

test('el modal de cocinas también toma el UBIGEO desde el pin', async ({ page, request }) => {
  await authenticate(page, request);
  await page.route('**/api/v1/locations/reverse-address', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          id: 'pin-callao',
          label: 'Av. Sáenz Peña 123, Callao',
          line1: 'Av. Sáenz Peña 123',
          district: 'Callao',
          districtId: null,
          ubigeoCode: '070101',
          city: 'Callao',
          province: 'Callao',
          region: 'Callao',
          postcode: '07001',
          latitude: -12.0566,
          longitude: -77.1181,
          source: 'openstreetmap',
          precision: 'exact',
          hasHouseNumber: true,
        },
      }),
    });
  });

  await page.setViewportSize({ width: 1365, height: 768 });
  await page.goto('/admin/cobertura');
  await expect(page.getByRole('heading', { level: 1, name: 'Cobertura y cocinas' })).toBeVisible();
  await page.getByRole('button', { name: 'Nueva cocina' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Departamento')).toBeVisible();
  await expect(dialog.getByLabel('Provincia')).toBeVisible();
  await expect(dialog.getByLabel('Distrito')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Crear cocina' })).toBeDisabled();

  await dialog
    .getByRole('application', { name: 'Mapa interactivo para seleccionar la ubicación exacta' })
    .click({ position: { x: 220, y: 190 } });

  const unsupportedZone = dialog.getByText(/UBIGEO 070101 detectado.*fuera de los distritos/);
  await unsupportedZone.scrollIntoViewIfNeeded();
  await expect(unsupportedZone).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Crear cocina' })).toBeDisabled();
});
