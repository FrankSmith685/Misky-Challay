import type { Transaction } from 'sequelize';
import {
  Branch,
  MobilePaymentClaim,
  Order,
  Payment,
  PaymentAttempt,
  Refund,
  WebhookEvent,
  sequelize,
} from '@database/models';
import { PAYABLE_TYPE } from '@database/models/payment.model';
import { MOBILE_PAYMENT_CLAIM_STATUS } from '@database/models/mobilePaymentClaim.model';
import { REFUND_STATUS } from '@database/models/refund.model';
import { ORDER_STATUS, PAYMENT_PROVIDER, PAYMENT_STATUS } from '@config/constants';
import { env } from '@config/env';
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

/**
 * Canal desde el que se paga. Decide UNICAMENTE a donde devuelve la pasarela: la
 * URL de retorno se construye aqui a partir de una lista cerrada, nunca se acepta
 * una URL enviada por el cliente.
 */
export type PaymentClient = 'WEB' | 'MOBILE';

/**
 * Margen antes de dar por buena una sesion de pago ya abierta. Una sesion a punto
 * de caducar no sirve de nada: el cliente la abre, escribe la tarjeta y Stripe se
 * la rechaza por expirada.
 */
const SESSION_SAFETY_MARGIN_MS = 5 * 60 * 1000;

/**
 * Caducidad que se asume cuando el proveedor no la declara (el simulador local no
 * la devuelve). Es la de Stripe Checkout: 24 h desde que se crea la sesion.
 */
const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** Cuando muere la sesion de pago: lo que diga el proveedor o, si calla, 24 h. */
const sessionExpiresAt = (payment: Payment): number => {
  const declared = payment.safeResponseJson?.expiresAt;
  // Stripe devuelve `expires_at` en segundos epoch dentro de la respuesta depurada.
  if (typeof declared === 'number' && Number.isFinite(declared)) return declared * 1000;
  return payment.createdAt.getTime() + DEFAULT_SESSION_TTL_MS;
};

/**
 * La url de la sesion de pago guardada, si todavia sirve para cobrar. Null si no.
 *
 * Es lo que separa "reabre el enlace que ya tienes" de "abre uno nuevo": las
 * sesiones de Stripe caducan y hasta ahora la app reabria la URL muerta guardada
 * en el pedido, con lo que el cliente no podia pagar y el pedido moria reteniendo
 * su inventario.
 */
export const usableCheckoutUrl = (payment: Payment): string | null => {
  if (!payment.checkoutUrl) return null;
  if (payment.status !== PAYMENT_STATUS.PENDING) return null;
  return sessionExpiresAt(payment) - Date.now() > SESSION_SAFETY_MARGIN_MS
    ? payment.checkoutUrl
    : null;
};

/** Retorno de la pasarela. Web y movil aterrizan en pantallas distintas. */
const buildOrderReturnUrls = (orderNumber: string, client: PaymentClient) => {
  const isMobile = client === 'MOBILE';
  const path = isMobile ? '/checkout/movil' : '/checkout/confirmacion';
  const baseUrl = isMobile ? (env.MOBILE_RETURN_BASE_URL ?? env.FRONTEND_URL) : env.FRONTEND_URL;
  const orderParam = encodeURIComponent(orderNumber);

  return {
    successUrl: `${baseUrl}${path}?pedido=${orderParam}${isMobile ? '&resultado=aprobado' : ''}`,
    /*
     * Volver de la pasarela sin pagar NO lleva al carrito: el pedido ya existe y el
     * carrito se vacio al crearlo, asi que el cliente aterrizaba en una pagina vacia
     * creyendo que habia perdido su compra, mientras el pedido seguia vivo reteniendo
     * stock, cupon y saldo sin que el pudiera pagarlo ni cancelarlo. Se le devuelve a
     * SU pedido, donde puede hacer las dos cosas.
     */
    cancelUrl: `${baseUrl}${path}?pedido=${orderParam}${isMobile ? '&resultado=cancelado' : '&pago=cancelado'}`,
  };
};

export interface CheckoutSessionOptions {
  client?: PaymentClient;
  customerEmail?: string | null;
}

/**
 * Abre una sesion de pago alojada para un cobro YA reservado y devuelve su URL.
 *
 * Recibe la fila de `payments` en vez de crearla: quien llama la reserva dentro de
 * SU transaccion (es ahi donde el UNIQUE de `idempotency_key` hace de guardia), y
 * la llamada de red al proveedor ocurre despues, fuera de cualquier bloqueo.
 *
 * Export suelto y no metodo del servicio a proposito, igual que `confirmPaidOrder`:
 * es un contrato compartido entre checkout (primer intento) y pedidos (reintento),
 * y una sola definicion evita que los dos caminos se desincronicen.
 *
 * Lanza si el proveedor falla, dejando el cobro en FAILED con su motivo. Que hacer
 * con el pedido lo decide quien llama: el checkout lo cancela porque acaba de
 * nacer; un reintento lo deja vivo para volver a intentarlo.
 */
export const openOrderCheckoutSession = async (
  order: Order,
  payment: Payment,
  options: CheckoutSessionOptions = {},
): Promise<string> => {
  const provider = getPaymentProvider();
  const { successUrl, cancelUrl } = buildOrderReturnUrls(order.orderNumber, options.client ?? 'WEB');

  try {
    const checkout = await provider.createCheckout({
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: Number(payment.amount),
      currency: payment.currency,
      customerEmail: options.customerEmail ?? null,
      description: `Pedido ${order.orderNumber} en Verde Bowl`,
      idempotencyKey: payment.idempotencyKey,
      successUrl,
      cancelUrl,
    });

    payment.providerReference = checkout.providerReference;
    payment.checkoutUrl = checkout.checkoutUrl;
    payment.status = PAYMENT_STATUS.PENDING;
    payment.safeResponseJson = checkout.safeResponse;
    await payment.save();

    await PaymentAttempt.create({
      paymentId: payment.id,
      idempotencyKey: payment.idempotencyKey,
      requestJson: { orderId: order.id, amount: Number(payment.amount) },
      responseJson: checkout.safeResponse,
      success: true,
    });

    return checkout.checkoutUrl;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error del proveedor de pago';

    payment.status = PAYMENT_STATUS.FAILED;
    payment.failedAt = new Date();
    payment.failureReason = message.slice(0, 255);
    await payment.save();

    await PaymentAttempt.create({
      paymentId: payment.id,
      idempotencyKey: payment.idempotencyKey,
      requestJson: { orderId: order.id },
      responseJson: null,
      success: false,
      errorMessage: message.slice(0, 500),
    });

    logger.error(`No se pudo abrir el pago del pedido ${order.orderNumber}`, error);
    throw ApiError.internal('No pudimos iniciar el pago. Intenta de nuevo.');
  }
};

export const paymentsService = {
  /** Cola de declaraciones Yape/Plin que Caja debe contrastar con el aplicativo real. */
  async pendingMobilePayments(branchId: number) {
    const claims = await MobilePaymentClaim.findAll({
      where: { status: MOBILE_PAYMENT_CLAIM_STATUS.PENDING },
      include: [{
        model: Payment,
        as: 'payment',
        required: true,
        where: { payableType: PAYABLE_TYPE.ORDER, status: PAYMENT_STATUS.PENDING },
      }],
      order: [['submittedAt', 'ASC']],
    });
    const payments = claims.map((claim) => claim.get('payment') as Payment);
    const orders = await Order.findAll({
      where: { id: payments.map((payment) => payment.payableId), branchId },
      include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'] }],
    });
    const byId = new Map(orders.map((order) => [order.id, order]));
    return claims.flatMap((claim) => {
      const payment = claim.get('payment') as Payment;
      const order = byId.get(payment.payableId);
      if (!order) return [];
      return [{
        id: claim.id,
        paymentId: payment.id,
        provider: claim.provider,
        operationCode: claim.operationCode,
        payerPhone: claim.payerPhone,
        amount: Number(payment.amount),
        currency: payment.currency,
        submittedAt: claim.submittedAt,
        order: {
          orderNumber: order.orderNumber,
          contactName: order.contactName,
          contactPhone: order.contactPhone,
          placedAt: order.placedAt,
          branch: order.get('branch') ?? null,
        },
      }];
    });
  },

  /**
   * Validacion de Caja con bloqueo de filas. Aprobar ejecuta exactamente el mismo
   * cierre que un webhook confiable; rechazar libera todas las reservas.
   */
  async reviewMobilePayment(
    paymentId: number,
    decision: 'APPROVE' | 'REJECT',
    actorId: number,
    reason?: string,
    scopeCheck?: (branchId: number) => void,
  ) {
    return sequelize.transaction(async (transaction) => {
      const payment = await Payment.findByPk(paymentId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!payment || ![PAYMENT_PROVIDER.YAPE, PAYMENT_PROVIDER.PLIN].includes(payment.provider as 'yape' | 'plin')) {
        throw ApiError.notFound('Pago Yape/Plin no encontrado');
      }
      const claim = await MobilePaymentClaim.findOne({
        where: { paymentId: payment.id }, transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!claim) throw ApiError.notFound('Declaracion de pago no encontrada');
      const order = await Order.findByPk(payment.payableId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!order) throw ApiError.notFound('Pedido no encontrado');
      scopeCheck?.(order.branchId);
      if (claim.status !== MOBILE_PAYMENT_CLAIM_STATUS.PENDING || payment.status !== PAYMENT_STATUS.PENDING) {
        throw ApiError.conflict('Este pago ya fue revisado');
      }
      if (order.status !== ORDER_STATUS.PENDING_PAYMENT) {
        throw ApiError.conflict(`El pedido ya esta en ${order.status}`);
      }

      claim.reviewedBy = actorId;
      claim.reviewedAt = new Date();
      if (decision === 'APPROVE') {
        claim.status = MOBILE_PAYMENT_CLAIM_STATUS.APPROVED;
        payment.status = PAYMENT_STATUS.SUCCEEDED;
        payment.authorizedAt = new Date();
        payment.capturedAt = new Date();
        await payment.save({ transaction });
        await claim.save({ transaction });
        await confirmPaidOrder(
          order,
          transaction,
          'CASHIER',
          `${claim.provider.toUpperCase()} validado por Caja · operacion ${claim.operationCode}`,
        );
      } else {
        claim.status = MOBILE_PAYMENT_CLAIM_STATUS.REJECTED;
        claim.rejectionReason = reason?.trim() || 'El movimiento no fue encontrado';
        payment.status = PAYMENT_STATUS.FAILED;
        payment.failedAt = new Date();
        payment.failureReason = claim.rejectionReason;
        await payment.save({ transaction });
        await claim.save({ transaction });
        order.cancelReason = `Pago ${claim.provider.toUpperCase()} rechazado: ${claim.rejectionReason}`;
        await inventoryService.releaseForOrder(order, transaction);
        await ordersService.releaseReservations(order, transaction);
        await ordersService.changeStatus(order, ORDER_STATUS.CANCELLED, {
          actorId, source: 'CASHIER', comment: order.cancelReason, transaction,
        });
      }
      return {
        paymentId: payment.id,
        orderNumber: order.orderNumber,
        paymentStatus: payment.status,
        claimStatus: claim.status,
        orderStatus: order.status,
      };
    });
  },

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
      // El efectivo se devuelve en mano: no hay proveedor que llamar ni referencia.
      // Solo se exige referencia a los pagos online (tarjeta).
      const isManualProvider = [PAYMENT_PROVIDER.CASH, PAYMENT_PROVIDER.YAPE, PAYMENT_PROVIDER.PLIN]
        .includes(locked.provider as 'cash' | 'yape' | 'plin');
      if (!isManualProvider && !locked.providerReference) {
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

    let result: { succeeded: boolean; providerReference?: string | null };
    if ([PAYMENT_PROVIDER.CASH, PAYMENT_PROVIDER.YAPE, PAYMENT_PROVIDER.PLIN]
      .includes(payment.provider as 'cash' | 'yape' | 'plin')) {
      // Efectivo/Yape/Plin no exponen una API de devolucion: la fila Refund es el
      // asiento de la devolucion manual realizada por Caja.
      result = { succeeded: true, providerReference: null };
    } else {
      const provider = getPaymentProvider();
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
   * Cobro cerrado de un pedido que todavia admite devolucion, o null si no lo hay
   * (pagado 100% con saldo, o que nunca llego a cobrarse).
   *
   * Se necesita SEPARADO de `refundOrderPayment` porque quien cancela un pedido
   * puede no tener `payment.refund`: hay que saber que queda dinero pendiente para
   * avisarlo, sin intentar devolverlo. Antes ambos casos —"no habia nada" y "fallo
   * el proveedor"— llegaban al panel como el mismo `null` y el aviso era una
   * conjetura ("revisa si el pedido tenia un cobro...").
   */
  async refundableForOrder(order: Order): Promise<Payment | null> {
    const payment = await Payment.findOne({
      where: {
        payableType: PAYABLE_TYPE.ORDER,
        payableId: order.id,
        status: PAYMENT_STATUS.SUCCEEDED,
      },
      order: [['id', 'DESC']],
    });

    return payment && Number(payment.amount) > 0 ? payment : null;
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
   *
   * OJO: mueve dinero real. Quien la invoque tiene que haber comprobado antes que
   * el actor puede reembolsar (`payment.refund`); el permiso no se valida aqui
   * porque el servicio tambien corre sin peticion detras (webhooks, jobs).
   */
  async refundOrderPayment(order: Order, reason: string, actorId: number | null) {
    const payment = await paymentsService.refundableForOrder(order);
    if (!payment) return null;

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
