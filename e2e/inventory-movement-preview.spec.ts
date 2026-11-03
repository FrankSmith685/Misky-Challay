import path from 'node:path';
import { config } from 'dotenv';
import { expect, test } from '@playwright/test';

config({ path: path.resolve(process.cwd(), 'backend/.env') });

test('inventario explica y valida el efecto de un movimiento antes de guardarlo', async ({ page, request }) => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  test.skip(!email || !password, 'Requiere las credenciales locales del administrador');

  const login = await request.post('http://127.0.0.1:4000/api/v1/auth/login', {
    data: { email, password },
  });
  expect(login.ok()).toBeTruthy();
  const payload = await login.json();
  const invalidMovement = await request.post('http://127.0.0.1:4000/api/v1/operations/inventory/adjust', {
    headers: { Authorization: `Bearer ${payload.data.accessToken}` },
    data: { branchId: 1, inventoryItemId: 999999, type: 'WASTE', quantity: 0.001, reason: 'Prueba de precisión' },
  });
  expect(invalidMovement.status()).toBe(400);
  expect((await invalidMovement.json()).code).toBe('VALIDATION_ERROR');
  await page.addInitScript(({ accessToken, refreshToken }) => {
    localStorage.setItem('verde-bowl:accessToken', accessToken);
    localStorage.setItem('verde-bowl:refreshToken', refreshToken);
  }, payload.data);
  await page.setViewportSize({ width: 390, height: 844 });

  // La tabla está simulada: esta prueba nunca modifica el inventario real.
  await page.route('**/api/v1/operations/inventory?*', async (route) => {
    await route.fulfill({ json: { success: true, data: [{
      inventoryItemId: 999999, code: 'INS-PRUEBA', name: 'Azúcar de prueba', unit: 'kg', imageUrl: null,
      onHand: 3.5, reserved: 1.5, available: 2, unitCost: 8, averageUnitCost: 8, stockValue: 28,
      minLevel: 1, isLow: false, stockStatus: 'HEALTHY', consumedLast7Days: 0, averageDailyUsage: 0,
      daysRemaining: null, targetLevel: 2, suggestedPurchase: 0, impactedOptions: [], suggestedSubstitutes: [],
    }] } });
  });
  await page.route('**/api/v1/operations/inventory/movements?*', async (route) => {
    await route.fulfill({ json: { success: true, data: [{
      id: 1, inventoryItemId: 999999, itemName: 'Azúcar de prueba', unit: 'kg',
      type: 'ADJUSTMENT', quantity: -0.5, onHandAfter: 3.5, reservedAfter: 0,
      totalCost: 0, reason: 'Conteo de prueba', orderId: null, purchaseOrderId: null,
      lotId: null, actorName: 'Ana López', createdAt: '2026-01-01T10:00:00.000Z',
    }] } });
  });

  await page.goto('/admin/inventario');
  await expect(page.getByRole('heading', { name: 'Inventario de insumos' })).toBeVisible();
  await expect(page.getByText('3. Prepara la compra')).toBeVisible();
  await page.getByText('Cómo se calculan las alertas, la cobertura y la compra sugerida').click();
  await expect(page.getByText('No representa dinero pagado ni ganancia.', { exact: false })).toBeVisible();
  await page.getByRole('tab', { name: 'Movimientos' }).click();
  await expect(page.getByText('Responsable: Ana López')).toBeVisible();
  await page.getByRole('tab', { name: 'Existencias' }).click();
  await page.getByRole('button', { name: 'Movimiento', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Qué hará el sistema')).toBeVisible();

  await dialog.getByLabel('Cantidad contada en cocina (kg)').fill('2');
  await expect(dialog.getByText('3.5 → 2 kg')).toBeVisible();
  await expect(dialog.getByText('2 → 0.5 kg')).toBeVisible();
  await expect(dialog.getByRole('status').getByText('1.5 kg', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Registrar movimiento' })).toBeDisabled();
  const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);

  await dialog.getByLabel('Cantidad contada en cocina (kg)').fill('1');
  await expect(dialog.getByRole('alert')).toContainText('reservados para pedidos');
  await expect(dialog.getByRole('button', { name: 'Registrar movimiento' })).toBeDisabled();

  await dialog.getByLabel('Cantidad contada en cocina (kg)').fill('2');
  await dialog.getByLabel('Motivo').fill('Conteo físico de cierre');
  await expect(dialog.getByRole('button', { name: 'Registrar movimiento' })).toBeEnabled();

  await dialog.getByLabel('Tipo').click();
  await page.getByRole('option', { name: 'Merma' }).click();
  await expect(dialog.getByLabel('Cantidad perdida (kg)')).toBeEmpty();
  await dialog.getByLabel('Cantidad perdida (kg)').fill('2.01');
  await expect(dialog.getByRole('alert')).toContainText('reservados para pedidos');
  await dialog.getByLabel('Cantidad perdida (kg)').fill('0.5');
  await expect(dialog.getByText('3.5 → 3 kg')).toBeVisible();
  await expect(dialog.getByText('2 → 1.5 kg')).toBeVisible();

  await dialog.getByLabel('Tipo').click();
  await page.getByRole('option', { name: 'Entrada manual' }).click();
  await expect(dialog.getByLabel('Cantidad que ingresa manualmente (kg)')).toBeEmpty();
  await dialog.getByLabel('Cantidad que ingresa manualmente (kg)').fill('1');
  await expect(dialog.getByText('3.5 → 4.5 kg')).toBeVisible();
  await expect(dialog.getByText('2 → 3 kg')).toBeVisible();
  await expect(dialog.getByText('No crea proveedor, orden de compra ni lote.', { exact: false })).toBeVisible();

  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await page.getByRole('button', { name: 'Nuevo insumo' }).click();
  const createDialog = page.getByRole('dialog');
  await expect(createDialog.getByLabel('Unidad de control')).toBeVisible();
  await createDialog.getByLabel('Unidad de control').click();
  await page.getByRole('option', { name: 'kg · kilogramos' }).click();
  await expect(createDialog.getByLabel('Costo (S/ por kg)')).toBeVisible();
  await createDialog.getByLabel('Unidad de control').click();
  await page.getByRole('option', { name: 'Otra unidad…' }).click();
  await createDialog.getByLabel('Especifica la unidad').fill('caja');
  await expect(createDialog.getByLabel('Costo (S/ por caja)')).toBeVisible();
  const mobileWidth = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(mobileWidth.content).toBeLessThanOrEqual(mobileWidth.viewport + 1);

  await page.setViewportSize({ width: 1440, height: 900 });
  const nameBox = await createDialog.getByLabel('Nombre del insumo').boundingBox();
  const selectorBox = await createDialog.getByLabel('Unidad de control').boundingBox();
  const customBox = await createDialog.getByLabel('Especifica la unidad').boundingBox();
  expect(nameBox && selectorBox && customBox).toBeTruthy();
  expect(Math.abs(selectorBox!.y - customBox!.y)).toBeLessThan(6);
  expect(nameBox!.width).toBeGreaterThan(selectorBox!.width * 1.8);
});
