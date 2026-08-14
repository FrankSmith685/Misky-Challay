import path from 'node:path';
import { config } from 'dotenv';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

config({ path: path.resolve(process.cwd(), 'backend/.env') });

const expectNoHorizontalOverflow = async (page: Page) => {
  const size = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(size.scroll).toBeLessThanOrEqual(size.width + 1);
};

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

test('cobertura presenta un flujo claro y compacto en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/cobertura');

  await expect(page.getByRole('heading', { level: 1, name: /Tu bowl, desde la cocina/i })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: '¿Llegamos a tu dirección?' })).toBeVisible();
  await expect(page.getByText('Tu progreso')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('cobertura conserva separación visible entre beneficios, avisos y acciones', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('verde-bowl:purchase-context:v2', JSON.stringify({
      cityId: 1,
      branchId: 1,
      address: null,
      deliveryType: 'PICKUP',
      serviceMode: 'ASAP',
      scheduledSlotId: null,
      pickupBranch: {
        id: 1,
        name: 'Verde Bowl Miraflores',
        addressLine: 'Av. José Larco 345, Miraflores',
        distanceKm: 3.45,
      },
    }));
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/cobertura');

  const signals = page.getByRole('list').filter({ hasText: 'Validación por ubicación exacta' });
  const heroAction = page.getByRole('link', { name: 'Revisar mi dirección' });
  const pickupNotice = page.getByTestId('pickup-no-address-notice');
  const pickupAction = page.getByRole('button', { name: 'Cambiar local o usar delivery' });
  const [signalsBox, heroActionBox, noticeBox, pickupActionBox] = await Promise.all([
    signals.boundingBox(),
    heroAction.boundingBox(),
    pickupNotice.boundingBox(),
    pickupAction.boundingBox(),
  ]);

  expect(signalsBox).not.toBeNull();
  expect(heroActionBox).not.toBeNull();
  expect(noticeBox).not.toBeNull();
  expect(pickupActionBox).not.toBeNull();
  expect(heroActionBox!.y - (signalsBox!.y + signalsBox!.height)).toBeGreaterThanOrEqual(16);
  expect(pickupActionBox!.y - (noticeBox!.y + noticeBox!.height)).toBeGreaterThanOrEqual(16);
});

test('todas las secciones de cuenta comparten navegación y diseño responsive', async ({ page, request }) => {
  await authenticate(page, request);
  await page.setViewportSize({ width: 390, height: 844 });

  const routes = [
    ['/cuenta/perfil', 'Mi perfil'],
    ['/cuenta/direcciones', 'Mis direcciones'],
    ['/cuenta/pedidos', 'Mis pedidos'],
    ['/cuenta/saldo', 'Mi saldo'],
    ['/cuenta/favoritos', 'Mis favoritos'],
    ['/cuenta/bowls-guardados', 'Bowls guardados'],
  ] as const;

  for (const [route, title] of routes) {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole('navigation').filter({ has: page.getByText('Mi perfil') })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }

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
