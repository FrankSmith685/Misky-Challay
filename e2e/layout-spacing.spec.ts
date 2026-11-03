import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

const business = {
  legalName: 'Pastelería de prueba', commercialName: 'Misky Challay', ruc: '20600000000',
  phone: '999111222', whatsappPhone: '999111222', address: 'Av. Principal 123, Lima',
  email: 'tienda@example.test', supportEmail: 'tienda@example.test', complaintResponseDays: 15,
};
const user = {
  id: 999, email: 'layout@example.test', firstName: 'Cliente', lastName: 'Prueba',
  phone: '999111222', avatarUrl: null, roles: ['ADMIN'], permissions: [], branchIds: [1],
  isSuperAdmin: true, createdAt: '2026-10-01T12:00:00Z', emailVerifiedAt: null,
};
const branch = { id: 1, name: 'Sucursal de prueba', addressLine: 'Av. Principal 123',
  acceptsPickup: true, isActive: true, latitude: -12.12, longitude: -77.03, prepMinutes: 30 };
const communication = {
  emailNotificationsEnabled: true, inAppNotificationsEnabled: true, orderUpdatesEnabled: true,
  whatsappUpdatesEnabled: false, planUpdatesEnabled: true, staffAccessEnabled: true,
  availabilityAlertsEnabled: true, availabilityEmailSubject: '', availabilityEmailBody: '',
  smtpHost: '', smtpPort: 587, smtpSecure: false, smtpUser: '', smtpPasswordConfigured: false,
  fromEmail: business.email, fromName: business.commercialName, replyToEmail: '', deliveryMode: 'console',
};
const localPayments = {
  yapeEnabled: false, plinEnabled: false, yapePhone: '', plinPhone: '', yapeRecipient: '',
  plinRecipient: '', yapeQrImageUrl: '', plinQrImageUrl: '', instructions: '',
  paymentWindowMinutes: 15, reviewAlertMinutes: 15,
};
const receipts = { mode: 'INTERNAL_ONLY', autoPrintKitchenTicket: false,
  autoPrintCustomerTicket: false, paperWidth: 80 };

/** Toda consulta queda en el navegador; esta auditoría no cambia datos reales. */
async function prepare(page: Page, authenticated: boolean) {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path.startsWith('/auth/') && !authenticated)
      return route.fulfill({ status: 401, json: { success: false, message: 'Sin sesión' } });
    const settingsState = { isConfigured: true, source: 'database', updatedAt: null };
    const fixtures: Record<string, unknown> = {
      '/auth/me': user, '/account/profile': user,
      '/settings/public': { business, receipts, localPayments, payments: { onlineEnabled: true, onlineProvider: 'mercadopago' } },
      '/settings/business': { ...settingsState, business },
      '/settings/communication': { ...settingsState, communication },
      '/settings/local-payments': { ...settingsState, localPayments },
      '/settings/receipts': { ...settingsState, receipts },
      '/settings/integrations': { checkedAt: new Date().toISOString(), integrations: [] },
      '/settings/notification-history': { totals: { sent: 0, failed: 0 }, recent: [] },
      '/account/purchase-context': { source: 'EMPTY' },
      '/account/food-preferences': { allergens: [], dietaryTags: [], dislikedOptionIds: [] },
      '/locations/branches': [branch],
      '/plans/wallet': { balance: 0, paidBalance: 0, bonusBalance: 0, currency: 'PEN',
        nextExpiry: null, paidCreditValidityDays: 365, lots: [], activePlans: [] },
      '/subscriptions/config': { termsVersion: '2026-10-01', available: false },
      '/subscriptions/admin/options': { products: [], branches: [branch] },
      '/admin/catalog/meta': { categories: [], allergens: [], dietaryTags: [] },
      '/operations/kitchen/board': { tickets: [], scheduled: [],
        stats: { queued: 0, preparing: 0, ready: 0, completed: 0 } },
      '/operations/kitchen/push/config': { enabled: false, publicKey: '' },
      '/operations/procurement/cost-summary': { purchasesTotal: 0, stockValue: 0, consumedCost: 0, rows: [] },
      '/payments/mobile': { items: [], counts: {}, total: 0, page: 1, pageSize: 20 },
      '/admin/reports': { range: { from: '2026-10-01', to: '2026-11-01' },
        sales: { orders: 0, revenue: 0, averageTicket: 0, discounts: 0, deliveryShare: 0 },
        quality: { cancelled: 0, cancellationRate: 0 }, operations: { avgPrepMinutes: 0, ticketsMeasured: 0 },
        experience: {}, topProducts: [], channelBreakdown: [], hourlySales: [], paymentBreakdown: [] },
      '/admin/coverage': { branches: [], zones: [], schedules: [], slots: [], cities: [], districts: [] },
      '/cakes/recipes': { inventoryItems: [], variants: [] },
      '/cakes/creation-setup': { categories: [], allergenOptionCount: 0 },
      '/cakes/visual-preview/capabilities': { enabled: false, maxPerHour: 0 },
      '/experiences/admin/config': { packages: [], templates: [], assets: [] },
      '/communications/settings': {
        config: { enabled: false, testMode: true, supportPhone: '999111222', botEnabled: false,
          paymentReminders: { enabled: false, delayMinutes: 5, activatedAt: null },
          phoneNumberId: '', graphVersion: '', language: 'es', welcome: '', deliveryInfo: '', humanReply: '',
          closedReply: '', openingTime: '09:00', closingTime: '19:00', workingDays: [1, 2, 3, 4, 5, 6], events: {} },
        accessTokenConfigured: false, appSecretConfigured: false, verifyToken: 'layout-test',
        connectionReady: false, webhookReady: false, smtpConfigured: false,
        whatsappUpdatesEnabled: false, emailNotificationsEnabled: true,
      },
      '/communications/conversations': { items: [], total: 0, page: 1, pageSize: 20 },
      '/communications/deliveries': { items: [], total: 0, page: 1, pageSize: 20 },
    };
    if (path.endsWith('/events'))
      return route.fulfill({ contentType: 'text/event-stream', body: ': heartbeat\n\n' });
    await route.fulfill({ json: { success: true, data: fixtures[path] ?? [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 1 } } });
  });
  await page.addInitScript(({ user, authenticated }) => {
    localStorage.setItem('verde-bowl.admin.active-branch', '1');
    localStorage.setItem('verde-bowl:analytics-consent', 'rejected');
    if (authenticated) {
      localStorage.setItem('verde-bowl:accessToken', 'layout-test-token');
      localStorage.setItem('verde-bowl:state', JSON.stringify({
        auth: { user, isAuthenticated: true, status: 'succeeded', error: null },
        cart: { persistenceVersion: 1, ownerUserId: user.id, items: [], subtotal: 0, grandTotal: 0,
          discountTotal: 0, deliveryFee: 0, walletAmount: 0, couponCode: null },
        favorites: { items: [] },
      }));
    }
  }, { user, authenticated });
}

const routes = {
  public: ['/', '/menu', '/empresas', '/crea-tu-torta', '/planes', '/cobertura', '/carrito',
    '/ingresar', '/crear-cuenta', '/recuperar-clave', '/restablecer-clave',
    '/privacidad', '/terminos', '/cookies', '/eliminar-cuenta', '/libro-de-reclamaciones', '/no-existe'],
  account: ['/cuenta', '/cuenta/perfil', '/cuenta/pedidos', '/cuenta/saldo',
    '/cuenta/suscripciones', '/cuenta/direcciones', '/cuenta/favoritos',
    '/cuenta/bowls-guardados', '/cuenta/opiniones', '/cuenta/disenos'],
  admin: ['/admin/resumen', '/admin/pedidos', '/admin/caja', '/admin/pagos-directos',
    '/admin/comunicaciones', '/admin/comunicaciones?tab=settings', '/admin/comunicaciones?tab=history',
    '/admin/comunicaciones?tab=tests', '/admin/punto-venta', '/admin/salon', '/admin/cocina',
    '/admin/tortas', '/admin/reparto', '/admin/inventario', '/admin/compras', '/admin/catalogo',
    '/admin/empresas', '/admin/experiencias-qr', '/admin/constructor', '/admin/medios',
    '/admin/cupones', '/admin/planes', '/admin/recargas', '/admin/cobertura',
    '/admin/usuarios', '/admin/equipos', '/admin/roles', '/admin/reclamaciones', '/admin/bitacora',
    '/admin/configuracion-negocio', '/admin/configuracion-negocio?tab=payments',
    '/admin/configuracion-negocio?tab=communication', '/admin/configuracion-negocio?tab=receipts',
    '/admin/configuracion-negocio?tab=integrations', '/admin/configuracion-negocio?tab=history',
    '/admin/sistema-diseno'],
};

for (const width of [1440, 390]) {
  for (const [area, paths] of Object.entries(routes)) {
    test(`espaciado y adaptación de las vistas ${area} (${width}px)`, async ({ page }, testInfo) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width, height: 1000 });
      await prepare(page, area !== 'public');
      const errors: string[] = [];
      const failures: unknown[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      for (const path of paths) {
        await test.step(path, async () => {
          const previousErrors = errors.length;
          await page.goto(path);
          await page.waitForLoadState('networkidle');
          const result = await page.evaluate(() => {
            const main = document.querySelector('main');
            const suppressed: unknown[] = [];
            // Comprueba que un componente no elimine la separación que la vista pide.
            for (const node of document.querySelectorAll<HTMLElement>(
              'main .MuiButton-root, main .MuiTextField-root, main .MuiTypography-root, main [data-ui-page-header], main [data-ui-card]',
            )) {
              if (!node.getClientRects().length) continue;
              for (const [prefix, property] of [['mt', 'marginTop'], ['mb', 'marginBottom']] as const) {
                const relevant = [...node.classList].filter((name) => new RegExp(`^(?:(sm|md|lg|xl|2xl):)?${prefix}-(\\d+(?:\\.\\d+)?)$`).test(name));
                let intended = 0;
                for (const name of relevant) {
                  const match = name.match(/^(?:(sm|md|lg|xl|2xl):)?m[bt]-(\d+(?:\.\d+)?)$/)!;
                  const minimum = ({ sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 })[match[1]] ?? 0;
                  if (innerWidth >= minimum) intended = Number(match[2]) * 4;
                }
                if (intended > 0 && parseFloat(getComputedStyle(node)[property]) < 1)
                  suppressed.push({ text: node.textContent?.slice(0, 80), property, intended });
              }
            }
            const overflowing = [...document.querySelectorAll<HTMLElement>('main .MuiButton-root, main .MuiTextField-root, main [data-ui-page-header]')]
              .filter((node) => {
                const r = node.getBoundingClientRect();
                return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) &&
                  !node.closest('.overflow-x-auto, .MuiTabs-root');
              }).map((node) => ({ text: node.textContent?.slice(0, 80), width: node.getBoundingClientRect().width }));
            return { heading: main?.querySelector('h1, h2, h3, h4, h5, h6')?.textContent,
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
              suppressed, overflowing };
          });
          if (!result.heading || result.overflow > 1 || result.suppressed.length || result.overflowing.length || errors.length > previousErrors) {
            failures.push({ path, ...result, errors: errors.slice(previousErrors) });
            await page.screenshot({ path: testInfo.outputPath(`${path.replace(/\W/g, '-')}.png`), fullPage: true });
          }
        });
      }
      expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
    });
  }

  test(`el botón de cajas mensuales respeta la separación con sus ventajas (${width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await prepare(page, false);
    await page.goto('/');
    const button = page.getByRole('link', { name: 'Descubrir las cajas mensuales', exact: true });
    await button.scrollIntoViewIfNeeded();
    const gap = await button.evaluate((node) => {
      const list = node.previousElementSibling!;
      return node.getBoundingClientRect().top - list.getBoundingClientRect().bottom;
    });
    expect(gap).toBeGreaterThanOrEqual(24);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.screenshot({ path: testInfo.outputPath('cajas-mensuales.png') });
  });

  test(`los campos de un modal de direcciones mantienen su separación (${width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await prepare(page, true);
    await page.goto('/cuenta/direcciones');
    await page.getByRole('button', { name: 'Nueva dirección', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: /Nueva dirección/ });
    const label = dialog.getByRole('textbox', { name: 'Etiqueta', exact: true });
    const reference = dialog.getByRole('textbox', { name: 'Referencia (opcional)', exact: true });
    await reference.scrollIntoViewIfNeeded();
    const [first, second] = await Promise.all([label, reference].map((field) =>
      field.evaluate((node) => {
        const rect = node.closest('.MuiTextField-root')!.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      }),
    ));
    expect(second.top - first.bottom).toBeGreaterThanOrEqual(16);
    const content = await dialog.locator('.MuiDialogContent-root').evaluate((node) => ({
      width: node.clientWidth, scroll: node.scrollWidth,
    }));
    expect(content.scroll).toBeLessThanOrEqual(content.width + 1);
    await dialog.screenshot({ path: testInfo.outputPath('direccion-formulario.png') });
  });
}
