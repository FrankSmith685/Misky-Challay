import { Transaction } from 'sequelize';
import {
  Branch,
  Coupon,
  CouponRedemption,
  DeliverySlot,
  Order,
  OrderDiscount,
  OrderItem,
  OrderItemCustomization,
  OrderStatusHistory,
  Payment,
  sequelize,
} from '@database/models';
import { REDEMPTION_STATUS } from '@database/models/couponRedemption.model';
import { PAYABLE_TYPE } from '@database/models/payment.model';
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
import { logger } from '@config/logger';
import { ApiError } from '@shared/errors/ApiError';
import { getPagination, buildMeta, type PaginationQuery } from '@shared/utils/pagination';
import { inventoryService } from '@modules/operations/inventory.service';

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
    include: [{ model: OrderItemCustomization, as: 'customizations' }],
  },
  { model: OrderDiscount, as: 'discounts' },
  { model: Branch, as: 'branch', attributes: ['id', 'name', 'addressLine', 'phone'] },
];

export interface StatusChangeContext {
  actorId?: number | null;
  source?: string;
  comment?: string | null;
  transaction?: Transaction;
}

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

export const ordersService = {
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
      order.status = next;
      if (next === ORDER_STATUS.CONFIRMED) order.confirmedAt = new Date();
      if (next === ORDER_STATUS.DELIVERED) {
        order.deliveredAt = new Date();
        // Pago contra entrega: el efectivo se cobra al entregar.
        await settleCashPayment(order.id, PAYMENT_STATUS.SUCCEEDED, transaction);
      }
      if (next === ORDER_STATUS.CANCELLED) {
        order.cancelledAt = new Date();
        // Un pedido en efectivo que se cancela nunca se cobra: el pago pendiente se anula.
        await settleCashPayment(order.id, PAYMENT_STATUS.FAILED, transaction);
      }

      await order.save({ transaction });

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
    void notificationsService
      .notifyOrderStatus(order.id, next)
      .catch((error) => logger.error('Fallo la notificacion del pedido', error));

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
   */
  async releaseReservations(order: Order, transaction?: Transaction) {
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

  async listByUser(userId: number, query: PaginationQuery) {
    const pagination = getPagination(query);

    const { rows, count } = await Order.findAndCountAll({
      where: { userId },
      include: ORDER_INCLUDE,
      order: [['id', 'DESC']],
      limit: pagination.limit,
      offset: pagination.offset,
      distinct: true,
    });

    return { orders: rows, meta: buildMeta(pagination, count) };
  },

  /** Un cliente solo puede ver SUS pedidos (seccion 7.1). */
  async getForUser(orderNumber: string, userId: number | null) {
    const order = await Order.findOne({
      where: { orderNumber },
      include: [
        ...ORDER_INCLUDE,
        { model: OrderStatusHistory, as: 'statusHistory', separate: true, order: [['id', 'ASC']] },
      ],
    });

    if (!order) throw ApiError.notFound('Pedido no encontrado');
    if (order.userId && order.userId !== userId) throw ApiError.forbidden('Este pedido no es tuyo');

    const payment = await Payment.findOne({
      where: { payableType: PAYABLE_TYPE.ORDER, payableId: order.id },
      order: [['id', 'DESC']],
      attributes: ['id', 'status', 'provider', 'checkoutUrl', 'amount', 'currency'],
    });

    return { order, payment };
  },

  /** RN-018: cancelar depende del estado. Ya en cocina, lo decide soporte. */
  async cancelByCustomer(orderNumber: string, userId: number, reason: string) {
    const order = await Order.findOne({ where: { orderNumber } });
    if (!order) throw ApiError.notFound('Pedido no encontrado');
    if (order.userId !== userId) throw ApiError.forbidden('Este pedido no es tuyo');

    const cancellable: OrderStatus[] = [ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.CONFIRMED];
    if (!cancellable.includes(order.status)) {
      throw ApiError.unprocessable(
        'Tu pedido ya esta en preparacion. Escribenos a soporte para cancelarlo.',
      );
    }

    await sequelize.transaction(async (transaction) => {
      order.cancelReason = reason;
      await ordersService.releaseReservations(order, transaction);
      // El stock se reserva desde que comienza el pago; liberar es idempotente.
      await inventoryService.releaseForOrder(order, transaction);

      await ordersService.changeStatus(order, ORDER_STATUS.CANCELLED, {
        actorId: userId,
        source: 'CUSTOMER',
        comment: reason,
        transaction,
      });
    });

    return order;
  },
};

export type OrdersService = typeof ordersService;
