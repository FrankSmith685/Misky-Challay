import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import type { Transaction } from 'sequelize';
import {
  CommunicationDelivery,
  MessagingSetting,
  WhatsappConversation,
} from '@database/models/messaging.model';
import {
  MobilePaymentClaim,
  Notification,
  Order,
  Payment,
  User,
  sequelize,
} from '@database/models';
import {
  messagingConfigSchema,
  messagingConfigService,
  COMMUNICATION_EVENTS,
} from '@modules/communications/communications.config';
import { communicationQueue } from '@modules/communications/communications.queue';
import {
  paymentFollowupDeadline,
  paymentFollowupSkipReason,
  verifiedUnpaidOutcome,
  PAYMENT_EXPIRED_REASON,
  type PaymentFollowupContext,
} from '@modules/communications/paymentFollowup.logic';
import { paymentFollowupState } from '@modules/communications/paymentFollowup.state';
import { paymentRemindersService } from '@modules/communications/paymentReminders.service';
import { paymentNotifications } from '@modules/communications/paymentNotifications.service';
import { settingsService } from '@modules/settings/settings.service';
import { paymentsService } from '@modules/payments/payments.service';
import type { PaymentProvider } from '@integrations/payments';
import { sqlUtcDatetime } from '@shared/utils/datetime';

afterEach(() => mock.restoreAll());
const now = Date.now();
test('los filtros SQL usan UTC sin depender de la zona horaria del proceso', () => {
  assert.equal(sqlUtcDatetime(new Date('2026-10-31T17:30:00-05:00')), '2026-10-31 22:30:00.000');
});
const config = messagingConfigSchema.parse({
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
  paymentReminders: {
    enabled: true,
    delayMinutes: 5,
    activatedAt: new Date(now - 86400000).toISOString(),
  },
  events: Object.fromEntries(
    COMMUNICATION_EVENTS.map((event) => [event, { email: true, whatsapp: true, template: '' }]),
  ),
});
function context(): PaymentFollowupContext {
  const order = Order.build({
    id: 41,
    userId: 51,
    orderNumber: 'REMINDER-41',
    branchId: 1,
    deliveryType: 'PICKUP',
    subtotal: 18,
    grandTotal: 18,
    status: 'PENDING_PAYMENT',
    placedAt: new Date(now - 6 * 60000),
    whatsappOptInAt: new Date(now - 6 * 60000),
  });
  const payment = Payment.build({
    id: 61,
    payableId: 41,
    payableType: 'ORDER',
    provider: 'yape',
    status: 'PENDING',
    stage: 'FULL',
    amount: 18,
    currency: 'PEN',
    idempotencyKey: 'reminder-payment-test',
    createdAt: new Date(now - 6 * 60000),
    safeResponseJson: { directPayment: { expiresAt: new Date(now + 20 * 60000).toISOString() } },
  });
  return { order, payments: [payment], hasReport: false };
}
function prepare(current = context()) {
  const user = User.build({
    id: 51,
    status: 'ACTIVE',
    email: 'reminder@example.test',
    phone: '999888777',
    firstName: 'Prueba',
  });
  mock.method(messagingConfigService, 'runtime', async () => ({
    config,
    accessToken: '',
    appSecret: '',
    verifyToken: '',
    updatedAt: null,
  }));
  mock.method(settingsService, 'getCommunicationSettings', async () => ({
    orderUpdatesEnabled: true,
    emailNotificationsEnabled: true,
    whatsappUpdatesEnabled: true,
    inAppNotificationsEnabled: true,
  }));
  mock.method(Order, 'findByPk', async () => current.order);
  mock.method(Payment, 'findAll', async () => current.payments);
  mock.method(Payment, 'findByPk', async () => current.payments[0]);
  mock.method(MobilePaymentClaim, 'count', async () => Number(current.hasReport));
  mock.method(MobilePaymentClaim, 'findOne', async () =>
    current.hasReport ? { status: 'PENDING' } : null,
  );
  mock.method(User, 'findByPk', async () => user);
  mock.method(WhatsappConversation, 'findOne', async () => null);
  const rows = new Map<string, CommunicationDelivery>();
  mock.method(
    CommunicationDelivery,
    'findOrCreate',
    async (options: { defaults: Record<string, unknown>; where: { idempotencyKey: string } }) => {
      const key = options.where.idempotencyKey;
      if (rows.has(key)) return [rows.get(key), false];
      const row = CommunicationDelivery.build({ ...options.defaults, id: rows.size + 1 } as never);
      mock.method(row, 'update', async (values: Record<string, unknown>) => {
        row.set(values);
        return row;
      });
      rows.set(key, row);
      return [row, true];
    },
  );
  const tx = { LOCK: { UPDATE: 'UPDATE' }, afterCommit: () => undefined } as unknown as Transaction;
  mock.method(
    sequelize,
    'transaction',
    async (callback: (transaction: Transaction) => Promise<unknown>) => callback(tx),
  );
  mock.method(Notification, 'findOrCreate', async () => []);
  mock.method(paymentRemindersService, 'candidates', async () => [{ id: current.order.id }]);
  const network = mock.method(globalThis, 'fetch', async () => {
    throw new Error('Prueba sin envíos externos');
  });
  return { current, user, rows, tx, network };
}

test('el recordatorio espera el plazo configurado y no alcanza pedidos anteriores a la activación', () => {
  const current = context();
  assert.equal(paymentFollowupSkipReason('PAYMENT_REMINDER', current, 61, config, now), null);
  assert.match(
    paymentFollowupSkipReason(
      'PAYMENT_REMINDER',
      current,
      61,
      { ...config, paymentReminders: { ...config.paymentReminders, enabled: false } },
      now,
    )!,
    /desactivados/,
  );
  assert.match(
    paymentFollowupSkipReason(
      'PAYMENT_REMINDER',
      current,
      61,
      { ...config, paymentReminders: { ...config.paymentReminders, delayMinutes: 10 } },
      now,
    )!,
    /Todavía/,
  );
  assert.match(
    paymentFollowupSkipReason(
      'PAYMENT_REMINDER',
      current,
      61,
      {
        ...config,
        paymentReminders: { ...config.paymentReminders, activatedAt: new Date(now).toISOString() },
      },
      now,
    )!,
    /anterior/,
  );
});

test('excluye pagos ya acreditados, transferencias reportadas, saldos y reintentos reemplazados', () => {
  const current = context();
  current.hasReport = true;
  assert.match(
    paymentFollowupSkipReason('PAYMENT_REMINDER', current, 61, config, now)!,
    /transferencia/,
  );
  current.hasReport = false;
  current.payments[0].status = 'SUCCEEDED';
  assert.match(
    paymentFollowupSkipReason('PAYMENT_REMINDER', current, 61, config, now)!,
    /confirmado/,
  );
  current.payments[0].status = 'PENDING';
  current.payments[0].stage = 'BALANCE';
  assert.match(paymentFollowupSkipReason('PAYMENT_REMINDER', current, 61, config, now)!, /inicial/);
  current.payments[0].stage = 'FULL';
  assert.match(
    paymentFollowupSkipReason('PAYMENT_REMINDER', current, 60, config, now)!,
    /otro intento/,
  );
  current.order.status = 'CANCELLED';
  assert.match(paymentFollowupSkipReason('PAYMENT_REMINDER', current, 61, config, now)!, /ya no/);
});

test('respeta el vencimiento real y omite el último minuto para no enviar un enlace a punto de vencer', () => {
  const current = context();
  current.payments[0].safeResponseJson = {
    directPayment: { expiresAt: new Date(now + 30000).toISOString() },
  };
  assert.match(paymentFollowupSkipReason('PAYMENT_REMINDER', current, 61, config, now)!, /vencer/);
  current.payments[0].provider = 'mercadopago';
  current.payments[0].safeResponseJson = { expiresAt: (now + 600000) / 1000 };
  assert.equal(paymentFollowupDeadline(current.order, current.payments[0]), now + 600000);
  current.payments[0].provider = 'mock';
  assert.equal(
    paymentFollowupDeadline(current.order, current.payments[0]),
    current.order.placedAt.getTime() + 15 * 60000,
  );
});

test('procesando, requiriendo acción o un resultado desconocido no prueban que el pago falló', () => {
  for (const eventType of [
    'order.processing',
    'order.action_required',
    'order.processed',
    'unknown',
  ])
    assert.equal(verifiedUnpaidOutcome({ kind: 'IGNORED', eventId: 'test', eventType }), false);
  assert.equal(
    verifiedUnpaidOutcome({ kind: 'IGNORED', eventId: 'test', eventType: 'order.created' }),
    true,
  );
  assert.equal(verifiedUnpaidOutcome(null), false);
});

test('la conciliación evita reclamar otro pago si un intento anterior ya fue acreditado', async () => {
  const fixture = prepare();
  const latest = fixture.current.payments[0];
  latest.provider = 'mercadopago';
  latest.providerReference = 'latest-unpaid';
  const earlier = Payment.build({ ...latest.get(), id: 60, providerReference: 'earlier-paid' });
  fixture.current.payments.push(earlier);
  const provider = {
    name: 'mercadopago',
    lookupCheckout: async () => null,
  } as unknown as PaymentProvider;
  mock.method(paymentsService, 'reconcilePayment', async (payment: Payment) =>
    payment.id === earlier.id
      ? {
          kind: 'PAID',
          eventId: 'paid-test',
          eventType: 'order.processed',
          providerReference: 'earlier-paid',
        }
      : { kind: 'IGNORED', eventId: 'created-test', eventType: 'order.created' },
  );
  assert.equal(await paymentFollowupState.verifyProvider(fixture.current, provider), false);
  assert.equal(fixture.network.mock.callCount(), 0);
});

test('el estado de procesando en la pasarela aplaza el seguimiento aunque la base diga pendiente', async () => {
  const fixture = prepare();
  fixture.current.payments[0].provider = 'mercadopago';
  fixture.current.payments[0].providerReference = 'processing-test';
  const provider = {
    name: 'mercadopago',
    lookupCheckout: async () => null,
  } as unknown as PaymentProvider;
  mock.method(paymentsService, 'reconcilePayment', async () => ({
    kind: 'IGNORED',
    eventId: 'processing-test',
    eventType: 'order.processing',
  }));
  assert.equal(await paymentFollowupState.verifyProvider(fixture.current, provider), false);
  assert.equal(fixture.network.mock.callCount(), 0);
});

test('ejecuciones repetidas y cambio de intento conservan una sola notificación por canal y pedido', async () => {
  const fixture = prepare();
  await paymentRemindersService.run(new Date(now));
  await paymentRemindersService.run(new Date(now));
  fixture.current.payments[0].id = 62;
  await paymentRemindersService.run(new Date(now));
  assert.equal(fixture.rows.size, 2);
  assert.equal(fixture.network.mock.callCount(), 0);
  for (const row of fixture.rows.values()) {
    assert.equal(row.simulation, true);
    assert.match(row.idempotencyKey, /payment-reminder:order:41:(email|whatsapp)$/);
    assert.match(String(row.payload.text), /no realices otra transferencia/);
    assert.match(String(row.payload.text), /cuenta\/pedidos\/REMINDER-41/);
  }
});

test('una transferencia ya reportada no entra al planificador', async () => {
  const fixture = prepare();
  fixture.current.hasReport = true;
  assert.equal(await paymentRemindersService.run(new Date(now)), 0);
  assert.equal(fixture.rows.size, 0);
});

test('no encola WhatsApp sin consentimiento y el correo se puede usar por separado', async () => {
  const fixture = prepare();
  fixture.current.order.whatsappOptInAt = null;
  await paymentRemindersService.run(new Date(now));
  assert.equal(fixture.rows.size, 1);
  assert.equal([...fixture.rows.values()][0].channel, 'EMAIL');
});

test('un pago aprobado mientras espera en la cola impide el recordatorio', async () => {
  const fixture = prepare();
  await paymentRemindersService.run(new Date(now));
  fixture.current.payments[0].status = 'SUCCEEDED';
  for (const row of fixture.rows.values())
    await assert.rejects(communicationQueue.dispatch(row), /pago confirmado/);
  assert.equal(fixture.network.mock.callCount(), 0);
});

test('un reporte Yape/Plin registrado después de encolar cancela el aviso y no sale a la red', async () => {
  const fixture = prepare();
  await paymentRemindersService.run(new Date(now));
  fixture.current.hasReport = true;
  for (const row of fixture.rows.values())
    await assert.rejects(communicationQueue.dispatch(row), /transferencia/);
  assert.equal(fixture.network.mock.callCount(), 0);
});

test('la cola vuelve a comprobar la pasarela y relee el pedido después de conciliar', async () => {
  const fixture = prepare();
  await paymentRemindersService.run(new Date(now));
  const row = [...fixture.rows.values()][0];
  mock.method(paymentFollowupState, 'verifyProvider', async () => {
    fixture.current.order.status = 'CONFIRMED';
    fixture.current.payments[0].status = 'SUCCEEDED';
    return true;
  });
  await assert.rejects(communicationQueue.dispatch(row), /pago confirmado/);
  assert.equal(fixture.network.mock.callCount(), 0);
});

test('si no se puede consultar la pasarela el aviso se aplaza sin afirmar un rechazo', async () => {
  const fixture = prepare();
  await paymentRemindersService.run(new Date(now));
  mock.method(paymentFollowupState, 'verifyProvider', async () => {
    throw new Error('Tiempo de espera agotado');
  });
  await assert.rejects(
    communicationQueue.dispatch([...fixture.rows.values()][0]),
    (error: unknown) => {
      assert.equal((error as { disposition: string }).disposition, 'QUEUED');
      return true;
    },
  );
  assert.equal(fixture.network.mock.callCount(), 0);
});

test('el vencimiento informa la cancelación sin invitar a pagar un enlace caducado', async () => {
  const fixture = prepare();
  fixture.current.order.status = 'CANCELLED';
  fixture.current.order.cancelReason = PAYMENT_EXPIRED_REASON;
  fixture.current.payments[0].status = 'FAILED';
  await paymentNotifications.record(
    fixture.current.order,
    fixture.current.payments[0],
    'PAYMENT_EXPIRED',
    fixture.tx,
  );
  const row = [...fixture.rows.values()][0];
  assert.match(String(row.payload.text), /No pagues usando el enlace/);
  await communicationQueue.dispatch(row);
  assert.equal(row.state, 'SIMULATED');
  assert.equal(fixture.network.mock.callCount(), 0);
});

test('al activar se fija la fecha en el servidor y el cliente no puede enviar una fecha anterior', async () => {
  const row = MessagingSetting.build({
    id: 1,
    config: { ...config, paymentReminders: { enabled: false, delayMinutes: 5, activatedAt: null } },
    secrets: {},
  });
  mock.method(MessagingSetting, 'findOrCreate', async () => [row, false]);
  mock.method(row, 'update', async (values: Record<string, unknown>) => {
    row.set(values);
    return row;
  });
  mock.method(messagingConfigService, 'admin', async () => ({ config: row.config }));
  await messagingConfigService.update({ config }, 1);
  const activated = (row.config.paymentReminders as { activatedAt: string }).activatedAt;
  assert.ok(Date.parse(activated) >= now);
  assert.notEqual(activated, config.paymentReminders.activatedAt);
  await messagingConfigService.update(
    {
      config: {
        ...config,
        paymentReminders: { ...config.paymentReminders, activatedAt: '2000-01-01T00:00:00.000Z' },
      },
    },
    1,
  );
  assert.equal((row.config.paymentReminders as { activatedAt: string }).activatedAt, activated);
});
