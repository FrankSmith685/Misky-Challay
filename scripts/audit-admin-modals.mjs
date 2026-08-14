import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';
import { config } from 'dotenv';

config({ path: path.resolve(process.cwd(), 'backend/.env') });

const targets = [
  ['producto', '/admin/catalogo', /Nuevo producto/i],
  ['inventario', '/admin/inventario', /Nuevo insumo/i],
  ['cupon', '/admin/cupones', /Nuevo cupón/i],
  ['plan', '/admin/planes', /Nuevo plan/i],
  ['zona', '/admin/cobertura', /Nueva zona/i],
  ['usuario', '/admin/usuarios', /Nuevo usuario/i],
  ['rol', '/admin/roles', /Crear rol/i],
];

const response = await fetch('http://127.0.0.1:4000/api/v1/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
});
if (!response.ok) throw new Error(`No se pudo iniciar sesion: ${response.status}`);
const session = (await response.json()).data;

const output = path.resolve(process.cwd(), 'test-results/admin-modal-audit');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });

for (const [viewportName, viewport] of [
  ['desktop', { width: 1440, height: 1000 }],
  ['mobile', { width: 390, height: 844 }],
]) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript((tokens) => {
    localStorage.setItem('verde-bowl:accessToken', tokens.accessToken);
    localStorage.setItem('verde-bowl:refreshToken', tokens.refreshToken);
  }, session);

  for (const [name, route, buttonName] of targets) {
    const page = await context.newPage();
    await page.goto(`http://localhost:5173${route}`, { waitUntil: 'domcontentloaded' });
    const button = page.getByRole('button', { name: buttonName }).first();
    await button.waitFor({ state: 'visible', timeout: 15_000 });
    await button.click();
    await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 8_000 });
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(output, `${viewportName}-${name}.png`), fullPage: false });
    await page.close();
  }

  await context.close();
}

await browser.close();

