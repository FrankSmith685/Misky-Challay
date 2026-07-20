import { logger } from '@config/logger';
import { plansService } from '@modules/plans/plans.service';
import { Op } from 'sequelize';
import { AdminDraft, Order, sequelize } from '@database/models';
import { ORDER_STATUS } from '@config/constants';
import { ordersService } from '@modules/orders/orders.service';
import { inventoryService } from '@modules/operations/inventory.service';
import { commercialAdminService } from '@modules/admin/commercialAdmin.service';

/**
 * TAREAS PROGRAMADAS
 * ---------------------------------------------------------------------------
 * Por ahora un intervalo simple dentro del proceso. Cuando haya varias instancias
 * del backend, esto debe moverse a una cola (BullMQ/Redis) para que la tarea no
 * se ejecute varias veces en paralelo.
 *
 * Los movimientos de saldo son idempotentes (plan-<id>-expiration), asi que un
 * doble disparo no anularia el saldo dos veces.
 */

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const PAYMENT_HOLD_MINUTES = 15;

/** Vence los planes caducados y anula el saldo restante (decision de Fase 0). */
const expirePlansJob = async (): Promise<void> => {
  try {
    const result = await plansService.expireDuePlans();
    if (result.expired > 0) {
      logger.info(
        `Job de vencimiento: ${result.expired} planes vencidos, S/ ${result.creditVoided} de saldo anulado`,
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

/** Temporizadores activos, para poder detenerlos en un apagado ordenado. */
const timers: NodeJS.Timeout[] = [];

export const startJobs = (): void => {
  void expirePlansJob(); // una pasada al arrancar
  void expirePendingPaymentsJob();
  void publishAdminDraftsJob();
  timers.push(
    setInterval(() => void expirePlansJob(), HOUR),
    setInterval(() => void expirePendingPaymentsJob(), MINUTE),
    setInterval(() => void publishAdminDraftsJob(), MINUTE),
  );

  logger.info('Tareas programadas activas: planes, reservas de pago y publicaciones del panel');
};

/** Detiene los temporizadores: sin esto el proceso no termina de cerrarse solo. */
export const stopJobs = (): void => {
  timers.splice(0).forEach(clearInterval);
};
