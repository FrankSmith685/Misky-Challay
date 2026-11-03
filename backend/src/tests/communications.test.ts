import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { afterEach, mock, test } from 'node:test';
import { CommunicationDelivery, WhatsappConversation } from '@database/models/messaging.model';
import { Order, MobilePaymentClaim, Notification, sequelize } from '@database/models';
import { SmtpMailProvider } from '../integrations/mail/smtp.provider';
import { TEMPLATES } from '../modules/notifications/templates';
import {
  messagingConfigService,
  messagingUpdateSchema,
} from '../modules/communications/communications.config';
import { communicationQueue } from '../modules/communications/communications.queue';
import { settingsService } from '../modules/settings/settings.service';
import {
  botMenu,
  monotonicDeliveryState,
  validWebhookSignature,
  withinOpeningHours,
  withinServiceWindow,
} from '../modules/communications/communications.logic';

afterEach(() => mock.restoreAll());

test('confirmar un anticipo informa el saldo y no afirma que un pedido programado ya está en cocina', () => {
  const message = TEMPLATES.ORDER_CONFIRMED({ orderNumber: 'TEST-ANTICIPO', customerName: 'Cliente', grandTotal: 100, depositAmount: 50, balancePending: 50, items: [] });
  assert.match(message.text, /anticipo de S\/ 50.00/);
  assert.match(message.text, /saldo de S\/ 50.00/);
  assert.ok(!message.text.includes('ya esta en cocina'));
  assert.ok(!message.html.includes('ya estamos preparando'));
});
const config = messagingUpdateSchema.shape.config.parse({
  enabled: true,
  testMode: true,
  supportPhone: '926749330',
  botEnabled: true,
  phoneNumberId: '',
  graphVersion: '',
  language: 'es',
  welcome: 'Hola, somos Misky Challay',
  deliveryInfo: 'Delivery según dirección.',
  humanReply: 'Te atenderemos.',
  closedReply: 'Volveremos pronto.',
  openingTime: '09:00',
  closingTime: '19:00',
  workingDays: [1, 2, 3, 4, 5, 6],
  events: {},
});
function prepare() {
  mock.method(messagingConfigService, 'runtime', async () => ({
    config,
    accessToken: '',
    appSecret: '',
    verifyToken: '',
    updatedAt: null,
  }));
  mock.method(settingsService, 'getCommunicationSettings', async () => ({
    emailNotificationsEnabled: true,
    whatsappUpdatesEnabled: true,
  }));
  mock.method(WhatsappConversation, 'findOne', async () => null);
  const network = mock.method(globalThis, 'fetch', async () => {
    throw new Error('Una simulación nunca debe acceder a la red');
  });
  return { network };
}
function delivery(extra: Partial<CommunicationDelivery> = {}) {
  const row = CommunicationDelivery.build({
    channel: 'EMAIL',
    recipient: 'test@example.test',
    event: 'TEST',
    subject: 'Prueba',
    payload: { text: 'Prueba', html: '<p>Prueba</p>' },
    simulation: true,
    idempotencyKey: 'unit-simulated',
    ...extra,
  });
  mock.method(row, 'update', async (values: Record<string, unknown>) => {
    row.set(values);
    return row;
  });
  return row;
}

test('la cola conserva el aviso confirmado al comenzar cocina y reserva el agradecimiento para entregado', async () => {
  prepare();
  mock.method(Order, 'findByPk', async () => ({ id: 1, status: 'PREPARING' }));
  const confirmed = delivery({ event: 'ORDER_CONFIRMED', orderId: 1 });
  await communicationQueue.dispatch(confirmed);
  assert.equal(confirmed.state, 'SIMULATED');
  const thanks = delivery({ event: 'ORDER_DELIVERED', orderId: 1 });
  await assert.rejects(communicationQueue.dispatch(thanks), /avanzó a otro estado/);
});
test('valida la firma sobre los bytes originales y rechaza firmas ausentes o alteradas', () => {
  const body = Buffer.from('{"texto":"¡Hola!"}');
  const secret = 'app-secret-de-prueba';
  const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  assert.equal(validWebhookSignature(body, signature, secret), true);
  assert.equal(validWebhookSignature(Buffer.from('{ "texto":"¡Hola!"}'), signature, secret), false);
  assert.equal(validWebhookSignature(body, signature, 'otra-clave'), false);
  assert.equal(validWebhookSignature(body, undefined, secret), false);
  assert.equal(validWebhookSignature(body, 'sha256=aa', secret), false);
});
test('la ventana de servicio depende del último mensaje del cliente y vence a las 24 horas', () => {
  const now = Date.now();
  assert.equal(withinServiceWindow(new Date(now - 23 * 3600000), now), true);
  assert.equal(withinServiceWindow(new Date(now - 24 * 3600000), now), false);
  assert.equal(withinServiceWindow(new Date(now + 1000), now), false);
  assert.equal(withinServiceWindow(null, now), false);
});
test('los horarios usan Lima y contemplan turnos que cruzan medianoche', () => {
  assert.equal(withinOpeningHours(config, new Date('2026-10-31T14:00:00Z')), true);
  assert.equal(withinOpeningHours(config, new Date('2026-11-01T14:00:00Z')), false);
  const overnight = { ...config, openingTime: '22:00', closingTime: '02:00', workingDays: [6] };
  assert.equal(withinOpeningHours(overnight, new Date('2026-11-01T06:00:00Z')), true);
  assert.equal(withinOpeningHours(overnight, new Date('2026-11-02T06:00:00Z')), false);
});
test('callbacks atrasados no degradan lectura o entrega ni ocultan un fallo', () => {
  assert.equal(monotonicDeliveryState('READ', 'DELIVERED'), 'READ');
  assert.equal(monotonicDeliveryState('READ', 'FAILED'), 'READ');
  assert.equal(monotonicDeliveryState('DELIVERED', 'ACCEPTED'), 'DELIVERED');
  assert.equal(monotonicDeliveryState('FAILED', 'ACCEPTED'), 'FAILED');
  assert.equal(monotonicDeliveryState('FAILED', 'DELIVERED'), 'DELIVERED');
  assert.equal(monotonicDeliveryState('SIMULATED', 'READ'), 'SIMULATED');
});
test('la configuración exige número y versión válidos sin aceptar secretos en el objeto público', () => {
  assert.equal(messagingUpdateSchema.safeParse({ config }).success, true);
  assert.equal(
    messagingUpdateSchema.safeParse({ config: { ...config, supportPhone: '123' } }).success,
    false,
  );
  assert.equal(
    messagingUpdateSchema.safeParse({ config: { ...config, graphVersion: 'https://otro.example' } })
      .success,
    false,
  );
  assert.ok(botMenu(config.welcome).includes('Hablar con una persona'));
  assert.ok(botMenu(config.welcome).includes('BAJA'));
});
test('un envío de prueba nunca usa la red ni se presenta como entregado', async () => {
  const { network } = prepare();
  const row = delivery();
  await communicationQueue.dispatch(row);
  assert.equal(row.state, 'SIMULATED');
  assert.ok(!row.providerMessageId);
  assert.equal(network.mock.callCount(), 0);
});
test('cambiar a modo real no convierte los avisos de prueba ya creados en envíos reales', async () => {
  const { network } = prepare();
  mock.method(messagingConfigService, 'runtime', async () => ({
    config: { ...config, testMode: false },
    accessToken: '',
    appSecret: '',
    verifyToken: '',
    updatedAt: null,
  }));
  const row = delivery();
  await communicationQueue.dispatch(row);
  assert.equal(row.state, 'SIMULATED');
  assert.equal(network.mock.callCount(), 0);
});
test('un aviso pendiente de pago se omite si el cliente ya reportó la transferencia', async () => {
  prepare();
  mock.method(Order, 'findByPk', async () => ({ status: 'PENDING_PAYMENT' }));
  mock.method(MobilePaymentClaim, 'findOne', async () => ({ status: 'PENDING' }));
  const { Payment } = await import('@database/models');
  mock.method(Payment, 'findByPk', async () => ({ status: 'PENDING' }));
  await assert.rejects(
    communicationQueue.dispatch(
      delivery({ event: 'PAYMENT_PENDING', orderId: 1, payload: { paymentId: 1 } }),
    ),
    /ya fue reportado/,
  );
});
test('un destinatario que pidió BAJA no recibe avisos ni respuestas del agente', async () => {
  prepare();
  mock.method(WhatsappConversation, 'findOne', async () => ({ optedOutAt: new Date() }));
  await assert.rejects(
    communicationQueue.dispatch(
      delivery({ channel: 'WHATSAPP', event: 'CONVERSATION', payload: { kind: 'text' } }),
    ),
    /desactivó/,
  );
});
test('las respuestas libres requieren un mensaje reciente del cliente', async () => {
  prepare();
  mock.method(WhatsappConversation, 'findOne', async () => ({
    optedOutAt: null,
    lastInboundAt: new Date(Date.now() - 25 * 3600000),
  }));
  await assert.rejects(
    communicationQueue.dispatch(
      delivery({ channel: 'WHATSAPP', event: 'CONVERSATION', payload: { kind: 'text' } }),
    ),
    /24 horas/,
  );
});

test('Meta recibe la plantilla y sus dos variables; aceptar la solicitud no significa entregar el mensaje', async () => {
  prepare();
  mock.method(messagingConfigService, 'runtime', async () => ({ config: { ...config, testMode: false, phoneNumberId: '123456789', graphVersion: 'v24.0' }, accessToken: 'test-token', appSecret: '', verifyToken: '', updatedAt: null }));
  const request = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ messages: [{ id: 'wamid-test-accepted' }] }), { status: 200 }));
  const row = delivery({ id: 321, channel: 'WHATSAPP', recipient: '51999111222', simulation: false, payload: { kind: 'template', template: 'pedido_prueba', parameters: ['ORDER-1', 'https://example.test/cuenta/pedidos/ORDER-1'] } });
  mock.method(row, 'reload', async () => row);
  mock.method(sequelize, 'transaction', async (callback: (transaction: unknown) => Promise<unknown>) => callback({ LOCK: { UPDATE: 'UPDATE' } }));
  mock.method(Notification, 'findOrCreate', async () => []);
  await communicationQueue.dispatch(row);
  const [url, options] = request.mock.calls[0].arguments as unknown as [string, RequestInit];
  assert.equal(url, 'https://graph.facebook.com/v24.0/123456789/messages');
  const payload = JSON.parse(String(options.body));
  assert.equal(payload.to, '51999111222');
  assert.equal(payload.template.name, 'pedido_prueba');
  assert.equal(payload.template.components[0].parameters.length, 2);
  assert.equal(row.state, 'ACCEPTED');
  assert.equal(row.providerMessageId, 'wamid-test-accepted');
});

test('el límite temporal de Meta queda identificado para reintentar sin incluir sus mensajes privados de error', async () => {
  prepare();
  mock.method(messagingConfigService, 'runtime', async () => ({ config: { ...config, testMode: false, phoneNumberId: '123456789', graphVersion: 'v24.0' }, accessToken: 'test-token', appSecret: '', verifyToken: '', updatedAt: null }));
  mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: { code: 130429, message: 'private-provider-debug' } }), { status: 429 }));
  const row = delivery({ channel: 'WHATSAPP', simulation: false, payload: { kind: 'template', template: 'pedido_prueba', parameters: ['1', 'https://example.test'] } });
  await assert.rejects(communicationQueue.dispatch(row), (error: unknown) => {
    assert.equal((error as { disposition: string }).disposition, 'QUEUED');
    assert.ok(!(error as Error).message.includes('private-provider-debug'));
    return true;
  });
});

test('SMTP aceptado se registra con identificador y sin afirmar recepción en el buzón', async () => {
  prepare();
  mock.method(messagingConfigService, 'runtime', async () => ({ config: { ...config, testMode: false }, accessToken: '', appSecret: '', verifyToken: '', updatedAt: null }));
  mock.method(settingsService, 'getCommunicationSettings', async () => ({ emailNotificationsEnabled: true, smtpHost: 'smtp.example.test', smtpPort: 587, smtpSecure: false, smtpUser: '', fromEmail: 'test@example.test', fromName: 'Prueba' }));
  const smtp = mock.method(SmtpMailProvider.prototype, 'send', async () => ({ messageId: 'smtp-test-accepted' }));
  mock.method(sequelize, 'transaction', async (callback: (transaction: unknown) => Promise<unknown>) => callback({ LOCK: { UPDATE: 'UPDATE' } }));
  mock.method(Notification, 'findOrCreate', async () => []);
  const row = delivery({ id: 322, simulation: false });
  mock.method(row, 'reload', async () => row);
  await communicationQueue.dispatch(row);
  assert.equal(smtp.mock.callCount(), 1);
  assert.equal(row.state, 'ACCEPTED');
  assert.equal(row.providerMessageId, 'smtp-test-accepted');
});
