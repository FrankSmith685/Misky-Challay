import { hasAdditionalBalance } from '@modules/orders/additionalBalance';
import type { Transaction } from 'sequelize';
import {
  Branch,
  CakeProductionTask,
  MobilePaymentClaim,
  MobilePaymentEvent,
  Order,
  Payment,
  PaymentAttempt,
  Refund,
  WebhookEvent,
  sequelize,
} from '@database/models';
import { PAYABLE_TYPE, PAYMENT_STAGE } from '@database/models/payment.model';
import { MOBILE_PAYMENT_CLAIM_STATUS } from '@database/models/mobilePaymentClaim.model';
import { REFUND_STATUS } from '@database/models/refund.model';
import { ORDER_STATUS, PAYMENT_PROVIDER, PAYMENT_STATUS, PERMISSIONS, PUSH_CHANNEL, PUSH_TEMPLATE } from '@config/constants';
import { env } from '@config/env';
import { logger } from '@config/logger';
import { ApiError } from '@shared/errors/ApiError';
import { round2 } from '@shared/utils/money';
import { ordersService } from '@modules/orders/orders.service';
import { plansService } from '@modules/plans/plans.service';
import { mpSubscriptions } from '@modules/subscriptions/mercadoPagoSubscriptions';
import { operationsService } from '@modules/operations/operations.service';
import { deliveryService } from '@modules/delivery/delivery.service';
import { getPaymentProvider } from '@integrations/payments';
import type { WebhookOutcome } from '@integrations/payments/payment.provider';
import { inventoryService } from '@modules/operations/inventory.service';
import { cakeProductionService } from '@modules/cakes/cakeProduction.service';
import { cakeCommissionService } from '@modules/cakes/cakeCommission.service';
import { kitchenPushService } from '@modules/operations/kitchenPush.service';
import { sendMobilePushToStaff } from '@modules/notifications/mobilePush.service';
import { buildOrderReturnUrls, type PaymentClient } from './paymentReturnUrls';
import { isDirectProvider } from './directPayments.logic';
import { paymentNotifications } from '@modules/communications/paymentNotifications.service';

export interface WebhookResult {
  handled: boolean;
  reason: string;
  orderNumber?: string;
}

/**
 * Confirmacion compartida para pedidos pagados y contra entrega. El efectivo
 * queda pendiente hasta que el equipo registre el cobro o entregue el pedido.
 */
const confirmOrder = async (
  order: Order,
  transaction: Transaction,
  source: string,
  comment: string,
  payment?: Payment,
  options: { skipCakeProduction?: boolean; markPaid?: boolean } = {},
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

  if (options.markPaid !== false) {
    const paidAt = new Date();
    order.depositPaidAt = paidAt;
    if (!payment || payment.stage === PAYMENT_STAGE.FULL) order.balancePaidAt = paidAt;
    await order.save({ transaction });
  }

  await ordersService.confirmCouponRedemptions(order.id, transaction);
  await ordersService.confirmSlot(order, transaction);
  // Las ventas de mostrador pueden corresponder a una torta ya terminada. En
  // ese caso la venta igual pasa por inventario y cocina, pero no crea una
  // segunda agenda de producción sin fecha programada.
  if (!options.skipCakeProduction) {
    await cakeProductionService.confirmForOrder(order, transaction);
    if (order.scheduledAt && await CakeProductionTask.count({ where: { orderId: order.id }, transaction })) {
      transaction.afterCommit(() => {
        void kitchenPushService.notifyBranch(order.branchId, {
          title: `Torta confirmada ${order.orderNumber}`,
          body: 'Revisa las etapas y asigna responsables en Producción de tortas.',
          tag: `cake-production-${order.id}`,
          url: `/admin/tortas?seccion=production&pedido=${encodeURIComponent(order.orderNumber)}&branchId=${order.branchId}`,
        }).catch((error) => logger.error('Fallo el aviso de nueva torta programada', error));
        void sendMobilePushToStaff({
          branchId: order.branchId,
          permission: PERMISSIONS.KITCHEN_READ,
          title: `Torta confirmada ${order.orderNumber}`,
          body: 'Ya está en el plan de producción. Revisa sus etapas y fecha de entrega.',
          actionUrl: `/staff/cakes?branchId=${order.branchId}`,
          channel: PUSH_CHANNEL.KITCHEN_OPERATIONS,
          template: PUSH_TEMPLATE.KITCHEN_OPERATION,
          orderId: order.id,
          idempotencyKey: `cake-production-${order.id}-confirmed`,
        }).catch((error) => logger.error('Fallo el aviso móvil de nueva torta programada', error));
      });
    }
  }
  if (options.markPaid !== false) await cakeCommissionService.ensureForOrder(order, transaction);

  // Entra a cocina, se reservan los insumos (RN-016) y, si es delivery, se abre el reparto.
  await operationsService.openTicketForOrder(order, transaction);
  await deliveryService.openForOrder(order, transaction);
};

export const confirmPaidOrder = (
  order: Order,
  transaction: Transaction,
  source: string,
  comment: string,
  payment?: Payment,
  options: { skipCakeProduction?: boolean } = {},
): Promise<void> => confirmOrder(order, transaction, source, comment, payment, options);

export const confirmCashOrder = (
  order: Order,
  transaction: Transaction,
): Promise<void> => confirmOrder(order, transaction, 'CUSTOMER', 'Pedido confirmado; pago en efectivo al entregar', undefined, { markPaid: false });

/**
 * Canal desde el que se paga. Decide UNICAMENTE a donde devuelve la pasarela: la
 * URL de retorno se construye aqui a partir de una lista cerrada, nunca se acepta
 * una URL enviada por el cliente.
 */
export type { PaymentClient } from './paymentReturnUrls';

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
  // Mercado Pago no debe abrir otra order mientras la anterior aun se puede pagar.
  const margin = payment.provider === PAYMENT_PROVIDER.MERCADOPAGO ? 0 : SESSION_SAFETY_MARGIN_MS;
  return sessionExpiresAt(payment) - Date.now() > margin
    ? payment.checkoutUrl
    : null;
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
  const { successUrl, cancelUrl } = buildOrderReturnUrls(
    order.orderNumber, options.client ?? 'WEB', env.FRONTEND_URL, env.MOBILE_RETURN_BASE_URL,
  );

  try {
    const cakePaymentLabel = payment.stage === PAYMENT_STAGE.DEPOSIT
      ? 'Anticipo de torta'
      : payment.stage === PAYMENT_STAGE.BALANCE
        ? 'Saldo de torta'
        : 'Pedido';
    const checkout = await provider.createCheckout({
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: Number(payment.amount),
      currency: payment.currency,
      customerEmail: options.customerEmail ?? null,
      displayName: `${cakePaymentLabel} ${order.orderNumber}`,
      description: `${cakePaymentLabel} ${order.orderNumber} en Misky Challay`,
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
  async captureCash(paymentId: number, reference: string, actorId: number, scopeCheck?: (branchId: number) => void) {
    return sequelize.transaction(async (transaction) => {
      const payment = await Payment.findByPk(paymentId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!payment || payment.provider !== PAYMENT_PROVIDER.CASH || payment.payableType !== PAYABLE_TYPE.ORDER) throw ApiError.notFound('Cobro en efectivo no encontrado');
      const order = await Order.findByPk(payment.payableId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!order) throw ApiError.notFound('Pedido no encontrado');
      scopeCheck?.(order.branchId);
      if (payment.status === PAYMENT_STATUS.SUCCEEDED) return payment;
      if (payment.status !== PAYMENT_STATUS.PENDING || order.status === ORDER_STATUS.CANCELLED || order.status === ORDER_STATUS.REFUNDED) throw ApiError.conflict('Este cobro no puede confirmarse');
      payment.status = PAYMENT_STATUS.SUCCEEDED;
      payment.capturedAt = new Date();
      payment.authorizedAt = payment.capturedAt;
      payment.safeResponseJson = { cashReceiptReference: reference.trim(), capturedBy: actorId };
      await payment.save({ transaction });
      await cakeCommissionService.ensureForOrder(order, transaction);
      return payment;
    });
  },
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
    const { directPaymentsService } = await import('./directPayments.service');
    return directPaymentsService.review(paymentId, decision, actorId, reason, scopeCheck ?? (() => undefined));
  },

  /**
   * La pasarela es la fuente de verdad del pago (RN-014).
   *
   * 1) Verifica la firma con el body CRUDO. Sin firma valida, no se toca nada.
   * 2) Deduplica por id de evento: Stripe reintenta, y reintentar no debe cobrar
   *    ni confirmar dos veces (RN-015).
   * 3) Solo entonces confirma el pedido, consume el cupon y fija el cupo.
   */
  async handleWebhook(rawBody: Buffer, signature: string | undefined, context?: { requestId?: string; resourceId?: string }): Promise<WebhookResult> {
    const provider = getPaymentProvider();
    const outcome = await provider.parseWebhook(rawBody, signature, context); // lanza si la firma no valida
    return paymentsService.applyVerifiedOutcome(outcome);
  },

  /** Recupera un pago desde la API del proveedor cuando no llego su webhook. */
  async reconcilePayment(payment: Payment): Promise<WebhookOutcome | null> {
    const provider = getPaymentProvider();
    if (provider.name !== payment.provider || !provider.lookupCheckout || !payment.providerReference) return null;
    const outcome = await provider.lookupCheckout(payment.providerReference);
    await paymentsService.applyVerifiedOutcome(outcome);
    return outcome;
  },

  async reconcileOrderPayments(orderId: number): Promise<WebhookOutcome[]> {
    const payments = await Payment.findAll({
      where: { payableType: PAYABLE_TYPE.ORDER, payableId: orderId, provider: PAYMENT_PROVIDER.MERCADOPAGO },
      order: [['id', 'DESC']],
    });
    const outcomes: WebhookOutcome[] = [];
    for (const payment of payments) {
      if (payment.providerReference && payment.status !== PAYMENT_STATUS.SUCCEEDED) {
        const outcome = await paymentsService.reconcilePayment(payment);
        if (outcome) outcomes.push(outcome);
      }
    }
    return outcomes;
  },

  /** El cliente solo puede pedir conciliacion de sus propios pedidos. */
  async reconcileOrder(orderNumber: string, userId: number): Promise<void> {
    const order = await Order.findOne({ where: { orderNumber } });
    if (!order) throw ApiError.notFound('Pedido no encontrado');
    if (order.userId !== userId) throw ApiError.forbidden('Este pedido no es tuyo');
    await paymentsService.reconcileOrderPayments(order.id);
  },

  async applyVerifiedOutcome(outcome: WebhookOutcome): Promise<WebhookResult> {
    const provider = getPaymentProvider();

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

    if (outcome.kind === 'PAID' && outcome.amount !== undefined && (
      round2(outcome.amount) !== round2(Number(payment.amount)) ||
      (outcome.currency && outcome.currency.toUpperCase() !== payment.currency.toUpperCase())
    )) {
      throw ApiError.unprocessable('El importe o la moneda del cobro no coincide con el pedido');
    }

    // --- Compra de un plan: se activa y se acredita el saldo (RN-012) ---
    if (payment.payableType === PAYABLE_TYPE.PLAN_PURCHASE) {
      if (outcome.kind !== 'PAID') {
        if (payment.status === PAYMENT_STATUS.SUCCEEDED) {
          event.processedAt = new Date();
          await event.save();
          return { handled: false, reason: 'El plan ya estaba activado' };
        }
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

      let closedAtPayment = false;
      let alreadyPaid = false;
      await sequelize.transaction(async (transaction) => {
        const lockedOrder = await Order.findByPk(order.id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!lockedOrder) throw ApiError.notFound('Pedido no encontrado');
        const lockedPayment = await Payment.findByPk(payment.id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!lockedPayment) throw ApiError.notFound('Pago no encontrado');
        if (lockedPayment.status === PAYMENT_STATUS.SUCCEEDED) {
          alreadyPaid = true;
          event.processedAt = new Date();
          await event.save({ transaction });
          return;
        }
        closedAtPayment = lockedOrder.status === ORDER_STATUS.CANCELLED
          || lockedOrder.status === ORDER_STATUS.REFUNDED
          || lockedOrder.status === ORDER_STATUS.DELIVERED
          || (lockedPayment.stage !== PAYMENT_STAGE.BALANCE && lockedOrder.status !== ORDER_STATUS.PENDING_PAYMENT);
        lockedPayment.status = PAYMENT_STATUS.SUCCEEDED;
        lockedPayment.method = outcome.method ?? lockedPayment.method;
        lockedPayment.capturedAt = new Date();
        lockedPayment.authorizedAt = lockedPayment.authorizedAt ?? new Date();
        await lockedPayment.save({ transaction });

        // El pedido puede haber sido cancelado antes de que llegara el evento:
        // en ese caso no se confirma; queda el pago para reembolsar.
        if (payment.stage === PAYMENT_STAGE.BALANCE) {
          if (!closedAtPayment && !lockedOrder.balancePaidAt) {
            lockedOrder.balancePaidAt = new Date();
            await lockedOrder.save({ transaction });
            await cakeCommissionService.ensureForOrder(lockedOrder, transaction);
          }
        } else if (!closedAtPayment) {
          const source = outcome.eventId.startsWith('reconcile:') ? 'PAYMENT_RECONCILIATION' : 'PAYMENT_WEBHOOK';
          await confirmPaidOrder(lockedOrder, transaction, source, `Pago confirmado por ${provider.name}`, lockedPayment);
        }

        event.processedAt = new Date();
        await event.save({ transaction });
      });

      if (alreadyPaid) return { handled: false, reason: 'El pago ya estaba confirmado', orderNumber: order.orderNumber };

      if (closedAtPayment) {
        logger.warn(`Pago recibido para pedido ${order.orderNumber} cerrado; requiere revisar el reembolso`);
      } else {
        logger.success(`Pago del pedido ${order.orderNumber} confirmado por ${outcome.eventId.startsWith('reconcile:') ? 'conciliacion' : 'webhook'}`);
      }
      return { handled: true, reason: closedAtPayment ? 'Pago registrado; revisar reembolso' : payment.stage === PAYMENT_STAGE.BALANCE ? 'Saldo confirmado' : 'Pedido confirmado', orderNumber: order.orderNumber };
    }

    // En Mercado Pago el cliente puede reintentar una order rechazada mientras
    // siga vigente la reserva. Los otros proveedores conservan su flujo anterior.
    await sequelize.transaction(async (transaction) => {
      const lockedOrder = await Order.findByPk(order.id, { transaction, lock: transaction.LOCK.UPDATE });
      const lockedPayment = await Payment.findByPk(payment.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!lockedOrder || !lockedPayment) throw ApiError.notFound('Pedido o pago no encontrado');
      if (lockedPayment.status !== PAYMENT_STATUS.SUCCEEDED) {
        lockedPayment.status = PAYMENT_STATUS.FAILED;
        lockedPayment.failedAt = new Date();
        lockedPayment.failureReason = outcome.reason ?? 'Pago rechazado';
        await lockedPayment.save({ transaction });
      }
      if (provider.name !== PAYMENT_PROVIDER.MERCADOPAGO
        && lockedPayment.status !== PAYMENT_STATUS.SUCCEEDED
        && lockedOrder.status === ORDER_STATUS.PENDING_PAYMENT) {
        lockedOrder.cancelReason = 'El pago no se completo';
        await inventoryService.releaseForOrder(lockedOrder, transaction);
        await ordersService.releaseReservations(lockedOrder, transaction);
        await ordersService.changeStatus(lockedOrder, ORDER_STATUS.CANCELLED, {
          source: 'PAYMENT_WEBHOOK', comment: lockedPayment.failureReason ?? 'Pago rechazado', transaction,
        });
      }

      // Un cierre de pestaña no dispara este aviso: solo un resultado verificado del proveedor.
      if (lockedOrder.status === ORDER_STATUS.PENDING_PAYMENT && lockedPayment.status === PAYMENT_STATUS.FAILED
        && !/expired|canceled|cancelled/i.test(outcome.eventType)) {
        await paymentNotifications.record(lockedOrder, lockedPayment, 'PAYMENT_FAILED', transaction);
      }

      event.processedAt = new Date();
      await event.save({ transaction });
    });

    return {
      handled: true,
      reason: provider.name === PAYMENT_PROVIDER.MERCADOPAGO
        ? 'Pago fallido; el pedido puede reintentarse' : 'Pago fallido, pedido cancelado',
      orderNumber: order.orderNumber,
    };
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
      if (['yape', 'plin'].includes(locked.provider)) throw ApiError.unprocessable('Registra la devolución realizada y su referencia desde Yape y Plin en el panel.');
      if (locked.status !== PAYMENT_STATUS.SUCCEEDED) {
        throw ApiError.unprocessable('Solo se puede devolver un pago confirmado');
      }
      if (locked.provider === PAYMENT_PROVIDER.WALLET) {
        throw ApiError.unprocessable('El saldo del monedero se restituye al cancelar el pedido; no uses un reembolso externo');
      }
      // El efectivo se devuelve en mano: no hay proveedor que llamar ni referencia.
      // Solo se exige referencia a los pagos online (tarjeta).
      const isManualProvider = [PAYMENT_PROVIDER.CASH, PAYMENT_PROVIDER.POS, PAYMENT_PROVIDER.YAPE, PAYMENT_PROVIDER.PLIN]
        .includes(locked.provider as 'cash' | 'pos' | 'yape' | 'plin');
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
    if ([PAYMENT_PROVIDER.CASH, PAYMENT_PROVIDER.POS, PAYMENT_PROVIDER.YAPE, PAYMENT_PROVIDER.PLIN]
      .includes(payment.provider as 'cash' | 'pos' | 'yape' | 'plin')) {
      // Efectivo/Yape/Plin no exponen una API de devolucion: la fila Refund es el
      // asiento de la devolucion manual realizada por Caja.
      result = { succeeded: true, providerReference: null };
    } else {
      try {
        result = payment.provider === PAYMENT_PROVIDER.MERCADOPAGO_SUBSCRIPTION
          ? await mpSubscriptions.refundPayment(payment.providerReference as string, amount, `refund-${refund.id}`)
          : await getPaymentProvider().refund({
              providerReference: payment.providerReference as string,
              amount,
              reason,
              idempotencyKey: `refund-${refund.id}`,
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

      await cakeCommissionService.applyRefund(payment.id, amount, transaction);

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
    const payments = await paymentsService.refundablePaymentsForOrder(order);
    return payments[payments.length - 1] ?? null;
  },

  async refundablePaymentsForOrder(order: Order): Promise<Payment[]> {
    return Payment.findAll({
      where: { payableType: PAYABLE_TYPE.ORDER, payableId: order.id, status: PAYMENT_STATUS.SUCCEEDED },
      order: [['id', 'ASC']],
    }).then((rows) => rows.filter((payment) => Number(payment.amount) > 0 && payment.provider !== PAYMENT_PROVIDER.WALLET));
  },

  /**
   * Intenta devolver los cobros online al cancelar un pedido.
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
    const payments = await paymentsService.refundablePaymentsForOrder(order);
    let lastRefund: Refund | null = null;
    for (const payment of payments) {
      // Efectivo, Yape y Plin requieren que una persona entregue el dinero.
      // Registrar aquí un reembolso automático lo marcaría como pagado sin mover fondos.
      if ([PAYMENT_PROVIDER.CASH, PAYMENT_PROVIDER.YAPE, PAYMENT_PROVIDER.PLIN]
        .includes(payment.provider as 'cash' | 'yape' | 'plin')) continue;
      try {
        const committed = Number(await Refund.sum('amount', {
          where: { paymentId: payment.id, status: [REFUND_STATUS.PENDING, REFUND_STATUS.SUCCEEDED] },
        }) ?? 0);
        const remaining = round2(Number(payment.amount) - committed);
        if (remaining <= 0) continue;
        lastRefund = await paymentsService.refund(payment.id, remaining, reason, actorId ?? 0);
      } catch (error) {
        logger.error(`Reembolso automatico fallido al cancelar el pedido ${order.orderNumber}. Requiere gestion manual.`, error);
      }
    }
    return lastRefund;
  },

  /** Estado del pago de un pedido (la pagina de exito lo consulta; no confia en la URL). */
  async getByOrder(orderId: number) {
    return Payment.findOne({
      where: { payableType: PAYABLE_TYPE.ORDER, payableId: orderId },
      order: [['id', 'DESC']],
    });
  },

  async openBalanceCheckout(orderNumber: string, userId: number, options: CheckoutSessionOptions = {}) {
    const order = await Order.findOne({ where: { orderNumber } });
    if (!order) throw ApiError.notFound('Pedido no encontrado');
    if (order.userId !== userId) throw ApiError.forbidden('Este pedido no es tuyo');
    if (order.status === ORDER_STATUS.CANCELLED || order.status === ORDER_STATUS.REFUNDED || order.status === ORDER_STATUS.DELIVERED) throw ApiError.conflict('Este pedido ya no admite pago de saldo');
    if (order.paymentPlan !== 'DEPOSIT_BALANCE' || !order.depositPaidAt) throw ApiError.unprocessable('Este pedido no tiene un saldo pendiente');
    if (order.balancePaidAt || Number(order.balanceAmount) <= 0) throw ApiError.conflict('El saldo de este pedido ya fue pagado');
    const existing = await Payment.findOne({ where: { payableType: PAYABLE_TYPE.ORDER, payableId: order.id, stage: PAYMENT_STAGE.BALANCE }, order: [['id', 'DESC']] });
    if (existing?.status === PAYMENT_STATUS.SUCCEEDED && !await hasAdditionalBalance(order.id, existing.id)) throw ApiError.conflict('El saldo de este pedido ya fue pagado');
    if (existing?.provider === PAYMENT_PROVIDER.MERCADOPAGO && existing.status === PAYMENT_STATUS.PENDING) {
      const outcome = await paymentsService.reconcilePayment(existing);
      if (outcome?.kind === 'PAID') throw ApiError.conflict('El saldo de este pedido ya fue pagado');
      if (outcome?.eventType === 'order.processing' || outcome?.eventType === 'order.action_required') {
        throw ApiError.conflict('Mercado Pago sigue procesando el saldo. Espera la confirmacion antes de reintentar.');
      }
      await existing.reload();
    }
    const reserved = await sequelize.transaction(async (transaction) => {
      const lockedOrder = await Order.findByPk(order.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!lockedOrder) throw ApiError.notFound('Pedido no encontrado');
      if (lockedOrder.status === ORDER_STATUS.CANCELLED
        || lockedOrder.status === ORDER_STATUS.REFUNDED
        || lockedOrder.status === ORDER_STATUS.DELIVERED) {
        throw ApiError.conflict('Este pedido ya no admite pago de saldo');
      }
      if (!lockedOrder.depositPaidAt || lockedOrder.balancePaidAt || Number(lockedOrder.balanceAmount) <= 0) {
        throw ApiError.conflict('El saldo de este pedido ya fue pagado');
      }
      const latest = await Payment.findOne({
        where: { payableType: PAYABLE_TYPE.ORDER, payableId: lockedOrder.id, stage: PAYMENT_STAGE.BALANCE },
        order: [['id', 'DESC']], transaction, lock: transaction.LOCK.UPDATE,
      });
      if (latest?.status === PAYMENT_STATUS.SUCCEEDED && !await hasAdditionalBalance(lockedOrder.id, latest.id, transaction)) throw ApiError.conflict('El saldo de este pedido ya fue pagado');
      if (latest && isDirectProvider(latest.provider) && latest.status === PAYMENT_STATUS.PENDING) {
        const claim = await MobilePaymentClaim.findOne({ where: { paymentId: latest.id }, transaction, lock: transaction.LOCK.UPDATE });
        const snapshot = latest.safeResponseJson?.directPayment as { expiresAt?: string } | undefined;
        if (claim && ['PENDING', 'OBSERVED'].includes(claim.status) || !snapshot?.expiresAt || Date.now() < Date.parse(snapshot.expiresAt)) {
          throw ApiError.conflict('Ya hay un pago directo abierto para este saldo. Revísalo antes de abrir otro medio de pago.');
        }
        latest.status = PAYMENT_STATUS.FAILED; latest.failedAt = new Date(); latest.failureReason = 'Plazo de pago directo del saldo vencido';
        await latest.save({ transaction });
        await MobilePaymentEvent.create({ paymentId: latest.id, kind: 'EXPIRED', details: { reason: latest.failureReason } }, { transaction });
      }
      if (latest) {
        const live = usableCheckoutUrl(latest);
        if (live) return { order: lockedOrder, payment: latest, checkoutUrl: live, reused: true as const };
        if (latest.status === PAYMENT_STATUS.CREATED) {
          throw ApiError.conflict('Ya estamos abriendo el pago del saldo. Espera unos segundos.');
        }
        if (latest.status === PAYMENT_STATUS.PENDING) {
          latest.status = PAYMENT_STATUS.FAILED;
          latest.failedAt = new Date();
          latest.failureReason = 'Sesion de saldo caducada, reemplazada por un reintento';
          await latest.save({ transaction });
        }
      }
      const attempts = await Payment.count({
        where: { payableType: PAYABLE_TYPE.ORDER, payableId: lockedOrder.id, stage: PAYMENT_STAGE.BALANCE }, transaction,
      });
      const payment = await Payment.create({
        payableType: PAYABLE_TYPE.ORDER,
        payableId: lockedOrder.id,
        userId,
        provider: getPaymentProvider().name,
        amount: round2(Number(lockedOrder.balanceAmount)),
        stage: PAYMENT_STAGE.BALANCE,
        currency: lockedOrder.currency,
        status: PAYMENT_STATUS.CREATED,
        idempotencyKey: `order-${lockedOrder.id}-balance-${attempts + 1}`,
      }, { transaction });
      return { order: lockedOrder, payment, checkoutUrl: null, reused: false as const };
    });
    if (reserved.reused) return reserved;
    const checkoutUrl = await openOrderCheckoutSession(reserved.order, reserved.payment, options);
    return { order: reserved.order, payment: reserved.payment, checkoutUrl, reused: false };
  },
};

export type PaymentsService = typeof paymentsService;
