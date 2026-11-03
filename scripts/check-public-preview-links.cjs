/* Verify public QR destinations locally without publishing a share or calling AI. */
const { chromium } = require('@playwright/test');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const base = 'http://127.0.0.1:5173';

(async () => {
  const configured = (await fs.readFile(path.join(root, 'backend/.env'), 'utf8')).match(/^FRONTEND_URL\s*=\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
  const origin = new URL(process.env.PUBLIC_PREVIEW_ORIGIN || configured).origin;
  assert.equal(new URL(origin).protocol, 'https:');
  const output = path.join(root, 'backend/tmp/public-preview-links-review');
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], writes = [];
  const token = 'C'.repeat(24);
  try {
    const page = await browser.newPage({ viewport: { width: 1365, height: 950 }, acceptDownloads: true });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/v1/**', route => {
      const request = route.request(), pathname = new URL(request.url()).pathname;
      if (request.method() !== 'GET') { writes.push(`${request.method()} ${pathname}`); return route.abort(); }
      if (pathname.endsWith(`/cake-previews/${token}`)) return route.fulfill({ json: { success: true, data: {
        snapshot: { productId: 1, productSlug: 'test-cake', productName: 'Torta de prueba', variantId: 1, variantName: '18 cm', servings: 12, diameterCm: 18, themeName: null, themeSlug: null, options: [] },
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      } } });
      return route.fulfill({ status: 503, json: { success: false, message: 'Read omitted in QR check' } });
    });
    await page.goto(`${base}/experiencia-ar`, { waitUntil: 'networkidle', timeout: 120000 });
    const consent = page.getByRole('button', { name: 'Solo necesario', exact: true }); if (await consent.isVisible()) await consent.click();
    const generatedUrl = await page.evaluate(async token => {
      const { cakePreviewUrl } = await import('/src/features/cakes/utils/cakePreviewLinks.ts');
      return cakePreviewUrl(token);
    }, token);
    assert.equal(generatedUrl, `${origin}/vista-3d/${token}`, 'Share made from localhost points to wrong origin');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar tarjeta', exact: true }).click()]);
    const cardPath = path.join(output, 'tarjeta-ar-dominio-publico.png'); await download.saveAs(cardPath);
    const qr = spawnSync(process.env.AR_CHECK_PYTHON || path.join(root, 'backend/tmp/photo-3d/venv-hunyuan/Scripts/python.exe'), ['-c', 'import cv2,sys; print(cv2.QRCodeDetector().detectAndDecode(cv2.imread(sys.argv[1]))[0])', cardPath], { encoding: 'utf8' });
    assert.equal(qr.status, 0, qr.stderr);
    assert.equal(qr.stdout.trim(), `${origin}/experiencia-ar`, 'Downloaded AR card points to wrong origin');
    await page.goto(`${base}/vista-3d/${token}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Compartir mi torta por QR', exact: true }).first().click();
    await page.getByRole('button', { name: 'Ver en mi celular y compartir', exact: true }).click();
    const shareUrl = page.getByRole('textbox', { name: 'Enlace de la vista 3D', exact: true });
    await shareUrl.waitFor();
    assert.equal(await shareUrl.inputValue(), `${origin}/vista-3d/${token}`, 'Re-sharing an existing preview leaked localhost');
    await page.screenshot({ path: path.join(output, 'shared-public-url.png') });
    assert.deepEqual(errors, []); assert.deepEqual(writes, []);
    const checks = { publicOrigin: origin, generatedShare: generatedUrl, downloadedCard: qr.stdout.trim(), existingShareUsesPublicOrigin: true, errors, writes };
    await fs.writeFile(path.join(output, 'checks.json'), JSON.stringify(checks, null, 2)); console.log(JSON.stringify(checks));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
