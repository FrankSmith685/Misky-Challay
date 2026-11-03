/* eslint-disable @typescript-eslint/no-explicit-any */
/** Fixtures and audit records are rolled back. Network is limited to the local test server. */
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import express from 'express';
import { mock } from 'node:test';
import {
  AuditLog,
  Branch,
  CommunicationDelivery,
  MobilePaymentClaim,
  Notification,
  Order,
  Payment,
  User,
  WebhookEvent,
  WhatsappConversation,
  WhatsappMessage,
  registerModels,
  sequelize,
} from '../src/database/models';
import { env } from '../src/config/env';
import { signAccessToken } from '../src/shared/utils/jwt';
import { messagingConfigService } from '../src/modules/communications/communications.config';
import { settingsService } from '../src/modules/settings/settings.service';
import { whatsappInbox } from '../src/modules/communications/whatsapp.inbox';
import { communicationQueue } from '../src/modules/communications/communications.queue';
import communicationsRouter from '../src/modules/communications/communications.routes';
import { directPaymentsService } from '../src/modules/payments/directPayments.service';
import { staffAudienceService } from '../src/modules/notifications/staffAudience.service';
import { ApiError } from '../src/shared/errors/ApiError';
import { publishCommunicationChange } from '../src/modules/communications/communications.events';

async function main() {
  assert.equal(env.NODE_ENV, 'development');
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(env.DB_HOST));
  registerModels();
  const baseline = await messagingConfigService.runtime();
  const communication = await settingsService.getCommunicationSettings();
  const actor = await User.findOne({ where: { isSuperAdmin: true, status: 'ACTIVE' } });
  const branch = await Branch.findOne();
  assert.ok(actor && branch);
  const openTransaction = sequelize.transaction.bind(sequelize);
  const transaction = await openTransaction();
  let server: ReturnType<express.Application['listen']> | undefined;
  let externalAttempts = 0;
  const nativeFetch = globalThis.fetch;
  try {
    // Force every fixture query, instance update and HTTP-side audit into one rollback.
    mock.method(sequelize, 'transaction', async (options: any) =>
      typeof options === 'function'
        ? options(transaction)
        : openTransaction({ ...options, transaction }),
    );
    for (const model of [
      CommunicationDelivery,
      WhatsappConversation,
      WhatsappMessage,
      Notification,
      WebhookEvent,
      Order,
      Payment,
      MobilePaymentClaim,
      User,
      AuditLog,
    ] as any[]) {
      for (const method of [
        'findOne',
        'findAll',
        'findAndCountAll',
        'findOrCreate',
        'count',
        'destroy',
      ]) {
        const original = model[method].bind(model);
        mock.method(model, method, (options: any = {}) => original({ ...options, transaction }));
      }
      for (const method of ['findByPk', 'create', 'update']) {
        const original = model[method].bind(model);
        mock.method(model, method, (values: any, options: any = {}) =>
          original(values, { ...options, transaction }),
        );
      }
      for (const method of ['save', 'reload']) {
        const original = model.prototype[method];
        mock.method(model.prototype, method, function (this: any, options: any = {}) {
          return original.call(this, { ...options, transaction });
        });
      }
    }
    const config = {
      ...baseline.config,
      testMode: true,
      enabled: true,
      botEnabled: true,
      phoneNumberId: '123456789',
      openingTime: '00:00',
      closingTime: '23:59',
      workingDays: [0, 1, 2, 3, 4, 5, 6],
    };
    mock.method(messagingConfigService, 'runtime', async () => ({
      config,
      accessToken: 'test-token-never-sent',
      appSecret: 'local-test-app-secret',
      verifyToken: 'local-verify-token',
      updatedAt: null,
    }));
    mock.method(settingsService, 'getCommunicationSettings', async () => ({
      ...communication,
      emailNotificationsEnabled: true,
      inAppNotificationsEnabled: true,
      orderUpdatesEnabled: true,
      whatsappUpdatesEnabled: true,
    }));
    mock.method(staffAudienceService, 'userIds', async () => [actor.id]);
    mock.method(globalThis, 'fetch', async (input: any, options?: any) => {
      if (new URL(String(input)).hostname !== '127.0.0.1') {
        externalAttempts++;
        throw new Error('Prueba bloqueó un envío externo');
      }
      return nativeFetch(input, options);
    });

    const stamp = randomUUID();
    const user = await User.create({
      email: `communications-${stamp}@example.test`,
      firstName: 'Prueba',
      phone: '999111222',
      passwordHash: 'disabled-test-account',
    });
    const order = await Order.create({
      userId: user.id,
      branchId: branch.id,
      orderNumber: `COMM-${stamp.slice(0, 12)}`,
      idempotencyKey: stamp,
      deliveryType: 'PICKUP',
      subtotal: 18,
      grandTotal: 18,
      whatsappOptInAt: new Date(),
      contactName: 'Prueba temporal',
    });
    const payment = await directPaymentsService.create(
      order,
      'yape',
      {
        phone: '999888777',
        recipient: 'Cuenta de prueba',
        qrImageUrl: '',
        instructions: 'Prueba',
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        reviewAlertMinutes: 10,
      },
      transaction,
    );
    assert.equal(
      await CommunicationDelivery.count({ where: { orderId: order.id, event: 'PAYMENT_PENDING' } }),
      2,
    );
    await directPaymentsService.report(payment.id, user.id, {
      operationCode: 'COMM-TEST',
      payerName: 'Prueba',
      amount: 18,
      paidAt: new Date().toISOString(),
    });
    assert.equal(
      await CommunicationDelivery.count({
        where: { orderId: order.id, event: 'PAYMENT_REPORTED' },
      }),
      2,
    );
    assert.equal(
      (await Order.findByPk(order.id))?.status,
      'PENDING_PAYMENT',
      'Reportar o conversar no acredita el pago',
    );
    assert.ok(
      (await Notification.count({
        where: { orderId: order.id, template: 'PAYMENT_REVIEW_REQUIRED' },
      })) > 0,
    );
    await communicationQueue.process(30);
    const stale = await CommunicationDelivery.findAll({
      where: { orderId: order.id, event: 'PAYMENT_PENDING' },
    });
    assert.ok(
      stale.every((delivery) => delivery.state === 'SKIPPED'),
      'No envía instrucciones de pago después del reporte',
    );
    const reported = await CommunicationDelivery.findAll({
      where: { orderId: order.id, event: 'PAYMENT_REPORTED' },
    });
    assert.ok(reported.every((delivery) => delivery.state === 'SIMULATED'));

    const incoming = { phone: '51999111222', text: 'hola', timestamp: new Date(), isTest: true };
    const conversation = await whatsappInbox.incoming({
      ...incoming,
      id: `test-incoming:${stamp}`,
    });
    const firstCount = await WhatsappMessage.count({ where: { conversationId: conversation.id } });
    await whatsappInbox.incoming({ ...incoming, id: `test-incoming:${stamp}` });
    assert.equal(
      await WhatsappMessage.count({ where: { conversationId: conversation.id } }),
      firstCount,
      'Webhook repetido no duplica mensajes ni bot',
    );
    await whatsappInbox.incoming({ ...incoming, id: `${stamp}:human`, text: '4' });
    assert.equal((await WhatsappConversation.findByPk(conversation.id))?.mode, 'HUMAN');
    await whatsappInbox.setMode(conversation.id, 'HUMAN', actor.id, true);
    const countBeforeHuman = await WhatsappMessage.count({
      where: { conversationId: conversation.id, direction: 'OUT' },
    });
    await whatsappInbox.incoming({ ...incoming, id: `${stamp}:human-question`, text: 'Ya pagué' });
    assert.equal(
      await WhatsappMessage.count({ where: { conversationId: conversation.id, direction: 'OUT' } }),
      countBeforeHuman,
      'El bot se pausa mientras una persona atiende',
    );
    const replyKey = randomUUID();
    await whatsappInbox.reply(
      conversation.id,
      'Revisaremos tu reporte en la web.',
      actor.id,
      true,
      replyKey,
    );
    await whatsappInbox.reply(
      conversation.id,
      'Revisaremos tu reporte en la web.',
      actor.id,
      true,
      replyKey,
    );
    assert.equal(
      await WhatsappMessage.count({ where: { conversationId: conversation.id, direction: 'OUT' } }),
      countBeforeHuman + 1,
    );
    await whatsappInbox.incoming({ ...incoming, id: `${stamp}:stop`, text: 'BAJA' });
    await assert.rejects(
      whatsappInbox.reply(conversation.id, 'No enviar', actor.id, true, randomUUID()),
      /desactivó/,
    );
    await whatsappInbox.incoming({ ...incoming, id: `${stamp}:start`, text: 'ALTA' });
    await whatsappInbox.incoming({ ...incoming, id: `${stamp}:orders`, text: '1' });
    const lastReply = await WhatsappMessage.findOne({
      where: { conversationId: conversation.id, direction: 'OUT' },
      order: [['id', 'DESC']],
    });
    assert.match(lastReply?.body ?? '', /Inicia sesión/);
    assert.ok(
      !lastReply?.body.includes(order.orderNumber),
      'El bot no expone pedidos privados por una coincidencia de teléfono',
    );
    await whatsappInbox.setMode(conversation.id, 'HUMAN', actor.id, true);
    await conversation.update({ lastInboundAt: new Date(Date.now() - 25 * 3600000) });
    await assert.rejects(
      whatsappInbox.reply(conversation.id, 'Fuera de plazo', actor.id, true, randomUUID()),
      /24 horas/,
    );

    const callbackId = `wamid-local-test-${stamp}`;
    await whatsappInbox.status(callbackId, 'read', '1'); // callback antes de que el envío se guarde
    const queued = await communicationQueue.enqueue({
      channel: 'WHATSAPP',
      recipient: incoming.phone,
      subject: 'Callback de prueba',
      event: 'TEST',
      key: `status:${stamp}`,
      payload: {},
      simulation: true,
    });
    await queued.update({ state: 'ACCEPTED', providerMessageId: callbackId });
    await communicationQueue.reconcileStatuses();
    await queued.reload();
    assert.equal(queued.state, 'READ');
    await whatsappInbox.status(callbackId, 'delivered', '2');
    await whatsappInbox.status(callbackId, 'failed', '3');
    await queued.reload();
    assert.equal(queued.state, 'READ');
    assert.equal(queued.error, null);

    const app = express();
    app.use('/api/v1/communications/webhook', express.raw({ type: 'application/json' }));
    app.use(express.json());
    app.use('/api/v1/communications', communicationsRouter);
    app.use(
      (
        error: ApiError,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
      ) => {
        res.status(error.statusCode || 500).json({ message: error.message });
      },
    );
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server!.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}/api/v1/communications`;
    const token = (permissions: string[], superAdmin = false, branchIds: number[] = []) =>
      signAccessToken({
        sub: superAdmin ? actor.id : user.id,
        email: null,
        roles: [],
        permissions,
        isSuperAdmin: superAdmin,
        branchIds,
        tv: superAdmin ? actor.tokenVersion : user.tokenVersion,
      });
    const adminHeaders = { Authorization: `Bearer ${token([], true)}` };
    const streamController = new AbortController();
    const stream = await fetch(`${base}/events`, { headers: adminHeaders, signal: AbortSignal.any([streamController.signal, AbortSignal.timeout(3000)]) });
    assert.equal(stream.status, 200);
    assert.match(stream.headers.get('content-type') ?? '', /text\/event-stream/);
    const reader = stream.body!.getReader();
    assert.match(new TextDecoder().decode((await reader.read()).value), /event: change/);
    publishCommunicationChange();
    assert.match(new TextDecoder().decode((await reader.read()).value), /event: change/);
    await reader.cancel();
    streamController.abort();
    assert.equal((await fetch(`${base}/conversations`)).status, 401);
    assert.equal(
      (await fetch(`${base}/conversations`, { headers: { Authorization: `Bearer ${token([])}` } }))
        .status,
      403,
    );
    assert.equal(
      (
        await fetch(`${base}/conversations`, {
          headers: { Authorization: `Bearer ${token(['communication.read'], false, [branch.id])}` },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${base}/conversations`, {
          headers: { Authorization: `Bearer ${token(['communication.read'])}` },
        })
      ).status,
      200,
    );
    const secretResponse = await fetch(`${base}/settings`, { headers: adminHeaders });
    assert.equal(secretResponse.status, 200);
    const settingsJson = await secretResponse.text();
    assert.ok(
      !settingsJson.includes('test-token-never-sent') &&
        !settingsJson.includes('local-test-app-secret'),
    );
    assert.equal(
      (
        await fetch(
          `${base}/webhook?hub.mode=subscribe&hub.verify_token=incorrect&hub.challenge=123`,
        )
      ).status,
      403,
    );
    assert.equal(
      await (
        await fetch(
          `${base}/webhook?hub.mode=subscribe&hub.verify_token=local-verify-token&hub.challenge=123`,
        )
      ).text(),
      '123',
    );
    const webhook = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: config.phoneNumberId },
                messages: [
                  {
                    id: `${stamp}:signed`,
                    from: incoming.phone,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: 'text',
                    text: { body: 'hola' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    assert.equal(
      (
        await fetch(`${base}/webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: webhook,
        })
      ).status,
      401,
    );
    const signature = `sha256=${createHmac('sha256', 'local-test-app-secret').update(webhook).digest('hex')}`;
    assert.equal(
      (
        await fetch(`${base}/webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signature },
          body: webhook,
        })
      ).status,
      200,
    );
    const readonlyReply = await fetch(`${base}/conversations/${conversation.id}/reply`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token(['communication.read'])}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: 'No autorizado', key: randomUUID() }),
    });
    assert.equal(readonlyReply.status, 403);
    await communicationQueue.process(50);
    assert.equal(externalAttempts, 0);
    console.log(
      'Verificados: cola transaccional de pagos, simulación sin red, aviso a caja, bot, derivación humana, BAJA/ALTA, ventana de 24 h, duplicados, callbacks adelantados, firma del webhook, secretos y permisos globales. Se revierten todos los datos de prueba.',
    );
  } finally {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    mock.restoreAll();
    await transaction.rollback();
  }
}
void main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? `${error.name}: ${error.message}` : 'Falló la verificación',
    );
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
