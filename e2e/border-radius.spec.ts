import { expect, test } from '@playwright/test';

const PUBLIC_ROUTES = [
  '/',
  '/menu',
  '/arma-tu-bowl',
  '/planes',
  '/cobertura',
  '/carrito',
  '/ingresar',
  '/registro',
] as const;

test.describe('Radio visual global', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} no supera 5px en elementos rectangulares`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      const violations = await page.locator('body *').evaluateAll((elements) =>
        elements.flatMap((element) => {
          const node = element as HTMLElement;
          const rect = node.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) return [];

          // Avatares, indicadores, iconos y decoraciones realmente circulares
          // conservan su geometría. El límite de 5px aplica a superficies rectangulares.
          if (Math.abs(rect.width - rect.height) <= 1) return [];

          const styles = getComputedStyle(node);
          const radii = [
            styles.borderTopLeftRadius,
            styles.borderTopRightRadius,
            styles.borderBottomRightRadius,
            styles.borderBottomLeftRadius,
          ].map((value) => Number.parseFloat(value) || 0);
          const maximum = Math.max(...radii);
          if (maximum <= 5.01) return [];

          return [{
            tag: node.tagName.toLowerCase(),
            className: String(node.className).slice(0, 160),
            label: (node.getAttribute('aria-label') || node.textContent || '').trim().slice(0, 80),
            maximum,
          }];
        }),
      );

      expect(violations.slice(0, 20), JSON.stringify(violations.slice(0, 20), null, 2)).toEqual([]);
    });
  }
});
