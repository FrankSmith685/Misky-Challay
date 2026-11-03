import { expect, test, type Page } from '@playwright/test';

const expectNoHorizontalOverflow = async (page: Page) => {
  const size = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(size.scroll).toBeLessThanOrEqual(size.width + 1);
};

test.describe('Detalle de producto mejorado', () => {
  test('muestra contexto, nutrición y permite agregar el producto', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/menu/bowl-pollo-teriyaki');
    const cookieChoice = page.getByRole('button', { name: 'Solo necesario' });
    if (await cookieChoice.isVisible()) await cookieChoice.click();

    await expect(
      page.getByRole('heading', { level: 1, name: /Bowl.*pollo.*teriyaki/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Elige tu tamaño' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Lo que contiene tu elección' }),
    ).toBeVisible();
    await expect(page.getByText('Confirma dónde recibirás tu pedido')).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Presentación' })).toBeVisible();

    await page.getByRole('button', { name: /Agregar al carrito/i }).click();
    await expect(page.getByText(/agregado al carrito/i).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('mantiene información y compra accesibles en móvil', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/menu/bowl-pollo-teriyaki');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Disponible para pedir')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Agregar', exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const excessiveRadius = await page
      .locator('main section, main article, main button, main nav, main [role="group"] > button')
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
