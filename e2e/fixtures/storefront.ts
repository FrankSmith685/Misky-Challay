import { expect, type Page } from '@playwright/test';
import defaults from '../../frontend/src/features/home/content/storefront.defaults.json';

export const contentDefaults = defaults;
const business = {
  legalName: 'Pastelería de prueba',
  commercialName: 'Misky Challay',
  ruc: '20600000000',
  phone: '999111222',
  whatsappPhone: '926749330',
  address: 'Dirección de prueba',
  email: 'tienda@example.test',
  supportEmail: 'tienda@example.test',
  complaintResponseDays: 15,
};
const user = {
  id: 9001,
  email: 'editor@example.test',
  firstName: 'Editor',
  lastName: 'Prueba',
  phone: '999111222',
  roles: ['ADMIN'],
  permissions: [],
  branchIds: [],
  isSuperAdmin: true,
  createdAt: '2026-11-01T12:00:00Z',
};
const product = {
  id: 101,
  slug: 'torta-publicada',
  name: 'Torta publicada',
  family: 'CAKE',
  cakeSaleMode: 'STANDARD',
  preparationMode: 'MADE_TO_ORDER',
  minLeadHours: 2,
  categoryId: 1,
  type: 'FIXED',
  imageUrl: '/images/cakes/vanilla.png',
  isAvailable: true,
  priceFrom: 75,
  defaultVariantPrice: 75,
  defaultVariantId: 201,
  defaultVariantName: 'Pequeña',
  dietaryTags: [],
  allergens: [],
};

export async function setupStorefront(page: Page, { admin = false, fail = false } = {}) {
  const server = {
    content: structuredClone(defaults),
    version: 7,
    updatedAt: '2026-11-01T12:00:00Z',
    writes: 0,
    conflict: false,
  };
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path === '/settings/storefront') {
      if (fail)
        return route.fulfill({
          status: 503,
          json: { success: false, message: 'Contenido temporalmente no disponible' },
        });
      if (route.request().method() === 'PUT') {
        if (server.conflict)
          return route.fulfill({
            status: 409,
            json: {
              success: false,
              message:
                'Otra persona actualizó la portada. Recarga el contenido antes de guardar tus cambios.',
              code: 'CONFLICT',
            },
          });
        const input = route.request().postDataJSON();
        server.content = input.content;
        server.version++;
        server.writes++;
      }
      return route.fulfill({
        json: {
          success: true,
          data: { content: server.content, version: server.version, updatedAt: server.updatedAt },
        },
      });
    }
    if (path.startsWith('/auth/') && !admin)
      return route.fulfill({ status: 401, json: { success: false, message: 'Sin sesión' } });
    const fixtures: Record<string, unknown> = {
      '/auth/me': user,
      '/account/profile': user,
      '/account/purchase-context': { source: 'EMPTY' },
      '/settings/public': {
        business,
        payments: { onlineEnabled: true, onlineProvider: 'mercadopago' },
        receipts: { mode: 'INTERNAL_ONLY' },
      },
      '/catalog/products': [product],
      '/locations/branches': [],
      '/plans/wallet': { balance: 0, activePlans: [], lots: [] },
      '/account/food-preferences': { allergens: [], dietaryTags: [], dislikedOptionIds: [] },
    };
    await route.fulfill({
      json: {
        success: true,
        data: fixtures[path] ?? [],
        meta: { total: 0, page: 1, pageSize: 20, totalPages: 1 },
      },
    });
  });
  await page.addInitScript(
    ({ admin, user }) => {
      localStorage.setItem('verde-bowl:analytics-consent', 'rejected');
      localStorage.setItem('verde-bowl:theme-cache-v4', 'done');
      if (admin) {
        localStorage.setItem('verde-bowl:accessToken', 'editor-mock-token');
        localStorage.setItem('verde-bowl:refreshToken', 'editor-mock-refresh');
        localStorage.setItem(
          'persist:auth',
          JSON.stringify({
            user: JSON.stringify(user),
            isAuthenticated: 'true',
            _persist: JSON.stringify({ version: -1, rehydrated: true }),
          }),
        );
      }
    },
    { admin, user },
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return server;
}

export async function noOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(sizes.content).toBeLessThanOrEqual(sizes.viewport + 1);
}
