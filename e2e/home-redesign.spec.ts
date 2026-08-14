import { expect, test } from '@playwright/test';

const assertNoHorizontalOverflow = async (page: import('@playwright/test').Page) => {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
};

test.describe('Portada profesional', () => {
  test('presenta una jerarquia clara en escritorio', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: /Comer bien puede ser simple/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Explorar el menú/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Hoy tú decides cuánto quieres pensar' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'De tu antojo a tu puerta' })).toBeVisible();
    await expect(page.locator('main img').first()).toHaveJSProperty('complete', true);
    await assertNoHorizontalOverflow(page);
  });

  test('conserva acciones y lectura cómoda en móvil', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /Explorar el menú/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Crear mi bowl/ })).toBeVisible();
    await assertNoHorizontalOverflow(page);

    const excessiveRadius = await page.locator('main article, main button, main a').evaluateAll((elements) =>
      elements.flatMap((element) => {
        const style = getComputedStyle(element);
        const radius = Math.max(...style.borderRadius.split(' ').map((value) => Number.parseFloat(value) || 0));
        return radius > 5.1 ? [{ tag: element.tagName, className: element.className, radius }] : [];
      }),
    );
    expect(excessiveRadius).toEqual([]);
  });
});
