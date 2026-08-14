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

test('mis pedidos presenta historial, filtros y acciones sin desbordar en móvil', async ({ page, request }) => {
  await authenticate(page, request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/cuenta/pedidos');

  await expect(page.getByRole('heading', { level: 1, name: 'Mis pedidos' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Hacer un pedido' })).toBeVisible();

  const filters = page.getByRole('navigation', { name: 'Filtrar pedidos' });
  if (await filters.isVisible()) {
    await expect(page.getByRole('region', { name: 'Resumen de pedidos' })).toBeVisible();
    await expect(filters.getByRole('button', { name: /Todos/ })).toHaveAttribute('aria-pressed', 'true');
    await filters.getByRole('button', { name: /Entregados/ }).click();
    await expect(filters.getByRole('button', { name: /Entregados/ })).toHaveAttribute('aria-pressed', 'true');
  } else {
    await expect(page.getByText('Todavía no tienes pedidos')).toBeVisible();
  }

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
