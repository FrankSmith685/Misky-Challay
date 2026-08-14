import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';
import { config } from 'dotenv';

config({ path: path.resolve(process.cwd(), 'backend/.env') });
const root = path.resolve(process.cwd(), 'test-results/admin-restaurant-operations');
await fs.mkdir(root, { recursive: true });

const response = await fetch('http://127.0.0.1:4000/api/v1/auth/login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
});
if (!response.ok) throw new Error(`No se pudo iniciar sesión: ${response.status}`);
const session = (await response.json()).data;

const tables = [
  { id: 1, code: 'Mesa 01', area: 'Salón principal', capacity: 2, status: 'AVAILABLE', command: null },
  { id: 2, code: 'Mesa 02', area: 'Salón principal', capacity: 4, status: 'OCCUPIED', command: { orderNumber: 'VB-MESA-1024', status: 'PREPARING', guestName: 'Familia Ramos', waiterName: 'Andrea Pérez', total: 78.5, openedAt: new Date(Date.now() - 18 * 60_000).toISOString(), items: [{ name: 'Poke clásico salmón', quantity: 2 }, { name: 'Limonada', quantity: 2 }] } },
  { id: 3, code: 'Mesa 03', area: 'Salón principal', capacity: 2, status: 'OCCUPIED', command: { orderNumber: 'VB-MESA-1025', status: 'READY', guestName: 'Cliente Mesa 03', waiterName: 'Carlos Díaz', total: 42.9, openedAt: new Date(Date.now() - 31 * 60_000).toISOString(), items: [{ name: 'Bowl pollo teriyaki', quantity: 1 }, { name: 'Chips de camote', quantity: 1 }] } },
  { id: 4, code: 'Terraza 01', area: 'Terraza', capacity: 4, status: 'AVAILABLE', command: null },
  { id: 5, code: 'Terraza 02', area: 'Terraza', capacity: 2, status: 'AVAILABLE', command: null },
];
const catalog = [
  { productId: 1, name: 'Poke clásico salmón', imageUrl: '/images/builder/bowl-signature.jpg', categoryId: 1, variantId: 1, variantName: 'Regular', price: 34.9, isAvailable: true },
  { productId: 2, name: 'Bowl pollo teriyaki', imageUrl: '/images/builder/proteins.jpg', categoryId: 1, variantId: 2, variantName: 'Regular', price: 29.9, isAvailable: true },
  { productId: 3, name: 'Chips de camote', imageUrl: '/images/builder/crunch.jpg', categoryId: 2, variantId: 3, variantName: 'Porción', price: 13, isAvailable: true },
];

const browser = await chromium.launch({ headless: true });
for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript((tokens) => {
    localStorage.setItem('verde-bowl:accessToken', tokens.accessToken);
    localStorage.setItem('verde-bowl:refreshToken', tokens.refreshToken);
  }, session);
  const page = await context.newPage();
  await page.route('**/api/v1/operations/dining/tables**', async (route) => {
    if (route.request().method() === 'GET') await route.fulfill({ json: { success: true, data: tables } });
    else await route.continue();
  });
  await page.route('**/api/v1/operations/dining/catalog**', async (route) => route.fulfill({ json: { success: true, data: catalog } }));
  await page.goto('http://localhost:5173/admin/salon', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { level: 1, name: 'Salón y comandas' }).waitFor();
  await page.screenshot({ path: path.join(root, `${name}-salon.png`), fullPage: true });
  await page.getByRole('button', { name: 'Abrir comanda' }).first().click();
  const productButton = page.getByRole('button', { name: /Poke clásico salmón/ });
  await productButton.waitFor();
  await productButton.click();
  await page.screenshot({ path: path.join(root, `${name}-nueva-comanda.png`), fullPage: true });
  await context.close();
}
await browser.close();
