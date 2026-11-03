import type { Order, Payment } from '@database/models';
import type { WebhookOutcome } from '@integrations/payments/payment.provider';
import type { MessagingConfig } from './communications.config';

export const PAYMENT_HOLD_MINUTES = 15;
export const PAYMENT_EXPIRED_REASON = 'El tiempo para completar el pago venció';
export const FOLLOWUP_EVENTS = ['PAYMENT_REMINDER', 'PAYMENT_FAILED', 'PAYMENT_EXPIRED'] as const;
export type PaymentFollowupEvent = (typeof FOLLOWUP_EVENTS)[number];
export interface PaymentFollowupContext {
  order: Order;
  payments: Payment[];
  hasReport: boolean;
}

/** La fecha de cierre nunca se amplía por enviar un recordatorio. */
export const paymentFollowupDeadline = (order: Order, payment: Payment): number => {
  if (['yape', 'plin'].includes(payment.provider)) {
    const snapshot = payment.safeResponseJson?.directPayment as { expiresAt?: string } | undefined;
    const expiry = snapshot?.expiresAt ? Date.parse(snapshot.expiresAt) : NaN;
    return Number.isFinite(expiry) ? expiry : 0;
  }
  const declared = payment.safeResponseJson?.expiresAt;
  const expiry =
    typeof declared === 'number' && Number.isFinite(declared) ? declared * 1000 : Infinity;
  if (payment.provider === 'mercadopago')
    return Math.min(expiry, payment.createdAt.getTime() + 30 * 60000);
  return Math.min(expiry, order.placedAt.getTime() + PAYMENT_HOLD_MINUTES * 60000);
};

/** Solo estados explícitamente impagados. Procesando o desconocido no significa rechazado. */
export const verifiedUnpaidOutcome = (outcome: WebhookOutcome | null): boolean =>
  Boolean(
    outcome &&
    (outcome.kind === 'FAILED' ||
      (outcome.kind === 'IGNORED' &&
        ['order.created', 'checkout.session.open'].includes(outcome.eventType))),
  );

export const paymentFollowupSkipReason = (
  event: PaymentFollowupEvent,
  context: PaymentFollowupContext | null,
  paymentId: number,
  config: MessagingConfig,
  now = Date.now(),
): string | null => {
  if (!context) return 'El pedido o el pago ya no están disponibles.';
  const { order, payments, hasReport } = context;
  const payment = payments[0];
  if (!payment || Number(payment.id) !== paymentId)
    return 'El cliente inició otro intento de pago.';
  if (payments.some((item) => ['SUCCEEDED', 'REFUNDED'].includes(item.status)))
    return 'El pedido ya tiene un pago confirmado o devuelto.';
  if (hasReport) return 'El cliente ya reportó una transferencia; no se solicita otro pago.';
  if (payment.stage === 'BALANCE') return 'Este aviso solo corresponde al pago inicial del pedido.';
  if (!['yape', 'plin', 'mercadopago', 'stripe', 'mock'].includes(payment.provider))
    return 'El medio de pago no admite este seguimiento.';
  if (event === 'PAYMENT_EXPIRED')
    return order.status === 'CANCELLED' && order.cancelReason === PAYMENT_EXPIRED_REASON
      ? null
      : 'El pedido no fue cancelado por vencimiento del pago.';
  if (order.status !== 'PENDING_PAYMENT') return 'El pedido ya no está pendiente de pago.';
  if (paymentFollowupDeadline(order, payment) <= now + 60000)
    return 'El plazo para pagar venció o está por vencer.';
  if (event === 'PAYMENT_FAILED')
    return payment.status === 'FAILED' ? null : 'El intento de pago ya no está fallido.';
  const reminder = config.paymentReminders;
  if (!reminder.enabled) return 'Los recordatorios de pago están desactivados.';
  if (!reminder.activatedAt || order.placedAt.getTime() < Date.parse(reminder.activatedAt))
    return 'El pedido es anterior a la activación de los recordatorios.';
  if (order.placedAt.getTime() + reminder.delayMinutes * 60000 > now)
    return 'Todavía no corresponde enviar el recordatorio.';
  return payment.status === 'PENDING' ? null : 'El pago ya no está pendiente.';
};
