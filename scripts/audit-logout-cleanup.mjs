import { chromium } from '@playwright/test';

const baseUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
const user = {
  id: 77,
  email: 'cliente.prueba@verdebowl.test',
  phone: '999999999',
  firstName: 'Cliente',
  lastName: 'Prueba',
  roles: ['customer'],
  permissions: [],
  isSuperAdmin: false,
  branchIds: [],
};

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });

  await page.addInitScript(({ currentUser }) => {
    localStorage.setItem('verde-bowl:accessToken', 'access-test');
    localStorage.setItem('verde-bowl:refreshToken', 'refresh-test');
    localStorage.setItem('verde-bowl:state', JSON.stringify({
      auth: { user: currentUser, isAuthenticated: true, status: 'idle', error: null },
      cart: {
        items: [{ id: 'private-item', productId: 1, variantId: 1, name: 'Pedido privado', variantName: 'Único', quantity: 1, unitPrice: 10, extrasTotal: 0, lineTotal: 10, selections: [] }],
        couponCode: null,
        subtotal: 10,
        discountTotal: 0,
        deliveryFee: 0,
        walletAmount: 0,
        grandTotal: 10,
        editingItemId: null,
      },
    }));
    localStorage.setItem('verde-bowl:purchase-context:v2', JSON.stringify({
      cityId: 1,
      address: null,
      branchId: 9,
      pickupBranch: { id: 9, name: 'Verde Bowl Miraflores', addressLine: 'Av. Prueba 123' },
      deliveryType: 'PICKUP',
      serviceMode: 'ASAP',
      scheduledSlotId: null,
    }));
    localStorage.setItem('verde-bowl:checkout-draft:v1', JSON.stringify({ contactName: 'Cliente anterior' }));
    localStorage.setItem('verde-bowl:checkout-billing:v1', JSON.stringify({ documentNumber: '20123456789' }));
  }, { currentUser: user });

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('/auth/me')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'OK', data: user }) });
      return;
    }
    if (pathname.endsWith('/auth/logout')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'Sesión cerrada', data: null }) });
      return;
    }
    if (pathname.endsWith('/settings/public')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'OK',
          data: {
            business: {
              legalName: 'Verde Bowl S.A.C.', commercialName: 'Verde Bowl', ruc: '20600000000',
              address: 'Miraflores, Lima', phone: '+51 999 999 999', email: 'hola@verdebowl.test',
              supportEmail: 'soporte@verdebowl.test', complaintResponseDays: 15,
            },
            cod: { enabled: true, maxAmount: 300 },
            invoicing: { boletaDniThreshold: 700 },
          },
        }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'OK', data: [] }) });
  });

  // Pagina estatica: aisla la prueba de logout de los datos propios del home.
  await page.goto(`${baseUrl}/terminos`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Recojo · Verde Bowl Miraflores', { exact: false }).waitFor();
  await page.getByRole('button', { name: /Mi cuenta · Cliente Prueba/i }).evaluate((button) => {
    if (!(button instanceof HTMLButtonElement)) throw new Error('No se encontró el botón de cuenta');
    button.click();
  });
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).evaluate((item) => {
    if (!(item instanceof HTMLElement)) throw new Error('No se encontró la opción de cierre de sesión');
    item.click();
  });

  await page.getByRole('link', { name: /Ingresar/i }).waitFor();
  await page.getByText('Recojo · Verde Bowl Miraflores', { exact: false }).waitFor({ state: 'detached' });

  const result = await page.evaluate(() => {
    const purchaseContext = localStorage.getItem('verde-bowl:purchase-context:v2');
    const redux = JSON.parse(localStorage.getItem('verde-bowl:state') ?? 'null');
    return {
      hasPurchaseContext: purchaseContext !== null,
      authenticated: redux?.auth?.isAuthenticated,
      cartItems: redux?.cart?.items?.length,
      hasAccessToken: localStorage.getItem('verde-bowl:accessToken') !== null,
      hasRefreshToken: localStorage.getItem('verde-bowl:refreshToken') !== null,
      hasCheckoutDraft: localStorage.getItem('verde-bowl:checkout-draft:v1') !== null,
      hasBillingDraft: localStorage.getItem('verde-bowl:checkout-billing:v1') !== null,
    };
  });

  if (
    result.hasPurchaseContext
    || result.authenticated !== false
    || result.cartItems !== 0
    || result.hasAccessToken
    || result.hasRefreshToken
    || result.hasCheckoutDraft
    || result.hasBillingDraft
  ) {
    throw new Error(`Logout incompleto: ${JSON.stringify(result)}`);
  }

  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
