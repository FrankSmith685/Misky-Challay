import { Op, type Transaction } from 'sequelize';
import { MobilePaymentClaim, Order, Payment } from '@database/models';
import { getPaymentProvider } from '@integrations/payments';
import type { PaymentProvider } from '@integrations/payments';
import { isDirectProvider } from '@modules/payments/directPayments.logic';
import { verifiedUnpaidOutcome, type PaymentFollowupContext } from './paymentFollowup.logic';

export const paymentFollowupState = {
  async read(orderId: number, transaction?: Transaction): Promise<PaymentFollowupContext | null> {
    const order = await Order.findByPk(orderId, {
      transaction,
      ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (!order) return null;
    const payments = await Payment.findAll({
      where: { payableType: 'ORDER', payableId: orderId },
      order: [['id', 'DESC']],
      transaction,
    });
    const reports = payments.length
      ? await MobilePaymentClaim.count({
          where: { paymentId: { [Op.in]: payments.map((payment) => payment.id) } },
          transaction,
        })
      : 0;
    return { order, payments, hasReport: reports > 0 };
  },
  /** Siempre fuera de una transacción. Una API inaccesible aplaza el aviso. */
  async verifyProvider(
    context: PaymentFollowupContext,
    configuredProvider?: PaymentProvider,
  ): Promise<boolean> {
    const latest = context.payments[0];
    if (!latest) return false;
    if (isDirectProvider(latest.provider) || latest.provider === 'mock') return true;
    const provider = configuredProvider ?? getPaymentProvider();
    if (provider.name !== latest.provider || !provider.lookupCheckout || !latest.providerReference)
      return false;
    const { paymentsService } = await import('@modules/payments/payments.service');
    let currentVerified = false;
    for (const payment of context.payments) {
      if (payment.provider !== provider.name || !payment.providerReference) continue;
      if (['SUCCEEDED', 'REFUNDED'].includes(payment.status)) return false;
      const outcome = await paymentsService.reconcilePayment(payment);
      if (outcome?.kind === 'PAID') return false;
      if (payment.id === latest.id) currentVerified = verifiedUnpaidOutcome(outcome);
      // Un intento anterior que sigue procesándose también puede terminar cobrándose.
      else if (!verifiedUnpaidOutcome(outcome)) return false;
    }
    return currentVerified;
  },
};
