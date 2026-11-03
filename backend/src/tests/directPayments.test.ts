import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import type { Transaction } from 'sequelize';
import {
  MobilePaymentClaim,
  MobilePaymentEvent,
  Order,
  Payment,
  Refund,
  sequelize,
} from '@database/models';
import {
  directState,
  holdsDirectReview,
  decodeDirectEvidence,
} from '../modules/payments/directPayments.logic';
import { directPaymentsService } from '../modules/payments/directPayments.service';
import { directReportBody } from '../modules/payments/directPayments.routes';
import { localPaymentsBody } from '../modules/settings/settings.routes';
import { paymentNotifications } from '../modules/communications/paymentNotifications.service';

afterEach(() => mock.restoreAll());

test('la cuenta global admite QR de la tienda y exige titular y número al habilitar cada método', () => {
  const settings = {
    yapeEnabled: true, plinEnabled: true,
    yapePhone: '999111222', plinPhone: '999111222',
    yapeRecipient: 'Cuenta de prueba', plinRecipient: 'Cuenta de prueba',
    yapeQrImageUrl: '/images/payments/demo-yape-qr.svg',
    plinQrImageUrl: 'https://example.test/plin.png',
    instructions: 'Verifica el importe y el destinatario antes de transferir.',
  };
  assert.equal(localPaymentsBody.safeParse(settings).success, true);
  assert.equal(localPaymentsBody.safeParse({ ...settings, yapeQrImageUrl: '', plinQrImageUrl: '' }).success, true);
  assert.equal(localPaymentsBody.safeParse({ ...settings, yapeQrImageUrl: 'javascript:alert(1)' }).success, false);
  assert.equal(localPaymentsBody.safeParse({ ...settings, yapeQrImageUrl: '//example.test/qr.svg' }).success, false);
  assert.equal(localPaymentsBody.safeParse({ ...settings, yapePhone: '' }).success, false);
  assert.equal(localPaymentsBody.safeParse({ ...settings, plinRecipient: '' }).success, false);
});
const transaction = { LOCK: { UPDATE: 'UPDATE' } } as unknown as Transaction;
const setup = (
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' = 'PENDING',
  orderStatus: 'PENDING_PAYMENT' | 'CANCELLED' = 'PENDING_PAYMENT',
) => {
  mock.method(paymentNotifications, 'record', async () => undefined);
  const order = Order.build({
    id: 9,
    orderNumber: 'DIRECT-9',
    userId: 10,
    branchId: 2,
    deliveryType: 'PICKUP',
    subtotal: 50,
    grandTotal: 50,
    status: orderStatus,
  });
  const payment = Payment.build({
    id: 7,
    provider: 'yape',
    payableId: 9,
    payableType: 'ORDER',
    idempotencyKey: 'direct-test',
    amount: 50,
    status,
    safeResponseJson: {
      directPayment: {
        phone: '999111222',
        recipient: 'Cuenta congelada',
        instructions: '',
        qrImageUrl: '',
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        reviewAlertMinutes: 10,
      },
    },
  });
  const claim = MobilePaymentClaim.build({
    paymentId: 7,
    provider: 'yape',
    operationCode: 'OP-100',
    payerName: 'Cliente',
    declaredAmount: 50,
    status: 'PENDING',
  });
  mock.method(sequelize, 'transaction', async (callback: (tx: Transaction) => Promise<unknown>) =>
    callback(transaction),
  );
  mock.method(Order, 'findByPk', async () => order);
  mock.method(Payment, 'findByPk', async () => payment);
  mock.method(MobilePaymentClaim, 'findOne', async () => claim);
  mock.method(MobilePaymentEvent, 'create', async () => ({}));
  mock.method(order, 'save', async () => order);
  mock.method(payment, 'save', async () => payment);
  mock.method(claim, 'save', async () => claim);
  mock.method(directPaymentsService, 'detail', async () => ({}));
  return { order, payment, claim };
};

test('reportes en revisión y observados conservan su estado después del plazo', () => {
  assert.equal(directState('PENDING', 'PENDING', 'PENDING_PAYMENT', true, 50), 'REVIEW');
  assert.equal(directState('PENDING', 'OBSERVED', 'PENDING_PAYMENT', true, 50), 'OBSERVED');
  assert.equal(directState('PENDING', null, 'PENDING_PAYMENT', true, 50), 'EXPIRED');
  assert.equal(holdsDirectReview('OBSERVED'), true);
  assert.equal(holdsDirectReview('APPROVED'), false);
});
test('un ingreso confirmado en pedido cancelado requiere devolución y no una nueva preparación', () => {
  assert.equal(directState('SUCCEEDED', 'APPROVED', 'CANCELLED', true, 50), 'REFUND_PENDING');
  assert.equal(directState('REFUNDED', 'APPROVED', 'REFUNDED', true, 0), 'REFUNDED');
  assert.equal(directState('SUCCEEDED', 'APPROVED', 'CONFIRMED', true, 50, true), 'REFUND_PENDING');
});
test('la constancia valida contenido y tamaño, no solo el MIME declarado', () => {
  assert.equal(decodeDirectEvidence(undefined), null);
  assert.throws(() =>
    decodeDirectEvidence(
      'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64'),
    ),
  );
  assert.throws(() =>
    decodeDirectEvidence('data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64')),
  );
  const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
  assert.equal(
    decodeDirectEvidence(`data:image/png;base64,${png.toString('base64')}`)?.mime,
    'image/png',
  );
  assert.throws(() =>
    decodeDirectEvidence(
      'data:image/png;base64,' + Buffer.concat([png, Buffer.alloc(513 * 1024)]).toString('base64'),
    ),
  );
});
test('reportar exige importe, fecha y titular; la captura es opcional', () => {
  const report = {
    operationCode: 'YP-123',
    payerName: 'Cliente',
    paidAt: new Date().toISOString(),
    amount: 50,
  };
  assert.equal(directReportBody.safeParse(report).success, true);
  assert.equal(directReportBody.safeParse({ ...report, amount: 50.001 }).success, false);
  assert.equal(directReportBody.safeParse({ ...report, paidAt: 'ayer' }).success, false);
});
test('caja no puede confirmar un importe distinto ni revisar fuera de su sede', async () => {
  const { claim } = setup();
  claim.declaredAmount = 49;
  await assert.rejects(
    () => directPaymentsService.review(7, 'APPROVE', 1, undefined, () => undefined),
    /importe reportado/i,
  );
  assert.equal(claim.status, 'PENDING');
  await assert.rejects(
    () =>
      directPaymentsService.review(7, 'APPROVE', 1, undefined, () => {
        throw new Error('Sin sede');
      }),
    /Sin sede/,
  );
});
test('observar permite corregir el reporte sin anular el pago ni el pedido', async () => {
  const { order, payment, claim } = setup();
  await directPaymentsService.review(7, 'OBSERVE', 1, 'Revisa la referencia', () => undefined);
  assert.equal(order.status, 'PENDING_PAYMENT');
  assert.equal(payment.status, 'PENDING');
  assert.equal(claim.status, 'OBSERVED');
  assert.equal(claim.rejectionReason, 'Revisa la referencia');
});
test('verificar un ingreso después de cancelar no reabre el pedido y una segunda aprobación falla', async () => {
  const { order, payment, claim } = setup('PENDING', 'CANCELLED');
  await directPaymentsService.review(7, 'APPROVE', 1, undefined, () => undefined);
  assert.equal(order.status, 'CANCELLED');
  assert.equal(payment.status, 'SUCCEEDED');
  assert.equal(claim.status, 'APPROVED');
  await assert.rejects(
    () => directPaymentsService.review(7, 'APPROVE', 1, undefined, () => undefined),
    /pendiente de revisión/,
  );
});
test('el reporte exige dueño, protege vencidos y tolera reintentos sin duplicar', async () => {
  const { payment, claim } = setup();
  const events = mock.method(MobilePaymentEvent, 'create', async () => ({}));
  await assert.rejects(
    () => directPaymentsService.report(7, 99, { operationCode: 'OP-100' }),
    /no es tuyo/,
  );
  await directPaymentsService.report(7, 10, { operationCode: 'OP-100' });
  assert.equal(events.mock.callCount(), 0);
  mock.method(MobilePaymentClaim, 'findOne', async () => null);
  await assert.rejects(
    () => directPaymentsService.report(7, 10, { operationCode: 'OP-101' }),
    /Venció el plazo/,
  );
  assert.equal(payment.status, 'PENDING');
  assert.equal(claim.status, 'PENDING');
});
test('la devolución no supera el saldo disponible ni duplica referencias', async () => {
  setup('SUCCEEDED', 'CANCELLED');
  mock.method(Refund, 'findAll', async () => [
    Refund.build({
      paymentId: 7,
      amount: 30,
      reason: 'Parcial',
      status: 'SUCCEEDED',
      providerReference: 'DEV-1',
    }),
  ]);
  await assert.rejects(
    () => directPaymentsService.recordRefund(7, 21, 'DEV-2', 'Prueba', 1, () => undefined),
    /supera/,
  );
  await assert.rejects(
    () => directPaymentsService.recordRefund(7, 20, 'DEV-1', 'Prueba', 1, () => undefined),
    /ya fue registrada/,
  );
});

test('detalle y constancias privados solo son accesibles al dueño o a la sede autorizada', async () => {
  const order = Order.build({
    id: 9,
    orderNumber: 'DIRECT-9',
    userId: 10,
    branchId: 2,
    deliveryType: 'PICKUP',
    subtotal: 50,
    grandTotal: 50,
  });
  const payment = Payment.build({
    id: 7,
    provider: 'yape',
    payableId: 9,
    payableType: 'ORDER',
    idempotencyKey: 'direct-test',
    amount: 50,
  });
  mock.method(Order, 'findByPk', async () => order);
  mock.method(Payment, 'findByPk', async () => payment);
  const evidence = mock.method(MobilePaymentEvent, 'findOne', async () => null);
  await assert.rejects(() => directPaymentsService.detail(7, { userId: 11 }), /no es tuyo/);
  await assert.rejects(() => directPaymentsService.evidence(7, 1, { userId: 11 }), /no es tuyo/);
  await assert.rejects(
    () =>
      directPaymentsService.detail(7, {
        scopeCheck: () => {
          throw new Error('Sin sede');
        },
      }),
    /Sin sede/,
  );
  assert.equal(evidence.mock.callCount(), 0);
});

test('el detalle conserva la cuenta congelada y devuelve metadatos de la constancia sin bytes', async () => {
  const order = Order.build({
    id: 9,
    orderNumber: 'DIRECT-9',
    userId: 10,
    branchId: 2,
    deliveryType: 'PICKUP',
    subtotal: 50,
    grandTotal: 50,
  });
  const payment = Payment.build({
    id: 7,
    provider: 'plin',
    payableId: 9,
    idempotencyKey: 'direct-test',
    amount: 50,
    status: 'PENDING',
    safeResponseJson: {
      directPayment: {
        recipient: 'Cuenta original',
        phone: '999111222',
        qrImageUrl: '',
        instructions: '',
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        reviewAlertMinutes: 10,
      },
    },
  });
  mock.method(MobilePaymentClaim, 'findOne', async () => null);
  mock.method(Refund, 'findAll', async () => []);
  mock.method(MobilePaymentEvent, 'findAll', async () => [
    MobilePaymentEvent.build({
      id: 1,
      paymentId: 7,
      kind: 'REPORTED',
      createdAt: new Date(),
      evidenceMime: 'image/png',
      evidenceBytes: Buffer.from('no-exponer'),
    }),
  ]);
  const result = await directPaymentsService.serialize(payment, order);
  assert.equal(result.recipient.recipient, 'Cuenta original');
  assert.equal(result.history[0].hasEvidence, true);
  assert.equal(JSON.stringify(result).includes('evidenceBytes'), false);
  assert.equal(JSON.stringify(result).includes('no-exponer'), false);
});
