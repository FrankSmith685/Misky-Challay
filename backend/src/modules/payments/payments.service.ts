import type { Transaction } from 'sequelize';
import { Order, Payment, Refund, WebhookEvent, sequelize } from '@database/models';
import { PAYABLE_TYPE } from '@database/models/payment.model';
import { REFUND_STATUS } from '@database/models/refund.model';
import { ORDER_STATUS, PAYMENT_STATUS } from '@config/constants';
import { logger } from '@config/logger';
import { ApiError } from '@shared/errors/ApiError';
import { round2 } from '@shared/utils/money';
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

  /**
   * RN-019: el reembolso referencia pago, importe, motivo y responsable.
   *
   * Tres cosas que antes fallaban:
   *  - El tope se comparaba contra el importe del pago SIN restar lo ya devuelto,
   *    asi que dos reembolsos de S/50 sobre un pago de S/100 pasaban los dos.
   *  - Como ninguno era igual al total, el pago nunca llegaba a REFUNDED: el dinero
   *    salia y el sistema seguia afirmando que no.
   *  - La fila de Refund se creaba antes de llamar al proveedor y, si este fallaba,
   *    la excepcion subia dejando un PENDING huerfano para siempre.
   *
   * La reserva se hace en una transaccion con bloqueo (la fila PENDING ya cuenta
   * para el tope, de modo que dos reembolsos simultaneos no se pisan), la llamada al
   * proveedor ocurre FUERA de la transaccion —no se retiene un lock durante una
   * llamada de red— y el desenlace se escribe en una segunda transaccion.
   */
  async refund(paymentId: number, amount: number, reason: string, approvedBy: number) {
    const { payment, refund } = await sequelize.transaction(async (transaction) => {
      const locked = await Payment.findByPk(paymentId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!locked) throw ApiError.notFound('Pago no encontrado');
      if (locked.status !== PAYMENT_STATUS.SUCCEEDED) {
        throw ApiError.unprocessable('Solo se puede devolver un pago confirmado');
      }
      if (!locked.providerReference) {
        throw ApiError.unprocessable('El pago no tiene referencia del proveedor');
      }

      // Lo ya comprometido: devuelto con exito o en curso. Los fallidos no cuentan.
      const committed =
        (await Refund.sum('amount', {
          where: {
            paymentId: locked.id,
            status: [REFUND_STATUS.PENDING, REFUND_STATUS.SUCCEEDED],
          },
          transaction,
        })) ?? 0;

      const remaining = round2(Number(locked.amount) - Number(committed));
      if (amount <= 0 || amount > remaining) {
        throw ApiError.badRequest(
          `Importe de reembolso invalido. Disponible para devolver: ${remaining.toFixed(2)}`,
        );
      }

      const created = await Refund.create(
        {
          paymentId: locked.id,
          amount,
          reason,
          approvedBy,
          status: REFUND_STATUS.PENDING,
        },
        { transaction },
      );

      return { payment: locked, refund: created };
    });

    const provider = getPaymentProvider();

    let result: { succeeded: boolean; providerReference?: string | null };
    try {
      result = await provider.refund({
        providerReference: payment.providerReference as string,
        amount,
        reason,
      });
    } catch (error) {
      // Sin esto la fila quedaba PENDING para siempre y bloqueaba el importe restante.
      refund.status = REFUND_STATUS.FAILED;
      await refund.save();
      logger.error(`Fallo el reembolso del pago ${payment.id}`, error);
      throw ApiError.unprocessable('El proveedor rechazo el reembolso. Intentalo de nuevo.');
    }

    await sequelize.transaction(async (transaction) => {
      refund.status = result.succeeded ? REFUND_STATUS.SUCCEEDED : REFUND_STATUS.FAILED;
      refund.providerReference = result.providerReference ?? null;
      await refund.save({ transaction });

      if (!result.succeeded) return;

      // Se recalcula el total devuelto: el pago pasa a REFUNDED cuando se completa,
      // aunque se haya devuelto en varias veces.
      const refunded =
        (await Refund.sum('amount', {
          where: { paymentId: payment.id, status: REFUND_STATUS.SUCCEEDED },
          transaction,
        })) ?? 0;

      if (round2(Number(refunded)) < round2(Number(payment.amount))) return;

      payment.status = PAYMENT_STATUS.REFUNDED;
      await payment.save({ transaction });

      if (payment.payableType !== PAYABLE_TYPE.ORDER) return;

      const order = await Order.findByPk(payment.payableId, { transaction });
      if (order && order.status === ORDER_STATUS.CANCELLED) {
        await ordersService.changeStatus(order, ORDER_STATUS.REFUNDED, {
          actorId: approvedBy,
          source: 'STAFF',
          comment: reason,
          transaction,
        });
      }
    });

    return refund;
  },

  /**
   * Devuelve lo cobrado con tarjeta al cancelar un pedido.
   *
   * El saldo del plan y el cupon ya se liberan solos en `releaseReservations`, pero
   * el cobro con tarjeta no se devolvia por ningun camino: ni al cancelar el cliente,
   * ni al cancelar soporte. El pedido quedaba CANCELLED con el dinero cobrado.
   *
   * No lanza: la cancelacion no puede quedar a medias porque el proveedor falle. Si
   * el reembolso no sale, se registra para que soporte lo retome desde el panel.
   */
  async refundOrderPayment(order: Order, reason: string, actorId: number | null) {
    const payment = await Payment.findOne({
      where: {
        payableType: PAYABLE_TYPE.ORDER,
        payableId: order.id,
        status: PAYMENT_STATUS.SUCCEEDED,
      },
      order: [['id', 'DESC']],
    });

    // Sin cobro con tarjeta no hay nada que devolver: pedido pagado 100% con saldo,
    // o que nunca llego a pagarse.
    if (!payment || Number(payment.amount) <= 0) return null;

    try {
      return await paymentsService.refund(
        payment.id,
        Number(payment.amount),
        reason,
        actorId ?? 0,
      );
    } catch (error) {
      logger.error(
        `Reembolso automatico fallido al cancelar el pedido ${order.orderNumber}. Requiere gestion manual.`,
        error,
      );
      return null;
    }
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
