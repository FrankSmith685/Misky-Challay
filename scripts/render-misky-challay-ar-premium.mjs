import { chromium } from 'playwright';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage();
const html = resolve(root, 'docs/MISKY-CHALLAY-AR-PREMIUM-PROPUESTA.html');
await page.goto(`file:///${html.replaceAll('\\', '/')}`, { waitUntil: 'networkidle' });
await page.pdf({
  path: resolve(root, 'docs/MISKY-CHALLAY-AR-PREMIUM-PROPUESTA.pdf'),
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
});
await browser.close();
console.log(resolve(root, 'docs/MISKY-CHALLAY-AR-PREMIUM-PROPUESTA.pdf'));

