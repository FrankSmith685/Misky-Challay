import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';
import { config } from 'dotenv';

config({ path: path.resolve(process.cwd(), 'backend/.env') });
const output = path.resolve(process.cwd(), 'test-results/kds-audit');
await fs.mkdir(output, { recursive: true });

const user = { id: 1, email: process.env.ADMIN_EMAIL || 'admin@verdebowl.com', phone: null, firstName: 'Admin', lastName: 'KDS', roles: ['Administrador'], permissions: ['kitchen.read', 'kitchen.operate', 'order.read', 'order.cancel'], isSuperAdmin: true, branchIds: [] };
const now = Date.now();
const item = (id, status, minutes, orderNumber, deliveryType = 'DELIVERY') => ({
  id, status, priority: minutes > 4 ? 2 : 1,
  createdAt: new Date(now - minutes * 60_000).toISOString(), acceptedAt: status === 'QUEUED' ? null : new Date(now - (minutes - 1) * 60_000).toISOString(),
  targetAt: new Date(now + (20 - minutes) * 60_000).toISOString(), notes: null, isLate: false,
  order: { id, orderNumber, deliveryType, diningTable: deliveryType === 'DINE_IN' ? { id: 2, code: 'Mesa 04', area: 'Salón' } : null, serviceMode: 'ASAP', contactName: deliveryType === 'DINE_IN' ? 'Familia Rojas' : 'María Torres', notes: id === 1 ? 'Salsa aparte' : null, items: [{ id, name: id === 2 ? 'Bowl pollo teriyaki' : 'Poke clásico salmón', quantity: id === 3 ? 2 : 1, allergens: id === 1 ? ['MANÍ'] : [], specialInstructions: id === 1 ? 'Sin cebolla' : null, customizations: [{ group: 'Base', option: 'Quinua', quantity: 1 }] }] },
});
const tickets = [
  item(1, 'QUEUED', 6, 'VB-2026-0042'),
  item(2, 'QUEUED', 1, 'VB-2026-0043', 'DINE_IN'),
  item(3, 'PREPARING', 9, 'VB-2026-0041'),
  item(4, 'READY', 14, 'VB-2026-0040', 'PICKUP'),
];
const board = { tickets, stats: { queued: 2, preparing: 1, ready: 1, late: 0 } };

const browser = await chromium.launch({ headless: true });
for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['tablet', { width: 1024, height: 768 }], ['mobile', { width: 390, height: 844 }]]) {
  const context = await browser.newContext({ viewport, permissions: ['notifications'] });
  await context.addInitScript(() => {
    localStorage.setItem('verde-bowl:accessToken', 'audit-token');
    localStorage.setItem('verde-bowl:refreshToken', 'audit-refresh');
    localStorage.setItem('verde-bowl.admin.kitchen-alert', 'off');
  });
  const page = await context.newPage();
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ json: { success: true, data: user } }));
  await page.route('**/api/v1/locations/branches**', (route) => route.fulfill({ json: { success: true, data: [{ id: 1, name: 'Verde Bowl Miraflores', slug: 'miraflores', addressLine: 'Av. Principal 123', phone: null, prepMinutes: 20, acceptsPickup: true, acceptsDelivery: true }] } }));
  await page.route('**/api/v1/admin/orders**', (route) => route.fulfill({ json: { success: true, data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 1 } } }));
  await page.route('**/api/v1/operations/kitchen/board**', (route) => route.fulfill({ json: { success: true, data: board } }));
  await page.route('**/api/v1/operations/kitchen/stream**', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': audit\n\n' }));
  await page.route('**/api/v1/operations/kitchen/push/config**', (route) => route.fulfill({ json: { success: true, data: { enabled: false, publicKey: '' } } }));
  await page.goto('http://localhost:5173/admin/cocina?kds=1', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { level: 1, name: 'Tablero de cocina' }).waitFor();
  await page.waitForTimeout(700);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  if (overflow) throw new Error(`Overflow horizontal en ${name}`);
  await page.screenshot({ path: path.join(output, `${name}-kds.png`), fullPage: false });
  await context.close();
}
await browser.close();
