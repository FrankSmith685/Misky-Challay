import type { Page } from '@playwright/test';

export const checkoutTermsFixture = {
  version: 1, title: 'Términos y Condiciones',
  content: 'Condiciones de compra de prueba. El cliente revisa el total y la modalidad de entrega antes de confirmar.',
  acceptanceLabel: 'He leído y acepto los términos y condiciones de mi compra.',
  publishedAt: '2026-11-02T15:00:00.000Z',
};

export async function acceptCheckoutTerms(page: Page) {
  const summary = page.getByRole('region', { name: 'Resumen del pedido', exact: true });
  if (await summary.count()) {
    const toggle = summary.getByRole('button', { name: 'Resumen del pedido', exact: true });
    if (await toggle.count() && await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  }
  await page.locator('#checkout-terms-checkbox').check();
}
