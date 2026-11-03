/* Real MindAR recognition with a synthetic camera. All APIs are intercepted. */
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const base = process.env.AR_LOCAL_URL || 'http://127.0.0.1:5173';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Use a loopback URL.');
const token = 'A'.repeat(24);
const expiresAt = new Date(Date.now() + 86400000).toISOString();
const snapshot = { productId: 1, productSlug: 'test-cake', productName: 'Torta compartida de prueba', variantId: 1, variantName: '18 cm', diameterCm: 18, servings: 12, themeName: null, themeSlug: null, options: [{ groupName: 'Bizcocho', optionName: 'Chocolate', quantity: 1 }] };
const out = path.join(root, 'backend/tmp/mindar-review');

const modelToken = 'B'.repeat(32);
const fixtureModel = () => {
  const positions = new Float32Array([-.5, 0, -.5, .5, 0, -.5, .5, .6, -.5, -.5, .6, -.5, -.5, 0, .5, .5, 0, .5, .5, .6, .5, -.5, .6, .5]);
  const indices = new Uint16Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 1, 2, 6, 1, 6, 5, 0, 4, 7, 0, 7, 3]);
  const bin = Buffer.concat([Buffer.from(positions.buffer), Buffer.from(indices.buffer)]);
  const document = { asset: { version: '2.0', generator: 'Local AR test fixture' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }], materials: [{ pbrMetallicRoughness: { baseColorFactor: [.3, .1, .05, 1], metallicFactor: 0, roughnessFactor: 1 } }], buffers: [{ byteLength: bin.length }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }, { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength }], accessors: [{ bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [-.5, 0, -.5], max: [.5, .6, .5] }, { bufferView: 1, componentType: 5123, count: 36, type: 'SCALAR' }] };
  const text = JSON.stringify(document); const json = Buffer.from(text + ' '.repeat((4 - text.length % 4) % 4));
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + bin.length, 8); header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binaryHeader = Buffer.alloc(8); binaryHeader.writeUInt32LE(bin.length, 0); binaryHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, json, binaryHeader, bin]);
};

(async () => {
  await fs.mkdir(out, { recursive: true });
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'frontend/public/ar/misky-card-v1.json'), 'utf8'));
  const hash = data => crypto.createHash('sha256').update(data).digest('hex');
  assert.equal(hash(await fs.readFile(path.join(root, 'frontend/public', manifest.target))), manifest.sha256);
  assert.equal(hash(await fs.readFile(path.join(root, 'frontend/public/ar/misky-card-v1.mind'))), manifest.compiledSha256);
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], writes = [], external = [];
  let sharedModel = false, modelLoads = 0;
  let reviewPage;
  try {
    const context = await browser.newContext({ viewport: { width: 1365, height: 950 }, acceptDownloads: true });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)) { external.push(url.origin); return route.abort(); }
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (request.method() !== 'GET') writes.push(`${request.method()} ${url.pathname}`);
      if (url.pathname.endsWith(`/cake-previews/${token}`)) return route.fulfill({ json: { success: true, data: { snapshot: sharedModel ? { ...snapshot, visualDesign: { reconstruction: { token: modelToken, sourceHash: '0'.repeat(64) } } } : snapshot, expiresAt } } });
      if (url.pathname.endsWith(`/cakes/reconstructions/${modelToken}/model`)) { modelLoads++; return route.fulfill({ contentType: 'model/gltf-binary', body: fixtureModel() }); }
      return route.fulfill({ status: 503, json: { success: false, message: 'API isolated for AR check' } });
    });
    await context.addInitScript(() => {
      window.__arCameraCalls = 0;
      window.__arTrackStops = 0;
      window.__arTargetVisible = true;
      if (!navigator.mediaDevices) return;
      navigator.mediaDevices.getUserMedia = async () => {
        window.__arCameraCalls++;
        if (window.__arDenyCamera) throw new DOMException('Denied by test', 'NotAllowedError');
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
        const ctx = canvas.getContext('2d');
        const image = new Image(); image.src = '/images/brand/patisserie-chocolate-v1.jpg'; await image.decode();
        const draw = () => { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 640, 480); if (window.__arTargetVisible) ctx.drawImage(image, 80, 105, 480, 270); };
        draw(); const timer = setInterval(draw, 100);
        const stream = canvas.captureStream(10);
        stream.getTracks().forEach(track => { const stop = track.stop.bind(track); track.stop = () => { window.__arTrackStops++; clearInterval(timer); stop(); }; });
        window.__arTestStream = stream;
        return stream;
      };
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    reviewPage = page;
    await page.goto(`${base}/experiencia-ar`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.getByRole('heading', { name: 'Una torta que cobra vida en tu mundo.' }).waitFor();
    const consent = page.getByRole('button', { name: 'Solo necesario', exact: true }); if (await consent.isVisible()) await consent.click();
    assert.equal(await page.locator('iframe').count(), 0, 'Camera started automatically');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar tarjeta', exact: true }).click()]);
    await download.saveAs(path.join(out, 'tarjeta-ar-misky-challay.png'));
    await page.screenshot({ path: path.join(out, 'desktop.png'), fullPage: true });
    // Decode the actual downloaded QR locally, and confirm the uncropped source image.
    const qrCheck = spawnSync(process.env.AR_CHECK_PYTHON || path.join(root, 'backend/tmp/photo-3d/venv-hunyuan/Scripts/python.exe'), ['-c', 'import cv2,json,sys; im=cv2.imread(sys.argv[1]); value,_,_=cv2.QRCodeDetector().detectAndDecode(im); print(json.dumps({"width":im.shape[1],"height":im.shape[0],"qr":value}))', path.join(out, 'tarjeta-ar-misky-challay.png')], { encoding: 'utf8' });
    assert.equal(qrCheck.status, 0, qrCheck.stderr);
    const cardChecks = JSON.parse(qrCheck.stdout);
    const cardUrl = new URL(cardChecks.qr);
    assert.equal(cardUrl.pathname, '/experiencia-ar');
    assert.equal(cardUrl.search, '');
    assert(cardUrl.protocol === 'https:' || cardUrl.origin === new URL(base).origin, 'Non-public QR must use the local test server');
    if (process.env.AR_EXPECTED_PUBLIC_ORIGIN) assert.equal(cardUrl.origin, new URL(process.env.AR_EXPECTED_PUBLIC_ORIGIN).origin);
    assert.equal(cardChecks.width, 2200); assert.equal(cardChecks.height, 1556);
    console.log('Card downloaded; QR decoded.');
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile overflow');
    await page.screenshot({ path: path.join(out, 'mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1365, height: 950 });
    await page.getByRole('button', { name: 'Activar cámara AR', exact: true }).click();
    console.log('Camera requested.');
    await Promise.race([
      page.getByText('Tarjeta reconocida.', { exact: false }).waitFor({ timeout: 90000 }),
      page.getByRole('dialog', { name: 'Tu torta sobre la tarjeta', exact: true }).getByRole('alert').waitFor({ timeout: 90000 }).then(async () => { throw new Error(await page.getByRole('dialog', { name: 'Tu torta sobre la tarjeta', exact: true }).getByRole('alert').innerText()); }),
    ]);
    console.log('Target recognized.');
    await page.screenshot({ path: path.join(out, 'recognized.png') });
    const runtime = page.frames().find(frame => frame.url().includes('/ar-camera.html'));
    assert(runtime, 'Camera runtime missing');
    assert.equal(await runtime.evaluate(() => window.__arCameraCalls), 1);
    await runtime.evaluate(() => { window.__arTargetVisible = false; });
    await page.getByText('Vuelve a enfocar toda la fotografía de la tarjeta.', { exact: true }).waitFor({ timeout: 60000 });
    await runtime.evaluate(() => { window.__arTargetVisible = true; });
    await page.getByText('Tarjeta reconocida.', { exact: false }).waitFor({ timeout: 60000 });
    // Backgrounding stops the stream before the iframe is destroyed.
    await runtime.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.getByText('La cámara se pausó.', { exact: false }).waitFor();
    assert(await runtime.evaluate(() => window.__arTestStream.getTracks().every(track => track.readyState === 'ended')));
    await page.getByRole('button', { name: 'Cerrar cámara', exact: true }).click();
    assert.equal(await page.locator('iframe').count(), 0);
    await page.goto(`${base}/experiencia-ar?vista=${token}`, { waitUntil: 'networkidle' });
    await page.getByText('Modelo: Torta compartida de prueba.', { exact: false }).waitFor();
    assert(await page.getByRole('button', { name: 'Activar cámara AR', exact: true }).isEnabled());
    const [sharedCard] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar tarjeta', exact: true }).click()]);
    await sharedCard.saveAs(path.join(out, 'tarjeta-compartida.png'));
    sharedModel = true;
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('Se usa la reconstrucción incluida en el enlace.', { exact: false }).waitFor();
    assert.equal(modelLoads, 0, 'Model loaded before activating camera');
    await page.getByRole('button', { name: 'Activar cámara AR', exact: true }).click();
    await page.getByText('Tarjeta reconocida.', { exact: false }).waitFor({ timeout: 90000 });
    assert.equal(modelLoads, 1, 'Shared GLB was not loaded exactly once');
    await page.getByRole('button', { name: 'Cerrar cámara', exact: true }).click();
    // Permission error and retry use a fresh document, no stale camera state.
    await context.addInitScript(() => { window.__arDenyCamera = true; });
    await page.getByRole('button', { name: 'Activar cámara AR', exact: true }).click();
    await page.getByText('No se permitió la cámara.', { exact: false }).waitFor({ timeout: 60000 });
    await page.getByRole('button', { name: 'Cerrar cámara', exact: true }).click();
    await page.goto(`${base}/experiencia-ar?vista=invalid`, { waitUntil: 'networkidle' });
    await page.getByText('El enlace de la torta no es válido.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Activar cámara AR', exact: true }).count(), 0);
    await page.route(`**/cake-previews/${token}`, route => route.fulfill({ json: { success: true, data: { snapshot, expiresAt: '2020-01-01T00:00:00.000Z' } } }));
    await page.goto(`${base}/experiencia-ar?vista=${token}`, { waitUntil: 'networkidle' });
    await page.getByText('Esta vista compartida venció.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Activar cámara AR', exact: true }).count(), 0);
    assert.deepEqual(errors, []); assert.deepEqual(writes, []);
    const checks = { recognition: 'REAL MindAR + synthetic camera', targetFound: true, targetLost: true, targetReacquired: true, cameraExplicit: true, backgroundStopsTracks: true, cameraRemovedOnClose: true, permissionError: true, sharedLink: true, sharedGlbLoadedAndRecognized: true, modelLoads, malformedLink: true, expiredLink: true, mobile: true, cardChecks, errors, writes, externalBlocked: [...new Set(external)] };
    await fs.writeFile(path.join(out, 'checks.json'), JSON.stringify(checks, null, 2)); console.log(JSON.stringify(checks));
  } catch (error) {
    if (reviewPage && !reviewPage.isClosed()) {
      await reviewPage.screenshot({ path: path.join(out, 'failure.png') });
      console.error(JSON.stringify({ text: (await reviewPage.locator('body').innerText()).slice(-2200), frames: reviewPage.frames().map(frame => frame.url()), errors }));
    }
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
