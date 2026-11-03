import { expect, test, type Page } from '@playwright/test';
import type {
  MessagingConfig,
  ConversationDetail,
  Delivery,
} from '../frontend/src/features/admin/services/communications.service';
const user = {
  id: 999,
  email: 'communications@example.test',
  firstName: 'Equipo',
  lastName: 'Prueba',
  phone: '999888777',
  avatarUrl: null,
  roles: ['CUSTOMER'],
  permissions: ['communication.read', 'communication.reply'],
  branchIds: [],
  isSuperAdmin: true,
};
const events = [
  'PAYMENT_PENDING',
  'PAYMENT_REMINDER',
  'PAYMENT_FAILED',
  'PAYMENT_EXPIRED',
  'PAYMENT_REPORTED',
  'PAYMENT_OBSERVED',
  'PAYMENT_APPROVED',
  'PAYMENT_REJECTED',
  'PAYMENT_REFUNDED',
  'ORDER_CONFIRMED',
  'ORDER_PREPARING',
  'ORDER_READY',
  'ORDER_OUT_FOR_DELIVERY',
  'ORDER_DELIVERED',
  'ORDER_CANCELLED',
  'DESIGN_QUOTED',
];
const configuration = (): MessagingConfig => ({
  enabled: true,
  testMode: true,
  supportPhone: '926749330',
  botEnabled: true,
  paymentReminders: { enabled: false, delayMinutes: 5, activatedAt: null },
  phoneNumberId: '',
  graphVersion: '',
  language: 'es',
  welcome: 'Hola, somos Misky Challay.',
  deliveryInfo: 'Delivery según dirección.',
  humanReply: 'Una persona te atenderá.',
  closedReply: 'Volveremos en horario de atención.',
  openingTime: '09:00',
  closingTime: '19:00',
  workingDays: [1, 2, 3, 4, 5, 6],
  events: Object.fromEntries(
    events.map((key) => [key, { email: true, whatsapp: true, template: '', emailText: '' }]),
  ),
});
async function setup(
  page: Page,
  readOnly = false,
  paymentState = 'REVIEW',
  includeReminder = false,
) {
  const actor = readOnly
    ? { ...user, isSuperAdmin: false, permissions: ['communication.read'] }
    : user;
  let config = configuration();
  const saved: Array<Record<string, unknown>> = [];
  const replies: Array<Record<string, unknown>> = [];
  const retries: Array<Record<string, unknown>> = [];
  const chat: ConversationDetail = {
    conversation: {
      id: 1,
      name: 'Conversación de prueba',
      phone: '51999888777',
      isTest: true,
      mode: 'BOT',
      assignedTo: null,
      optedOutAt: null,
      lastInboundAt: new Date().toISOString(),
      lastMessage: '',
      unread: 0,
    },
    messages: [],
    hasMore: false,
  };
  const deliveries = ['SIMULATED', 'UNKNOWN', 'ACCEPTED'].map((state, index) => ({
    id: index + 1,
    channel: 'EMAIL',
    recipient: 'test@example.test',
    subject: ['Correo simulado', 'Resultado desconocido', 'Correo aceptado'][index],
    event: 'TEST',
    state,
    simulation: state === 'SIMULATED',
    attempts: 1,
    error: state === 'UNKNOWN' ? 'Comprueba el envío anterior.' : null,
    createdAt: new Date().toISOString(),
    providerMessageId: null,
  })) as Delivery[];
  if (includeReminder)
    deliveries.push({
      ...deliveries[0],
      id: 4,
      event: 'PAYMENT_REMINDER',
      subject: 'Tu pedido sigue pendiente de pago · REMINDER-41',
      state: 'QUEUED',
      attempts: 0,
    });
  let seeded = readOnly;
  if (readOnly)
    chat.messages.push({
      id: 1,
      direction: 'IN',
      body: 'Tengo una consulta',
      state: 'RECEIVED',
      actorId: null,
      createdAt: new Date().toISOString(),
    });
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const body =
      route.request().method() === 'POST' || route.request().method() === 'PUT'
        ? route.request().postDataJSON()
        : null;
    let data: unknown = [];
    if (path === '/auth/me') data = actor;
    if (path === '/settings/public')
      data = {
        business: {
          commercialName: 'Misky Challay',
          legalName: 'Prueba',
          ruc: '20600000000',
          phone: '999888777',
          whatsappPhone: '926749330',
          address: 'Lima',
          email: 'test@example.test',
          supportEmail: 'test@example.test',
          complaintResponseDays: 15,
        },
        receipts: { mode: 'INTERNAL_ONLY' },
      };
    if (path === '/account/purchase-context') data = { source: 'EMPTY' };
    if (path === '/orders')
      data = [
        {
          id: 1,
          orderNumber: 'COMM-ORDER',
          status: 'PENDING_PAYMENT',
          directPaymentState: paymentState,
          placedAt: new Date().toISOString(),
          deliveryType: 'PICKUP',
          serviceMode: 'SCHEDULED',
          scheduledAt: null,
        },
      ];
    if (path === '/communications/events')
      return route.fulfill({ contentType: 'text/event-stream', body: ': heartbeat\n\n' });
    if (path === '/communications/settings') {
      if (body) {
        saved.push(body);
        config = body.config;
        if (config.paymentReminders.enabled && !config.paymentReminders.activatedAt)
          config = {
            ...config,
            paymentReminders: { ...config.paymentReminders, activatedAt: new Date().toISOString() },
          };
      }
      data = {
        config,
        accessTokenConfigured: saved.length > 0,
        appSecretConfigured: saved.length > 0,
        verifyToken: 'verification-token-for-test',
        connectionReady: Boolean(config.phoneNumberId && config.graphVersion && saved.length),
        webhookReady: true,
        smtpConfigured: true,
        whatsappUpdatesEnabled: true,
        emailNotificationsEnabled: true,
      };
    }
    if (path === '/communications/connection/check')
      data = {
        displayPhone: '+51 926 749 330',
        verifiedName: 'Misky Challay',
        matchesSupportPhone: true,
      };
    if (path === '/communications/conversations')
      data = {
        items: seeded ? [chat.conversation] : [],
        total: seeded ? 1 : 0,
        page: 1,
        pageSize: 30,
      };
    if (path === '/communications/conversations/1') data = chat;
    if (path === '/communications/conversations/1/mode') {
      chat.conversation.mode = body.mode;
      chat.conversation.assignedTo = body.mode === 'HUMAN' ? actor.id : null;
      data = chat.conversation;
    }
    if (path === '/communications/conversations/1/reply') {
      replies.push(body);
      chat.messages.push({
        id: chat.messages.length + 1,
        direction: 'OUT',
        body: body.text,
        state: 'QUEUED',
        actorId: actor.id,
        createdAt: new Date().toISOString(),
      });
      data = null;
    }
    if (path === '/communications/test/incoming') {
      seeded = true;
      chat.conversation.phone = `51${body.phone}`;
      chat.messages.push({
        id: chat.messages.length + 1,
        direction: 'IN',
        body: body.text,
        state: 'RECEIVED',
        actorId: null,
        createdAt: new Date().toISOString(),
      });
      let response =
        'Hola, somos Misky Challay.\n1. Consultar mi pedido\n2. Cómo pagar con Yape o Plin\n3. Horarios y delivery\n4. Hablar con una persona';
      if (body.text === '4') {
        chat.conversation.mode = 'HUMAN';
        response = 'Una persona te atenderá.';
      }
      chat.messages.push({
        id: chat.messages.length + 1,
        direction: 'OUT',
        body: response,
        state: 'SIMULATED',
        actorId: null,
        createdAt: new Date().toISOString(),
      });
      data = { conversationId: 1 };
    }
    if (path === '/communications/test/delivery') data = { simulation: true, deliveryId: 1 };
    if (path === '/communications/deliveries') {
      const event = new URL(route.request().url()).searchParams.get('event');
      const items = deliveries.filter((delivery) => !event || delivery.event === event);
      data = { items, total: items.length, page: 1, pageSize: 30 };
    }
    if (path === '/communications/deliveries/2/retry') {
      retries.push(body);
      deliveries[1].state = 'QUEUED';
      data = null;
    }
    await route.fulfill({ json: { success: true, data } });
  });
  await page.addInitScript((actor) => {
    localStorage.setItem('verde-bowl:accessToken', 'communications-ui-test-token');
    localStorage.setItem(
      'verde-bowl:state',
      JSON.stringify({
        auth: { user: actor, isAuthenticated: true, status: 'succeeded', error: null },
        cart: {
          items: [],
          subtotal: 0,
          grandTotal: 0,
          discountTotal: 0,
          deliveryFee: 0,
          walletAmount: 0,
          couponCode: null,
        },
        favorites: { items: [] },
      }),
    );
  }, actor);
  return { saved, replies, retries };
}

for (const width of [1440, 390])
  test(`simula el bot y permite tomar la conversación para responder (${width}px)`, async ({
    page,
  }, testInfo) => {
    const fixture = await setup(page);
    await page.setViewportSize({ width, height: 950 });
    await page.goto('/admin/comunicaciones?tab=tests');
    await expect(
      page.getByText('Modo de prueba: sin envíos reales', { exact: true }),
    ).toBeVisible();
    await page.getByLabel('Celular de prueba', { exact: true }).fill('999888777');
    await page.getByRole('button', { name: 'Simular mensaje', exact: true }).click();
    await expect(page.getByRole('log')).toContainText('Cómo pagar con Yape o Plin');
    await expect(page.getByRole('log')).toContainText('Simulado · sin envío real');
    await expect(page.getByLabel('Respuesta al cliente', { exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Tomar conversación', exact: true }).click();
    await expect(page.getByLabel('Respuesta al cliente', { exact: true })).toBeEnabled();
    await page
      .getByLabel('Respuesta al cliente', { exact: true })
      .fill('Estamos revisando tu reporte.');
    await page.getByRole('button', { name: 'Enviar respuesta', exact: true }).click();
    await expect.poll(() => fixture.replies.length).toBe(1);
    expect(fixture.replies[0]).toMatchObject({ text: 'Estamos revisando tu reporte.' });
    expect(fixture.replies[0].key).toMatch(/^[a-f0-9-]{36}$/);
    await expect(page.getByRole('log')).toContainText('Estamos revisando tu reporte.');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('whatsapp-inbox.png'), fullPage: true });
    await page.getByRole('button', { name: 'Devolver al bot', exact: true }).click();
    await expect(page.getByLabel('Respuesta al cliente', { exact: true })).toBeDisabled();
  });

test('guarda canales, plantillas y credenciales sin publicar los secretos en el formulario', async ({
  page,
}) => {
  const fixture = await setup(page);
  await page.goto('/admin/comunicaciones?tab=settings');
  await expect(page.getByLabel('WhatsApp de atención', { exact: true })).toHaveValue('926749330');
  await page.getByLabel('Identificador del número en Meta', { exact: true }).fill('123456789');
  await page.getByLabel('Versión Graph de tu aplicación', { exact: true }).fill('v24.0');
  await page.getByLabel('Access token de Meta', { exact: true }).fill('ui-test-secret-token');
  await page.getByLabel('App secret de Meta', { exact: true }).fill('ui-test-app-secret');
  await page.getByLabel('Plantilla: Pago reportado', { exact: true }).fill('pago_reportado_prueba');
  await page.getByLabel('Correo: Pago reportado', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Guardar comunicaciones', exact: true }).click();
  await expect.poll(() => fixture.saved.length).toBe(1);
  expect(fixture.saved[0]).toMatchObject({
    config: {
      testMode: true,
      events: {
        PAYMENT_REPORTED: { email: false, whatsapp: true, template: 'pago_reportado_prueba' },
      },
    },
    accessToken: 'ui-test-secret-token',
    appSecret: 'ui-test-app-secret',
  });
  await expect(page.getByLabel('Access token de Meta', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('App secret de Meta', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Verificar conexión con Meta', exact: true }).click();
  await expect(
    page.getByText('Número correcto: +51 926 749 330 · Misky Challay', { exact: true }),
  ).toBeVisible();
});

test('solicita confirmación antes de activar los envíos reales', async ({ page }) => {
  const fixture = await setup(page);
  await page.goto('/admin/comunicaciones?tab=settings');
  await page.getByLabel('Modo de prueba (sin envíos reales)', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Guardar comunicaciones', exact: true }).click();
  const dialog = page.getByRole('dialog').last();
  await expect(dialog).toContainText('Los nuevos avisos se enviarán a clientes');
  expect(fixture.saved).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Activar envíos reales', exact: true }).click();
  await expect.poll(() => fixture.saved.length).toBe(1);
  expect(fixture.saved[0]).toMatchObject({ config: { testMode: false } });
  await expect(page.getByLabel('Estado guardado de los canales')).toContainText('Envíos reales');
});

test('configura la espera del recordatorio y los canales del aviso desde el panel', async ({
  page,
}) => {
  const fixture = await setup(page);
  await page.goto('/admin/comunicaciones?tab=settings');
  await page.getByLabel('Recordar pagos pendientes', { exact: true }).check();
  await page.getByRole('spinbutton', { name: /Espera antes del recordatorio/ }).fill('2');
  await page.getByLabel('WhatsApp: Recordatorio de pago pendiente', { exact: true }).uncheck();
  await page
    .getByRole('button', {
      name: 'Personalizar correo: Recordatorio de pago pendiente',
      exact: true,
    })
    .click();
  await page
    .getByLabel('Texto de correo: Recordatorio de pago pendiente', { exact: true })
    .fill('Tu pedido {{pedido}} sigue pendiente. Revisa su estado en {{enlace}}.');
  await page.getByRole('button', { name: 'Guardar comunicaciones', exact: true }).click();
  await expect.poll(() => fixture.saved.length).toBe(1);
  expect(fixture.saved[0]).toMatchObject({
    config: {
      paymentReminders: { enabled: true, delayMinutes: 2 },
      events: {
        PAYMENT_REMINDER: {
          email: true,
          whatsapp: false,
          emailText: 'Tu pedido {{pedido}} sigue pendiente. Revisa su estado en {{enlace}}.',
        },
      },
    },
  });
  await expect(
    page.getByRole('button', { name: 'Guardar comunicaciones', exact: true }),
  ).toBeDisabled();
});

test('filtra los recordatorios en el historial de envíos', async ({ page }) => {
  await setup(page, false, 'REVIEW', true);
  await page.goto('/admin/comunicaciones?tab=history');
  await page
    .getByRole('combobox', { name: 'Filtrar por tipo de aviso' })
    .selectOption('PAYMENT_REMINDER');
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article')).toContainText(
    'Tu pedido sigue pendiente de pago · REMINDER-41',
  );
  await expect(page.getByRole('article')).not.toContainText('Correo aceptado');
});

for (const width of [1440, 390])
  test(`la configuración mantiene los cambios al filtrar y se adapta sin desbordar (${width}px)`, async ({
    page,
  }, testInfo) => {
    const fixture = await setup(page);
    await page.setViewportSize({ width, height: 950 });
    await page.goto('/admin/comunicaciones?tab=settings');
    const form = page.getByRole('form', { name: 'Configuración de comunicaciones' });
    const save = form.getByRole('button', { name: 'Guardar comunicaciones', exact: true });
    await expect(save).toBeDisabled();
    await expect(page.getByLabel('Estado guardado de los canales')).toContainText(
      'No llegan al cliente',
    );
    await expect(
      page.getByRole('button', { name: 'Verificar conexión con Meta', exact: true }),
    ).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath('settings-overview.png') });

    await page.getByText('Datos para el webhook', { exact: true }).click();
    await expect(page.getByText('verification-token-for-test', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Mostrar token de verificación', exact: true }).click();
    await expect(page.getByText('verification-token-for-test', { exact: true })).toBeVisible();
    const meta = form.locator('section').filter({
      has: page.getByRole('heading', { name: 'Conexión de WhatsApp con Meta', exact: true }),
    });
    await meta.screenshot({ path: testInfo.outputPath('settings-meta.png') });

    await page.getByLabel('Saludo del bot', { exact: true }).fill('Hola, bienvenida a la tienda.');
    const bot = form.locator('section').filter({
      has: page.getByRole('heading', { name: 'Respuestas del bot y horarios', exact: true }),
    });
    await bot.screenshot({ path: testInfo.outputPath('settings-bot.png') });
    await page.getByLabel('Correo: Pago reportado', { exact: true }).uncheck();
    await form.getByRole('tab', { name: 'Pedidos', exact: true }).click();
    await expect(page.getByLabel('Plantilla: Pago reportado', { exact: true })).toHaveCount(0);
    await page
      .getByLabel('Plantilla: Pedido confirmado', { exact: true })
      .fill('pedido_confirmado');
    const eventsSection = form
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Avisos por evento', exact: true }) });
    await eventsSection.screenshot({ path: testInfo.outputPath('settings-events.png') });
    await form.getByRole('tab', { name: 'Pagos', exact: true }).click();
    await expect(page.getByLabel('Correo: Pago reportado', { exact: true })).not.toBeChecked();
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await expect(page.getByLabel('Saludo del bot', { exact: true })).toHaveValue(
      'Hola, bienvenida a la tienda.',
    );
    await expect(form.getByText('Tienes cambios sin guardar.', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await save.click();
    await expect.poll(() => fixture.saved.length).toBe(1);
    expect(fixture.saved[0]).toMatchObject({
      config: {
        welcome: 'Hola, bienvenida a la tienda.',
        events: {
          PAYMENT_REPORTED: { email: false },
          ORDER_CONFIRMED: { template: 'pedido_confirmado' },
        },
      },
    });
    await expect(save).toBeDisabled();
    await page
      .getByLabel('Saludo del bot', { exact: true })
      .fill('Cambio temporal para descartar.');
    await form.getByRole('button', { name: 'Restablecer', exact: true }).click();
    await expect(page.getByLabel('Saludo del bot', { exact: true })).toHaveValue(
      'Hola, bienvenida a la tienda.',
    );
    await expect(save).toBeDisabled();
  });

test('distingue simulación de aceptación y solicita comprobar un resultado desconocido antes de reintentar', async ({
  page,
}) => {
  const fixture = await setup(page);
  await page.goto('/admin/comunicaciones?tab=history');
  const unknown = page.getByRole('article').filter({ hasText: 'Resultado desconocido' });
  await expect(
    page.getByText('Simulado · sin envío real · 1 intentos', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Aceptado por el proveedor · 1 intentos', { exact: true }),
  ).toBeVisible();
  await unknown.getByRole('button', { name: 'Reintentar', exact: true }).click();
  const dialog = page.getByRole('dialog').last();
  await expect(dialog).toContainText('pudo recibir el mensaje anterior');
  await dialog.getByRole('button', { name: 'Ya revisé, reintentar', exact: true }).click();
  await expect.poll(() => fixture.retries.length).toBe(1);
  expect(fixture.retries[0]).toEqual({ acknowledgeUnknown: true });
});

test('un operador con permiso de lectura no recibe controles de configuración ni respuesta', async ({
  page,
}) => {
  await setup(page, true);
  await page.goto('/admin/comunicaciones?tab=inbox&conversation=1');
  await expect(page.getByRole('log')).toContainText('Tengo una consulta');
  await expect(page.getByRole('button', { name: 'Tomar conversación', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByLabel('Respuesta al cliente', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Configuración', exact: true })).toHaveCount(0);
});

for (const paymentState of ['REVIEW', 'OBSERVED'])
  test(`el aviso del pedido distingue ${paymentState} de un pago sin reportar`, async ({
    page,
  }) => {
    await setup(page, false, paymentState);
    await page.goto('/carrito');
    const notice = page.getByRole('complementary', { name: 'Pedido en curso' });
    await expect(notice).toContainText(
      paymentState === 'REVIEW' ? 'Pago en revisión' : 'Corrección solicitada',
    );
    await expect(notice).not.toContainText('Pedido sin pagar');
    await expect(notice.getByRole('link')).toHaveText(
      paymentState === 'REVIEW' ? 'Ver revisión' : 'Revisar observación',
    );
  });
