import { processActivityOutbox, enqueueSubscriptionReminders } from '@modules/notifications/activity.service';
import { processPushQueue } from '@modules/notifications/pushQueue.service';
import { logger } from '@config/logger';
import { processCommunicationQueue } from '@modules/communications/communications.queue';
import { processPaymentReminders } from '@modules/communications/paymentReminders.service';
import { paymentNotifications } from '@modules/communications/paymentNotifications.service';
import { PAYMENT_HOLD_MINUTES, PAYMENT_EXPIRED_REASON } from '@modules/communications/paymentFollowup.logic';
import { plansService } from '@modules/plans/plans.service';
import { subscriptionsService } from '@modules/subscriptions/subscriptions.service';
import { Op } from 'sequelize';
import { AdminDraft, Branch, CakeProductionTask, KitchenTicket, MobilePaymentClaim, MobilePaymentEvent, Order, Payment, Subscription, sequelize } from '@database/models';
import { SUBSCRIPTION_STATUS } from '@database/models/subscription.model';
import { ORDER_STATUS, PAYMENT_PROVIDER, PAYMENT_STATUS, PERMISSIONS, PUSH_CHANNEL, PUSH_TEMPLATE } from '@config/constants';
import { PAYABLE_TYPE } from '@database/models/payment.model';
import { MOBILE_PAYMENT_CLAIM_STATUS } from '@database/models/mobilePaymentClaim.model';
import { holdsDirectReview, isDirectProvider, type DirectPaymentSnapshot } from '@modules/payments/directPayments.logic';
import { findPaymentExpiryCandidates } from '@modules/payments/paymentExpiry';
import { env } from '@config/env';
import { ordersService } from '@modules/orders/orders.service';
import { paymentsService } from '@modules/payments/payments.service';
import { inventoryService } from '@modules/operations/inventory.service';
import { seedCakeCapacities } from '@database/seeders/cakes.seeder';
import { commercialAdminService } from '@modules/admin/commercialAdmin.service';
import { TICKET_STATUS } from '@database/models/kitchenTicket.model';
import { kitchenPushService } from '@modules/operations/kitchenPush.service';
import { publishKitchenEvent } from '@modules/operations/kitchenEvents';
import { operationsService } from '@modules/operations/operations.service';
import { sendMobilePushToStaff } from '@modules/notifications/mobilePush.service';
import { dayInLima } from '@modules/cakes/cakeProduction.service';
import { addDaysToIsoDate } from '@shared/utils/datetime';

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
const PAYMENT_CONFIRMATION_GRACE_MINUTES = 5;
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

/** Avisa una vez por día sobre etapas próximas sin asignar, vencidas o bloqueadas. */
const notifyCakeProductionJob = async (): Promise<void> => {
  try {
    const today = dayInLima(new Date());
    const tomorrow = addDaysToIsoDate(today, 1);
    const tasks = await CakeProductionTask.findAll({
      where: { workDate: { [Op.between]: [addDaysToIsoDate(today, -7), tomorrow] }, status: { [Op.ne]: 'DONE' } },
      include: [{ model: Order, as: 'order', attributes: ['id', 'orderNumber'], required: true, where: { status: { [Op.notIn]: [ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUNDED, ORDER_STATUS.DELIVERED] } } }],
      order: [['workDate', 'ASC'], ['id', 'ASC']],
      limit: 200,
    });
    for (const task of tasks) {
      if (task.workDate === tomorrow && task.assignedTo && task.status !== 'BLOCKED') continue;
      const order = task.get('order') as Order | undefined;
      if (!order) continue;
      const state = task.status === 'BLOCKED' ? 'bloqueada' : task.workDate < today ? 'atrasada' : task.workDate === today ? 'programada para hoy' : 'sin responsable para mañana';
      const stationName: Record<string, string> = { DESIGN: 'diseño', BAKING: 'horneado', COOLING: 'enfriado', FILLING: 'relleno', DECORATING: 'decoración', QA: 'calidad', DISPATCH: 'despacho' };
      await sendMobilePushToStaff({
        branchId: task.branchId,
        permission: PERMISSIONS.KITCHEN_READ,
        title: `Producción de torta ${order.orderNumber}`,
        body: `Etapa ${stationName[task.station] ?? task.station} ${state}. Revisa el plan y asigna en el panel.`,
        actionUrl: `/staff/cakes?branchId=${task.branchId}`,
        channel: PUSH_CHANNEL.KITCHEN_OPERATIONS,
        template: PUSH_TEMPLATE.KITCHEN_OPERATION,
        orderId: order.id,
        idempotencyKey: `cake-task-${task.id}-${today}`,
      });
    }
  } catch (error) {
    logger.error('Fallo el aviso de etapas de torta pendientes', error);
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
    const candidates = await findPaymentExpiryCandidates(cutoff);
    const pending = candidates.length ? await Order.findAll({ where: { id: candidates.map((row) => row.id) }, order: [['placedAt', 'ASC']] }) : [];
    for (const order of pending) {
      const latestPayment = await Payment.findOne({
        where: { payableType: PAYABLE_TYPE.ORDER, payableId: order.id }, order: [['id', 'DESC']],
      });
      if (latestPayment?.provider === PAYMENT_PROVIDER.MERCADOPAGO) {
        const declared = latestPayment.safeResponseJson?.expiresAt;
        const checkoutExpiry = typeof declared === 'number' && Number.isFinite(declared)
          ? declared * 1000
          : latestPayment.createdAt.getTime() + 30 * MINUTE;
        if (Date.now() < checkoutExpiry + PAYMENT_CONFIRMATION_GRACE_MINUTES * MINUTE) continue;
        try {
          const outcomes = await paymentsService.reconcileOrderPayments(order.id);
          if (outcomes.some((outcome) => outcome.kind === 'PAID'
            || ['order.processing', 'order.action_required', 'order.processed', 'order.refunded'].includes(outcome.eventType))) continue;
        } catch (error) {
          logger.error(`No se pudo conciliar el pago del pedido ${order.orderNumber}; se conserva la reserva`, error);
          continue;
        }
      }
      await sequelize.transaction(async (transaction) => {
        const locked = await Order.findByPk(order.id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!locked || locked.status !== ORDER_STATUS.PENDING_PAYMENT) return;
        const credited = await Payment.count({
          where: { payableType: PAYABLE_TYPE.ORDER, payableId: locked.id,
            status: PAYMENT_STATUS.SUCCEEDED },
          transaction,
        });
        if (credited > 0) {
          logger.error(`El pedido ${locked.orderNumber} tiene un pago acreditado y sigue pendiente; no se libera su reserva`);
          return;
        }
        const currentPayment = await Payment.findOne({
          where: { payableType: PAYABLE_TYPE.ORDER, payableId: locked.id },
          order: [['id', 'DESC']], transaction, lock: transaction.LOCK.UPDATE,
        });
        if (currentPayment?.id !== latestPayment?.id) return;
        if (currentPayment && isDirectProvider(currentPayment.provider)) {
          const report = await MobilePaymentClaim.findOne({ where: { paymentId: currentPayment.id }, transaction, lock: transaction.LOCK.UPDATE });
          if (holdsDirectReview(report?.status)) return;
          const snapshot = currentPayment.safeResponseJson?.directPayment as DirectPaymentSnapshot | undefined;
          if (snapshot && Date.now() < Date.parse(snapshot.expiresAt)) return;
        }
        locked.cancelReason = PAYMENT_EXPIRED_REASON;
        const payment = currentPayment?.status === PAYMENT_STATUS.PENDING ? currentPayment : null;
        if (payment) {
          payment.status = PAYMENT_STATUS.FAILED;
          payment.failedAt = new Date();
          payment.failureReason = locked.cancelReason;
          await payment.save({ transaction });
          if (isDirectProvider(payment.provider)) await MobilePaymentEvent.create({ paymentId: payment.id, kind: 'EXPIRED', details: { reason: locked.cancelReason } }, { transaction });
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
          notifyCustomer: !currentPayment,
        });
        if (currentPayment)
          await paymentNotifications.record(locked, currentPayment, 'PAYMENT_EXPIRED', transaction);
      });
    }
    if (pending.length) logger.info(`Reservas vencidas liberadas: ${pending.length}`);
  } catch (error) {
    logger.error('Fallo el job de reservas temporales', error);
  }
};

/** Recupera pagos confirmados aunque el webhook no haya llegado. */
const reconcileMercadoPagoPaymentsJob = async (): Promise<void> => {
  if (!env.MERCADOPAGO_ACCESS_TOKEN) return;
  try {
    const pending = await Payment.findAll({
      where: { provider: PAYMENT_PROVIDER.MERCADOPAGO, status: PAYMENT_STATUS.PENDING },
      limit: 100,
      order: [['createdAt', 'ASC']],
    });
    for (const payment of pending) {
      try {
        await paymentsService.reconcilePayment(payment);
      } catch (error) {
        logger.error(`No se pudo conciliar el pago ${payment.id} de Mercado Pago`, error);
      }
    }
  } catch (error) {
    logger.error('Fallo la conciliacion de Mercado Pago', error);
  }
};

const reconcileSubscriptionsJob = async (): Promise<void> => {
  if (!env.MERCADOPAGO_ACCESS_TOKEN) return;
  try {
    const rows = await Subscription.findAll({ where: { [Op.or]: [
      { status: { [Op.in]: [SUBSCRIPTION_STATUS.PENDING, SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.PAST_DUE] } },
      { status: SUBSCRIPTION_STATUS.CANCELED, providerReference: null },
    ] }, limit: 100, order: [['updatedAt', 'ASC']] });
    for (const subscription of rows) {
      try { await subscriptionsService.sync(subscription.id); }
      catch (error) { logger.error(`No se pudo conciliar la suscripción ${subscription.id}`, error); }
    }
  } catch (error) { logger.error('Fallo la conciliación de suscripciones', error); }
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
      where: { isActive: true, [Op.or]: [{ acceptsDelivery: true }, { acceptsPickup: true }] },
      attributes: ['id', 'name'],
    });

    let created = 0;
    for (const branch of branches) {
      const result = await commercialAdminService.generateSlots({
        branchId: branch.id,
        days: Math.max(env.SLOT_HORIZON_DAYS, 45),
        windows,
        capacity: env.SLOT_CAPACITY,
        cutoffHours: env.SLOT_CUTOFF_HOURS,
      });
      created += result.created;
      // La capacidad base es operativa, no un dato demo: se mantiene un
      // horizonte futuro para que la disponibilidad de tortas funcione aunque
      // SEED_DEMO_DATA esté desactivado. Los cambios manuales por fecha y
      // estación se conservan porque seedCakeCapacities solo crea faltantes.
      await seedCakeCapacities(branch.id, Math.max(env.SLOT_HORIZON_DAYS, 45));
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
  const processActivity = async () => {
    try { await processActivityOutbox(); }
    catch (error) { logger.error('No se pudo procesar la actividad pendiente', error); }
  };
  void processActivity();
  void processPushQueue();
  timers.push(setInterval(() => void processActivity(), 3000), setInterval(() => void processPushQueue(), 10000), setInterval(() => void enqueueSubscriptionReminders().catch((error) => logger.error('Fallo el recordatorio de cajas', error)), HOUR));
  void processCommunicationQueue();
  void processPaymentReminders();
  void expirePlansJob(); // una pasada al arrancar
  void expirePendingPaymentsJob();
  void reconcileMercadoPagoPaymentsJob();
  void reconcileSubscriptionsJob();
  void publishAdminDraftsJob();
  void generateDeliverySlotsJob();
  void releaseScheduledKitchenOrdersJob();
  void notifyCakeProductionJob();
  void escalateUnacceptedKitchenTicketsJob();
  timers.push(
    setInterval(() => void processCommunicationQueue(), 10_000),
    setInterval(() => void processPaymentReminders(), MINUTE),
    setInterval(() => void expirePlansJob(), HOUR),
    setInterval(() => void expirePendingPaymentsJob(), MINUTE),
    setInterval(() => void reconcileMercadoPagoPaymentsJob(), 2 * MINUTE),
    setInterval(() => void reconcileSubscriptionsJob(), 30 * MINUTE),
    setInterval(() => void publishAdminDraftsJob(), MINUTE),
    setInterval(() => void generateDeliverySlotsJob(), 6 * HOUR),
    setInterval(() => void releaseScheduledKitchenOrdersJob(), 30_000),
    setInterval(() => void notifyCakeProductionJob(), HOUR),
    setInterval(() => void escalateUnacceptedKitchenTicketsJob(), 30_000),
  );

  logger.info(
    'Tareas programadas activas: planes, reservas de pago, publicaciones, franjas, capacidad y avisos de tortas, pedidos programados y escalamiento KDS',
  );
};

/** Detiene los temporizadores: sin esto el proceso no termina de cerrarse solo. */
export const stopJobs = (): void => {
  timers.splice(0).forEach(clearInterval);
};
