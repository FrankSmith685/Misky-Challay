import { expect, test, type Page } from '@playwright/test';

type Notice = { message: string | null; severity?: 'success' | 'warning' | 'error' };
const notice = (page: Page) => page.locator('.MuiSnackbar-root');

async function openStore(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let data: unknown = [];
    if (path === '/settings/public')
      data = {
        business: {
          commercialName: 'Misky Challay',
          legalName: 'Prueba',
          ruc: '20600000000',
          phone: '999888777',
          whatsappPhone: '926749330',
          address: 'Lima',
          email: 'test@example.test',
          supportEmail: 'test@example.test',
          complaintResponseDays: 15,
        },
        receipts: { mode: 'INTERNAL_ONLY' },
      };
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/carrito');
  await expect(page.getByRole('heading', { name: 'Carrito', level: 1, exact: true })).toBeVisible();
}

async function publish(page: Page, messages: Notice[]) {
  await page.evaluate(async (items) => {
    const modulePath = '/src/components/mui/MuiToast.tsx';
    const { default: toast } = await import(modulePath);
    for (const item of items) {
      if (item.severity) toast[item.severity](item.message);
      else toast(item.message);
    }
  }, messages);
}

for (const width of [1440, 390])
  test(`la confirmación desaparece sola con hover, foco y cambio de ventana (${width}px)`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 950 });
    await openStore(page);
    await publish(page, [{ severity: 'success', message: 'Pedido cancelado' }]);
    await expect(notice(page)).toContainText('Pedido cancelado');
    await notice(page).hover();
    await notice(page).getByRole('button', { name: 'Cerrar aviso' }).focus();
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(notice(page)).toBeHidden({ timeout: 5500 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('toast-closed.png') });
  });

for (const severity of ['warning', 'error'] as const)
  test(`${severity} conserva seis segundos para leer y también se cierra sin intervención`, async ({
    page,
  }) => {
    await openStore(page);
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await publish(page, [{ severity, message: 'Revisa el estado de tu solicitud' }]);
    await expect(notice(page)).toBeVisible();
    await notice(page).hover();
    await page.clock.runFor(4500);
    await expect(notice(page)).toBeVisible();
    await page.clock.runFor(1600);
    await page.clock.runFor(400);
    await expect(notice(page)).toBeHidden();
  });

test('los avisos repetidos no reinician el plazo ni reaparecen después del cierre', async ({
  page,
}) => {
  await openStore(page);
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await publish(page, [{ severity: 'success', message: 'Cambios guardados' }]);
  await expect(notice(page)).toBeVisible();
  await page.clock.runFor(2500);
  await publish(
    page,
    Array.from({ length: 6 }, () => ({ severity: 'success', message: 'Cambios guardados' })),
  );
  await page.clock.runFor(1600);
  await page.clock.runFor(400);
  await expect(notice(page)).toBeHidden();
  await page.clock.runFor(12000);
  await expect(notice(page)).toBeHidden();
});

test('el cierre repetido no elimina el siguiente aviso y cada turno tiene su propio reloj', async ({
  page,
}) => {
  await openStore(page);
  await publish(page, [
    { severity: 'success', message: 'Primero' },
    { severity: 'warning', message: 'Segundo' },
    { severity: 'error', message: 'Tercero' },
  ]);
  await expect(notice(page)).toContainText('Primero');
  const close = notice(page).getByRole('button', { name: 'Cerrar aviso' });
  await close.evaluate((button) => {
    button.click();
    window.setTimeout(() => button.click(), 80);
  });
  await expect(notice(page)).toContainText('Segundo');
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.clock.runFor(1000);
  await expect(notice(page)).toContainText('Segundo');
  await page.keyboard.press('Escape');
  await page.clock.runFor(400);
  await expect(notice(page)).toContainText('Tercero');
});

test('ignora mensajes vacíos y la barra indica una cuenta regresiva', async ({ page }) => {
  await openStore(page);
  await publish(page, [{ message: '   ' }, { severity: 'error', message: null }]);
  await expect(notice(page)).toHaveCount(0);
  await publish(page, [{ message: 'Información actualizada' }]);
  await expect(notice(page)).toBeVisible();
  const bar = notice(page).locator('.MuiLinearProgress-bar');
  await expect
    .poll(async () =>
      bar.evaluate((element) => {
        const transform = new DOMMatrixReadOnly(getComputedStyle(element).transform);
        return transform.a;
      }),
    )
    .toBeLessThan(0.9);
  await expect(notice(page)).toBeHidden({ timeout: 5000 });
});
