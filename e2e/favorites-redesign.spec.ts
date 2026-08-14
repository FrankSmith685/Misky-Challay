import path from 'node:path';
import { config } from 'dotenv';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

config({ path: path.resolve(process.cwd(), 'backend/.env') });

const authenticateWithFavorites = async (page: Page, request: APIRequestContext) => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  test.skip(!email || !password, 'La prueba requiere las credenciales locales configuradas');

  const login = await request.post('http://127.0.0.1:4000/api/v1/auth/login', {
    data: { email, password },
  });
  expect(login.ok()).toBeTruthy();
  const payload = await login.json();
  await page.addInitScript(({ accessToken, refreshToken, user }) => {
    localStorage.setItem('verde-bowl:accessToken', accessToken);
    localStorage.setItem('verde-bowl:refreshToken', refreshToken);
    localStorage.setItem('verde-bowl:state', JSON.stringify({
      auth: { user, isAuthenticated: true, status: 'succeeded', error: null },
      favorites: {
        items: [
          { productId: 91001, slug: 'bowl-favorito-prueba', name: 'Bowl Mediterráneo', imageUrl: null, priceFrom: 29.9, type: 'FIXED' },
          { productId: 91002, slug: 'bowl-personalizable-prueba', name: 'Mi bowl personalizado', imageUrl: null, priceFrom: 24.9, type: 'CUSTOMIZABLE' },
        ],
      },
    }));
  }, payload.data);
};

test('favoritos permite buscar y filtrar una colección responsive', async ({ page, request }) => {
  await authenticateWithFavorites(page, request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/cuenta/favoritos');

  await expect(page.getByRole('heading', { level: 1, name: 'Mis favoritos' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Resumen de favoritos' })).toBeVisible();
  await expect(page.getByText('Bowl Mediterráneo')).toBeVisible();
  await expect(page.getByText('Mi bowl personalizado')).toBeVisible();

  const filters = page.getByRole('navigation', { name: 'Filtrar favoritos' });
  await filters.getByRole('button', { name: /Personalizables/ }).click();
  await expect(filters.getByRole('button', { name: /Personalizables/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Mi bowl personalizado')).toBeVisible();
  await expect(page.getByText('Bowl Mediterráneo')).toBeHidden();

  await filters.getByRole('button', { name: /Todos/ }).click();
  await page.getByLabel('Buscar en favoritos').fill('mediterráneo');
  await expect(page.getByText('Bowl Mediterráneo')).toBeVisible();
  await expect(page.getByText('Mi bowl personalizado')).toBeHidden();

  const layout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewport + 1);

  const excessiveRadius = await page.locator('#account-content *').evaluateAll((elements) =>
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
