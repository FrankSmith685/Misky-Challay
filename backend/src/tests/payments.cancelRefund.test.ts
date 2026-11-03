import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import type { Transaction } from 'sequelize';
import { Order, Payment, Refund, sequelize } from '@database/models';
import { PAYMENT_PROVIDER, PAYMENT_STATUS } from '@config/constants';
import { paymentsService } from '../modules/payments/payments.service';

afterEach(() => mock.restoreAll());

const payment = (id: number, provider: string, amount: number) => Payment.build({
  id, provider, amount, status: PAYMENT_STATUS.SUCCEEDED, payableId: 7,
  idempotencyKey: `test-${id}`,
});
const order = (id: number) => Order.build({
  id, orderNumber: `PED-${id}`, userId: null, branchId: 1,
  deliveryType: 'PICKUP', subtotal: 0, grandTotal: 0,
});

test('la cancelación no marca efectivo, Yape ni Plin como devueltos automáticamente', async () => {
  const rows = [
    payment(1, PAYMENT_PROVIDER.CASH, 10),
    payment(2, PAYMENT_PROVIDER.YAPE, 15),
    payment(3, PAYMENT_PROVIDER.PLIN, 20),
  ];
  mock.method(paymentsService, 'refundablePaymentsForOrder', async () => rows);
  const refund = mock.method(paymentsService, 'refund', async () => Refund.build());

  const result = await paymentsService.refundOrderPayment(order(7), 'Cancelado', 2);

  assert.equal(result, null);
  assert.equal(refund.mock.callCount(), 0);
});

test('la cancelación intenta solo el saldo online que aún no se devolvió', async () => {
  const rows = [payment(1, PAYMENT_PROVIDER.CASH, 10), payment(2, PAYMENT_PROVIDER.MERCADOPAGO, 25)];
  mock.method(paymentsService, 'refundablePaymentsForOrder', async () => rows);
  mock.method(Refund, 'sum', async () => 5);
  const refund = mock.method(paymentsService, 'refund', async () => Refund.build());

  await paymentsService.refundOrderPayment(order(8), 'Cancelado', 2);

  assert.equal(refund.mock.callCount(), 1);
  assert.equal(refund.mock.calls[0].arguments[0], 2);
  assert.equal(refund.mock.calls[0].arguments[1], 20);
});

test('el saldo de monedero no se trata como un cobro externo pendiente', async () => {
  mock.method(Payment, 'findAll', async () => [
    payment(1, PAYMENT_PROVIDER.WALLET, 12),
    payment(2, PAYMENT_PROVIDER.CASH, 8),
  ]);

  const rows = await paymentsService.refundablePaymentsForOrder(order(9));

  assert.deepEqual(rows.map((row) => row.id), [2]);
});

test('la devolución manual tampoco puede registrar un pago de monedero como reembolso externo', async () => {
  const wallet = payment(4, PAYMENT_PROVIDER.WALLET, 12);
  mock.method(sequelize, 'transaction', async (callback: (tx: Transaction) => Promise<unknown>) =>
    callback({ LOCK: { UPDATE: 'UPDATE' } } as unknown as Transaction));
  mock.method(Payment, 'findByPk', async () => wallet);

  await assert.rejects(paymentsService.refund(wallet.id, 12, 'Cancelado', 2),
    (error: unknown) => error instanceof Error && error.message.includes('monedero'));
});
