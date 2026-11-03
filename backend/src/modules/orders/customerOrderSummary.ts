import { CakeProductionTask, Payment, Refund } from '@database/models';
import type { Order } from '@database/models/order.model';
import { Op } from 'sequelize';

export function cancellationPolicy(
  order: Pick<Order, 'status' | 'paymentPlan' | 'scheduledAt'>,
  productionStarted: boolean,
  now = Date.now(),
) {
  const reason = !['PENDING_PAYMENT', 'CONFIRMED'].includes(order.status)
    ? 'El pedido ya no admite cancelación directa. Contacta al equipo.'
    : productionStarted
      ? 'La producción ya comenzó. Solicita atención para revisar tu caso.'
      : order.status === 'CONFIRMED' &&
          order.paymentPlan === 'DEPOSIT_BALANCE' &&
          (!order.scheduledAt || now >= new Date(order.scheduledAt).getTime() - 48 * 3_600_000)
        ? 'El plazo de cancelación del anticipo terminó: debe solicitarse hasta 48 horas antes de la entrega.'
        : null;
  return { allowed: !reason, reason };
}
export async function customerOrderSummary(order: Order) {
  const [payments, started] = await Promise.all([
    Payment.findAll({
      where: { payableType: 'ORDER', payableId: order.id },
      attributes: ['id', 'amount', 'status', 'provider', 'stage', 'createdAt'],
      order: [['id', 'ASC']],
    }),
    CakeProductionTask.count({ where: { orderId: order.id, startedAt: { [Op.ne]: null } } }),
  ]);
  const refunds = payments.length
    ? await Refund.findAll({
        where: { paymentId: payments.map((payment) => payment.id) },
        attributes: ['id', 'paymentId', 'amount', 'status', 'createdAt'],
        order: [['id', 'ASC']],
      })
    : [];
  const paid = payments
    .filter((p) => ['SUCCEEDED', 'REFUNDED'].includes(p.status))
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const refunded = refunds
    .filter((r) => r.status === 'SUCCEEDED')
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const wallet = Number(order.walletAmount);
  const returnedWallet = ['CANCELLED', 'REFUNDED'].includes(order.status) ? wallet : 0;
  return {
    cancellation: cancellationPolicy(order, started > 0),
    financial: {
      payments,
      refunds,
      paid: paid + wallet,
      refunded: refunded + returnedWallet,
      refundPending: ['CANCELLED', 'REFUNDED'].includes(order.status)
        ? Math.max(0, Math.round((paid - refunded) * 100) / 100)
        : 0,
    },
  };
}
