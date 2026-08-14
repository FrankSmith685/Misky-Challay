import { expect, test, type Page } from '@playwright/test';

const expectNoHorizontalOverflow = async (page: Page) => {
  const size = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(size.scroll).toBeLessThanOrEqual(size.width + 1);
};

test.describe('Planes mejorados', () => {
  test('explica la recarga y dirige al inicio de sesión antes de comprar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/planes');

    await expect(
      page.getByRole('heading', { level: 1, name: /Haz que tu presupuesto rinda más/i }),
    ).toBeVisible();
    await expect(page.getByText('Pagas una vez').first()).toBeVisible();
    await expect(page.getByText('Saldo recibido').first()).toBeVisible();
    await expect(page.getByText('Pago único · no se renovará automáticamente').first()).toBeVisible();
    await expect(page.locator('[aria-label^="Resumen económico de"]')).not.toHaveCount(0);

    await page.getByRole('button', { name: /Iniciar sesión para elegir/i }).first().click();
    await expect(page).toHaveURL(/\/ingresar/);
  });

  test('mantiene comparación y preguntas frecuentes usables en móvil', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/planes');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Elige cuánto quieres recargar' })).toBeVisible();
    await expect(page.getByText('¿Qué pasa si compro otro plan antes de que venza el actual?')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const excessiveRadius = await page
      .locator('main section, main article, main button, main details, main a')
      .evaluateAll((elements) =>
        elements.flatMap((element) => {
          const radius = Math.max(
            ...getComputedStyle(element)
              .borderRadius.split(' ')
              .map((value) => Number.parseFloat(value) || 0),
          );
          return radius > 5.1
            ? [{ tag: element.tagName, className: element.className, radius }]
            : [];
        }),
      );
    expect(excessiveRadius).toEqual([]);
  });
});
