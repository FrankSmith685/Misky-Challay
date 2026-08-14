import { logger } from '@config/logger';
import { plansService } from '@modules/plans/plans.service';
import { Op } from 'sequelize';
import { AdminDraft, Branch, KitchenTicket, MobilePaymentClaim, Order, Payment, sequelize } from '@database/models';
import { ORDER_STATUS, PAYMENT_STATUS, PERMISSIONS, PUSH_CHANNEL, PUSH_TEMPLATE } from '@config/constants';
import { PAYABLE_TYPE } from '@database/models/payment.model';
import { MOBILE_PAYMENT_CLAIM_STATUS } from '@database/models/mobilePaymentClaim.model';
import { env } from '@config/env';
import { ordersService } from '@modules/orders/orders.service';
import { inventoryService } from '@modules/operations/inventory.service';
import { commercialAdminService } from '@modules/admin/commercialAdmin.service';
import { TICKET_STATUS } from '@database/models/kitchenTicket.model';
import { kitchenPushService } from '@modules/operations/kitchenPush.service';
import { publishKitchenEvent } from '@modules/operations/kitchenEvents';
import { operationsService } from '@modules/operations/operations.service';
import { sendMobilePushToStaff } from '@modules/notifications/mobilePush.service';

/**
 * TAREAS PROGRAMADAS
 * ---------------------------------------------------------------------------
 * Por ahora un intervalo simple dentro del proceso. Cuando haya varias instancias
 * del backend, esto debe moverse a una cola (BullMQ/Redis) para que la tarea no
 * se ejecute varias veces en paralelo.
 *
 * Los movimientos de saldo son idempotentes (lot-<id>-expiration), así que un
 * doble disparo no anula el mismo lote dos veces.
 */

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const PAYMENT_HOLD_MINUTES = 15;
const KITCHEN_ACCEPT_SLA_MINUTES = 2;

/** Libera comandas programadas solo al comenzar su ventana de preparacion. */
const releaseScheduledKitchenOrdersJob = async (): Promise<void> => {
  try {
    const released = await operationsService.releaseDueScheduledOrders();
    if (released > 0) logger.info(`Pedidos programados enviados a Cocina: ${released}`);
  } catch (error) {
    logger.error('Fallo la liberacion de pedidos programados a Cocina', error);
  }
};

/** Vence beneficios y únicamente los lotes de saldo que alcanzaron su propia fecha. */
const expirePlansJob = async (): Promise<void> => {
  try {
    const result = await plansService.expireDuePlans();
    if (result.expired > 0) {
      logger.info(
        `Job de vencimiento: ${result.expired} planes vencidos, S/ ${result.creditVoided} de lotes vencidos`,
      );
    }
  } catch (error) {
    logger.error('Fallo el job de vencimiento de planes', error);
  }
};

/** Libera stock, cupón, saldo y cupo de pagos abandonados. */
const expirePendingPaymentsJob = async (): Promise<void> => {
  try {
    const cutoff = new Date(Date.now() - PAYMENT_HOLD_MINUTES * MINUTE);
    const pending = await Order.findAll({
      where: { status: ORDER_STATUS.PENDING_PAYMENT, placedAt: { [Op.lt]: cutoff } },
      limit: 100,
      order: [['placedAt', 'ASC']],
    });
    for (const order of pending) {
      await sequelize.transaction(async (transaction) => {
        const locked = await Order.findByPk(order.id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!locked || locked.status !== ORDER_STATUS.PENDING_PAYMENT) return;
        locked.cancelReason = 'El tiempo para completar el pago venció';
        const payment = await Payment.findOne({
          where: { payableType: PAYABLE_TYPE.ORDER, payableId: locked.id, status: PAYMENT_STATUS.PENDING },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (payment) {
          payment.status = PAYMENT_STATUS.FAILED;
          payment.failedAt = new Date();
          payment.failureReason = locked.cancelReason;
          await payment.save({ transaction });
          const claim = await MobilePaymentClaim.findOne({
            where: { paymentId: payment.id, status: MOBILE_PAYMENT_CLAIM_STATUS.PENDING },
            transaction,
            lock: transaction.LOCK.UPDATE,
          });
          if (claim) {
            claim.status = MOBILE_PAYMENT_CLAIM_STATUS.REJECTED;
            claim.reviewedAt = new Date();
            claim.rejectionReason = locked.cancelReason;
            await claim.save({ transaction });
          }
        }
        await inventoryService.releaseForOrder(locked, transaction);
        await ordersService.releaseReservations(locked, transaction);
        await ordersService.changeStatus(locked, ORDER_STATUS.CANCELLED, {
          source: 'SYSTEM', comment: locked.cancelReason, transaction,
        });
      });
    }
    if (pending.length) logger.info(`Reservas vencidas liberadas: ${pending.length}`);
  } catch (error) {
    logger.error('Fallo el job de reservas temporales', error);
  }
};

/** Publica borradores territoriales programados desde el panel. */
const publishAdminDraftsJob = async (): Promise<void> => {
  // El findAll estaba fuera de try/catch: con la base caida, la promesa rechazada
  // de este job (lanzado con `void`) tumbaba el proceso entero cada minuto.
  let drafts: AdminDraft[];
  try {
    drafts = await AdminDraft.findAll({
      where: { status: 'SCHEDULED', publishAt: { [Op.lte]: new Date() } },
      limit: 25,
      order: [['publishAt', 'ASC']],
    });
  } catch (error) {
    logger.error('Fallo el job de publicaciones programadas', error);
    return;
  }

  for (const draft of drafts) {
    try {
      if (draft.scope !== 'coverage-zone') throw new Error(`Tipo de borrador no publicable: ${draft.scope}`);
      const payload = draft.payload as {
        cityId: number; name: string; deliveryFee: number; minimumOrder: number;
        estimatedMinutes: number; priority: number; polygon?: Array<{ lat: number; lng: number }>;
      };
      await commercialAdminService.createZone(payload);
      await draft.update({ status: 'PUBLISHED', errorMessage: null });
      logger.info(`Borrador publicado: ${draft.key}`);
    } catch (error) {
      try {
        await draft.update({ status: 'FAILED', errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'Error al publicar' });
      } catch (updateError) {
        logger.error(`No se pudo marcar como fallido el borrador ${draft.key}`, updateError);
      }
      logger.error(`Fallo la publicacion programada ${draft.key}`, error);
    }
  }
};

/** "12-14,19-21" -> [{startHour:12,endHour:14},{startHour:19,endHour:21}] */
const parseSlotWindows = (raw: string): Array<{ startHour: number; endHour: number }> =>
  raw
    .split(',')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [start, end] = chunk.split('-').map(Number);
      return { startHour: start, endHour: end };
    })
    .filter(
      (window) =>
        Number.isInteger(window.startHour) &&
        Number.isInteger(window.endHour) &&
        window.endHour > window.startHour,
    );

/**
 * Mantiene generadas las franjas de entrega con un horizonte movil.
 *
 * Antes, las franjas solo nacian de un boton del panel que creaba 7 dias con todos
 * los parametros cableados en el frontend. Al octavo dia `listSlots` devolvia vacio
 * y la entrega programada desaparecia de la web: caida comercial silenciosa y
 * perfectamente periodica. `generateSlots` es idempotente (findOrCreate por
 * sucursal + inicio), asi que repetir la pasada no duplica nada.
 */
const generateDeliverySlotsJob = async (): Promise<void> => {
  const windows = parseSlotWindows(env.SLOT_WINDOWS);
  if (windows.length === 0) {
    logger.warn('SLOT_WINDOWS no define ninguna ventana valida: no se generan franjas');
    return;
  }

  try {
    const branches = await Branch.findAll({
      where: { isActive: true, acceptsDelivery: true },
      attributes: ['id', 'name'],
    });

    let created = 0;
    for (const branch of branches) {
      const result = await commercialAdminService.generateSlots({
        branchId: branch.id,
        days: env.SLOT_HORIZON_DAYS,
        windows,
        capacity: env.SLOT_CAPACITY,
        cutoffHours: env.SLOT_CUTOFF_HOURS,
      });
      created += result.created;
    }

    if (created > 0) logger.info(`Franjas de entrega generadas: ${created}`);
  } catch (error) {
    logger.error('Fallo el job de generacion de franjas', error);
  }
};

/**
 * Escala comandas que siguen en cola: la marca en BD evita enviar el mismo aviso
 * tras reiniciar el proceso o cuando hay mas de una instancia compitiendo.
 */
const escalateUnacceptedKitchenTicketsJob = async (): Promise<void> => {
  try {
    const cutoff = new Date(Date.now() - KITCHEN_ACCEPT_SLA_MINUTES * MINUTE);
    const overdue = await KitchenTicket.findAll({
      where: {
        status: TICKET_STATUS.QUEUED,
        escalatedAt: null,
        createdAt: { [Op.lte]: cutoff },
      },
      order: [['createdAt', 'ASC']],
      limit: 100,
    });

    for (const ticket of overdue) {
      const [claimed] = await KitchenTicket.update(
        { escalatedAt: new Date() },
        { where: { id: ticket.id, status: TICKET_STATUS.QUEUED, escalatedAt: null } },
      );
      if (!claimed) continue;
      const order = await Order.findByPk(ticket.orderId, { attributes: ['orderNumber'] });
      const orderNumber = order?.orderNumber ?? `Ticket ${ticket.id}`;
      publishKitchenEvent({
        type: 'TICKET_UPDATED',
        branchId: ticket.branchId,
        ticketId: ticket.id,
        orderNumber,
        status: ticket.status,
      });
      await kitchenPushService.notifyBranch(ticket.branchId, {
        title: 'Pedido sin aceptar',
        body: `${orderNumber} lleva más de ${KITCHEN_ACCEPT_SLA_MINUTES} minutos esperando en cocina.`,
        tag: `kitchen-escalation-${ticket.id}`,
      });
      await sendMobilePushToStaff({
        branchId: ticket.branchId,
        permission: PERMISSIONS.KITCHEN_READ,
        title: 'Pedido sin aceptar',
        body: `${orderNumber} lleva más de ${KITCHEN_ACCEPT_SLA_MINUTES} minutos esperando en Cocina.`,
        actionUrl: `/staff/kitchen?branchId=${ticket.branchId}`,
        channel: PUSH_CHANNEL.KITCHEN_OPERATIONS,
        template: PUSH_TEMPLATE.KITCHEN_OPERATION,
        orderId: ticket.orderId,
        idempotencyKey: `kitchen-ticket-${ticket.id}-escalated`,
      });
      logger.warn(`Comanda escalada por falta de aceptación: ${orderNumber}`);
    }
  } catch (error) {
    logger.error('Fallo el escalamiento de comandas sin aceptar', error);
  }
};

/** Temporizadores activos, para poder detenerlos en un apagado ordenado. */
const timers: NodeJS.Timeout[] = [];

export const startJobs = (): void => {
  void expirePlansJob(); // una pasada al arrancar
  void expirePendingPaymentsJob();
  void publishAdminDraftsJob();
  void generateDeliverySlotsJob();
  void releaseScheduledKitchenOrdersJob();
  void escalateUnacceptedKitchenTicketsJob();
  timers.push(
    setInterval(() => void expirePlansJob(), HOUR),
    setInterval(() => void expirePendingPaymentsJob(), MINUTE),
    setInterval(() => void publishAdminDraftsJob(), MINUTE),
    setInterval(() => void generateDeliverySlotsJob(), 6 * HOUR),
    setInterval(() => void releaseScheduledKitchenOrdersJob(), 30_000),
    setInterval(() => void escalateUnacceptedKitchenTicketsJob(), 30_000),
  );

  logger.info(
    'Tareas programadas activas: planes, reservas de pago, publicaciones, franjas, pedidos programados y escalamiento KDS',
  );
};

/** Detiene los temporizadores: sin esto el proceso no termina de cerrarse solo. */
export const stopJobs = (): void => {
  timers.splice(0).forEach(clearInterval);
};
