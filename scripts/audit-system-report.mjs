import { chromium } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const source = path.join(projectRoot, 'docs', 'INFORME-INTEGRAL-VERDE-BOWL.html');
const previewDir = path.join(projectRoot, 'test-results', 'system-report');

await fs.mkdir(previewDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(source).href, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => [...document.images].every((item) => item.complete));
  await page.emulateMedia({ media: 'print' });

  const audit = await page.evaluate(() => ({
    title: document.title,
    chapters: document.querySelectorAll('.chapter').length,
    headings: document.querySelectorAll('h2').length,
    images: [...document.images].map((item) => ({
      src: item.getAttribute('src'),
      width: item.naturalWidth,
      height: item.naturalHeight,
    })),
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));

  if (audit.images.some((item) => item.width === 0 || item.height === 0)) {
    throw new Error(`Hay imágenes rotas: ${JSON.stringify(audit.images)}`);
  }

  await page.locator('.cover').screenshot({ path: path.join(previewDir, 'portada.png') });
  await page.locator('.chapter').nth(12).screenshot({ path: path.join(previewDir, 'capitulo-kds.png') });
  console.log(JSON.stringify(audit, null, 2));
} finally {
  await browser.close();
}
