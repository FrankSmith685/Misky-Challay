import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';
import { config } from 'dotenv';

config({ path: path.resolve(process.cwd(), 'backend/.env') });
const root = path.resolve(process.cwd(), 'test-results/admin-order-experience');
await fs.mkdir(root, { recursive: true });

const response = await fetch('http://127.0.0.1:4000/api/v1/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
});
if (!response.ok) throw new Error(`No se pudo iniciar sesión: ${response.status}`);
const session = (await response.json()).data;

const browser = await chromium.launch({ headless: true });
for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript((tokens) => {
    localStorage.setItem('verde-bowl:accessToken', tokens.accessToken);
    localStorage.setItem('verde-bowl:refreshToken', tokens.refreshToken);
  }, session);
  const page = await context.newPage();
  await page.goto('http://localhost:5173/admin/pedidos', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Detalles' }).first().click();
  await page.getByRole('heading', { level: 2 }).last().waitFor();
  await page.getByRole('button', { name: /Ver (boleta|factura)/ }).click();
  await page.getByText('Vista previa operativa.').waitFor();
  await page.screenshot({ path: path.join(root, `${name}-comprobante.png`), fullPage: true });
  await context.close();
}
await browser.close();
