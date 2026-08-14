import { chromium } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const source = path.join(projectRoot, 'docs', 'INFORME-INTEGRAL-VERDE-BOWL.html');
const output = path.join(projectRoot, 'docs', 'Informe-Integral-Verde-Bowl-V3.pdf');

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(source).href, { waitUntil: 'networkidle' });
  await page.emulateMedia({ media: 'print' });
  await page.pdf({
    path: output,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<div style="font:7px Segoe UI,Arial;color:#6b7770;width:100%;padding:0 14mm;text-align:right">Informe integral · Verde Bowl V3</div>',
    footerTemplate: '<div style="font:7px Segoe UI,Arial;color:#6b7770;width:100%;padding:0 14mm;display:flex;justify-content:space-between"><span>Documento técnico-funcional</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>',
    margin: { top: '14mm', right: '14mm', bottom: '17mm', left: '14mm' },
  });
  console.log(output);
} finally {
  await browser.close();
}
