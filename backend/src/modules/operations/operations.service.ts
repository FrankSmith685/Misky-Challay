import { Op, Transaction } from 'sequelize';
import {
  Branch,
  KitchenTicket,
  KitchenTicketEvent,
  Order,
  OrderItem,
  OrderItemCustomization,
  sequelize,
} from '@database/models';
import {
  TICKET_FLOW,
  TICKET_STATUS,
  type TicketStatus,
} from '@database/models/kitchenTicket.model';
import { DELIVERY_TYPE, ORDER_STATUS } from '@config/constants';
import { logger } from '@config/logger';
import { ApiError } from '@shared/errors/ApiError';
import type { BranchScopeCheck } from '@shared/utils/scope';
import { ordersService } from '@modules/orders/orders.service';
import { inventoryService } from './inventory.service';

const TICKET_INCLUDE = [
  {
    model: Order,
    as: 'order',
    include: [
      {
        model: OrderItem,
        as: 'items',
        include: [{ model: OrderItemCustomization, as: 'customizations' }],
      },
    ],
  },
];

/** El estado del pedido acompana al del ticket (la cocina mueve el pedido). */
const ORDER_STATUS_FOR_TICKET: Partial<Record<TicketStatus, string>> = {
  PREPARING: ORDER_STATUS.PREPARING,
  READY: ORDER_STATUS.READY,
};

export const operationsService = {
  /**
   * Se llama cuando el webhook confirma el pago (RN-014 -> RN-016).
   * Crea el ticket y reserva los insumos. Si algo falta, el ticket lo avisa:
   * el pedido ya esta pagado, asi que la cocina decide (sustituir o escalar a soporte).
   */
  async openTicketForOrder(order: Order, transaction: Transaction): Promise<KitchenTicket> {
    const existing = await KitchenTicket.findOne({
      where: { orderId: order.id },
      transaction,
    });
    if (existing) return existing;

    const branch = await Branch.findByPk(order.branchId, { transaction });
    const prepMinutes = branch?.prepMinutes ?? 20;

    // Hora comprometida: la franja si es programado, o ahora + preparacion si es inmediato.
    const targetAt =
      order.scheduledAt ?? new Date(Date.now() + prepMinutes * 60 * 1000);

    const { shortages } = await inventoryService.reserveForOrder(order, transaction);

    const ticket = await KitchenTicket.create(
      {
        orderId: order.id,
        branchId: order.branchId,
        status: TICKET_STATUS.QUEUED,
        priority: shortages.length > 0 ? 2 : 1,
        targetAt,
        notes:
          shortages.length > 0
            ? `FALTANTES: ${shortages
                .map((shortage) => `${shortage.item} (faltan ${shortage.missing}${shortage.unit})`)
                .join(', ')}`
            : null,
      },
      { transaction },
    );

    await KitchenTicketEvent.create(
      {
        ticketId: ticket.id,
        fromStatus: null,
        toStatus: TICKET_STATUS.QUEUED,
        actorId: null,
        comment: 'Ticket creado tras confirmarse el pago',
      },
      { transaction },
    );

    if (shortages.length > 0) {
      logger.warn(`Pedido ${order.orderNumber} con faltantes de stock`, shortages);
    }

    return ticket;
  },

  /** Cola de cocina: primero lo mas urgente, luego por hora comprometida. */
  async board(branchId: number, statuses?: TicketStatus[]) {
    const tickets = await KitchenTicket.findAll({
      where: {
        branchId,
        status: statuses?.length
          ? { [Op.in]: statuses }
          : {
              [Op.in]: [
                TICKET_STATUS.QUEUED,
                TICKET_STATUS.ACCEPTED,
                TICKET_STATUS.PREPARING,
                TICKET_STATUS.READY,
              ],
            },
      },
      include: TICKET_INCLUDE,
      order: [
        ['priority', 'DESC'],
        ['targetAt', 'ASC'],
      ],
    });

    return tickets.map((ticket) => {
      const order = ticket.order;
      return {
        id: ticket.id,
        status: ticket.status,
        priority: ticket.priority,
        targetAt: ticket.targetAt,
        notes: ticket.notes,
        isLate: ticket.status !== TICKET_STATUS.READY && new Date() > ticket.targetAt,
        order: order
          ? {
              id: order.id,
              orderNumber: order.orderNumber,
              deliveryType: order.deliveryType,
              serviceMode: order.serviceMode,
              contactName: order.contactName,
              notes: order.notes,
              items: (order.items ?? []).map((item) => ({
                id: item.id,
                name: item.productNameSnapshot,
                quantity: item.quantity,
                description: item.descriptionSnapshot,
                specialInstructions: item.specialInstructions,
                customizations: (item.customizations ?? []).map((customization) => ({
                  group: customization.groupNameSnapshot,
                  option: customization.optionNameSnapshot,
                  quantity: customization.quantity,
                })),
              })),
            }
          : null,
      };
    });
  },

  /**
   * Avanza el ticket. Cada paso valida la transicion y arrastra el estado del pedido.
   * Al pasar a PREPARING el consumo de insumos se vuelve definitivo (RN-016).
   */
  async advance(
    ticketId: number,
    next: TicketStatus,
    actorId: number,
    comment?: string,
    scope?: BranchScopeCheck,
  ): Promise<KitchenTicket> {
    const ticket = await KitchenTicket.findByPk(ticketId);
    if (!ticket) throw ApiError.notFound('Ticket no encontrado');
    scope?.(ticket.branchId);

    const current: TicketStatus = ticket.status;
    const allowed = TICKET_FLOW[current] ?? [];
    if (!allowed.includes(next)) {
      throw ApiError.unprocessable(`No se puede pasar el ticket de ${current} a ${next}`);
    }

    const order = await Order.findByPk(ticket.orderId);
    if (!order) throw ApiError.notFound('El pedido del ticket no existe');

    await sequelize.transaction(async (transaction) => {
      const now = new Date();

      if (next === TICKET_STATUS.ACCEPTED) ticket.acceptedAt = now;
      if (next === TICKET_STATUS.PREPARING) ticket.startedAt = now;
      if (next === TICKET_STATUS.READY) {
        ticket.readyAt = now;
        const reference = ticket.startedAt ?? ticket.acceptedAt ?? ticket.createdAt;
        ticket.prepMinutesActual = Math.round((now.getTime() - reference.getTime()) / 60000);
      }
      if (next === TICKET_STATUS.DISPATCHED) ticket.dispatchedAt = now;

      ticket.status = next;
      await ticket.save({ transaction });

      await KitchenTicketEvent.create(
        {
          ticketId: ticket.id,
          fromStatus: current,
          toStatus: next,
          actorId,
          comment: comment ?? null,
        },
        { transaction },
      );

      // El stock se consume de verdad cuando la cocina empieza a preparar.
      if (next === TICKET_STATUS.PREPARING) {
        await inventoryService.consumeForOrder(order, actorId, transaction);
      }

      // Cancelar en cocina cancela el pedido y devuelve lo reservado.
      if (next === TICKET_STATUS.CANCELLED) {
        order.cancelReason = comment ?? 'Cancelado en cocina';
        await inventoryService.releaseForOrder(order, transaction);
        await ordersService.releaseReservations(order, transaction);
        await ordersService.changeStatus(order, ORDER_STATUS.CANCELLED, {
          actorId,
          source: 'STAFF',
          comment: order.cancelReason,
          transaction,
        });
        return;
      }

      const nextOrderStatus = ORDER_STATUS_FOR_TICKET[next];
      if (nextOrderStatus) {
        await ordersService.changeStatus(order, nextOrderStatus as never, {
          actorId,
          source: 'KITCHEN',
          transaction,
        });
      }

      // Recojo en tienda: cuando esta listo y se entrega en mostrador, se cierra ahi.
      if (next === TICKET_STATUS.DISPATCHED && order.deliveryType === DELIVERY_TYPE.PICKUP) {
        await ordersService.changeStatus(order, ORDER_STATUS.DELIVERED, {
          actorId,
          source: 'STAFF',
          comment: 'Entregado en el local',
          transaction,
        });
      }
    });

    return ticket;
  },

  /** Metricas rapidas de la cola, para el encabezado del tablero. */
  async stats(branchId: number) {
    const [queued, preparing, ready, late] = await Promise.all([
      KitchenTicket.count({ where: { branchId, status: TICKET_STATUS.QUEUED } }),
      KitchenTicket.count({ where: { branchId, status: TICKET_STATUS.PREPARING } }),
      KitchenTicket.count({ where: { branchId, status: TICKET_STATUS.READY } }),
      KitchenTicket.count({
        where: {
          branchId,
          status: { [Op.in]: [TICKET_STATUS.QUEUED, TICKET_STATUS.ACCEPTED, TICKET_STATUS.PREPARING] },
          targetAt: { [Op.lt]: new Date() },
        },
      }),
    ]);

    return { queued, preparing, ready, late };
  },
};

export type OperationsService = typeof operationsService;
