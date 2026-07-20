import type { Transaction } from 'sequelize';
import { Order, Payment, Refund, WebhookEvent, sequelize } from '@database/models';
import { PAYABLE_TYPE } from '@database/models/payment.model';
import { REFUND_STATUS } from '@database/models/refund.model';
import { ORDER_STATUS, PAYMENT_STATUS } from '@config/constants';
import { logger } from '@config/logger';
import { ApiError } from '@shared/errors/ApiError';
import { ordersService } from '@modules/orders/orders.service';
import { plansService } from '@modules/plans/plans.service';
import { operationsService } from '@modules/operations/operations.service';
import { deliveryService } from '@modules/delivery/delivery.service';
import { getPaymentProvider } from '@integrations/payments';
import { inventoryService } from '@modules/operations/inventory.service';

export interface WebhookResult {
  handled: boolean;
  reason: string;
  orderNumber?: string;
}

/**
 * Todo lo que ocurre cuando un pedido queda PAGADO, venga el dinero de donde venga
 * (Stripe o saldo del plan). Una sola definicion evita que los dos caminos se
 * desincronicen.
 */
export const confirmPaidOrder = async (
  order: Order,
  transaction: Transaction,
  source: string,
  comment: string,
): Promise<void> => {
  if (order.status !== ORDER_STATUS.PENDING_PAYMENT) {
    logger.warn(`El pedido ${order.orderNumber} ya no estaba pendiente (${order.status})`);
    return;
  }

  await ordersService.changeStatus(order, ORDER_STATUS.CONFIRMED, {
    source,
    comment,
    transaction,
  });

  await ordersService.confirmCouponRedemptions(order.id, transaction);
  await ordersService.confirmSlot(order, transaction);

  // Entra a cocina, se reservan los insumos (RN-016) y, si es delivery, se abre el reparto.
  await operationsService.openTicketForOrder(order, transaction);
  await deliveryService.openForOrder(order, transaction);
};

export const paymentsService = {
  /**
   * UNICA fuente de verdad del pago (RN-014).
   *
   * 1) Verifica la firma con el body CRUDO. Sin firma valida, no se toca nada.
   * 2) Deduplica por id de evento: Stripe reintenta, y reintentar no debe cobrar
   *    ni confirmar dos veces (RN-015).
   * 3) Solo entonces confirma el pedido, consume el cupon y fija el cupo.
   */
  async handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<WebhookResult> {
    const provider = getPaymentProvider();
    const outcome = provider.parseWebhook(rawBody, signature); // lanza si la firma no valida

    // Idempotencia: el UNIQUE (provider, event_id) impide procesarlo dos veces.
    const [event, isNew] = await WebhookEvent.findOrCreate({
      where: { provider: provider.name, eventId: outcome.eventId },
      defaults: {
        provider: provider.name,
        eventId: outcome.eventId,
        eventType: outcome.eventType,
        payloadJson: null,
        processedAt: null,
      },
    });

    if (!isNew && event.processedAt) {
      return { handled: false, reason: 'Evento ya procesado' };
    }

    if (outcome.kind === 'IGNORED') {
      event.processedAt = new Date();
      await event.save();
      return { handled: false, reason: `Evento ignorado: ${outcome.eventType}` };
    }

    const payment = await Payment.findOne({
      where: { providerReference: outcome.providerReference },
    });

    if (!payment) {
      logger.warn(`Webhook sin pago asociado: ${outcome.providerReference}`);
      return { handled: false, reason: 'No existe un pago con esa referencia' };
    }

    // --- Compra de un plan: se activa y se acredita el saldo (RN-012) ---
    if (payment.payableType === PAYABLE_TYPE.PLAN_PURCHASE) {
      if (outcome.kind !== 'PAID') {
        payment.status = PAYMENT_STATUS.FAILED;
        payment.failedAt = new Date();
        payment.failureReason = outcome.reason ?? 'Pago rechazado';
        await payment.save();

        event.processedAt = new Date();
        await event.save();
        return { handled: true, reason: 'El pago del plan fallo' };
      }

      if (payment.status === PAYMENT_STATUS.SUCCEEDED) {
        event.processedAt = new Date();
        await event.save();
        return { handled: false, reason: 'El plan ya estaba activado' };
      }

      await sequelize.transaction(async (transaction) => {
        payment.status = PAYMENT_STATUS.SUCCEEDED;
        payment.method = outcome.method ?? payment.method;
        payment.capturedAt = new Date();
        payment.authorizedAt = payment.authorizedAt ?? new Date();
        await payment.save({ transaction });

        await plansService.activate(payment.payableId, transaction);

        event.processedAt = new Date();
        await event.save({ transaction });
      });

      return { handled: true, reason: 'Plan activado y saldo acreditado' };
    }

    // --- Pago de un pedido ---
    const order = await Order.findByPk(payment.payableId);
    if (!order || payment.payableType !== PAYABLE_TYPE.ORDER) {
      return { handled: false, reason: 'El pago no corresponde a un pedido' };
    }

    if (outcome.kind === 'PAID') {
      if (payment.status === PAYMENT_STATUS.SUCCEEDED) {
        event.processedAt = new Date();
        await event.save();
        return { handled: false, reason: 'El pago ya estaba confirmado', orderNumber: order.orderNumber };
      }

      await sequelize.transaction(async (transaction) => {
        payment.status = PAYMENT_STATUS.SUCCEEDED;
        payment.method = outcome.method ?? payment.method;
        payment.capturedAt = new Date();
        payment.authorizedAt = payment.authorizedAt ?? new Date();
        await payment.save({ transaction });

        // El pedido puede haber sido cancelado antes de que llegara el evento:
        // en ese caso no se confirma; queda el pago para reembolsar.
        await confirmPaidOrder(
          order,
          transaction,
          'PAYMENT_WEBHOOK',
          `Pago confirmado por ${provider.name}`,
        );

        event.processedAt = new Date();
        await event.save({ transaction });
      });

      logger.success(`Pedido ${order.orderNumber} CONFIRMADO por webhook`);
      return { handled: true, reason: 'Pedido confirmado', orderNumber: order.orderNumber };
    }

    // outcome.kind === 'FAILED'
    await sequelize.transaction(async (transaction) => {
      payment.status = PAYMENT_STATUS.FAILED;
      payment.failedAt = new Date();
      payment.failureReason = outcome.reason ?? 'Pago rechazado';
      await payment.save({ transaction });

      if (order.status === ORDER_STATUS.PENDING_PAYMENT) {
        order.cancelReason = 'El pago no se completo';
        await inventoryService.releaseForOrder(order, transaction);
        await ordersService.releaseReservations(order, transaction);
        await ordersService.changeStatus(order, ORDER_STATUS.CANCELLED, {
          source: 'PAYMENT_WEBHOOK',
          comment: payment.failureReason,
          transaction,
        });
      }

      event.processedAt = new Date();
      await event.save({ transaction });
    });

    return { handled: true, reason: 'Pago fallido, pedido cancelado', orderNumber: order.orderNumber };
  },

  /** RN-019: el reembolso referencia pago, importe, motivo y responsable. */
  async refund(paymentId: number, amount: number, reason: string, approvedBy: number) {
    const payment = await Payment.findByPk(paymentId);
    if (!payment) throw ApiError.notFound('Pago no encontrado');
    if (payment.status !== PAYMENT_STATUS.SUCCEEDED) {
      throw ApiError.unprocessable('Solo se puede devolver un pago confirmado');
    }
    if (amount <= 0 || amount > Number(payment.amount)) {
      throw ApiError.badRequest('Importe de reembolso invalido');
    }
    if (!payment.providerReference) {
      throw ApiError.unprocessable('El pago no tiene referencia del proveedor');
    }

    const refund = await Refund.create({
      paymentId: payment.id,
      amount,
      reason,
      approvedBy,
      status: REFUND_STATUS.PENDING,
    });

    const provider = getPaymentProvider();
    const result = await provider.refund({
      providerReference: payment.providerReference,
      amount,
      reason,
    });

    refund.status = result.succeeded ? REFUND_STATUS.SUCCEEDED : REFUND_STATUS.FAILED;
    refund.providerReference = result.providerReference;
    await refund.save();

    if (result.succeeded && amount === Number(payment.amount)) {
      payment.status = PAYMENT_STATUS.REFUNDED;
      await payment.save();

      const order = await Order.findByPk(payment.payableId);
      if (order && order.status === ORDER_STATUS.CANCELLED) {
        await ordersService.changeStatus(order, ORDER_STATUS.REFUNDED, {
          actorId: approvedBy,
          source: 'STAFF',
          comment: reason,
        });
      }
    }

    return refund;
  },

  /** Estado del pago de un pedido (la pagina de exito lo consulta; no confia en la URL). */
  async getByOrder(orderId: number) {
    return Payment.findOne({
      where: { payableType: PAYABLE_TYPE.ORDER, payableId: orderId },
      order: [['id', 'DESC']],
    });
  },
};

export type PaymentsService = typeof paymentsService;
