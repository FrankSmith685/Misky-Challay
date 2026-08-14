import path from 'node:path';
import { config } from 'dotenv';
import { expect, test } from '@playwright/test';

config({ path: path.resolve(process.cwd(), 'backend/.env') });

test('el centro de configuracion es usable en movil', async ({ page, request }) => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  test.skip(!email || !password, 'La prueba requiere las credenciales locales del superadmin');

  const login = await request.post('http://127.0.0.1:4000/api/v1/auth/login', {
    data: { email, password },
  });
  expect(login.ok()).toBeTruthy();
  const payload = await login.json();

  await page.addInitScript(({ accessToken, refreshToken }) => {
    localStorage.setItem('verde-bowl:accessToken', accessToken);
    localStorage.setItem('verde-bowl:refreshToken', refreshToken);
  }, payload.data);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/configuracion-negocio');

  await expect(page.getByRole('heading', { name: 'Negocio y comunicaciones' })).toBeVisible();
  await page.getByRole('button', { name: /Correo y avisos/ }).click();
  await expect(page.getByRole('heading', { name: 'Servidor SMTP' })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
});
