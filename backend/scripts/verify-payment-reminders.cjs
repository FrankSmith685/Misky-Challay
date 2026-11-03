/** Ejecutar tras compilar el backend. Fixtures transaccionales revertidos y red bloqueada. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { mock } = require('node:test');
const build = path.resolve(__dirname, process.argv[2] ?? '../dist');
const { env } = require(path.join(build, 'config/env'));
const models = require(path.join(build, 'database/models'));
const { messagingConfigService } = require(
  path.join(build, 'modules/communications/communications.config'),
);
const { paymentRemindersService } = require(
  path.join(build, 'modules/communications/paymentReminders.service'),
);
const { paymentNotifications } = require(
  path.join(build, 'modules/communications/paymentNotifications.service'),
);
const { paymentFollowupState } = require(
  path.join(build, 'modules/communications/paymentFollowup.state'),
);
const { paymentFollowupSkipReason, PAYMENT_EXPIRED_REASON } = require(
  path.join(build, 'modules/communications/paymentFollowup.logic'),
);
const { settingsService } = require(path.join(build, 'modules/settings/settings.service'));
const { ordersService } = require(path.join(build, 'modules/orders/orders.service'));
const { SmtpMailProvider } = require(path.join(build, 'integrations/mail/smtp.provider'));
const { findPaymentExpiryCandidates } = require(path.join(build, 'modules/payments/paymentExpiry'));

(async () => {
  assert.equal(env.NODE_ENV, 'development');
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(env.DB_HOST));
  models.registerModels();
  const { sequelize, Branch, User, Order, Payment, MobilePaymentClaim, CommunicationDelivery } =
    models;
  const baseline = await messagingConfigService.runtime();
  const branch = await Branch.findOne();
  assert.ok(branch);
  const transaction = await sequelize.transaction();
  const now = new Date();
  const activeAt = new Date(now.getTime() - 3600000).toISOString();
  const config = {
    ...baseline.config,
    enabled: true,
    testMode: true,
    paymentReminders: { enabled: true, delayMinutes: 1, activatedAt: activeAt },
    events: {
      ...baseline.config.events,
      PAYMENT_REMINDER: { email: true, whatsapp: false, template: '' },
      PAYMENT_EXPIRED: { email: true, whatsapp: false, template: '' },
    },
  };
  const fixtureIds = [];
  mock.method(messagingConfigService, 'runtime', async () => ({ ...baseline, config }));
  mock.method(settingsService, 'getCommunicationSettings', async () => ({
    orderUpdatesEnabled: true,
    emailNotificationsEnabled: true,
    whatsappUpdatesEnabled: false,
    inAppNotificationsEnabled: false,
  }));
  mock.method(globalThis, 'fetch', async () => {
    throw new Error('No se permite red externa en esta comprobación');
  });
  mock.method(SmtpMailProvider.prototype, 'send', async () => {
    throw new Error('No se permite SMTP en esta comprobación');
  });
  try {
    const stamp = randomUUID();
    const user = await User.create(
      {
        email: `reminder-${stamp}@example.test`,
        phone: null,
        passwordHash: null,
        firstName: 'Prueba transaccional',
        lastName: 'Recordatorio',
        status: 'ACTIVE',
        emailVerifiedAt: now,
        termsAcceptedAt: now,
      },
      { transaction },
    );
    const make = async (name, provider = 'yape', minutes = -3) => {
      const order = await Order.create(
        {
          orderNumber: `TR-${fixtureIds.length}-${stamp.slice(0, 8)}`,
          branchId: branch.id,
          userId: user.id,
          status: 'PENDING_PAYMENT',
          deliveryType: 'PICKUP',
          placedAt: new Date(now.getTime() + minutes * 60000),
          subtotal: 18,
          grandTotal: 18,
        },
        { transaction },
      );
      const payment = await Payment.create(
        {
          payableType: 'ORDER',
          payableId: order.id,
          userId: user.id,
          provider,
          amount: 18,
          status: 'PENDING',
          stage: 'FULL',
          currency: 'PEN',
          idempotencyKey: `${name}-${stamp}`,
          createdAt: order.placedAt,
          safeResponseJson:
            provider === 'mercadopago'
              ? { expiresAt: Math.floor((now.getTime() + 20 * 60000) / 1000) }
              : {
                  directPayment: { expiresAt: new Date(now.getTime() + 20 * 60000).toISOString() },
                },
        },
        { transaction },
      );
      fixtureIds.push(order.id);
      return { order, payment };
    };
    const pending = await make('pending');
    const reported = await make('reported');
    await MobilePaymentClaim.create(
      {
        paymentId: reported.payment.id,
        provider: 'yape',
        operationCode: `SQL${Date.now()}`,
        status: 'OBSERVED',
      },
      { transaction },
    );
    const paid = await make('paid');
    await paid.payment.update({ status: 'SUCCEEDED' }, { transaction });
    const expired = await make('expired');
    await expired.payment.update(
      {
        safeResponseJson: {
          directPayment: { expiresAt: new Date(now.getTime() - 60000).toISOString() },
        },
      },
      { transaction },
    );
    await make('old', 'yape', -90);
    await make('recent', 'yape', 0);
    const gateway = await make('gateway', 'mercadopago');
    const gatewayExpired = await make('gatewayExpired', 'mercadopago', -45);
    await gatewayExpired.payment.update(
      { safeResponseJson: { expiresAt: Math.floor((now.getTime() - 60000) / 1000) } },
      { transaction },
    );
    const candidates = await paymentRemindersService.candidates(
      activeAt,
      1,
      now,
      Math.min(...fixtureIds) - 1,
      transaction,
    );
    const own = candidates.map(({ id }) => Number(id)).filter((id) => fixtureIds.includes(id));
    assert.deepEqual(
      own.sort((a, b) => a - b),
      [pending.order.id, gateway.order.id].sort((a, b) => a - b),
    );
    const dueForExpiry = await findPaymentExpiryCandidates(
      new Date(now.getTime() - 15 * 60000),
      now,
      transaction,
    );
    assert.ok(dueForExpiry.some(({ id }) => Number(id) === gatewayExpired.order.id));
    assert.ok(!dueForExpiry.some(({ id }) => Number(id) === reported.order.id));
    await paymentNotifications.record(
      pending.order,
      pending.payment,
      'PAYMENT_REMINDER',
      transaction,
    );
    await paymentNotifications.record(
      pending.order,
      pending.payment,
      'PAYMENT_REMINDER',
      transaction,
    );
    assert.equal(
      await CommunicationDelivery.count({
        where: { orderId: pending.order.id, event: 'PAYMENT_REMINDER' },
        transaction,
      }),
      1,
    );
    const remaining = await paymentRemindersService.candidates(
      activeAt,
      1,
      now,
      Math.min(...fixtureIds) - 1,
      transaction,
    );
    assert.ok(!remaining.some(({ id }) => Number(id) === pending.order.id));
    const state = await paymentFollowupState.read(paid.order.id, transaction);
    assert.match(
      paymentFollowupSkipReason('PAYMENT_REMINDER', state, paid.payment.id, config, now.getTime()),
      /confirmado/,
    );
    await expired.payment.update({ status: 'FAILED' }, { transaction });
    expired.order.cancelReason = PAYMENT_EXPIRED_REASON;
    let genericNotifications = 0;
    const originalAfterCommit = transaction.afterCommit.bind(transaction);
    mock.method(transaction, 'afterCommit', (callback) => {
      genericNotifications++;
      return originalAfterCommit(callback);
    });
    await ordersService.changeStatus(expired.order, 'CANCELLED', {
      transaction,
      source: 'SYSTEM',
      comment: PAYMENT_EXPIRED_REASON,
      notifyCustomer: false,
    });
    assert.equal(genericNotifications, 0);
    await paymentNotifications.record(
      expired.order,
      expired.payment,
      'PAYMENT_EXPIRED',
      transaction,
    );
    assert.equal(
      await CommunicationDelivery.count({
        where: { orderId: expired.order.id, event: 'PAYMENT_EXPIRED' },
        transaction,
      }),
      1,
    );
    const rows = await CommunicationDelivery.findAll({
      where: { orderId: fixtureIds },
      transaction,
    });
    assert.ok(rows.every((row) => row.simulation));
    console.log(
      'OK: SQL de candidatos, plazos, reportes observados, pagos acreditados, deduplicación real y vencimiento sin aviso genérico duplicado.',
    );
  } finally {
    await transaction.rollback();
    mock.restoreAll();
    assert.equal(await Order.count({ where: { id: fixtureIds } }), 0);
    await sequelize.close();
    console.log('Fixtures revertidos; sin envíos externos ni cambios de configuración.');
  }
})().catch((error) => {
  console.error(`${error.name}: ${error.message}`);
  process.exitCode = 1;
});
