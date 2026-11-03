import { CustomerOrderCase } from '@database/models/customerJourney.model';
import { Op, Transaction } from 'sequelize';
import {
  Branch,
  CakeProductionTask,
  Coupon,
  CouponRedemption,
  CoverageZone,
  Delivery,
  DeliverySlot,
  Driver,
  KitchenTicket,
  Order,
  OrderDiscount,
  OrderItem,
  OrderItemReference,
  OrderItemCustomization,
  OrderStatusHistory,
  Payment,
  MobilePaymentClaim,
  MobilePaymentEvent,
  sequelize,
} from '@database/models';
import { REDEMPTION_STATUS } from '@database/models/couponRedemption.model';
import { PAYABLE_TYPE, PAYMENT_STAGE } from '@database/models/payment.model';
import {
  ORDER_STATUS,
  ORDER_STATUS_FLOW,
  PAYMENT_PROVIDER,
  PAYMENT_STATUS,
  WALLET_TX_TYPE,
  type OrderStatus,
} from '@config/constants';
import { walletService } from '@modules/plans/wallet.service';
import { notificationsService } from '@modules/notifications/notifications.service';
import { whatsappService } from '@integrations/whatsapp/whatsapp.service';
import { logger } from '@config/logger';
import { ApiError } from '@shared/errors/ApiError';
import { deriveIdempotencyKey } from '@shared/utils/idempotency';
import { getPagination, buildMeta, type PaginationQuery } from '@shared/utils/pagination';
import { getPaymentProvider } from '@integrations/payments';
import { inventoryService } from '@modules/operations/inventory.service';
import { cakeProductionService } from '@modules/cakes/cakeProduction.service';
import { cakeDesignService } from '@modules/cakes/cakeDesign.service';
// Ciclo de importacion a proposito y seguro: estos modulos importan `ordersService`
// y aqui solo se usan DENTRO de funciones, nunca al evaluar el modulo.
import { cancelTicketForOrder } from '@modules/operations/operations.service';
import { abortForOrder } from '@modules/delivery/delivery.service';
import {
  openOrderCheckoutSession,
  paymentsService,
  usableCheckoutUrl,
  type PaymentClient,
} from '@modules/payments/payments.service';
import { directPaymentsService } from '@modules/payments/directPayments.service';
import { holdsDirectReview, isDirectProvider } from '@modules/payments/directPayments.logic';
import { customerOrderSummary } from './customerOrderSummary';

/**
 * Estados en los que el pedido ya murio y sus reservas ya se devolvieron.
 * Volver a liberarlas descuenta un cupo que en ese momento es de OTRO cliente.
 */
const RELEASED_STATUSES: OrderStatus[] = [ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUNDED];

/**
 * Estados en los que `confirmSlot` ya movio el cupo de reservado a confirmado.
 * Determina de que contador hay que descontar cuando el pedido se cancela.
 */
const CONFIRMED_SLOT_STATUSES: OrderStatus[] = [
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.READY,
  ORDER_STATUS.OUT_FOR_DELIVERY,
  ORDER_STATUS.DELIVERED,
];

const ORDER_INCLUDE = [
  {
    model: OrderItem,
    as: 'items',
    include: [{ model: OrderItemCustomization, as: 'customizations' }, { model: OrderItemReference, as: 'reference', attributes: ['id'] }, { model: OrderItemReference, as: 'designImages', attributes: ['id', 'kind', 'position'] }],
  },
  { model: OrderDiscount, as: 'discounts' },
  { model: Branch, as: 'branch', attributes: ['id', 'name', 'addressLine', 'phone'] },
];

/**
 * El reparto, tal y como puede verlo el cliente. La asociacion existia desde el
 * principio pero el detalle del pedido no la cargaba: quien seguia su pedido no
 * tenia forma de saber si ya habia salido, quien se lo llevaba ni cuanto faltaba.
 *
 * Va solo en el detalle, no en `ORDER_INCLUDE`: el historial lista hasta 50 pedidos
 * por pagina y ninguno de ellos necesita el reparto para pintar su fila.
 *
 * El telefono personal del repartidor NO se expone. Es un dato suyo, no del pedido,
 * y sobre compartirlo con el cliente no hay ninguna decision tomada.
 */
const DELIVERY_INCLUDE = {
  model: Delivery,
  as: 'delivery',
  attributes: ['id', 'status', 'etaMinutes', 'assignedAt', 'pickedUpAt', 'deliveredAt'],
  include: [{ model: Driver, as: 'driver', attributes: ['id', 'fullName', 'vehicle'] }],
};

export interface StatusChangeContext {
  actorId?: number | null;
  source?: string;
  comment?: string | null;
  transaction?: Transaction;
  /** El vencimiento publica un aviso específico de pago en la misma transacción. */
  notifyCustomer?: boolean;
}

export interface RetryPaymentOptions {
  /** Canal desde el que se paga: decide a donde devuelve la pasarela. */
  client?: PaymentClient;
  /** Correo del titular de la sesion, para prellenar el checkout alojado. */
  customerEmail?: string | null;
}

export interface RetryPaymentResult {
  order: Order;
  payment: Payment;
  checkoutUrl: string;
  /** true cuando la sesion abierta todavia servia y se devuelve tal cual. */
  reused: boolean;
}

/**
 * Por que un pedido ya no admite reintento de pago, dicho para el cliente.
 * No dice "ya esta pagado" porque el contra entrega tambien sale de
 * PENDING_PAYMENT sin haber cobrado nada todavia.
 */
const retryBlockedMessage = (status: OrderStatus): string =>
  status === ORDER_STATUS.CANCELLED || status === ORDER_STATUS.REFUNDED
    ? 'Este pedido fue cancelado. Vuelve a armarlo desde el menu.'
    : 'Este pedido ya esta confirmado: no queda nada por pagar en linea.';

/**
 * Cierra el pago en efectivo pendiente de un pedido.
 * Al entregar se cobra (SUCCEEDED); al cancelar se anula (FAILED). Solo actua sobre
 * el pago `cash` que sigue PENDING, asi que es seguro llamarlo en cualquier transicion.
 */
const settleCashPayment = async (
  orderId: number,
  status: (typeof PAYMENT_STATUS)['SUCCEEDED'] | (typeof PAYMENT_STATUS)['FAILED'],
  transaction: Transaction,
): Promise<void> => {
  const cash = await Payment.findOne({
    where: {
      payableType: PAYABLE_TYPE.ORDER,
      payableId: orderId,
      provider: PAYMENT_PROVIDER.CASH,
      status: PAYMENT_STATUS.PENDING,
    },
    transaction,
  });
  if (!cash) return;

  cash.status = status;
  if (status === PAYMENT_STATUS.SUCCEEDED) cash.capturedAt = new Date();
  else cash.failedAt = new Date();
  await cash.save({ transaction });
};

/**
 * Al cancelar, conserva reportes en revisión para comprobar si hubo ingreso.
 * Su aprobación registra dinero recibido sin reabrir el pedido cancelado.
 */
const rejectPendingMobilePayment = async (
  orderId: number,
  reason: string,
  transaction: Transaction,
): Promise<void> => {
  const payment = await Payment.findOne({
    where: {
      payableType: PAYABLE_TYPE.ORDER,
      payableId: orderId,
      status: PAYMENT_STATUS.PENDING,
    },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!payment || ![PAYMENT_PROVIDER.YAPE, PAYMENT_PROVIDER.PLIN].includes(payment.provider as 'yape' | 'plin')) return;

  const reported = await MobilePaymentClaim.findOne({ where: { paymentId: payment.id }, transaction, lock: transaction.LOCK.UPDATE });
  if (holdsDirectReview(reported?.status)) {
    await MobilePaymentEvent.create({ paymentId: payment.id, kind: 'ORDER_CANCELLED', details: { reason, requiresReview: true } }, { transaction });
    return; // Cancellation cannot decide whether a transfer was actually received.
  }

  payment.status = PAYMENT_STATUS.FAILED;
  payment.failedAt = new Date();
  payment.failureReason = reason;
  await payment.save({ transaction });

  const claim = await MobilePaymentClaim.findOne({
    where: { paymentId: payment.id, status: 'PENDING' },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!claim) return;
  claim.status = 'REJECTED';
  claim.reviewedAt = new Date();
  claim.rejectionReason = reason;
  await claim.save({ transaction });
};

/**
 * Escribe el ETA del reparto (`deliveries.eta_minutes`).
 *
 * La columna existia desde el diseno pero NUNCA se escribia en ningun punto del
 * backend: era permanentemente nula, asi que el seguimiento del pedido no tenia
 * ningun minuto que ensenar. Se rellena al entrar en preparacion, que es el primer
 * momento en el que el dato deja de ser una conjetura: la cocina ya tiene hora
 * comprometida y la zona de entrega ya esta fijada en el pedido.
 *
 * No se inventa ningun numero. Son las dos mismas piezas que ya usa el resto del
 * sistema, sumadas:
 *   - lo que falta de cocina: minutos hasta el `targetAt` del ticket, que calcula
 *     el modulo de operaciones al abrirlo (franja programada, o preparacion de la
 *     sucursal si es inmediato);
 *   - el trayecto: `estimatedMinutes` de la zona de cobertura, la misma cifra con
 *     la que geo y checkout estiman el reparto cuando no hay ruta en vivo.
 *
 * Sin reparto (recojo o consumo en el local) no hay nada que escribir, y sin
 * ninguna de las dos fuentes se deja en nulo antes que publicar un ETA falso.
 */
const persistDeliveryEta = async (order: Order, transaction: Transaction): Promise<void> => {
  const delivery = await Delivery.findOne({ where: { orderId: order.id }, transaction });
  if (!delivery) return;

  const [ticket, zone] = await Promise.all([
    KitchenTicket.findOne({ where: { orderId: order.id }, transaction }),
    order.coverageZoneId
      ? CoverageZone.findByPk(order.coverageZoneId, { transaction })
      : Promise.resolve(null),
  ]);

  if (!ticket && !zone) return;

  // Una cocina con retraso deja `targetAt` en el pasado: el trayecto sigue siendo
  // real, pero de la preparacion ya no queda tiempo que sumar.
  const kitchenMinutes = ticket
    ? Math.max(0, Math.round((ticket.targetAt.getTime() - Date.now()) / 60000))
    : 0;
  const travelMinutes = zone?.estimatedMinutes ?? 0;

  delivery.etaMinutes = kitchenMinutes + travelMinutes;
  await delivery.save({ transaction });
};

export const ordersService = {
  async stopWhatsapp(orderNumber: string, userId: number) {
    const order = await Order.findOne({ where: { orderNumber, userId } });
    if (!order) throw ApiError.notFound('Pedido no encontrado');
    order.whatsappOptInAt = null;
    await order.save();
  },
  /**
   * Cambia el estado respetando las transiciones validas (figura 3 del analisis)
   * y deja rastro en order_status_history (RN-021).
   */
  async changeStatus(order: Order, next: OrderStatus, context: StatusChangeContext = {}) {
    const current: OrderStatus = order.status;

    if (current === next) return order;

    const allowed = ORDER_STATUS_FLOW[current] ?? [];
    if (!allowed.includes(next)) {
      throw ApiError.unprocessable(`No se puede pasar de ${current} a ${next}`);
    }

    const apply = async (transaction: Transaction) => {
      if (next === ORDER_STATUS.PREPARING && await CustomerOrderCase.count({ where: { orderId: order.id, kind: ['DESIGN', 'CHANGE'], status: 'AWAITING_CUSTOMER' }, transaction })) throw ApiError.conflict('El diseño final espera la aprobación del cliente.');
      if (
        (next === ORDER_STATUS.OUT_FOR_DELIVERY || next === ORDER_STATUS.DELIVERED)
        && order.paymentPlan === 'DEPOSIT_BALANCE'
        && !order.balancePaidAt
      ) {
        throw ApiError.unprocessable('No se puede enviar la torta: el saldo pendiente debe estar pagado');
      }
      if (next === ORDER_STATUS.OUT_FOR_DELIVERY || next === ORDER_STATUS.DELIVERED) {
        await cakeProductionService.assertDispatchComplete(order.id, transaction);
      }
      order.status = next;
      if (next === ORDER_STATUS.CONFIRMED) order.confirmedAt = new Date();
      // Entra a preparacion: es cuando el ETA del reparto pasa a ser un dato real.
      if (next === ORDER_STATUS.PREPARING) await persistDeliveryEta(order, transaction);
      if (next === ORDER_STATUS.DELIVERED) {
        order.deliveredAt = new Date();
        // Pago contra entrega: el efectivo se cobra al entregar.
        await settleCashPayment(order.id, PAYMENT_STATUS.SUCCEEDED, transaction);
      }
      if (next === ORDER_STATUS.CANCELLED) {
        order.cancelledAt = new Date();
        // Un pedido en efectivo que se cancela nunca se cobra: el pago pendiente se anula.
        await settleCashPayment(order.id, PAYMENT_STATUS.FAILED, transaction);
        await rejectPendingMobilePayment(order.id, context.comment ?? 'Pedido cancelado', transaction);
      }

      const saveOptions = { transaction, activityCustomerNotification: context.notifyCustomer !== false };
      await order.save(saveOptions);

      await OrderStatusHistory.create(
        {
          orderId: order.id,
          fromStatus: current,
          toStatus: next,
          actorId: context.actorId ?? null,
          source: context.source ?? 'SYSTEM',
          comment: context.comment ?? null,
        },
        { transaction },
      );
    };

    if (context.transaction) await apply(context.transaction);
    else await sequelize.transaction(apply);

    // El correo se manda DESPUES y sin esperarlo: un fallo del proveedor de email
    // no puede tumbar un pedido ya pagado ni revertir la transaccion.
    const notify = () => {
      void notificationsService.notifyOrderStatus(order.id, next)
        .catch((error) => logger.error('Fallo la notificacion del pedido', error));
      void whatsappService.notifyOrder(order.id, next)
        .catch((error) => logger.error('Fallo el aviso de WhatsApp del pedido', error));
    };
    if (context.notifyCustomer !== false) {
      if (context.transaction) context.transaction.afterCommit(notify);
      else notify();
    }

    return order;
  },

  /** Al confirmarse el pago: el cupon reservado pasa a usado (RN-011). */
  async confirmCouponRedemptions(orderId: number, transaction?: Transaction) {
    const redemptions = await CouponRedemption.findAll({
      where: { orderId, status: REDEMPTION_STATUS.RESERVED },
      transaction,
    });

    for (const redemption of redemptions) {
      redemption.status = REDEMPTION_STATUS.CONFIRMED;
      await redemption.save({ transaction });

      const coupon = await Coupon.findByPk(redemption.couponId, { transaction });
      if (coupon) {
        coupon.usedCount += 1;
        await coupon.save({ transaction });
      }
    }
  },

  /**
   * Si el pago falla o el pedido se cancela: se libera el cupon, el cupo de la
   * franja y se DEVUELVE el saldo que se habia gastado (RN-013).
   *
   * IDEMPOTENTE. El cupon (filtrado por RESERVED) y el monedero (idempotencyKey)
   * ya lo eran; el contador de la franja NO, y no habia forma de repararlo desde
   * el panel. Con el pedido ya cancelado, `wasConfirmed` valia false y la segunda
   * pasada caia en `slot.reservedCount -= 1`, descontando el cupo de otro cliente
   * que en ese momento estaba pagando: sobreventa de la franja.
   *
   * Todos los que llaman lo hacen ANTES de mover el pedido a CANCELLED, asi que
   * ver el pedido ya liberado solo puede significar una segunda pasada.
   */
  async releaseReservations(order: Order, transaction?: Transaction) {
    if (RELEASED_STATUSES.includes(order.status)) return;
    if (transaction) {
      await cakeProductionService.releaseForOrder(order, transaction);
      await cakeDesignService.releaseOrder(order.id, transaction);
    } else await sequelize.transaction(async (tx) => {
      await cakeProductionService.releaseForOrder(order, tx);
      await cakeDesignService.releaseOrder(order.id, tx);
    });

    const redemptions = await CouponRedemption.findAll({
      where: { orderId: order.id, status: REDEMPTION_STATUS.RESERVED },
      transaction,
    });

    for (const redemption of redemptions) {
      redemption.status = REDEMPTION_STATUS.RELEASED;
      await redemption.save({ transaction });
    }

    if (order.deliverySlotId) {
      const slot = await DeliverySlot.findByPk(order.deliverySlotId, {
        transaction,
        lock: transaction ? Transaction.LOCK.UPDATE : undefined,
      });

      if (slot) {
        /**
         * De que contador se descuenta depende de donde estaba el pedido.
         *
         * Al confirmar el pago, `confirmSlot` mueve el cupo de `reservedCount` a
         * `confirmedCount`. Descontar siempre de `reservedCount` al cancelar hacia
         * que un pedido ya confirmado dejase `confirmedCount` inflado para siempre
         * y ademas restase un cupo reservado que en ese momento pertenece a OTRO
         * cliente que esta pagando: sobreventa de la franja.
         */
        const wasConfirmed = CONFIRMED_SLOT_STATUSES.includes(order.status);

        if (wasConfirmed && slot.confirmedCount > 0) slot.confirmedCount -= 1;
        else if (!wasConfirmed && slot.reservedCount > 0) slot.reservedCount -= 1;

        await slot.save({ transaction });
      }
    }

    // El saldo se debito al crear el pedido: si el pedido muere, vuelve a la billetera.
    const walletAmount = Number(order.walletAmount);
    if (walletAmount > 0 && order.userId) {
      await walletService.move(
        {
          userId: order.userId,
          type: WALLET_TX_TYPE.REFUND,
          amount: walletAmount,
          description: `Devolucion del saldo del pedido ${order.orderNumber}`,
          idempotencyKey: `order-${order.id}-wallet-refund`,
          orderId: order.id,
        },
        transaction,
      );
    }
  },

  /** Cupo de la franja: de reservado a confirmado. */
  async confirmSlot(order: Order, transaction?: Transaction) {
    if (!order.deliverySlotId) return;

    const slot = await DeliverySlot.findByPk(order.deliverySlotId, { transaction });
    if (!slot) return;

    if (slot.reservedCount > 0) slot.reservedCount -= 1;
    slot.confirmedCount += 1;
    await slot.save({ transaction });
  },

  async listByUser(userId: number, query: PaginationQuery & { filter?: unknown }) {
    const pagination = getPagination(query);
    const active = ['PENDING_PAYMENT', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'];
    const statuses = query.filter === 'ACTIVE' ? active : query.filter === 'DELIVERED' ? ['DELIVERED'] : query.filter === 'CANCELLED' ? ['CANCELLED', 'REFUNDED'] : undefined;
    const counts = await Promise.all([Order.count({ where: { userId } }), Order.count({ where: { userId, status: active } }), Order.count({ where: { userId, status: 'DELIVERED' } }), Order.count({ where: { userId, status: ['CANCELLED', 'REFUNDED'] } })]);

    const { rows, count } = await Order.findAndCountAll({
      where: { userId, ...(statuses ? { status: statuses } : {}) },
      attributes: { exclude: ['termsAcceptanceJson', 'customerContactJson'] },
      include: ORDER_INCLUDE,
      order: [['id', 'DESC']],
      limit: pagination.limit,
      offset: pagination.offset,
      distinct: true,
    });

    const pendingIds = rows.filter((order) => order.status === ORDER_STATUS.PENDING_PAYMENT).map((order) => order.id);
    const payments = pendingIds.length ? await Payment.findAll({ where: { payableType: PAYABLE_TYPE.ORDER, payableId: pendingIds },
      attributes: ['id', 'payableId', 'provider', 'status'], include: [{ model: MobilePaymentClaim, as: 'mobileClaim', attributes: ['status'], required: false }], order: [['id', 'DESC']] }) : [];
    const paymentStates = new Map<number, string | null>();
    for (const payment of payments) {
      if (paymentStates.has(payment.payableId)) continue;
      const claim = payment.get('mobileClaim') as MobilePaymentClaim | undefined;
      paymentStates.set(payment.payableId, isDirectProvider(payment.provider) && payment.status === 'PENDING' && holdsDirectReview(claim?.status) ? claim!.status === 'OBSERVED' ? 'OBSERVED' : 'REVIEW' : null);
    }
    return { orders: rows.map((order) => ({ ...order.get({ plain: true }), directPaymentState: paymentStates.get(order.id) ?? null })), meta: { ...buildMeta(pagination, count), counts: { ALL: counts[0], ACTIVE: counts[1], DELIVERED: counts[2], CANCELLED: counts[3] } } };
  },

  /** Un cliente solo puede ver SUS pedidos (seccion 7.1). */
  async getForUser(orderNumber: string, userId: number | null) {
    const order = await Order.findOne({
      where: { orderNumber },
      attributes: { exclude: ['customerContactJson'] },
      include: [
        ...ORDER_INCLUDE,
        DELIVERY_INCLUDE,
        { model: OrderStatusHistory, as: 'statusHistory', separate: true, order: [['id', 'ASC']] },
      ],
    });

    if (!order) throw ApiError.notFound('Pedido no encontrado');
    if (order.userId && order.userId !== userId) throw ApiError.forbidden('Este pedido no es tuyo');

    const payment = await Payment.findOne({
      where: { payableType: PAYABLE_TYPE.ORDER, payableId: order.id },
      order: [['id', 'DESC']],
      attributes: [
        'id',
        'status',
        'provider',
        'providerReference',
        'checkoutUrl',
        'amount',
        'currency',
        'failureReason',
        // Solo para saber si la sesion de pago sigue viva: la respuesta cruda del
        // proveedor no se devuelve al cliente.
        'createdAt',
        'safeResponseJson',
        'stage',
      ],
    });

    const customerSummary = await customerOrderSummary(order);
    if (!payment) return { order, payment: null, customerSummary };

    const mobileClaim = [PAYMENT_PROVIDER.YAPE, PAYMENT_PROVIDER.PLIN].includes(payment.provider as 'yape' | 'plin')
      ? await MobilePaymentClaim.findOne({
          where: { paymentId: payment.id },
          attributes: ['status', 'operationCode', 'submittedAt', 'reviewedAt', 'rejectionReason'],
        })
      : null;

    const directPayments = await Promise.all((await Payment.findAll({
      where: { payableType: PAYABLE_TYPE.ORDER, payableId: order.id, provider: ['yape', 'plin'] },
      order: [['id', 'DESC']], limit: 50,
    })).map((direct) => directPaymentsService.serialize(direct, order)));
    return {
      order,
      directPayments,
      customerSummary,
      payment: {
        id: payment.id,
        status: payment.status,
        provider: payment.provider,
        providerReference: payment.providerReference,
        checkoutUrl: payment.checkoutUrl,
        /**
         * Si el enlace de pago guardado todavia sirve para cobrar. Sin esto la app
         * reabria a ciegas una sesion ya caducada y el cliente se quedaba sin forma
         * de pagar. En false y con el pedido en PENDING_PAYMENT, hay que pedir uno
         * nuevo en POST /orders/:orderNumber/payment/retry.
         */
        checkoutUrlIsLive: usableCheckoutUrl(payment) !== null,
        amount: payment.amount,
        currency: payment.currency,
        failureReason: payment.failureReason,
        mobileClaim: mobileClaim?.get({ plain: true }) ?? null,
        stage: payment.stage,
        directPayment: directPayments.find((direct) => direct.paymentId === payment.id) ?? null,
      },
    };
  },

  /**
   * Reintento del cobro de un pedido que sigue en PENDING_PAYMENT.
   *
   * Las sesiones de Stripe caducan (24 h) y el pedido guardaba SU url para siempre:
   * pasado ese plazo la app reabria un enlace muerto, el cliente no podia pagar y el
   * pedido se moria reteniendo su inventario, su cupo de franja y su cupon. Aqui se
   * abre una sesion NUEVA sobre el mismo pedido, sin recotizar ni tocar nada de lo
   * ya reservado: el importe es el que quedo guardado al confirmarlo.
   *
   * No confirma nada. Igual que el primer pago, el pedido solo pasa a CONFIRMED
   * cuando llega el webhook firmado del proveedor (RN-014).
   */
  async retryPayment(
    orderNumber: string,
    userId: number,
    options: RetryPaymentOptions = {},
  ): Promise<RetryPaymentResult> {
    const order = await Order.findOne({ where: { orderNumber } });
    if (!order) throw ApiError.notFound('Pedido no encontrado');
    // Los pedidos de invitado tienen `userId` nulo: tampoco son de nadie que pueda
    // reintentar el cobro desde su cuenta.
    if (order.userId !== userId) throw ApiError.forbidden('Este pedido no es tuyo');

    const currentPayment = await Payment.findOne({
      where: { payableType: PAYABLE_TYPE.ORDER, payableId: order.id }, order: [['id', 'DESC']],
    });
    if (currentPayment?.provider === PAYMENT_PROVIDER.MERCADOPAGO
      && currentPayment.status === PAYMENT_STATUS.PENDING) {
      const outcome = await paymentsService.reconcilePayment(currentPayment);
      if (outcome?.eventType === 'order.processing' || outcome?.eventType === 'order.action_required') {
        throw ApiError.conflict('Mercado Pago sigue procesando tu pago. Espera la confirmacion antes de reintentar.');
      }
    }

    /*
     * El cobro se RESERVA con la fila del pedido bloqueada, y la llamada de red al
     * proveedor ocurre despues, fuera de la transaccion: es el mismo reparto que ya
     * usa `paymentsService.refund`, porque retener un lock mientras se espera a
     * Stripe bloquea la cocina y el reparto de ese pedido.
     */
    const reserved = await sequelize.transaction(async (transaction) => {
      const locked = await Order.findByPk(order.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!locked) throw ApiError.notFound('Pedido no encontrado');
      if (locked.status !== ORDER_STATUS.PENDING_PAYMENT) {
        throw ApiError.unprocessable(retryBlockedMessage(locked.status));
      }
      if (Number(locked.grandTotal) <= 0) {
        throw ApiError.unprocessable('Este pedido no tiene nada pendiente de cobro');
      }

      const latest = await Payment.findOne({
        where: { payableType: PAYABLE_TYPE.ORDER, payableId: locked.id },
        order: [['id', 'DESC']],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (latest) {
        // Yape y Plin no tienen pasarela que reabrir: el pedido espera a que Caja
        // contraste el codigo de operacion contra el movimiento real. Abrir aqui un
        // cobro con tarjeta cobraria dos veces el mismo pedido.
        if (
          [PAYMENT_PROVIDER.YAPE, PAYMENT_PROVIDER.PLIN].includes(latest.provider as 'yape' | 'plin')
        ) {
          throw ApiError.unprocessable(
            'Tu pago por Yape o Plin esta en revision. Te avisamos apenas Caja lo valide.',
          );
        }

        // Si la sesion abierta todavia sirve, se devuelve tal cual: dos toques del
        // boton no pueden dejar dos cobros vivos del mismo pedido.
        const liveUrl = usableCheckoutUrl(latest);
        if (liveUrl) {
          return { payment: latest, checkoutUrl: liveUrl, opened: false as const };
        }

        // Otra peticion esta abriendo la sesion en este momento (cobro creado, aun
        // sin url). Que espere unos segundos es preferible a abrir un segundo cobro.
        if (latest.status === PAYMENT_STATUS.CREATED) {
          throw ApiError.conflict(
            'Ya estamos abriendo tu pago. Espera unos segundos y vuelve a intentarlo.',
          );
        }

        // La sesion caducada se cierra: el detalle del pedido siempre mira el ultimo
        // cobro, y dejar dos PENDING a la vez descuadra la caja y el reembolso.
        if (latest.status === PAYMENT_STATUS.PENDING) {
          latest.status = PAYMENT_STATUS.FAILED;
          latest.failedAt = new Date();
          latest.failureReason = 'Sesion de pago caducada, reemplazada por un reintento';
          await latest.save({ transaction });
        }
      }

      /*
       * Clave de idempotencia del intento. La del checkout NO se puede reutilizar:
       * Stripe la respeta y devolveria exactamente la MISMA sesion caducada que se
       * quiere sustituir. Se deriva con el mismo ambito y dueno que el resto del
       * modulo, anadiendo el numero de intento; el UNIQUE de `idempotency_key`
       * protege esta fila igual que a la del primer pago, y el bloqueo del pedido
       * impide que dos reintentos simultaneos calculen el mismo numero.
       */
      const attempts = await Payment.count({
        where: { payableType: PAYABLE_TYPE.ORDER, payableId: locked.id },
        transaction,
      });
      const idempotencyKey = deriveIdempotencyKey(
        'order',
        locked.userId,
        `${locked.orderNumber}:pago:${attempts + 1}`,
      );

      const payment = await Payment.create(
        {
          payableType: PAYABLE_TYPE.ORDER,
          payableId: locked.id,
          userId: locked.userId,
          provider: getPaymentProvider().name,
          amount: locked.paymentPlan === 'DEPOSIT_BALANCE' ? Number(locked.depositAmount) : Number(locked.grandTotal),
          stage: locked.paymentPlan === 'DEPOSIT_BALANCE' ? PAYMENT_STAGE.DEPOSIT : PAYMENT_STAGE.FULL,
          currency: locked.currency,
          status: PAYMENT_STATUS.CREATED,
          idempotencyKey,
        },
        { transaction },
      );

      return { payment, opened: true as const };
    });

    if (!reserved.opened) {
      return { order, payment: reserved.payment, checkoutUrl: reserved.checkoutUrl, reused: true };
    }

    // Si el proveedor falla, el cobro queda en FAILED con su motivo y el pedido
    // sigue vivo en PENDING_PAYMENT: el cliente puede volver a intentarlo.
    const checkoutUrl = await openOrderCheckoutSession(order, reserved.payment, {
      client: options.client,
      customerEmail: options.customerEmail,
    });

    return { order, payment: reserved.payment, checkoutUrl, reused: false };
  },

  /**
   * RN-018: cancelar depende del estado. Ya en cocina, lo decide soporte.
   *
   * El estado se comprueba DOS veces: fuera para responder rapido y dentro de la
   * transaccion sobre la fila bloqueada, que es la que decide. Sin el bloqueo, dos
   * toques seguidos del boton leian los dos CONFIRMED y liberaban las reservas dos
   * veces. Y se cierran ticket y reparto, que quedaban vivos: la cocina seguia
   * cocinando un pedido muerto y al avanzarlo reventaba con 422.
   */
  async cancelByCustomer(orderNumber: string, userId: number, reason: string) {
    const order = await Order.findOne({ where: { orderNumber } });
    if (!order) throw ApiError.notFound('Pedido no encontrado');
    if (order.userId !== userId) throw ApiError.forbidden('Este pedido no es tuyo');

    const cancellable: OrderStatus[] = [ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.CONFIRMED];
    const notCancellable = ApiError.unprocessable(
      'Tu pedido ya esta en preparacion. Escribenos a soporte para cancelarlo.',
    );
    if (!cancellable.includes(order.status)) throw notCancellable;

    const cancelled = await sequelize.transaction(async (transaction) => {
      const locked = await Order.findByPk(order.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!locked) throw ApiError.notFound('Pedido no encontrado');
      if (!cancellable.includes(locked.status)) throw notCancellable;
      if (await CakeProductionTask.count({ where: { orderId: locked.id, startedAt: { [Op.ne]: null } }, transaction })) {
        throw ApiError.unprocessable('La producción de la torta ya comenzó. Contacta a soporte para revisar la cancelación.');
      }

      if (locked.status === ORDER_STATUS.CONFIRMED && locked.paymentPlan === 'DEPOSIT_BALANCE') {
        const cutoff = locked.scheduledAt ? locked.scheduledAt.getTime() - 48 * 60 * 60_000 : 0;
        if (!cutoff || Date.now() >= cutoff) {
          throw ApiError.unprocessable('El anticipo de una torta con diseño solo se puede cancelar hasta 48 horas antes de la entrega');
        }
      }

      locked.cancelReason = reason;
      await ordersService.releaseReservations(locked, transaction);
      // El stock se reserva desde que comienza el pago; liberar es idempotente.
      await inventoryService.releaseForOrder(locked, transaction);
      // Contratos idempotentes: sin ticket o sin reparto no hacen nada, y el
      // reparto devuelve al repartidor a AVAILABLE si estaba asignado.
      await cancelTicketForOrder(locked.id, reason, transaction);
      await abortForOrder(locked.id, reason, transaction);

      await ordersService.changeStatus(locked, ORDER_STATUS.CANCELLED, {
        actorId: userId,
        source: 'CUSTOMER',
        comment: reason,
        transaction,
      });

      return locked;
    });

    return cancelled;
  },
};

export type OrdersService = typeof ordersService;
