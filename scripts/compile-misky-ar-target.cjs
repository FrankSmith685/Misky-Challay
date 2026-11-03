/* Run with the local Vite server running. No camera, API keys or inference calls. */
const { chromium } = require('@playwright/test');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const base = process.env.AR_LOCAL_URL || 'http://127.0.0.1:5173';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Use a loopback Vite URL.');
const output = path.join(root, 'frontend/public/ar');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage();
    await page.goto(`${base}/ar-camera.html`, { waitUntil: 'networkidle' });
    const compiled = await page.evaluate(async () => {
      const { Compiler } = await import('/src/vendor/mindar/mindar-image.prod.js');
      const image = new Image();
      image.src = '/images/brand/patisserie-chocolate-v1.jpg';
      await image.decode();
      const compiler = new Compiler();
      await compiler.compileImageTargets([image], () => {});
      const data = compiler.exportData();
      const decoded = compiler.importData(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
      return { bytes: Array.from(data), dimensions: decoded.map((target) => [target.targetImage.width, target.targetImage.height]), matchingFrames: decoded.map((target) => target.matchingData.length) };
    });
    mkdirSync(output, { recursive: true });
    const bytes = Buffer.from(compiled.bytes);
    const source = readFileSync(path.join(root, 'frontend/public/images/brand/patisserie-chocolate-v1.jpg'));
    const manifest = { mindar: '1.2.5', target: '/images/brand/patisserie-chocolate-v1.jpg', sha256: createHash('sha256').update(source).digest('hex'), compiledSha256: createHash('sha256').update(bytes).digest('hex'), dimensions: compiled.dimensions, matchingFrames: compiled.matchingFrames };
    writeFileSync(path.join(output, 'misky-card-v1.mind'), bytes);
    writeFileSync(path.join(output, 'misky-card-v1.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(JSON.stringify({ ...manifest, bytes: bytes.length }));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
