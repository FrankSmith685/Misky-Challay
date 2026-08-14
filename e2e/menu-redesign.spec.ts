import { expect, test, type Page } from '@playwright/test';

const expectNoHorizontalOverflow = async (page: Page) => {
  const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(size.scroll).toBeLessThanOrEqual(size.width + 1);
};

test.describe('Menú mejorado', () => {
  test('permite descubrir, ordenar y restablecer filtros', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/menu');

    await expect(page.getByRole('heading', { level: 1, name: /Encuentra el bowl que encaja contigo/ })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Buscar platos o ingredientes' })).toBeVisible();
    await expect(page.getByText(/platos disponibles|plato disponible/).first()).toBeVisible();

    await page.getByRole('button', { name: /^Filtros/ }).click();
    await expect(page.getByText('Proteína mínima')).toBeVisible();
    await page.getByLabel('Ordenar').click();
    await page.getByRole('option', { name: 'Más proteína' }).click();

    await page.getByRole('searchbox', { name: 'Buscar platos o ingredientes' }).fill('producto-imposible-xyz-2026');
    await expect(page.getByText('No encontramos coincidencias', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Restablecer filtros' }).click();
    await expect(page.getByText(/platos disponibles|plato disponible/).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('mantiene filtros y productos usables en móvil', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/menu');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Buscar platos o ingredientes' })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const excessiveRadius = await page.locator('main article, main button, main a').evaluateAll((elements) =>
      elements.flatMap((element) => {
        const radius = Math.max(...getComputedStyle(element).borderRadius.split(' ').map((value) => Number.parseFloat(value) || 0));
        return radius > 5.1 ? [{ tag: element.tagName, className: element.className, radius }] : [];
      }),
    );
    expect(excessiveRadius).toEqual([]);
  });
});
