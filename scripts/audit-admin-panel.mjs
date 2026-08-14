import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';
import { config } from 'dotenv';

config({ path: path.resolve(process.cwd(), 'backend/.env') });

const allRoutes = [
  ['resumen', '/admin/resumen'],
  ['pedidos', '/admin/pedidos'],
  ['caja', '/admin/caja'],
  ['salon', '/admin/salon'],
  ['cocina', '/admin/cocina'],
  ['reparto', '/admin/reparto'],
  ['inventario', '/admin/inventario'],
  ['catalogo', '/admin/catalogo'],
  ['constructor', '/admin/constructor'],
  ['medios', '/admin/medios'],
  ['cupones', '/admin/cupones'],
  ['planes', '/admin/planes'],
  ['cobertura', '/admin/cobertura'],
  ['usuarios', '/admin/usuarios'],
  ['roles', '/admin/roles'],
  ['reclamaciones', '/admin/reclamaciones'],
  ['bitacora', '/admin/bitacora'],
  ['negocio', '/admin/configuracion-negocio'],
  ['diseno', '/admin/sistema-diseno'],
];

const selectedModules = new Set(
  (process.env.ADMIN_AUDIT_MODULES ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
const routes = selectedModules.size > 0
  ? allRoutes.filter(([name]) => selectedModules.has(name))
  : allRoutes;

const viewports = [
  ['desktop', { width: 1440, height: 1000 }],
  ['mobile', { width: 390, height: 844 }],
];

const root = path.resolve(process.cwd(), 'test-results/admin-panel-audit');
await fs.mkdir(root, { recursive: true });

const response = await fetch('http://127.0.0.1:4000/api/v1/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  }),
});

if (!response.ok) throw new Error(`No se pudo iniciar sesion: ${response.status}`);
const payload = await response.json();
const session = payload.data;

const browser = await chromium.launch({ headless: true });
const report = [];

for (const [viewportName, viewport] of viewports) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript((tokens) => {
    localStorage.setItem('verde-bowl:accessToken', tokens.accessToken);
    localStorage.setItem('verde-bowl:refreshToken', tokens.refreshToken);
  }, session);

  for (const [name, route] of routes) {
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.goto(`http://localhost:5173${route}`, { waitUntil: 'domcontentloaded' });
    await page.locator('h1').waitFor({ state: 'visible', timeout: 12_000 }).catch(() => undefined);
    await page.waitForTimeout(800);

    const snapshot = await page.evaluate(() => {
      const body = document.body;
      const main = document.querySelector('main');
      const visible = (element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };

      return {
        url: window.location.pathname,
        title: document.querySelector('h1')?.textContent?.trim() ?? null,
        headings: [...document.querySelectorAll('h2, h3')]
          .filter(visible)
          .slice(0, 12)
          .map((element) => element.textContent?.trim()),
        buttons: [...document.querySelectorAll('button')]
          .filter(visible)
          .slice(0, 20)
          .map((element) => element.textContent?.trim()),
        tables: document.querySelectorAll('table').length,
        forms: document.querySelectorAll('form').length,
        cards: document.querySelectorAll('.MuiPaper-root').length,
        viewportWidth: document.documentElement.clientWidth,
        pageWidth: document.documentElement.scrollWidth,
        mainWidth: main?.scrollWidth ?? null,
        bodyText: body.innerText.slice(0, 1000),
      };
    });

    await page.screenshot({
      path: path.join(root, `${viewportName}-${name}.png`),
      fullPage: true,
    });
    report.push({ viewport: viewportName, module: name, ...snapshot, consoleErrors });
    await page.close();
  }

  await context.close();
}

await browser.close();
await fs.writeFile(path.join(root, 'report.json'), JSON.stringify(report, null, 2));

for (const row of report) {
  const overflow = row.pageWidth > row.viewportWidth + 1 ? ` overflow=${row.pageWidth - row.viewportWidth}px` : '';
  const errors = row.consoleErrors.length > 0 ? ` errors=${row.consoleErrors.length}` : '';
  process.stdout.write(`${row.viewport.padEnd(7)} ${row.module.padEnd(15)} ${String(row.title).slice(0, 42)}${overflow}${errors}\n`);
}
