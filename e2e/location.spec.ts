import { expect, test } from '@playwright/test';

test.describe('Direcciones y cobertura', () => {
  test('sugiere una dirección según distrito, la ubica y valida en el mapa', async ({ page }) => {
    await page.route('**/api/v1/locations/resolve-address', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'test-address',
            label: 'Av. José Larco 345, Miraflores, Lima, Perú',
            line1: 'Av. José Larco 345',
            district: 'Miraflores',
            districtId: 22,
            city: 'Lima',
            latitude: -12.1219,
            longitude: -77.0297,
            source: 'openstreetmap',
          },
        }),
      });
    });

    await page.goto('/cobertura');
    await expect(page.getByRole('heading', { name: /Llegamos a tu zona/i })).toBeVisible();

    await page.getByLabel('Distrito').click();
    await page.getByRole('option', { name: 'Miraflores', exact: true }).click();
    await page.getByLabel('Dirección exacta').fill('Av. José Larco 345');

    const suggestion = page.getByRole('option').filter({ hasText: 'Av. José Larco 345' }).first();
    await expect(suggestion).toContainText('Miraflores');
    await suggestion.click();
    await expect(page.getByText('-12.121900, -77.029700')).toBeVisible();

    await page.getByRole('button', { name: 'Verificar esta dirección' }).click();
    await expect(page.getByText(/Si llegamos a tu direccion/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Usar esta direccion' })).toBeEnabled();
  });

  test('un pin completa automáticamente la calle y el distrito', async ({ page }) => {
    await page.route('**/api/v1/locations/reverse-address', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'reverse-pin',
            label: 'Calle Porta 170, Miraflores, Lima, Perú',
            line1: 'Calle Porta 170',
            district: 'Miraflores',
            districtId: 22,
            city: 'Lima',
            latitude: -12.1222,
            longitude: -77.0301,
            source: 'openstreetmap',
            precision: 'exact',
            hasHouseNumber: true,
            distanceMeters: 8,
          },
        }),
      });
    });

    await page.goto('/cobertura');
    await page.locator('.leaflet-container').click({ position: { x: 190, y: 150 } });

    await expect(page.getByLabel('Dirección exacta')).toHaveValue('Calle Porta 170');
    await expect(page.getByText(/Dirección detectada: Calle Porta 170/i)).toBeVisible();
    await expect(page.locator('.verde-map-pin')).toBeVisible();
    await expect(page.getByText('Punto exacto').first()).toBeVisible();
    await expect(page.getByLabel('Distrito')).toContainText('Miraflores');
  });

  test('advierte cuando el proveedor no identifica el número de puerta', async ({ page }) => {
    await page.route('**/api/v1/locations/reverse-address', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: {
        id: 'approximate-pin', label: 'Avenida Arequipa, Lince, Lima', line1: 'Avenida Arequipa',
        district: 'Lince', districtId: 14, city: 'Lima', latitude: -12.09, longitude: -77.03,
        source: 'openstreetmap', precision: 'near', hasHouseNumber: false, distanceMeters: 35,
      } }),
    }));
    await page.goto('/cobertura');
    await page.locator('.leaflet-container').click({ position: { x: 180, y: 145 } });
    await expect(page.getByText(/No encontramos número de puerta/i)).toBeVisible();
    await expect(page.getByText(/No vemos un número de puerta/i)).toBeVisible();
  });

  test('ofrece recojo cercano cuando el punto queda fuera de cobertura', async ({ page }) => {
    await page.route('**/api/v1/locations/reverse-address', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {
        id: 'outside', label: 'Av. lejana 120, Lima', line1: 'Av. lejana 120', district: 'Miraflores', districtId: 22,
        city: 'Lima', latitude: -12.2, longitude: -77.1, source: 'openstreetmap', precision: 'exact', hasHouseNumber: true,
      } }),
    }));
    await page.route('**/api/v1/locations/coverage', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {
        covered: false, reason: 'Este punto está fuera del área exacta de entrega',
        nearestPickup: { id: 1, name: 'Verde Bowl Miraflores', addressLine: 'Av. Larco 345', distanceKm: 2.4, isOpenNow: true },
      } }),
    }));
    await page.goto('/cobertura');
    await page.locator('.leaflet-container').click({ position: { x: 180, y: 145 } });
    await page.getByRole('button', { name: 'Verificar esta dirección' }).click();
    await expect(page.getByText(/fuera del área exacta/i)).toBeVisible();
    await expect(page.getByText(/Verde Bowl Miraflores · 2.4 km/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Elegir recojo en tienda/i })).toBeEnabled();
  });

  test('permite continuar manualmente si se rechaza la geolocalización', async ({ page }) => {
    await page.goto('/cobertura');
    await page.getByRole('button', { name: 'Mi ubicacion' }).click();
    await expect(page.getByText(/No pudimos acceder a tu ubicacion/i)).toBeVisible();
    await expect(page.locator('.leaflet-container')).toBeVisible();
  });

  test('el modal global presenta el formulario por pasos', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Elige tu dirección' }).click();
    const dialog = page.getByRole('dialog', { name: /Donde entregamos tu pedido/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('1. Elige tu zona')).toBeVisible();
    await expect(dialog.getByText('2. Busca tu dirección')).toBeVisible();
    await expect(dialog.getByText('3. Confirma el punto')).toBeVisible();
  });
});
