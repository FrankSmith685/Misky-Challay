import { expect, test, type Page } from '@playwright/test';
import type { DirectPaymentDetail } from '../frontend/src/features/checkout/directPayments';

// Los recursos de prueba se sirven por las rutas simuladas, sin la caché de la PWA.
test.use({ serviceWorkers: 'block' });

const customer = {
  id: 999,
  email: 'direct@example.test',
  firstName: 'Cliente',
  lastName: 'Prueba',
  phone: '999888777',
  avatarUrl: null,
  roles: ['CUSTOMER'],
  permissions: [] as string[],
  isSuperAdmin: false,
  branchIds: [] as number[],
};
const initialPayment = (provider: 'yape' | 'plin'): DirectPaymentDetail => ({
  paymentId: 77,
  provider,
  amount: 100,
  currency: 'PEN',
  stage: 'FULL',
  state: 'AWAITING_PAYMENT',
  recipient: {
    phone: '999111222',
    recipient: 'CUENTA DE PRUEBA',
    qrImageUrl: `/images/payments/demo-${provider}-qr.svg`,
    instructions: 'Verifica el destinatario antes de transferir.',
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    reviewAlertMinutes: 10,
  },
  orderNumber: 'DIRECT-001',
  orderStatus: 'PENDING_PAYMENT',
  branchId: 1,
  contactName: 'Cliente Prueba',
  contactPhone: '999888777',
  createdAt: new Date().toISOString(),
  canReport: true,
  overdue: false,
  refundableAmount: 0,
  refundedAmount: 0,
  claim: null,
  history: [
    {
      id: 1,
      kind: 'CREATED',
      actorId: 999,
      actorName: null,
      createdAt: new Date().toISOString(),
      hasEvidence: false,
      details: null,
    },
  ],
  refunds: [],
});

async function setup(
  page: Page,
  provider: 'yape' | 'plin' = 'yape',
  staff = false,
  superAdmin = false,
) {
  const user = superAdmin
    ? { ...customer, isSuperAdmin: true, roles: ['SUPER_ADMIN'] }
    : staff
      ? {
          ...customer,
          roles: ['CASHIER'],
          permissions: ['payment.verify', 'payment.refund'],
          branchIds: [1],
        }
      : customer;
  let payment = initialPayment(provider);
  if (staff)
    payment = {
      ...payment,
      state: 'REVIEW',
      canReport: false,
      overdue: true,
      claim: {
        operationCode: 'OP-777',
        payerName: 'Cliente Prueba',
        payerPhone: null,
        paidAt: new Date().toISOString(),
        declaredAmount: 100,
        submittedAt: new Date().toISOString(),
        status: 'PENDING',
        reviewedAt: null,
        reviewedBy: null,
        reason: null,
      },
    };
  const reports: Array<Record<string, unknown>> = [];
  const decisions: Array<Record<string, unknown>> = [];
  const refunds: Array<Record<string, unknown>> = [];
  let showActiveOrder = false;
  let orderOverrides: Record<string, unknown> = {};
  const order = () => ({
    id: 1,
    orderNumber: payment.orderNumber,
    status: payment.orderStatus,
    subtotal: 80,
    deliveryFee: 20,
    discountTotal: 0,
    grandTotal: 100,
    taxRate: 0.18,
    taxTotal: 15.25,
    currency: 'PEN',
    deliveryType: 'DELIVERY',
    serviceMode: 'SCHEDULED',
    scheduledAt: new Date(Date.now() + 86400000).toISOString(),
    placedAt: payment.createdAt,
    addressSnapshotJson: { line1: 'Av. Prueba 123', districtName: 'Miraflores' },
    items: [
      {
        id: 1,
        productNameSnapshot: 'Torta de prueba',
        variantNameSnapshot: '8 porciones',
        quantity: 1,
        lineTotal: 80,
        unitPrice: 80,
        descriptionSnapshot: null,
      },
    ],
    branch: { id: 1, name: 'Local de prueba', addressLine: 'Av. Local 456' },
    discounts: [],
    ...orderOverrides,
  });
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let data: unknown = [];
    if (path === '/auth/me') data = user;
    if (path === '/settings/public')
      data = {
        business: {
          commercialName: 'Misky Challay',
          legalName: 'Prueba',
          ruc: '20600000000',
          phone: '999888777',
          address: 'Lima',
          email: 'test@example.test',
          supportEmail: 'test@example.test',
          complaintResponseDays: 15,
        },
        receipts: { mode: 'INTERNAL_ONLY' },
        localPayments: {
          yapeEnabled: true,
          plinEnabled: true,
          instructions: '',
          yapePhone: '999111222',
          yapeRecipient: 'CUENTA DE PRUEBA',
          yapeQrImageUrl: '',
          plinPhone: '999111222',
          plinRecipient: 'CUENTA DE PRUEBA',
          plinQrImageUrl: '',
        },
      };
    if (path === '/locations/branches')
      data = [
        { id: 1, name: 'Local de prueba', addressLine: 'Av. Prueba 123', acceptsPickup: true },
      ];
    if (path === '/orders') data = showActiveOrder ? [order()] : [];
    if (path.includes('/orders/DIRECT-001'))
      data = {
        order: order(),
        payment: {
          id: 77,
          provider,
          status: payment.state === 'CONFIRMED' ? 'SUCCEEDED' : 'PENDING',
          directPayment: payment,
        },
      };
    if (path === '/payments/mobile') {
      const filter = new URL(route.request().url()).searchParams.get('state');
      data = {
        items: !filter || filter === payment.state ? [payment] : [],
        total: !filter || filter === payment.state ? 1 : 0,
        page: 1,
        pageSize: 30,
        counts: { [payment.state]: 1 },
      };
    }
    if (path === '/payments/77/mobile/report') {
      const report = route.request().postDataJSON();
      reports.push(report);
      payment = {
        ...payment,
        state: 'REVIEW',
        canReport: false,
        claim: {
          ...report,
          status: 'PENDING',
          submittedAt: new Date().toISOString(),
          reviewedAt: null,
          reviewedBy: null,
          reason: null,
        },
        history: [
          ...payment.history,
          {
            id: 2,
            kind: 'REPORTED',
            actorId: 999,
            actorName: null,
            createdAt: new Date().toISOString(),
            hasEvidence: Boolean(report.evidenceDataUrl),
            details: null,
          },
        ],
      };
      data = payment;
    }
    if (path === '/payments/77/mobile/decision') {
      const decision = route.request().postDataJSON();
      decisions.push(decision);
      payment = {
        ...payment,
        state: decision.decision === 'OBSERVE' ? 'OBSERVED' : 'CONFIRMED',
        canReport: decision.decision === 'OBSERVE',
        refundableAmount: decision.decision === 'APPROVE' ? 100 : 0,
        claim: {
          ...payment.claim!,
          status: decision.decision === 'OBSERVE' ? 'OBSERVED' : 'APPROVED',
          reason: decision.reason ?? null,
        },
      };
      data = payment;
    }
    if (path === '/payments/77/mobile/refund-record') {
      refunds.push(route.request().postDataJSON());
      payment = { ...payment, state: 'REFUNDED', refundableAmount: 0, refundedAmount: 100 };
      data = payment;
    }
    if (path === '/payments/77/mobile') data = payment;
    await route.fulfill({ json: { success: true, data } });
  });
  await page.addInitScript((user) => {
    localStorage.setItem('verde-bowl:accessToken', 'direct-test-token');
    localStorage.setItem(
      'verde-bowl:state',
      JSON.stringify({
        persistenceVersion: 1,
        ownerUserId: user.id,
        auth: { user, isAuthenticated: true, status: 'succeeded', error: null },
        cart: { items: [] },
        favorites: { items: [] },
      }),
    );
  }, user);
  return {
    reports,
    decisions,
    refunds,
    showActiveOrder: () => {
      showActiveOrder = true;
    },
    changeOrder: (values: Record<string, unknown>) => {
      orderOverrides = values;
    },
    change: (values: Partial<DirectPaymentDetail>) => {
      payment = { ...payment, ...values };
    },
  };
}

for (const provider of ['yape', 'plin'] as const)
  test(`cliente reporta ${provider} después de crear el pedido y retoma sin volver a pagar`, async ({
    page,
  }) => {
    const mock = await setup(page, provider);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/checkout/confirmacion?pedido=DIRECT-001');
    const card = page.getByRole('region', {
      name: `Pago directo ${provider === 'yape' ? 'Yape' : 'Plin'}`,
    });
    await expect(card.getByText('CUENTA DE PRUEBA', { exact: true })).toBeVisible();
    await expect(page.getByText('Pago enviado a validación', { exact: true })).toHaveCount(0);
    await card.getByRole('button', { name: 'Ya pagué' }).click();
    await page.getByLabel('Referencia o código de operación').fill('OP-777');
    await page.getByLabel('Nombre de quien pagó').fill('Cliente Prueba');
    await page.getByLabel('Fecha y hora del pago (Perú)').fill('2026-10-30T12:15');
    await page.getByLabel('Importe transferido').fill('100');
    await page.getByRole('button', { name: 'Enviar reporte para verificar' }).click();
    await expect.poll(() => mock.reports.length).toBe(1);
    expect(mock.reports[0]).toMatchObject({
      operationCode: 'OP-777',
      payerName: 'Cliente Prueba',
      amount: 100,
      paidAt: '2026-10-30T17:15:00.000Z',
    });
    await expect(card.getByText('Por verificar', { exact: true })).toBeVisible();
    await page.reload();
    await expect(card.getByText('Por verificar', { exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Ya pagué' })).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });

for (const provider of ['yape', 'plin'] as const)
  test(`checkout crea el pedido ${provider} antes de pedir una transferencia y mantiene pago en línea`, async ({
    page,
  }, testInfo) => {
    const method = provider === 'yape' ? 'Yape' : 'Plin';
    await setup(page, provider);
    const placed: Array<Record<string, unknown>> = [];
    await page.route('**/api/v1/checkout/*', async (route) => {
      if (route.request().url().endsWith('/place')) {
        placed.push(route.request().postDataJSON());
        await route.fulfill({
          json: {
            success: true,
            data: {
              orderNumber: 'DIRECT-001',
              orderId: 1,
              status: 'PENDING_PAYMENT',
              grandTotal: 100,
              currency: 'PEN',
              checkoutUrl: null,
              provider,
              reused: false,
            },
          },
        });
      } else
        await route.fulfill({
          json: {
            success: true,
            data: {
              items: [],
              subtotal: 100,
              deliveryFee: 0,
              discountTotal: 0,
              walletAmount: 0,
              walletBalance: 0,
              taxRate: 0.18,
              taxableBase: 84.75,
              taxTotal: 15.25,
              grandTotal: 100,
              currency: 'PEN',
              minimumOrder: 0,
              meetsMinimum: true,
              branchId: 1,
              branchName: 'Local de prueba',
              isOpenNow: true,
              etaMinutes: 30,
              demandLevel: 'LOW',
              etaSource: 'ESTIMATE',
              discounts: [],
            },
          },
        });
    });
    await page.route('**/api/v1/account/purchase-context', (route) =>
      route.fulfill({ json: { success: true, data: { source: 'EMPTY' } } }),
    );
    await page.addInitScript(() => {
      const saved = JSON.parse(localStorage.getItem('verde-bowl:state')!);
      saved.cart = {
        items: [
          {
            id: 'direct-cart',
            productId: 1,
            variantId: 1,
            name: 'Torta de prueba',
            variantName: 'Individual',
            imageUrl: null,
            quantity: 1,
            unitPrice: 100,
            extrasTotal: 0,
            lineTotal: 100,
            selections: [],
            nutrition: null,
          },
        ],
        subtotal: 100,
        grandTotal: 100,
        discountTotal: 0,
        deliveryFee: 0,
        walletAmount: 0,
        couponCode: null,
      };
      localStorage.setItem('verde-bowl:state', JSON.stringify(saved));
      localStorage.setItem(
        'verde-bowl:purchase-context:v2',
        JSON.stringify({
          address: null,
          branchId: 1,
          deliveryType: 'PICKUP',
          serviceMode: 'ASAP',
          cityId: null,
          pickupBranch: {
            id: 1,
            name: 'Local de prueba',
            addressLine: 'Av. Prueba 123',
            acceptsPickup: true,
          },
          scheduledSlotId: null,
        }),
      );
    });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto('/checkout');
    const methods = page.getByRole('group', { name: 'Método de pago' });
    await expect(methods.getByRole('button', { name: /^Pago en línea/ })).toBeVisible();
    await expect(methods.getByRole('button', { name: /Efectivo/ })).toHaveCount(0);
    await expect(methods.getByRole('button', { name: /^Plin/ })).toBeEnabled();
    await methods.getByRole('button', { name: new RegExp(`^${method}`) }).click();
    await methods.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`checkout-${provider}.png`) });
    await expect(page.getByLabel('Referencia o código de operación')).toHaveCount(0);
    await expect(page.getByText('CUENTA DE PRUEBA', { exact: true })).toHaveCount(0);
    const action = page
      .locator('aside')
      .getByRole('button', { name: `Continuar con ${method}`, exact: true });
    await action.scrollIntoViewIfNeeded();
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await action.click();
    await expect.poll(() => placed.length).toBe(1);
    expect(placed[0].paymentMethod).toBe(provider.toUpperCase());
    expect(placed[0]).not.toHaveProperty('mobilePayment');
    await expect(page).toHaveURL(/checkout\/confirmacion\?pedido=DIRECT-001/);
    await expect(page.getByText('CUENTA DE PRUEBA', { exact: true })).toBeVisible();
    const qr = page.getByRole('img', { name: `QR de demostración de ${method}`, exact: true });
    await expect(qr).toBeVisible();
    await expect(qr).toHaveJSProperty('naturalWidth', 320);
    await expect(
      page.getByText('QR de demostración. Para pagar, usa el número 999111222.', { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('region', { name: `Pago directo ${method}` })
      .screenshot({ path: testInfo.outputPath(`direct-${provider}.png`) });
  });

test('superadmin accede a las cuentas globales desde Yape y Plin y ve sus QR de prueba', async ({
  page,
}) => {
  await setup(page, 'yape', false, true);
  await page.route('**/api/v1/settings/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1/settings/', '');
    let data: unknown;
    const state = { isConfigured: true, source: 'database', updatedAt: null };
    if (path === 'business')
      data = {
        ...state,
        business: {
          legalName: 'Negocio Prueba',
          commercialName: 'Misky Challay',
          ruc: '20600000000',
          address: 'Av. Prueba 123',
          phone: '999888777',
          email: 'test@example.test',
          supportEmail: 'test@example.test',
          complaintResponseDays: 15,
        },
      };
    if (path === 'local-payments')
      data = {
        ...state,
        localPayments: {
          yapeEnabled: true,
          plinEnabled: true,
          yapePhone: '926749330',
          plinPhone: '926749330',
          yapeRecipient: 'Frank Smith Bocangelino Rojas',
          plinRecipient: 'Frank Smith Bocangelino Rojas',
          yapeQrImageUrl: '/images/payments/demo-yape-qr.svg',
          plinQrImageUrl: '/images/payments/demo-plin-qr.svg',
          instructions: 'Verifica el destinatario antes de transferir.',
          paymentWindowMinutes: 15,
          reviewAlertMinutes: 10,
        },
      };
    if (path === 'communication')
      data = {
        ...state,
        communication: {
          emailNotificationsEnabled: false,
          inAppNotificationsEnabled: true,
          orderUpdatesEnabled: true,
          whatsappUpdatesEnabled: false,
          planUpdatesEnabled: true,
          staffAccessEnabled: true,
          availabilityAlertsEnabled: true,
          availabilityEmailSubject: 'Disponible',
          availabilityEmailBody: 'Producto disponible',
          smtpHost: '',
          smtpPort: 587,
          smtpSecure: false,
          smtpUser: '',
          fromEmail: 'test@example.test',
          fromName: 'Prueba',
          replyToEmail: '',
          smtpPasswordConfigured: false,
          deliveryMode: 'console',
        },
      };
    if (path === 'receipts')
      data = {
        ...state,
        receipts: {
          mode: 'INTERNAL_ONLY',
          paperWidth: 80,
          autoPrintKitchenTicket: false,
          autoPrintCustomerTicket: false,
        },
      };
    if (!data) return route.fallback();
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/admin/pagos-directos');
  await page.getByRole('link', { name: 'Configurar cuentas', exact: true }).click();
  await expect(page).toHaveURL(/configuracion-negocio\?tab=payments$/);
  await expect(page.getByRole('heading', { name: 'Yape', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Plin', exact: true })).toBeVisible();
  for (const input of await page.getByLabel('Teléfono asociado', { exact: true }).all())
    await expect(input).toHaveValue('926749330');
  for (const input of await page.getByLabel('Titular visible', { exact: true }).all())
    await expect(input).toHaveValue('Frank Smith Bocangelino Rojas');
  for (const method of ['Yape', 'Plin']) {
    const image = page.getByRole('img', { name: `QR de ${method}`, exact: true });
    await expect(image).toBeVisible();
    await expect(image).toHaveJSProperty('naturalWidth', 320);
  }
  await expect(page.getByText(/QR de demostración: no admite pagos/)).toHaveCount(2);
});

test('caja solicita corrección, verifica el ingreso y registra una devolución con referencia', async ({
  page,
}) => {
  const mock = await setup(page, 'yape', true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/admin/pagos-directos');
  await expect(page.getByRole('article').filter({ hasText: 'DIRECT-001' })).toBeVisible();
  await expect(page.getByText('Revisión demorada', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ver pago', exact: true }).click();
  await page.getByRole('button', { name: 'Solicitar corrección', exact: true }).click();
  let confirm = page.getByRole('dialog').last();
  await confirm.getByLabel('Motivo visible para el cliente').fill('Confirma el nombre del titular');
  await confirm.getByRole('button', { name: 'Solicitar corrección', exact: true }).click();
  await expect.poll(() => mock.decisions.length).toBe(1);
  expect(mock.decisions[0]).toMatchObject({
    decision: 'OBSERVE',
    reason: 'Confirma el nombre del titular',
  });
  await page.getByRole('button', { name: 'Confirmar ingreso', exact: true }).click();
  confirm = page.getByRole('dialog').last();
  await confirm.getByRole('button', { name: 'Sí, recibimos el importe', exact: true }).click();
  await expect.poll(() => mock.decisions.length).toBe(2);
  await page.getByRole('button', { name: 'Registrar devolución', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Referencia de la operación', exact: true })
    .fill('DEV-999');
  await page
    .getByRole('textbox', { name: 'Motivo del registro', exact: true })
    .fill('Cancelación solicitada');
  await page.getByRole('button', { name: 'Registrar devolución realizada', exact: true }).click();
  confirm = page.getByRole('dialog').last();
  await confirm.getByRole('button', { name: 'Ya devolví el dinero', exact: true }).click();
  await expect.poll(() => mock.refunds.length).toBe(1);
  expect(mock.refunds[0]).toMatchObject({
    amount: 100,
    reference: 'DEV-999',
    reason: 'Cancelación solicitada',
  });
  await expect(page.getByText('Devolución registrada: S/ 100.00.', { exact: true })).toBeVisible();
});

test('el cliente ve el motivo y corrige el mismo pago sin otra transferencia', async ({ page }) => {
  const mock = await setup(page, 'plin');
  mock.change({
    state: 'OBSERVED',
    canReport: true,
    claim: {
      operationCode: 'OP-777',
      payerName: 'Cliente Prueba',
      payerPhone: null,
      paidAt: new Date().toISOString(),
      declaredAmount: 100,
      submittedAt: new Date().toISOString(),
      status: 'OBSERVED',
      reviewedAt: null,
      reviewedBy: null,
      reason: 'Código incompleto',
    },
  });
  await page.goto('/checkout/confirmacion?pedido=DIRECT-001');
  await expect(page.getByText(/Código incompleto/)).toBeVisible();
  await page.getByRole('button', { name: 'Corregir reporte', exact: true }).click();
  await expect(page.getByLabel('Referencia o código de operación')).toHaveValue('OP-777');
  await page.getByLabel('Referencia o código de operación').fill('OP-777A');
  await page.getByRole('button', { name: 'Enviar reporte para verificar' }).click();
  await expect.poll(() => mock.reports.length).toBe(1);
  expect(mock.reports[0].operationCode).toBe('OP-777A');
});

for (const provider of ['yape', 'plin'] as const) {
  for (const width of [1440, 390]) {
    test(`diseño de pago ${provider} accesible con resumen y QR ampliable (${width}px)`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const mock = await setup(page, provider);
      mock.showActiveOrder();
      const method = provider === 'yape' ? 'Yape' : 'Plin';
      await page.goto('/checkout/confirmacion?pedido=DIRECT-001');
      await expect(
        page.getByRole('heading', { level: 1, name: `Tu pago con ${method}` }),
      ).toBeVisible();
      const cookie = page.getByRole('button', { name: 'Solo necesario', exact: true });
      if (await cookie.isVisible()) await cookie.click();
      await expect(page.getByRole('complementary', { name: 'Pedido en curso' })).toHaveCount(0);
      const card = page.getByRole('region', { name: `Pago directo ${method}` });
      const summary = page.getByRole('complementary', { name: 'Resumen del pedido y seguimiento' });
      await expect(summary).toContainText('Torta de prueba');
      await expect(summary).toContainText('Av. Prueba 123 · Miraflores');
      await expect(
        summary.getByRole('link', { name: 'Ver seguimiento del pedido' }),
      ).toHaveAttribute('href', '/cuenta/pedidos/DIRECT-001');
      await expect(card.getByRole('list', { name: 'Pasos del pago' })).toBeVisible();
      await card.getByRole('button', { name: `Ampliar QR de ${method}` }).click();
      const dialog = page.getByRole('dialog', { name: `QR de ${method}` });
      await expect(
        dialog.getByRole('img', { name: `QR de demostración de ${method} ampliado` }),
      ).toBeVisible();
      await expect(dialog).toContainText(
        'QR de demostración. Para pagar, usa el número 999111222.',
      );
      await dialog.getByRole('button', { name: 'Cerrar QR' }).click();
      await card.getByRole('button', { name: 'Ya pagué' }).click();
      const form = card.getByRole('form', { name: 'Reporte de transferencia' });
      await expect(form.getByLabel('Referencia o código de operación')).toBeFocused();
      await form.getByLabel('Importe transferido').fill('110');
      await expect(form.getByRole('alert')).toContainText(
        'El importe ingresado es distinto de S/ 100.00.',
      );
      await form.getByLabel('Importe transferido').fill('100');
      await expect(form.getByRole('alert')).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Enviar reporte para verificar', exact: true }),
      ).toHaveCount(1);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      if (width > 1000) {
        const bounds = await card.boundingBox();
        const aside = await summary.boundingBox();
        expect(bounds!.width).toBeGreaterThan(700);
        expect(aside!.x).toBeGreaterThan(bounds!.x + bounds!.width);
      }
      await page.evaluate(() => {
        (document.activeElement as HTMLElement)?.blur();
        window.scrollTo(0, 0);
      });
      await page.screenshot({ path: testInfo.outputPath(`pago-${provider}-${width}.png`) });
    });
  }
}

test('copia el número y conserva el reporte mientras actualiza su estado', async ({ page }) => {
  const mock = await setup(page);
  await page.goto('/checkout/confirmacion?pedido=DIRECT-001');
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          document.documentElement.dataset.copied = text;
        },
      },
    }),
  );
  await page.getByRole('button', { name: 'Copiar número', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-copied', '999111222');
  await page.getByRole('button', { name: 'Ya pagué' }).click();
  const code = page.getByLabel('Referencia o código de operación');
  await code.fill('BORRADOR-123');
  mock.change({ contactName: 'Nombre actualizado desde la cuenta' });
  await page.getByRole('button', { name: 'Actualizar pago' }).click();
  await expect(code).toHaveValue('BORRADOR-123');
  mock.change({ state: 'REVIEW', canReport: false });
  await page.getByRole('button', { name: 'Actualizar pago' }).click();
  await expect(page.getByText('Por verificar', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'QR de demostración de Yape', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('form', { name: 'Reporte de transferencia' })).toHaveCount(0);
});

test('el vencimiento cierra el QR y retira las acciones de transferir y reportar', async ({
  page,
}) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  const mock = await setup(page);
  mock.change({
    recipient: {
      ...initialPayment('yape').recipient,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    },
  });
  await page.goto('/checkout/confirmacion?pedido=DIRECT-001');
  await expect(page.getByRole('timer', { name: 'Tiempo disponible para pagar' })).toBeVisible();
  await page.getByRole('button', { name: 'Ampliar QR de Yape' }).click();
  await expect(page.getByRole('dialog', { name: 'QR de Yape' })).toBeVisible();
  await page.clock.runFor(62000);
  await page.clock.runFor(500);
  await expect(page.getByRole('dialog', { name: 'QR de Yape' })).toBeHidden();
  await expect(page.getByText('Plazo vencido', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ya pagué' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ampliar QR de Yape' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Consultar al taller' })).toBeVisible();
  expect(mock.reports).toHaveLength(0);
});

test('adjunta, previsualiza y retira una constancia sin perder los datos del reporte', async ({
  page,
}) => {
  const mock = await setup(page);
  await page.goto('/checkout/confirmacion?pedido=DIRECT-001');
  await page.getByRole('button', { name: 'Ya pagué' }).click();
  await page.getByLabel('Referencia o código de operación').fill('OP-ADJUNTO');
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 160;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 160, 160);
    context.fillStyle = '#803a52';
    context.fillText('PRUEBA', 20, 80);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const file = {
    name: 'constancia-prueba.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  };
  const input = page.getByLabel('Constancia del pago (opcional)', { exact: true });
  await input.setInputFiles(file);
  await expect(
    page.getByRole('img', { name: 'Vista previa de la constancia adjunta' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Quitar adjunto' }).click();
  await expect(
    page.getByRole('img', { name: 'Vista previa de la constancia adjunta' }),
  ).toHaveCount(0);
  await input.setInputFiles(file);
  await expect(
    page.getByRole('img', { name: 'Vista previa de la constancia adjunta' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Enviar reporte para verificar' }).click();
  await expect.poll(() => mock.reports.length).toBe(1);
  expect(mock.reports[0].evidenceDataUrl).toMatch(/^data:image\/webp;base64,/);
  expect(mock.reports[0].operationCode).toBe('OP-ADJUNTO');
});

test('distingue el anticipo del total y muestra el saldo del plan aplicado', async ({ page }) => {
  const mock = await setup(page);
  mock.change({ stage: 'DEPOSIT', amount: 40 });
  mock.changeOrder({ walletAmount: 20, grandTotal: 80 });
  await page.goto('/checkout/confirmacion?pedido=DIRECT-001');
  const card = page.getByRole('region', { name: 'Pago directo Yape' });
  await expect(card.getByRole('heading', { name: 'Yape · Anticipo' })).toBeVisible();
  await expect(card.getByText('S/ 40.00', { exact: true })).toBeVisible();
  const summary = page.getByRole('complementary', { name: 'Resumen del pedido y seguimiento' });
  await expect(summary.getByText('Total del pedido').locator('..')).toContainText('S/ 80.00');
  await expect(summary.getByText('Anticipo', { exact: true }).locator('..')).toContainText(
    'S/ 40.00',
  );
  await expect(summary.getByText('Saldo del plan aplicado').locator('..')).toContainText(
    'S/ 20.00',
  );
});

test('el QR configurado se identifica como cobro de la tienda y permite ampliarlo', async ({
  page,
}) => {
  const mock = await setup(page, 'plin');
  mock.change({
    recipient: { ...initialPayment('plin').recipient, qrImageUrl: '/qr-cobro-prueba.png' },
  });
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 320;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, 320, 320);
    context.fillStyle = '#803a52';
    context.fillText('PRUEBA DE INTERFAZ', 30, 160);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.route('**/qr-cobro-prueba.png', (route) => {
    return route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(png, 'base64'),
    });
  });
  await page.goto('/checkout/confirmacion?pedido=DIRECT-001');
  const card = page.getByRole('region', { name: 'Pago directo Plin' });
  await expect(
    card.getByRole('img', { name: 'QR de Plin del taller', exact: true }),
  ).toHaveJSProperty('naturalWidth', 320);
  await expect(card.getByText(/QR de demostración/)).toHaveCount(0);
  await card.getByRole('button', { name: 'Ampliar QR de Plin' }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'QR de Plin' })
      .getByRole('img', { name: 'QR de Plin ampliado', exact: true }),
  ).toBeVisible();
});
