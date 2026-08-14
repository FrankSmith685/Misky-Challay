import { Op, Transaction } from 'sequelize';
import {
  Branch,
  DiningTable,
  KitchenTicket,
  KitchenTicketEvent,
  Order,
  OrderItem,
  OrderItemCustomization,
  Payment,
  sequelize,
} from '@database/models';
import {
  TICKET_FLOW,
  TICKET_STATUS,
  type TicketStatus,
} from '@database/models/kitchenTicket.model';
import {
  DELIVERY_TYPE,
  ORDER_STATUS,
  PAYMENT_PROVIDER,
  PAYMENT_STATUS,
  PERMISSIONS,
  PUSH_CHANNEL,
  PUSH_TEMPLATE,
} from '@config/constants';
import { PAYABLE_TYPE } from '@database/models/payment.model';
import { logger } from '@config/logger';
import { ApiError } from '@shared/errors/ApiError';
import type { BranchScopeCheck } from '@shared/utils/scope';
import { ordersService } from '@modules/orders/orders.service';
import { inventoryService } from './inventory.service';
import { publishKitchenEvent } from './kitchenEvents';
import { kitchenPushService } from './kitchenPush.service';
import { sendMobilePushToStaff } from '@modules/notifications/mobilePush.service';

const TICKET_INCLUDE = [
  {
    model: Order,
    as: 'order',
    include: [
      { model: DiningTable, as: 'diningTable', attributes: ['id', 'code', 'area'] },
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

/**
 * Techo del tablero. La cola sale ordenada por urgencia, asi que lo que cae fuera
 * del corte es siempre lo menos urgente. Sin tope, una cocina con arrastre devolvia
 * TODOS sus tickets con sus lineas y personalizaciones en cada sondeo de 5 segundos.
 */
const BOARD_LIMIT = 120;
/** Agenda corta que Cocina necesita ver antes de que una comanda sea accionable. */
const SCHEDULED_BOARD_LIMIT = 60;

/** Estados de los que ya no se vuelve: cancelar sobre ellos no tiene sentido. */
const TERMINAL_TICKET_STATUSES: TicketStatus[] = [
  TICKET_STATUS.DISPATCHED,
  TICKET_STATUS.CANCELLED,
];

/**
 * Momento en que una comanda programada debe entrar al KDS. La hora elegida por
 * el cliente es la hora de entrega/recojo; Cocina necesita verla antes, con el
 * margen de preparacion propio de la sucursal.
 */
export const kitchenReleaseAt = (
  scheduledAt: Date,
  prepMinutes: number,
): Date => new Date(scheduledAt.getTime() - Math.max(0, prepMinutes) * 60_000);

export const operationsService = {
  /**
   * Se llama cuando el webhook confirma el pago (RN-014 -> RN-016).
   * Crea el ticket y reserva los insumos. Si algo falta, el ticket lo avisa:
   * el pedido ya esta pagado, asi que la cocina decide (sustituir o escalar a soporte).
   */
  async openTicketForOrder(
    order: Order,
    transaction: Transaction,
    options: { releaseScheduled?: boolean; now?: Date } = {},
  ): Promise<KitchenTicket | null> {
    const existing = await KitchenTicket.findOne({
      where: { orderId: order.id },
      transaction,
    });
    if (existing) return existing;

    const branch = await Branch.findByPk(order.branchId, { transaction });
    const prepMinutes = branch?.prepMinutes ?? 20;

    // Un pedido programado ya esta confirmado y conserva sus reservas, pero no
    // debe ocupar el tablero durante horas. El job de liberacion vuelve a llamar
    // este metodo cuando llega scheduledAt - prepMinutes.
    if (
      order.scheduledAt
      && !options.releaseScheduled
      && kitchenReleaseAt(order.scheduledAt, prepMinutes) > (options.now ?? new Date())
    ) {
      return null;
    }

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

    // Se publica SOLO tras confirmar la transaccion: una pantalla nunca debe
    // anunciar un ticket que finalmente hizo rollback por stock o pago.
    transaction.afterCommit(() => {
      publishKitchenEvent({
        type: 'TICKET_CREATED',
        branchId: order.branchId,
        ticketId: ticket.id,
        orderNumber: order.orderNumber,
        status: ticket.status,
      });
      void kitchenPushService.notifyBranch(order.branchId, {
        title: `Nuevo pedido ${order.orderNumber}`,
        body: 'La cocina tiene una nueva comanda esperando aceptación.',
        tag: `kitchen-ticket-${ticket.id}`,
      }).catch((error) => logger.error('Fallo el aviso push de nueva comanda', error));
      void sendMobilePushToStaff({
        branchId: order.branchId,
        permission: PERMISSIONS.KITCHEN_READ,
        title: `Nuevo pedido ${order.orderNumber}`,
        body: 'Hay una nueva comanda esperando aceptación en Cocina.',
        actionUrl: `/staff/kitchen?branchId=${order.branchId}`,
        channel: PUSH_CHANNEL.KITCHEN_OPERATIONS,
        template: PUSH_TEMPLATE.KITCHEN_OPERATION,
        orderId: order.id,
        idempotencyKey: `kitchen-ticket-${ticket.id}-created`,
      }).catch((error) => logger.error('Fallo el aviso móvil de nueva comanda', error));
    });

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
      limit: BOARD_LIMIT,
    });

    const orderIds = tickets.map((ticket) => ticket.orderId);
    const pendingCash = orderIds.length > 0
      ? await Payment.findAll({
          where: {
            payableType: PAYABLE_TYPE.ORDER,
            payableId: { [Op.in]: orderIds },
            provider: PAYMENT_PROVIDER.CASH,
            status: PAYMENT_STATUS.PENDING,
          },
          attributes: ['payableId'],
        })
      : [];
    const cashDueOrderIds = new Set(pendingCash.map((payment) => payment.payableId));

    return tickets.map((ticket) => {
      const order = ticket.order;
      return {
        id: ticket.id,
        status: ticket.status,
        priority: ticket.priority,
        createdAt: ticket.createdAt,
        acceptedAt: ticket.acceptedAt,
        targetAt: ticket.targetAt,
        notes: ticket.notes,
        isLate: ticket.status !== TICKET_STATUS.READY && new Date() > ticket.targetAt,
        order: order
          ? {
              id: order.id,
              orderNumber: order.orderNumber,
              deliveryType: order.deliveryType,
              serviceMode: order.serviceMode,
              scheduledAt: order.scheduledAt,
              contactName: order.contactName,
              paymentDueOnDelivery: cashDueOrderIds.has(order.id),
              diningTable: order.get('diningTable') ?? null,
              notes: order.notes,
              items: (order.items ?? []).map((item) => ({
                id: item.id,
                name: item.productNameSnapshot,
                quantity: item.quantity,
                description: item.descriptionSnapshot,
                specialInstructions: item.specialInstructions,
                // Seguridad alimentaria: los alergenos se congelan al comprar
                // (checkout) y ya viajaban en la fila, pero esta proyeccion no los
                // mapeaba, asi que la cocina preparaba el plato SIN VERLOS.
                allergens: item.allergenSnapshotJson ?? [],
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
   * Pedidos ya confirmados que todavia no deben ocupar la cola activa.
   *
   * Siguen separados de `KitchenTicket` a proposito: mostrarlos no permite
   * aceptar ni preparar antes del margen configurado por la sucursal. Cuando
   * llega `releaseAt`, el job crea la comanda real y desaparecen de esta agenda.
   */
  async scheduledBoard(branchId: number, now = new Date()) {
    const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60_000);
    const orders = await Order.findAll({
      where: {
        branchId,
        status: ORDER_STATUS.CONFIRMED,
        scheduledAt: { [Op.ne]: null, [Op.gt]: now, [Op.lte]: horizon },
      },
      include: [
        { model: Branch, as: 'branch', attributes: ['id', 'prepMinutes'], required: true },
        { model: KitchenTicket, as: 'kitchenTicket', attributes: ['id'], required: false },
        { model: DiningTable, as: 'diningTable', attributes: ['id', 'code', 'area'] },
        {
          model: OrderItem,
          as: 'items',
          include: [{ model: OrderItemCustomization, as: 'customizations' }],
        },
      ],
      order: [['scheduledAt', 'ASC']],
      // Se filtran tickets existentes en memoria para evitar que el JOIN con
      // items convierta el LIMIT en una agenda incompleta.
      limit: SCHEDULED_BOARD_LIMIT * 2,
    });

    const scheduled = orders
      .filter((order) => !order.get('kitchenTicket'))
      .map((order) => {
        const branch = order.get('branch') as Branch;
        const scheduledAt = order.scheduledAt as Date;
        return {
          id: order.id,
          orderNumber: order.orderNumber,
          deliveryType: order.deliveryType,
          serviceMode: order.serviceMode,
          scheduledAt,
          releaseAt: kitchenReleaseAt(scheduledAt, branch.prepMinutes),
          contactName: order.contactName,
          diningTable: order.get('diningTable') ?? null,
          notes: order.notes,
          items: (order.items ?? []).map((item) => ({
            id: item.id,
            name: item.productNameSnapshot,
            quantity: item.quantity,
            description: item.descriptionSnapshot,
            specialInstructions: item.specialInstructions,
            allergens: item.allergenSnapshotJson ?? [],
            customizations: (item.customizations ?? []).map((customization) => ({
              group: customization.groupNameSnapshot,
              option: customization.optionNameSnapshot,
              quantity: customization.quantity,
            })),
          })),
        };
      })
      .filter((order) => order.releaseAt > now)
      .slice(0, SCHEDULED_BOARD_LIMIT);

    return scheduled;
  },

  /**
   * Libera al KDS los pedidos programados cuyo margen de preparacion ya comenzo.
   * Bloquear el pedido y reutilizar `openTicketForOrder` mantiene idempotencia si
   * dos instancias del backend ejecutan el job al mismo tiempo.
   */
  async releaseDueScheduledOrders(now = new Date()): Promise<number> {
    const horizon = new Date(now.getTime() + 24 * 60 * 60_000);
    const candidates = await Order.findAll({
      where: {
        status: ORDER_STATUS.CONFIRMED,
        scheduledAt: { [Op.ne]: null, [Op.lte]: horizon },
      },
      include: [
        { model: Branch, as: 'branch', attributes: ['id', 'prepMinutes'], required: true },
        { model: KitchenTicket, as: 'kitchenTicket', attributes: ['id'], required: false },
      ],
      order: [['scheduledAt', 'ASC']],
      limit: 200,
    });

    let released = 0;
    for (const candidate of candidates) {
      if (candidate.get('kitchenTicket')) continue;
      const branch = candidate.get('branch') as Branch | undefined;
      if (!candidate.scheduledAt || kitchenReleaseAt(candidate.scheduledAt, branch?.prepMinutes ?? 20) > now) {
        continue;
      }

      const created = await sequelize.transaction(async (transaction) => {
        const locked = await Order.findByPk(candidate.id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!locked || locked.status !== ORDER_STATUS.CONFIRMED || !locked.scheduledAt) return null;
        return operationsService.openTicketForOrder(locked, transaction, {
          releaseScheduled: true,
          now,
        });
      });
      if (created) released += 1;
    }

    return released;
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

    if (
      next === TICKET_STATUS.DISPATCHED
      && order.deliveryType !== DELIVERY_TYPE.PICKUP
    ) {
      throw ApiError.unprocessable(
        order.deliveryType === DELIVERY_TYPE.DELIVERY
          ? 'El retiro lo confirma Reparto cuando recibe el pedido'
          : 'La salida de cocina se cierra desde Salon al servir y cobrar la mesa',
      );
    }

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

    publishKitchenEvent({
      type: 'TICKET_UPDATED',
      branchId: ticket.branchId,
      ticketId: ticket.id,
      orderNumber: order.orderNumber,
      status: ticket.status,
    });

    return ticket;
  },

  /**
   * Cierra la etapa de Cocina cuando el siguiente responsable confirma el
   * handoff. Reparto lo hace al recoger; Salon al cerrar la mesa. Asi Cocina no
   * puede declarar por adelantado una entrega que todavia no ocurrio.
   */
  async dispatchTicketForOrder(
    orderId: number,
    actorId: number | null,
    comment: string,
    transaction: Transaction,
  ): Promise<void> {
    const ticket = await KitchenTicket.findOne({
      where: { orderId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!ticket || ticket.status === TICKET_STATUS.DISPATCHED) return;
    if (ticket.status !== TICKET_STATUS.READY) {
      throw ApiError.unprocessable('Cocina todavia no ha marcado la comanda como lista');
    }

    const from = ticket.status;
    ticket.status = TICKET_STATUS.DISPATCHED;
    ticket.dispatchedAt = new Date();
    await ticket.save({ transaction });
    await KitchenTicketEvent.create({
      ticketId: ticket.id,
      fromStatus: from,
      toStatus: TICKET_STATUS.DISPATCHED,
      actorId,
      comment,
    }, { transaction });

    const order = await Order.findByPk(orderId, {
      attributes: ['orderNumber'],
      transaction,
    });
    transaction.afterCommit(() => {
      publishKitchenEvent({
        type: 'TICKET_UPDATED',
        branchId: ticket.branchId,
        ticketId: ticket.id,
        orderNumber: order?.orderNumber,
        status: ticket.status,
      });
    });
  },

  /**
   * Cierra el ticket de un pedido que muere fuera de la cocina (cancelacion desde
   * el panel o desde la cuenta del cliente).
   *
   * Sin esto la cocina seguia cocinando un pedido muerto y al pulsar "Empezar a
   * preparar" el flujo reventaba con 422, porque el pedido ya estaba en CANCELLED
   * y de ahi solo se sale a REFUNDED: el ticket quedaba inmovil para siempre.
   *
   * IDEMPOTENTE a proposito: quien cancela un pedido no tiene por que saber si
   * habia ticket ni en que estado estaba, y una segunda pasada no debe romper la
   * transaccion de quien llama. No toca inventario ni reservas: de eso ya se
   * encarga el que cancela el pedido (releaseForOrder + releaseReservations), y
   * duplicarlo aqui devolveria el stock dos veces.
   */
  async cancelTicketForOrder(
    orderId: number,
    reason: string,
    transaction?: Transaction,
  ): Promise<void> {
    const ticket = await KitchenTicket.findOne({
      where: { orderId },
      transaction,
      // Con transaccion se bloquea la fila: la cocina puede estar avanzando el mismo
      // ticket en el segundo en que soporte cancela el pedido.
      lock: transaction ? transaction.LOCK.UPDATE : undefined,
    });
    if (!ticket) return;
    // DISPATCHED incluido: el plato ya salio de cocina, no hay nada que parar.
    if (TERMINAL_TICKET_STATUSES.includes(ticket.status)) return;

    const from = ticket.status;
    ticket.status = TICKET_STATUS.CANCELLED;
    await ticket.save({ transaction });

    await KitchenTicketEvent.create(
      {
        ticketId: ticket.id,
        fromStatus: from,
        toStatus: TICKET_STATUS.CANCELLED,
        actorId: null,
        comment: reason.slice(0, 255),
      },
      { transaction },
    );

    logger.warn(`Ticket ${ticket.id} cerrado por cancelacion del pedido ${orderId}: ${reason}`);
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

/**
 * Suelta y con nombre para quien cancela pedidos (modulos admin y orders): asi el
 * cierre del ticket se lee como un paso mas de la cancelacion y no obliga a
 * importar el servicio entero.
 */
export const cancelTicketForOrder = operationsService.cancelTicketForOrder;
