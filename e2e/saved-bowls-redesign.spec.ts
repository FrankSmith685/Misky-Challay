import path from 'node:path';
import { config } from 'dotenv';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

config({ path: path.resolve(process.cwd(), 'backend/.env') });

const authenticate = async (page: Page, request: APIRequestContext) => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  test.skip(!email || !password, 'La prueba requiere las credenciales locales configuradas');
  const login = await request.post('http://127.0.0.1:4000/api/v1/auth/login', { data: { email, password } });
  expect(login.ok()).toBeTruthy();
  const payload = await login.json();
  await page.addInitScript(({ accessToken, refreshToken }) => {
    localStorage.setItem('verde-bowl:accessToken', accessToken);
    localStorage.setItem('verde-bowl:refreshToken', refreshToken);
  }, payload.data);
};

test('bowls guardados muestra ingredientes y disponibilidad en móvil', async ({ page, request }) => {
  await authenticate(page, request);
  await page.route('**/api/v1/account/saved-bowls', async (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: [{
      id: 99001,
      name: 'Mi bowl energético',
      productId: 501,
      variantId: 601,
      selections: [{ optionId: 701, quantity: 1 }, { optionId: 702, quantity: 2 }],
      product: { id: 501, name: 'Bowl a tu manera', slug: 'bowl-prueba', imageUrl: null },
      variant: { id: 601, name: 'Regular', basePrice: 24.9 },
      updatedAt: '2026-08-01T15:00:00.000Z',
    }] }),
  }));
  await page.route('**/api/v1/customizations/501*', async (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: {
      product: { id: 501, name: 'Bowl a tu manera', slug: 'bowl-prueba', type: 'CUSTOMIZABLE', imageUrl: null, imageAlt: null, imagePosition: 'center' },
      variants: [{ id: 601, name: 'Regular', basePrice: 24.9, isDefault: true, nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0 } }],
      groups: [{ id: 801, code: 'BASE', name: 'Ingredientes', description: null, selectionType: 'MULTIPLE', minSelection: 1, maxSelection: 4, freeQuantity: 1, sortOrder: 1, options: [
        { id: 701, name: 'Quinua tricolor', description: null, imageUrl: null, imageAlt: null, imagePosition: 'center', dietaryTags: [], allergens: [], spiceLevel: 0, priceDelta: 0, chargeAlways: false, nutrition: { calories: 100, protein: 4, carbs: 20, fat: 2 }, maxPerItem: 1, isAvailable: true, incompatibleWith: [], incompatibilities: [] },
        { id: 702, name: 'Pollo teriyaki', description: null, imageUrl: null, imageAlt: null, imagePosition: 'center', dietaryTags: [], allergens: [], spiceLevel: 0, priceDelta: 4, chargeAlways: false, nutrition: { calories: 180, protein: 24, carbs: 4, fat: 6 }, maxPerItem: 2, isAvailable: false, incompatibleWith: [], incompatibilities: [] },
      ] }],
      presets: [],
    } }),
  }));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/cuenta/bowls-guardados');

  await expect(page.getByRole('heading', { level: 1, name: 'Bowls guardados' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Resumen de bowls guardados' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mi bowl energético' })).toBeVisible();
  await expect(page.getByText('Quinua tricolor')).toBeVisible();
  await expect(page.getByText(/Pollo teriyaki/)).toBeVisible();
  await expect(page.getByText(/no está disponible en la cocina seleccionada/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agregar al carrito' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Personalizar' })).toBeEnabled();

  await page.getByLabel('Buscar receta o ingrediente').fill('quinua');
  await expect(page.getByRole('heading', { name: 'Mi bowl energético' })).toBeVisible();
  await page.getByLabel('Buscar receta o ingrediente').fill('inexistente');
  await expect(page.getByText('No encontramos esa receta')).toBeVisible();

  const layout = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, pageWidth: document.documentElement.scrollWidth }));
  expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewport + 1);

  const excessiveRadius = await page.locator('#account-content *').evaluateAll((elements) => elements.flatMap((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2 || Math.abs(rect.width - rect.height) <= 1) return [];
    const styles = getComputedStyle(element);
    const radius = Math.max(Number.parseFloat(styles.borderTopLeftRadius) || 0, Number.parseFloat(styles.borderTopRightRadius) || 0, Number.parseFloat(styles.borderBottomRightRadius) || 0, Number.parseFloat(styles.borderBottomLeftRadius) || 0);
    return radius > 5.1 ? [{ tag: element.tagName, className: element.className, radius }] : [];
  }));
  expect(excessiveRadius).toEqual([]);
});
