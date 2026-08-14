import path from 'node:path';
import { config } from 'dotenv';
import { expect, test } from '@playwright/test';

config({ path: path.resolve(process.cwd(), 'backend/.env') });

test.beforeEach(async ({ page, request }) => {
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
});

test('el perfil organiza datos, preferencias y seguridad en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/cuenta/perfil');

  await expect(page.getByRole('heading', { level: 1, name: 'Mi perfil' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Datos personales' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Perfil alimentario' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Contraseña y seguridad' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar datos' })).toBeDisabled();
  await expect(page.getByRole('navigation', { name: 'Secciones del perfil' })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);

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

test('seguridad mantiene campos separados y controles claros en escritorio', async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 768 });
  await page.goto('/cuenta/perfil');

  const summary = page.locator('[aria-labelledby="profile-summary-title"]');
  await expect(summary).toBeVisible();
  expect(await summary.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain(
    'linear-gradient',
  );

  const currentPassword = page.getByLabel('Contraseña actual');
  const newPassword = page.getByLabel('Nueva contraseña', { exact: true });
  const confirmation = page.getByLabel('Confirma la nueva contraseña', { exact: true });
  await currentPassword.scrollIntoViewIfNeeded();

  const [personalCardBox, securityCardBox, currentBox, newBox, confirmationBox] = await Promise.all(
    [
      page.locator('#datos-personales').boundingBox(),
      page.locator('#seguridad').boundingBox(),
      currentPassword.boundingBox(),
      newPassword.boundingBox(),
      confirmation.boundingBox(),
    ],
  );
  expect(personalCardBox).not.toBeNull();
  expect(securityCardBox).not.toBeNull();
  expect(Math.abs(personalCardBox!.x - securityCardBox!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(personalCardBox!.width - securityCardBox!.width)).toBeLessThanOrEqual(1);
  expect(currentBox).not.toBeNull();
  expect(newBox).not.toBeNull();
  expect(confirmationBox).not.toBeNull();
  expect(newBox!.y).toBeGreaterThan(currentBox!.y + currentBox!.height + 12);
  expect(Math.abs(confirmationBox!.y - newBox!.y)).toBeLessThanOrEqual(2);
  expect(confirmationBox!.x).toBeGreaterThan(newBox!.x + newBox!.width + 12);

  await page.getByRole('button', { name: 'Mostrar contraseñas' }).click();
  await expect(currentPassword).toHaveAttribute('type', 'text');
  await expect(newPassword).toHaveAttribute('type', 'text');
  await expect(confirmation).toHaveAttribute('type', 'text');

  await currentPassword.fill('ClaveActual1!');
  await newPassword.fill('NuevaClave2!');
  await confirmation.fill('NuevaClave2!');
  await expect(page.getByText('Las contraseñas coinciden')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Actualizar contraseña' })).toBeEnabled();

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
});
