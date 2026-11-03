import { QueryTypes, type Transaction } from 'sequelize';
import { sequelize } from '@database/connection';
import { logger } from '@config/logger';
import { settingsService } from '@modules/settings/settings.service';
import { sqlUtcDatetime } from '@shared/utils/datetime';
import { messagingConfigService } from './communications.config';
import { paymentNotifications } from './paymentNotifications.service';
import { paymentFollowupSkipReason, PAYMENT_HOLD_MINUTES } from './paymentFollowup.logic';
import { paymentFollowupState } from './paymentFollowup.state';

let running = false;
export const paymentRemindersService = {
  async candidates(
    activatedAt: string,
    delayMinutes: number,
    now: Date,
    afterId = 0,
    transaction?: Transaction,
  ) {
    // Los pagos reportados, resueltos, vencidos y ya recordados salen ANTES del LIMIT.
    return sequelize.query<{ id: number }>(
      `
      SELECT o.id FROM orders o
      JOIN users u ON u.id = o.user_id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
      JOIN payments p ON p.payable_type = 'ORDER' AND p.payable_id = o.id
      WHERE o.status = 'PENDING_PAYMENT' AND o.deleted_at IS NULL
        AND o.id > :afterId AND o.placed_at >= :activatedAt AND o.placed_at <= :cutoff
        AND p.status = 'PENDING' AND p.stage IN ('FULL', 'DEPOSIT')
        AND NOT EXISTS (SELECT 1 FROM payments newer WHERE newer.payable_type = 'ORDER'
          AND newer.payable_id = o.id AND newer.id > p.id)
        AND NOT EXISTS (SELECT 1 FROM payments paid WHERE paid.payable_type = 'ORDER'
          AND paid.payable_id = o.id AND paid.status IN ('SUCCEEDED', 'REFUNDED'))
        AND NOT EXISTS (SELECT 1 FROM payments reported JOIN mobile_payment_claims c ON c.payment_id = reported.id
          WHERE reported.payable_type = 'ORDER' AND reported.payable_id = o.id)
        AND NOT EXISTS (SELECT 1 FROM communication_deliveries d
          WHERE d.order_id = o.id AND d.event = 'PAYMENT_REMINDER')
        AND (
          (p.provider IN ('yape', 'plin') AND JSON_UNQUOTE(JSON_EXTRACT(p.safe_response_json, '$.directPayment.expiresAt')) > :deadline)
          OR (p.provider = 'mercadopago' AND p.created_at > :mpCutoff
            AND (JSON_EXTRACT(p.safe_response_json, '$.expiresAt') IS NULL
              OR CAST(JSON_UNQUOTE(JSON_EXTRACT(p.safe_response_json, '$.expiresAt')) AS DECIMAL(16, 3)) > :deadlineEpoch))
          OR (p.provider IN ('stripe', 'mock') AND o.placed_at > :holdCutoff)
        )
      ORDER BY o.id ASC LIMIT 100`,
      {
        type: QueryTypes.SELECT,
        transaction,
        replacements: {
          afterId,
          activatedAt: sqlUtcDatetime(new Date(activatedAt)),
          cutoff: sqlUtcDatetime(new Date(now.getTime() - delayMinutes * 60000)),
          deadline: new Date(now.getTime() + 60000).toISOString(),
          deadlineEpoch: (now.getTime() + 60000) / 1000,
          mpCutoff: sqlUtcDatetime(new Date(now.getTime() + 60000 - 30 * 60000)),
          holdCutoff: sqlUtcDatetime(
            new Date(now.getTime() + 60000 - PAYMENT_HOLD_MINUTES * 60000),
          ),
        },
      },
    );
  },
  async run(now = new Date()): Promise<number> {
    if (running) return 0;
    running = true;
    let scheduled = 0;
    try {
      const { config } = await messagingConfigService.runtime();
      const reminder = config.paymentReminders;
      if (!config.enabled || !reminder.enabled || !reminder.activatedAt) return 0;
      const settings = await settingsService.getCommunicationSettings();
      const rule = config.events.PAYMENT_REMINDER;
      if (
        !settings.orderUpdatesEnabled ||
        !(
          (settings.emailNotificationsEnabled && rule?.email) ||
          (settings.whatsappUpdatesEnabled && rule?.whatsapp)
        )
      )
        return 0;
      // El cursor evita que un proveedor inaccesible para los primeros pedidos bloquee los demás.
      let afterId = 0;
      for (let batch = 0; batch < 5; batch++) {
        const candidates = await paymentRemindersService.candidates(
          reminder.activatedAt,
          reminder.delayMinutes,
          now,
          afterId,
        );
        for (const { id } of candidates) {
          afterId = Number(id);
          try {
            const current = await paymentFollowupState.read(id);
            if (
              !current ||
              paymentFollowupSkipReason(
                'PAYMENT_REMINDER',
                current,
                Number(current.payments[0]?.id),
                config,
                now.getTime(),
              )
            )
              continue;
            if (!(await paymentFollowupState.verifyProvider(current))) continue;
            await sequelize.transaction(async (transaction) => {
              const fresh = await paymentFollowupState.read(id, transaction);
              const payment = fresh?.payments[0];
              if (
                !fresh ||
                !payment ||
                paymentFollowupSkipReason(
                  'PAYMENT_REMINDER',
                  fresh,
                  Number(payment.id),
                  config,
                  now.getTime(),
                )
              )
                return;
              await paymentNotifications.record(
                fresh.order,
                payment,
                'PAYMENT_REMINDER',
                transaction,
              );
              scheduled++;
            });
          } catch (error) {
            logger.error(
              `No se pudo comprobar el recordatorio del pedido ${id}; se aplaza el aviso`,
              error,
            );
          }
        }
        if (candidates.length < 100) break;
      }
      return scheduled;
    } finally {
      running = false;
    }
  },
};

export const processPaymentReminders = async () => {
  try {
    await paymentRemindersService.run();
  } catch (error) {
    logger.error('No se pudieron programar los recordatorios de pago', error);
  }
};
