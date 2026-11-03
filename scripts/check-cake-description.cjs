/* Browser check: real configurator, simulated image provider, no orders or AI calls. */
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const base = 'http://127.0.0.1:5173';
const out = path.join(root, 'backend/tmp/photo-3d/description-preview-review');

(async () => {
  await fs.mkdir(out, { recursive: true });
  const products = (await (await fetch(`${base}/api/v1/catalog/products`)).json()).data;
  const product = products.find(item => item.cakeSaleMode === 'SEMI_CUSTOM');
  assert(product, 'No published customizable cake');
  const bytes = await fs.readFile(path.join(root, 'frontend/public/images/cakes/vanilla.png'));
  const dataUrl = `data:image/png;base64,${bytes.toString('base64')}`;
  const photo = await fs.readFile(path.join(root, 'frontend/public/images/brand/patisserie-chocolate-v1.jpg'));
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const requests = [], errors = [], writes = [];
  let capabilities = 0, reconstructionCalls = 0;
  let page;
  try {
    page = await browser.newPage({ viewport: { width: 1510, height: 940 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/v1/**', async route => {
      const request = route.request(), pathname = new URL(request.url()).pathname;
      if (pathname.endsWith('/cakes/visual-preview/capabilities')) { capabilities++; return route.fulfill({ json: { success: true, data: { enabled: true, maxPerHour: 12 } } }); }
      if (pathname.endsWith('/cakes/visual-preview')) {
        requests.push(request.postDataJSON());
        await new Promise(resolve => setTimeout(resolve, requests.length === 2 ? 4000 : 200));
        return route.fulfill({ json: { success: true, data: { dataUrl, mimeType: 'image/png' } } });
      }
      if (pathname.includes('/cakes/reconstructions')) { reconstructionCalls++; return route.abort(); }
      if (request.method() !== 'GET' && !pathname.endsWith('/customizations/quote')) { writes.push(`${request.method()} ${pathname}`); return route.abort(); }
      return route.continue();
    });
    await page.goto(`${base}/tortas/${product.slug}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const preview = page.getByRole('region', { name: 'Vista previa de tu torta', exact: true }); await preview.waitFor({ timeout: 120000 });
    const consent = page.getByRole('button', { name: 'Solo necesario', exact: true }); if (await consent.isVisible()) await consent.click();
    await page.locator('.cake-steps button').filter({ hasText: 'Personalización' }).click();
    const choose = async name => {
      const group = page.locator(`[data-cake-group-name="${name}"]`);
      const button = group.locator('h3 button');
      if (await button.getAttribute('aria-expanded') === 'false') await button.click();
      await group.locator('button[data-option-id]:enabled').first().click();
    };
    await choose('Sabores'); await choose('Relleno');
    await page.locator('.cake-steps button').filter({ hasText: 'Entrega' }).click();
    await page.locator('input[type="file"]').first().setInputFiles({ name: 'test-reference.jpg', mimeType: 'image/jpeg', buffer: photo });
    await preview.locator('[aria-label="Comparar propuesta y referencia"]').waitFor();
    const description = page.getByRole('textbox', { name: 'Descripción de tu torta (opcional)', exact: true });
    const first = 'Feliz cumpleaños para Pepe, tiene 15 años';
    const second = 'Cumpleaños de Ana, 18 años. Escribir «Feliz cumpleaños, Ana» y flores lilas.';
    const third = 'Para Lucía, 20 años. Escribir «Feliz cumpleaños, Lucía», colores rosa y blanco.';
    await description.fill(first);
    await preview.getByText(`Tu diseño: ${first}`, { exact: true }).waitFor();
    await page.waitForTimeout(3200); assert.equal(requests.length, 0); assert.equal(capabilities, 0);
    await preview.getByRole('button', { name: 'Generar propuesta con IA', exact: true }).click();
    await preview.getByRole('button', { name: 'Propuesta actualizada', exact: true }).waitFor();
    assert.equal(requests.length, 1); assert.equal(requests[0].description, first); assert(requests[0].referenceDataUrl);
    assert(await preview.getByRole('img', { name: `Diseño solicitado: ${first}`, exact: false }).count());
    await preview.screenshot({ path: path.join(out, 'description-summary.png') });
    await description.fill(second);
    await preview.getByRole('button', { name: 'Actualizar propuesta con IA', exact: true }).waitFor();
    assert.equal(await preview.locator(`img[src="${dataUrl}"]`).count(), 0, 'Old image represents changed description');
    await page.waitForTimeout(2500); assert.equal(requests.length, 1);
    await preview.getByRole('button', { name: 'Actualizar propuesta con IA', exact: true }).click();
    await preview.getByRole('button', { name: 'Generando propuesta…', exact: true }).waitFor();
    await description.fill(third);
    await preview.getByRole('button', { name: 'Terminando propuesta anterior…', exact: true }).waitFor();
    await preview.getByRole('button', { name: 'Actualizar propuesta con IA', exact: true }).waitFor({ timeout: 20000 });
    assert.equal(requests.length, 2); assert.equal(requests[1].description, second);
    assert.equal(await preview.locator(`img[src="${dataUrl}"]`).count(), 0, 'Obsolete response replaced current design');
    await preview.getByRole('button', { name: 'Actualizar propuesta con IA', exact: true }).click();
    await preview.getByRole('button', { name: 'Propuesta actualizada', exact: true }).waitFor();
    assert.equal(requests.length, 3); assert.equal(requests[2].description, third);
    await description.fill(first);
    await preview.getByRole('button', { name: 'Propuesta actualizada', exact: true }).waitFor();
    assert.equal(requests.length, 3, 'Returning to saved description called the provider');
    await page.setViewportSize({ width: 390, height: 844 }); await preview.scrollIntoViewIfNeeded();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(out, 'mobile-description.png') });
    assert.equal(reconstructionCalls, 0); assert.deepEqual(errors, []); assert.deepEqual(writes, []);
    const checks = { provider: 'SIMULATED', requestDescriptions: requests.map(request => request.description), referenceIncluded: requests.every(request => Boolean(request.referenceDataUrl)), noAutomaticCalls: true, updatedDescriptionRequiresClick: true, staleImageHidden: true, staleResponseIgnored: true, descriptionCacheReused: true, summaryShowsDescription: true, mobile: true, reconstructionCalls, errors, writes };
    await fs.writeFile(path.join(out, 'checks.json'), JSON.stringify(checks, null, 2)); console.log(JSON.stringify(checks));
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') });
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
