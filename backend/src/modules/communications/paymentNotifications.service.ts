import { createHash } from 'node:crypto';
import type { Transaction } from 'sequelize';
import { Notification, Order, Payment, User } from '@database/models';
import { PERMISSIONS } from '@config/constants';
import { env } from '@config/env';
import { settingsService } from '@modules/settings/settings.service';
import { staffAudienceService } from '@modules/notifications/staffAudience.service';
import { whatsappRecipient } from '@shared/utils/whatsappPhone';
import { communicationQueue } from './communications.queue';
import { escapeMessageHtml } from './communications.logic';
import type { CommunicationEvent } from './communications.config';

const labels: Partial<Record<CommunicationEvent, string>> = {
  PAYMENT_PENDING: 'Pedido registrado: pendiente de pago',
  PAYMENT_REMINDER: 'Tu pedido sigue pendiente de pago',
  PAYMENT_FAILED: 'No se completó el intento de pago',
  PAYMENT_EXPIRED: 'Venció el plazo de pago de tu pedido',
  PAYMENT_REPORTED: 'Recibimos tu reporte de pago',
  PAYMENT_OBSERVED: 'Revisa una observación de tu pago',
  PAYMENT_APPROVED: 'Pago verificado',
  PAYMENT_REJECTED: 'El reporte de pago fue rechazado',
  PAYMENT_REFUNDED: 'Devolución registrada',
};
export const paymentNotifications = {
  async record(
    order: Order,
    payment: Payment,
    event: CommunicationEvent,
    transaction: Transaction,
    options: { reason?: string; suffix?: string; amount?: number } = {},
  ) {
    const settings = await settingsService.getCommunicationSettings();
    if (!settings.orderUpdatesEnabled) return;
    const user = order.userId ? await User.findByPk(order.userId, { transaction }) : null;
    if (!user || user.status !== 'ACTIVE') return;
    const amount = Number(options.amount ?? payment.amount);
    const stage =
      payment.stage === 'DEPOSIT'
        ? 'anticipo'
        : payment.stage === 'BALANCE'
          ? 'saldo'
          : 'pago total';
    const title = `${labels[event]} · ${order.orderNumber}`;
    const explanation =
      (
        {
          PAYMENT_PENDING:
            'Recibimos tu pedido. El pago está pendiente de confirmación. Abre el detalle para ver el importe y los datos de la cuenta del taller, o contacta al equipo para coordinar el diseño, las referencias y la entrega o el recojo.',
          PAYMENT_REMINDER: ['yape', 'plin'].includes(payment.provider)
            ? 'Tu pedido sigue pendiente de pago. Abre el detalle para retomarlo mientras siga vigente. Si ya transferiste por Yape o Plin, registra tu operación en el pedido; no realices otra transferencia.'
            : 'Tu pedido sigue pendiente de pago. Abre el detalle para comprobar su estado y retomar el pago mientras siga vigente. Si ves un cargo en tu cuenta, contacta con el taller antes de volver a pagar.',
          PAYMENT_FAILED:
            'La pasarela informó que el intento de pago no se completó. Abre el detalle para revisar el estado y las opciones disponibles. Si ves un cargo en tu cuenta, contacta con el taller antes de volver a pagar.',
          PAYMENT_EXPIRED:
            'El plazo para completar el pago venció y el pedido fue cancelado. No pagues usando el enlace o los datos de este pedido. Puedes consultar el detalle y crear otro pedido según disponibilidad. Si ya transferiste, contacta con el taller para revisar el movimiento; no vuelvas a pagar.',
          PAYMENT_REPORTED:
            'Tu reporte está en revisión. Caja comprobará el ingreso real antes de confirmar el pago. No vuelvas a transferir.',
          PAYMENT_OBSERVED:
            'Caja solicitó una corrección. Abre el mismo pago y corrige los datos del reporte; no realices otra transferencia.',
          PAYMENT_APPROVED: ['CANCELLED', 'REFUNDED'].includes(order.status)
            ? 'Verificamos el ingreso. El pedido continúa cancelado; contacta con el taller para coordinar la devolución.'
            : `Verificamos tu ${stage}. ${payment.stage === 'DEPOSIT' ? `Queda un saldo de S/ ${Number(order.balanceAmount).toFixed(2)} antes de la entrega.` : 'Revisa el seguimiento de tu pedido en la web.'}`,
          PAYMENT_REJECTED:
            'Consulta el motivo en tu pedido. Si ya transferiste, contacta con el taller para revisar el movimiento antes de realizar otro pago.',
          PAYMENT_REFUNDED:
            'El taller registró una devolución realizada por fuera de la web. Consulta la referencia y el importe en el detalle.',
        } as Partial<Record<CommunicationEvent, string>>
      )[event] ?? '';
    const actionUrl = `/cuenta/pedidos/${encodeURIComponent(order.orderNumber)}`;
    const url = new URL(actionUrl, env.FRONTEND_URL).toString();
    const reason = options.reason ? `\nMotivo: ${options.reason}` : '';
    const text = `${explanation}\nImporte: S/ ${amount.toFixed(2)} (${stage}).${reason}\n\n${url}`;
    const key =
      event === 'PAYMENT_REMINDER'
        ? `payment-reminder:order:${order.id}`
        : `payment-event:${payment.id}:${event}:${options.suffix ?? 'first'}`;
    if (user && settings.inAppNotificationsEnabled)
      await Notification.findOrCreate({
        where: { idempotencyKey: `${key}:in-app` },
        transaction,
        defaults: {
          userId: user.id,
          orderId: order.id,
          channel: 'IN_APP',
          template: event,
          recipient: `user:${user.id}`,
          subject: title,
          actionUrl,
          status: 'SENT',
          provider: 'in_app',
          idempotencyKey: `${key}:in-app`,
          sentAt: new Date(),
        },
      });
    if (user?.email && settings.emailNotificationsEnabled)
      await communicationQueue.enqueue({
        channel: 'EMAIL',
        recipient: user.email,
        subject: title,
        event,
        key: `${key}:email`,
        orderId: order.id,
        userId: user.id,
        transaction,
        payload: {
          paymentId: payment.id,
          text,
          variables: {
            pedido: order.orderNumber,
            importe: `S/ ${amount.toFixed(2)}`,
            etapa: stage,
            motivo: options.reason ?? '',
            enlace: url,
          },
          html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#382a2c"><h2>${escapeMessageHtml(title)}</h2><p>${escapeMessageHtml(text).replace(/\n/g, '<br>')}</p><p><a href="${escapeMessageHtml(url)}">Ver mi pedido</a></p></div>`,
        },
      });
    const phone = whatsappRecipient(user?.phone);
    if (phone && order.whatsappOptInAt)
      await communicationQueue.enqueue({
        channel: 'WHATSAPP',
        recipient: phone,
        subject: title,
        event,
        key: `${key}:whatsapp`,
        orderId: order.id,
        userId: user?.id,
        transaction,
        payload: {
          paymentId: payment.id,
          kind: 'template',
          parameters: [order.orderNumber, url],
          text,
        },
      });
    if (event === 'PAYMENT_REPORTED') {
      const staff = await staffAudienceService.userIds(order.branchId, PERMISSIONS.PAYMENT_VERIFY);
      for (const userId of staff)
        await Notification.findOrCreate({
          where: { idempotencyKey: `${key}:staff:${userId}` },
          transaction,
          defaults: {
            userId,
            orderId: order.id,
            channel: 'IN_APP',
            template: 'PAYMENT_REVIEW_REQUIRED',
            audience: 'STAFF',
            branchId: order.branchId,
            permissionCode: PERMISSIONS.PAYMENT_VERIFY,
            body: 'El cliente reportó una transferencia. Comprueba el ingreso antes de aprobarla.',
            recipient: `user:${userId}`,
            subject: `Verifica ${payment.provider.toUpperCase()} de ${order.orderNumber}`,
            actionUrl: `/admin/pagos-directos?pedido=${encodeURIComponent(order.orderNumber)}`,
            status: 'SENT',
            provider: 'in_app',
            idempotencyKey: `${key}:staff:${userId}`,
            sentAt: new Date(),
          },
        });
    }
  },
  suffix(value: string) {
    return createHash('sha256').update(value).digest('hex').slice(0, 20);
  },
};
