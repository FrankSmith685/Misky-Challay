/** Local transaction test: every fixture is rolled back and afterCommit notifications never run. */
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import type { Transaction } from 'sequelize';
import {
  Branch,
  CommunicationDelivery,
  MobilePaymentClaim,
  MobilePaymentEvent,
  Order,
  Payment,
  Refund,
  User,
  registerModels,
  sequelize,
} from '../src/database/models';
import { env } from '../src/config/env';
import { directPaymentsService } from '../src/modules/payments/directPayments.service';
import { operationsService } from '../src/modules/operations/operations.service';
import { deliveryService } from '../src/modules/delivery/delivery.service';
import { cakeProductionService } from '../src/modules/cakes/cakeProduction.service';
import { findPaymentExpiryCandidates } from '../src/modules/payments/paymentExpiry';

async function main() {
  if (!['localhost', '127.0.0.1', '::1'].includes(env.DB_HOST) || env.NODE_ENV === 'production')
    throw new Error('Usa una base local de desarrollo');
  registerModels();
  const transaction = await sequelize.transaction();
  const openTransaction = sequelize.transaction.bind(sequelize);
  try {
    const branch = await Branch.findOne({ transaction });
    assert.ok(branch, 'Se requiere una sede existente');
    const user = await User.create(
      {
        email: `direct-${Date.now()}@example.test`,
        firstName: 'Verificación',
        lastName: 'Temporal',
        passwordHash: 'disabled-test-login',
      },
      { transaction },
    );
    mock.method(sequelize, 'transaction', async (options: unknown) =>
      typeof options === 'function' ? options(transaction) : openTransaction({ ...(options as object), transaction }),
    );
    mock.method(directPaymentsService, 'detail', async () => ({}));
    // Isolate operational side effects; payment, order and audit writes use the real database.
    mock.method(operationsService, 'openTicketForOrder', async () => null);
    mock.method(deliveryService, 'openForOrder', async () => null);
    mock.method(cakeProductionService, 'confirmForOrder', async () => undefined);
    const stamp = String(Date.now()).slice(-10);
    const createOrder = async (suffix: string, deposit = false) =>
      Order.create(
        {
          orderNumber: `DP-${stamp}-${suffix}`,
          idempotencyKey: `verify-direct-${stamp}-${suffix}`,
          userId: user.id,
          branchId: branch.id,
          deliveryType: 'PICKUP',
          subtotal: 100,
          grandTotal: 100,
          contactName: 'Verificación temporal',
          paymentPlan: deposit ? 'DEPOSIT_BALANCE' : 'FULL',
          depositAmount: deposit ? 50 : 100,
          balanceAmount: deposit ? 50 : 0,
        },
        { transaction },
      );
    const snapshot = {
      phone: '999111222',
      recipient: 'CUENTA DE PRUEBA SIN COBRO',
      qrImageUrl: '',
      instructions: '',
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      reviewAlertMinutes: 1,
    };
    const order = await createOrder('F');
    const payment = await directPaymentsService.create(order, 'yape', snapshot, transaction);
    order.placedAt = new Date(Date.now() - 60 * 60000);
    await order.save({ transaction });
    const isExpiring = async () =>
      (
        await findPaymentExpiryCandidates(
          new Date(Date.now() - 15 * 60000),
          new Date(),
          transaction,
        )
      ).some((row) => row.id === order.id);
    assert.equal(
      await isExpiring(),
      false,
      'Respeta un plazo de pago configurado mayor a 15 minutos',
    );
    payment.safeResponseJson = {
      directPayment: { ...snapshot, expiresAt: new Date(Date.now() - 1000).toISOString() },
    };
    await payment.save({ transaction });
    assert.equal(await isExpiring(), true, 'El pago vencido sin reporte puede expirar');
    payment.safeResponseJson = { directPayment: snapshot };
    await payment.save({ transaction });
    assert.equal(Number(payment.amount), 100);
    assert.equal(
      await MobilePaymentClaim.count({ where: { paymentId: payment.id }, transaction }),
      0,
    );
    const report = {
      operationCode: `TEST-${stamp}`,
      payerName: 'Cliente temporal',
      paidAt: new Date().toISOString(),
      amount: 99,
    };
    await directPaymentsService.report(payment.id, user.id, report);
    payment.safeResponseJson = {
      directPayment: { ...snapshot, expiresAt: new Date(Date.now() - 1000).toISOString() },
    };
    await payment.save({ transaction });
    assert.equal(
      await isExpiring(),
      false,
      'El reporte pendiente conserva la reserva después del plazo',
    );
    await assert.rejects(
      () =>
        directPaymentsService.review(payment.id, 'APPROVE', user.id, undefined, () => undefined),
      /importe reportado/,
    );
    await directPaymentsService.review(
      payment.id,
      'OBSERVE',
      user.id,
      'Corregir importe',
      () => undefined,
    );
    assert.equal(await isExpiring(), false, 'Una observación tampoco cancela la reserva');
    await directPaymentsService.report(payment.id, user.id, { ...report, amount: 100 });
    const events = await MobilePaymentEvent.findAll({
      where: { paymentId: payment.id },
      transaction,
      order: [['id', 'ASC']],
    });
    assert.deepEqual(
      events.map((event) => event.kind),
      ['CREATED', 'REPORTED', 'OBSERVED', 'REPORTED'],
    );
    await directPaymentsService.review(payment.id, 'APPROVE', user.id, undefined, () => undefined);
    await order.reload({ transaction });
    assert.equal(order.status, 'CONFIRMED');
    assert.ok(order.balancePaidAt);
    await assert.rejects(
      () =>
        directPaymentsService.review(payment.id, 'APPROVE', user.id, undefined, () => undefined),
      /pendiente/,
    );
    const second = await createOrder('D', true);
    const deposit = await directPaymentsService.create(second, 'plin', snapshot, transaction);
    assert.equal(deposit.stage, 'DEPOSIT');
    assert.equal(Number(deposit.amount), 50);
    await directPaymentsService.report(deposit.id, user.id, {
      ...report,
      operationCode: `PL-${stamp}`,
      amount: 50,
    });
    await directPaymentsService.review(deposit.id, 'APPROVE', user.id, undefined, () => undefined);
    await second.reload({ transaction });
    assert.ok(second.depositPaidAt);
    assert.equal(second.balancePaidAt, null);
    const balance = await directPaymentsService.create(
      second,
      'yape',
      snapshot,
      transaction,
      'BALANCE',
    );
    await assert.rejects(
      () => directPaymentsService.report(balance.id, user.id, { ...report, amount: 50 }),
      /otro pago/,
    );
    await directPaymentsService.report(balance.id, user.id, {
      ...report,
      operationCode: `BL-${stamp}`,
      amount: 50,
    });
    await directPaymentsService.review(balance.id, 'APPROVE', user.id, undefined, () => undefined);
    await second.reload({ transaction });
    assert.ok(second.balancePaidAt);
    assert.equal(second.status, 'CONFIRMED');
    const extraBalance = await directPaymentsService.create(
      second,
      'plin',
      snapshot,
      transaction,
      'BALANCE',
    );
    await directPaymentsService.report(extraBalance.id, user.id, {
      ...report,
      operationCode: `EX-${stamp}`,
      amount: 50,
    });
    await directPaymentsService.review(
      extraBalance.id,
      'APPROVE',
      user.id,
      undefined,
      () => undefined,
    );
    await extraBalance.reload({ transaction });
    assert.equal(
      extraBalance.safeResponseJson?.directRefundRequired,
      true,
      'Un ingreso tardío duplicado se destina a devolución',
    );
    // A cancelled order with a late transfer remains cancelled and can be refunded.
    const cancelled = await createOrder('C');
    cancelled.status = 'CANCELLED';
    await cancelled.save({ transaction });
    const late = await directPaymentsService.create(
      cancelled,
      'yape',
      { ...snapshot, expiresAt: new Date(Date.now() - 1000).toISOString() },
      transaction,
    );
    late.status = 'FAILED';
    await late.save({ transaction });
    await directPaymentsService.recoveryReport(
      late.id,
      user.id,
      { ...report, operationCode: `LT-${stamp}`, amount: 100 },
      'Ingreso tardío',
      () => undefined,
    );
    await directPaymentsService.review(
      late.id,
      'OBSERVE',
      user.id,
      'Confirma los datos',
      () => undefined,
    );
    await directPaymentsService.report(late.id, user.id, {
      ...report,
      operationCode: `LT-${stamp}`,
      amount: 100,
    });
    await directPaymentsService.review(late.id, 'APPROVE', user.id, undefined, () => undefined);
    await cancelled.reload({ transaction });
    assert.equal(cancelled.status, 'CANCELLED');
    await directPaymentsService.recordRefund(
      late.id,
      40,
      `R1-${stamp}`,
      'Devolución parcial',
      user.id,
      () => undefined,
    );
    await assert.rejects(
      () =>
        directPaymentsService.recordRefund(
          late.id,
          61,
          `R2-${stamp}`,
          'Excede pendiente',
          user.id,
          () => undefined,
        ),
      /supera/,
    );
    await directPaymentsService.recordRefund(
      late.id,
      60,
      `R2-${stamp}`,
      'Devolución final',
      user.id,
      () => undefined,
    );
    await late.reload({ transaction });
    await cancelled.reload({ transaction });
    assert.equal(late.status, 'REFUNDED');
    assert.equal(cancelled.status, 'REFUNDED');
    assert.equal(await Refund.sum('amount', { where: { paymentId: late.id }, transaction }), 100);
    assert.equal(
      (await Payment.findByPk(payment.id, { transaction }))?.safeResponseJson?.directPayment !=
        null,
      true,
    );
    assert.ok(await CommunicationDelivery.count({ where: { orderId: order.id }, transaction }) > 0, 'Los eventos de pago quedan en la cola dentro de la transacción');
    console.log(
      'Verificados en BD: reporte, observación, corrección, duplicados, pago completo, anticipo, saldo, ingreso tardío y devoluciones parciales.',
    );
  } finally {
    mock.restoreAll();
    await transaction.rollback();
  }
}
main()
  .catch((error) => {
    console.error(error.name, error.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
