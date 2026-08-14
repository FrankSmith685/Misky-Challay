import { expect, test, type Page } from '@playwright/test';

const expectNoHorizontalOverflow = async (page: Page) => {
  const size = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(size.scroll).toBeLessThanOrEqual(size.width + 1);
};

test.describe('Constructor de bowl mejorado', () => {
  test('guía la selección y actualiza el resumen', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/arma-tu-bowl');

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: /Arma un bowl que se sienta realmente tuyo/i,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Elige el tamaño de tu bowl' }),
    ).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Progreso del bowl' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Así va tu bowl' })).toBeVisible();

    const firstOption = page.locator('[data-option-id][aria-disabled="false"], [data-option-id]:not([aria-disabled="true"])').first();
    await expect(firstOption).toBeVisible();
    await firstOption.click();
    await expect(firstOption).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(/ingrediente|selección/i).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('mantiene el flujo usable y compacto en móvil', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/arma-tu-bowl');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Tu progreso')).toBeVisible();
    await expect(page.getByText(/Tu bowl está esperando|ingredientes elegidos/)).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const excessiveRadius = await page
      .locator('main section, main article, main button, main aside > div, main details')
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
