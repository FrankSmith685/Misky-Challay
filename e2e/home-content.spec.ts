import { expect, test } from '@playwright/test';
import { setupStorefront, noOverflow, contentDefaults } from './fixtures/storefront';

for (const width of [1440, 390]) {
  test(`inicio orienta al visitante y muestra el catálogo real (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await setupStorefront(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(contentDefaults.hero.title);
    const primary = page.getByRole('link', { name: 'Personalizar mi torta', exact: true });
    const iconGap = await primary.evaluate((button) => {
      const icon = button.querySelector('.MuiButton-startIcon')!.getBoundingClientRect();
      const label = button.querySelector('.whitespace-normal')!.getBoundingClientRect();
      return label.left - icon.right;
    });
    expect(iconGap).toBeGreaterThanOrEqual(7);
    await page.screenshot({ path: `test-results-home-content/home-hero-${width}.png` });
    await expect(
      page.getByRole('link', { name: 'Personalizar mi torta', exact: true }),
    ).toHaveAttribute('href', '/crea-tu-torta');
    await expect(page.getByRole('link', { name: /Primera vez/ })).toHaveAttribute(
      'href',
      '/como-hacer-tu-pedido',
    );
    await expect(page.getByRole('heading', { name: 'Tu pedido, en tres pasos' })).toBeVisible();
    await expect(page.getByRole('main')).toContainText('S/ 75.00');
    await expect(page.getByRole('link', { name: 'Ver para empresas' })).toHaveAttribute(
      'href',
      '/empresas',
    );
    await page.getByText('¿Cómo funciona el pago con Yape o Plin?', { exact: true }).click();
    await expect(
      page.getByText(/Subir una constancia no confirma el pago automáticamente/),
    ).toBeVisible();
    const images = page.locator('main img');
    for (const img of await images.all()) {
      await img.scrollIntoViewIfNeeded();
      await expect(img).toHaveJSProperty('complete', true);
      expect(await img.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
      await expect(img).toHaveAttribute('alt', /.+/);
    }
    await expect(page).toHaveTitle(contentDefaults.seo.homeTitle);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      contentDefaults.seo.homeDescription,
    );
    expect(
      new URL((await page.locator('link[rel="canonical"]').getAttribute('href'))!).pathname,
    ).toBe('/');
    await page.screenshot({ path: `test-results-home-content/home-${width}.png`, fullPage: true });
    await noOverflow(page);
  });

  test(`guía pública explica entrega, pago y seguimiento (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await setupStorefront(page);
    await page.goto('/como-hacer-tu-pedido');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(contentDefaults.guide.title);
    await expect(page.locator('[id^="paso-"]')).toHaveCount(6);
    await page
      .getByRole('navigation', { name: 'Pasos de la guía' })
      .getByRole('link', { name: /Completa y reporta/ })
      .click();
    await expect(page).toHaveURL(/#paso-5$/);
    await expect(page.locator('#paso-5')).toContainText('no vuelvas a transferir si ya pagaste');
    await expect(page).toHaveTitle(contentDefaults.seo.guideTitle);
    const structured = JSON.parse(
      (await page.locator('#storefront-structured-data').textContent())!,
    );
    expect(structured['@type']).toBe('WebPage');
    await noOverflow(page);
    await page.screenshot({ path: `test-results-home-content/guide-${width}.png`, fullPage: true });
  });
}

test('contenido de reserva mantiene la orientación si falla el API', async ({ page }) => {
  await setupStorefront(page, { fail: true });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(contentDefaults.hero.title);
  await expect(page.getByRole('link', { name: /Primera vez/ })).toBeVisible();
});

test('editor publica textos, orden y visibilidad; persisten al recargar', async ({ page }) => {
  const server = await setupStorefront(page, { admin: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/admin/contenido-inicio');
  await expect(page.getByRole('heading', { level: 1, name: 'Contenido del inicio' })).toBeVisible();
  await page.screenshot({ path: 'test-results-home-content/editor-desktop.png' });
  const nav = page.getByRole('navigation', { name: 'Editar contenido' });
  await page.getByRole('switch', { name: 'Mostrar Más formas de compartir' }).uncheck();
  await page.getByRole('button', { name: 'Subir Así puedes crear tu torta', exact: true }).click();
  await nav.getByRole('button', { name: 'Presentación', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Título principal (H1)' })
    .fill('Una torta para tu próxima celebración');
  await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { level: 1 })).toHaveText(
    'Una torta para tu próxima celebración',
  );
  await expect(dialog.getByRole('heading', { name: 'Más formas de compartir' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cerrar' }).click();
  await nav.getByRole('button', { name: 'Guía completa', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Título de la guía', exact: true })
    .fill('Guía para elegir y recibir tu torta');
  await nav.getByRole('button', { name: 'Buscadores y enlaces', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Título SEO del inicio' })
    .fill('Pastelería y tortas | Misky Challay');
  await page.getByRole('button', { name: 'Publicar cambios', exact: true }).click();
  await expect(page.getByText('Contenido publicado', { exact: true })).toBeVisible();
  expect(server.writes).toBe(1);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Título SEO del inicio' })).toHaveValue(
    'Pastelería y tortas | Misky Challay',
  );
  await page.getByRole('link', { name: 'Ver inicio', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Una torta para tu próxima celebración',
  );
  await expect(page.getByRole('heading', { name: 'Más formas de compartir' })).toHaveCount(0);
  const headings = await page.locator('main h2').allTextContents();
  expect(headings.indexOf('Así puedes crear tu torta')).toBeLessThan(
    headings.indexOf('Tu pedido, en tres pasos'),
  );
  await expect(page).toHaveTitle('Pastelería y tortas | Misky Challay');
  await page.goto('/como-hacer-tu-pedido');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Guía para elegir y recibir tu torta',
  );
});

test('editor conserva borrador ante conflicto y avisa al salir', async ({ page }) => {
  const server = await setupStorefront(page, { admin: true });
  await page.goto('/admin/contenido-inicio?tab=hero');
  const title = page.getByRole('textbox', { name: 'Título principal (H1)' });
  await title.fill('Mi borrador de portada');
  server.conflict = true;
  await page.getByRole('button', { name: 'Publicar cambios', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Otra persona actualizó');
  await expect(title).toHaveValue('Mi borrador de portada');
  expect(server.writes).toBe(0);
  await page.getByRole('link', { name: 'Ver inicio', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Tienes cambios sin publicar' })).toBeVisible();
  await page.getByRole('button', { name: 'Seguir editando', exact: true }).click();
  await expect(title).toHaveValue('Mi borrador de portada');
});

test('editor móvil permite editar y rechaza enlaces inseguros sin publicar', async ({ page }) => {
  const server = await setupStorefront(page, { admin: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/contenido-inicio?tab=guide');
  await page.getByRole('textbox', { name: 'Video explicativo' }).fill('http://example.test/video');
  await page.getByRole('button', { name: 'Publicar cambios', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('HTTPS');
  expect(server.writes).toBe(0);
  await noOverflow(page);
  await page.screenshot({ path: 'test-results-home-content/editor-mobile.png', fullPage: true });
});
