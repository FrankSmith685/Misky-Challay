import { createHash } from 'node:crypto';
import { type Transaction } from 'sequelize';
import {
  CommunicationDelivery,
  WhatsappConversation,
  WhatsappMessage,
} from '@database/models/messaging.model';
import { Notification, WebhookEvent, sequelize } from '@database/models';
import { env } from '@config/env';
import { PERMISSIONS } from '@config/constants';
import { ApiError } from '@shared/errors/ApiError';
import { staffAudienceService } from '@modules/notifications/staffAudience.service';
import { communicationQueue } from './communications.queue';
import { messagingConfigService } from './communications.config';
import {
  botMenu,
  monotonicDeliveryState,
  withinOpeningHours,
  withinServiceWindow,
} from './communications.logic';
import { publishCommunicationChange } from './communications.events';

const portal = (path: string) => new URL(path, env.FRONTEND_URL).toString();
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export const whatsappInbox = {
  async outbound(
    conversation: WhatsappConversation,
    body: string,
    key: string,
    actorId: number | null,
    transaction: Transaction,
    optOutConfirmation = false,
  ) {
    const message = await WhatsappMessage.create(
      { conversationId: conversation.id, direction: 'OUT', body, actorId },
      { transaction },
    );
    await communicationQueue.enqueue({
      channel: 'WHATSAPP',
      recipient: conversation.phone,
      subject: actorId ? 'Respuesta de atención' : 'Respuesta del asistente',
      event: 'CONVERSATION',
      payload: { kind: 'text', text: body, isTest: conversation.isTest, optOutConfirmation },
      key,
      messageId: message.id,
      simulation: conversation.isTest || undefined,
      transaction,
    });
    await conversation.update({ lastMessage: body.slice(0, 255) }, { transaction });
  },
  async incoming(input: {
    id: string;
    phone: string;
    name?: string;
    text: string;
    timestamp: Date;
    isTest: boolean;
  }) {
    const { config } = await messagingConfigService.runtime();
    return sequelize.transaction(async (transaction) => {
      const [created] = await WhatsappConversation.findOrCreate({
        where: { phone: input.phone, isTest: input.isTest },
        defaults: { phone: input.phone, isTest: input.isTest, name: input.name?.slice(0, 120) },
        transaction,
      });
      const conversation = await WhatsappConversation.findByPk(created.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!conversation) throw ApiError.notFound('Conversación no encontrada');
      if (await WhatsappMessage.findOne({ where: { providerMessageId: input.id }, transaction }))
        return conversation;
      const inboundAt = new Date(Math.min(Date.now(), input.timestamp.getTime()));
      await WhatsappMessage.create(
        {
          conversationId: conversation.id,
          direction: 'IN',
          body: input.text.slice(0, 4000),
          providerMessageId: input.id,
        },
        { transaction },
      );
      await conversation.update(
        {
          name: input.name?.slice(0, 120) || conversation.name,
          lastMessage: input.text.slice(0, 255),
          unread: conversation.unread + 1,
          lastInboundAt:
            conversation.lastInboundAt && conversation.lastInboundAt > inboundAt
              ? conversation.lastInboundAt
              : inboundAt,
        },
        { transaction },
      );
      const command = input.text
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      let reply: string | null = null;
      let optOutConfirmation = false;
      if (['baja', 'stop', 'salir'].includes(command)) {
        await conversation.update({ optedOutAt: new Date() }, { transaction });
        reply =
          'Desactivamos los avisos por WhatsApp. Puedes seguir tu pedido en la web. Escribe ALTA si deseas permitirlos de nuevo.';
        optOutConfirmation = true;
      } else if (['alta', 'start'].includes(command)) {
        await conversation.update(
          { optedOutAt: null, mode: 'BOT', assignedTo: null },
          { transaction },
        );
        reply = botMenu(config.welcome);
      } else if (
        !conversation.optedOutAt &&
        conversation.mode === 'BOT' &&
        config.botEnabled &&
        config.enabled
      ) {
        if (['4', 'persona', 'asesor', 'humano'].includes(command)) {
          await conversation.update({ mode: 'HUMAN' }, { transaction });
          reply = withinOpeningHours(config) ? config.humanReply : config.closedReply;
          const staff = await staffAudienceService.userIds(0, PERMISSIONS.COMMUNICATION_REPLY);
          for (const userId of staff)
            await Notification.findOrCreate({
              where: { idempotencyKey: `wa-handoff:${hash(input.id).slice(0, 32)}:${userId}` },
              defaults: {
                userId,
                channel: 'IN_APP',
                template: 'WHATSAPP_HANDOFF',
                recipient: `user:${userId}`,
                subject: `${input.isTest ? '[Prueba] ' : ''}Consulta de WhatsApp pendiente de atención`,
                actionUrl: `/admin/comunicaciones?conversation=${conversation.id}`,
                status: 'SENT',
                provider: 'in_app',
                idempotencyKey: `wa-handoff:${hash(input.id).slice(0, 32)}:${userId}`,
                sentAt: new Date(),
              },
              transaction,
            });
        } else if (command === '1')
          reply = `Consulta el estado de tus pedidos y pagos aquí: ${portal('/cuenta/pedidos')}\nInicia sesión en tu cuenta para ver tus datos.`;
        else if (command === '2')
          reply = `Abre tu pedido en ${portal('/cuenta/pedidos')} y elige Yape o Plin. Allí verás el importe exacto, titular, número y QR. Después de transferir, pulsa «Ya pagué» y reporta la operación. Caja verificará el ingreso. Una captura o un mensaje no confirma el cobro.`;
        else if (command === '3')
          reply = `${config.deliveryInfo}\n\nAtención: ${config.openingTime} a ${config.closingTime} (hora de Perú). Días: ${config.workingDays.map((day) => ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][day]).join(', ')}.\n${portal('/cobertura')}`;
        else reply = botMenu(config.welcome);
      }
      if (reply)
        await whatsappInbox.outbound(
          conversation,
          reply,
          `wa-bot:${hash(input.id).slice(0, 64)}`,
          null,
          transaction,
          optOutConfirmation,
        );
      transaction.afterCommit(publishCommunicationChange);
      return conversation;
    });
  },
  async reply(id: number, text: string, actorId: number, superAdmin: boolean, key: string) {
    return sequelize.transaction(async (transaction) => {
      const conversation = await WhatsappConversation.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!conversation) throw ApiError.notFound('Conversación no encontrada');
      if (conversation.mode !== 'HUMAN')
        throw ApiError.conflict('Toma la conversación para responder y pausar al bot.');
      if (conversation.assignedTo && conversation.assignedTo !== actorId && !superAdmin)
        throw ApiError.forbidden('La conversación está asignada a otra persona.');
      if (conversation.optedOutAt)
        throw ApiError.unprocessable(
          'El cliente desactivó los mensajes; espera a que solicite ALTA.',
        );
      if (!withinServiceWindow(conversation.lastInboundAt))
        throw ApiError.unprocessable(
          'Pasaron 24 horas sin un mensaje del cliente. Espera a que escriba nuevamente.',
        );
      const existing = await CommunicationDelivery.findOne({
        where: { idempotencyKey: `wa-agent:${id}:${key}` },
        transaction,
      });
      if (existing) return;
      await conversation.update({ assignedTo: actorId, unread: 0 }, { transaction });
      await whatsappInbox.outbound(
        conversation,
        text,
        `wa-agent:${id}:${key}`,
        actorId,
        transaction,
      );
    });
  },
  async setMode(id: number, mode: 'BOT' | 'HUMAN', actorId: number, superAdmin: boolean) {
    return sequelize.transaction(async (transaction) => {
      const conversation = await WhatsappConversation.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!conversation) throw ApiError.notFound('Conversación no encontrada');
      if (conversation.assignedTo && conversation.assignedTo !== actorId && !superAdmin)
        throw ApiError.forbidden('La conversación está asignada a otra persona.');
      await conversation.update(
        { mode, assignedTo: mode === 'HUMAN' ? actorId : null, unread: 0 },
        { transaction },
      );
      transaction.afterCommit(publishCommunicationChange);
      return conversation;
    });
  },
  async status(messageId: string, state: string, stamp: string) {
    const mapped = (
      { sent: 'ACCEPTED', delivered: 'DELIVERED', read: 'READ', failed: 'FAILED' } as Record<
        string,
        string
      >
    )[state];
    if (!mapped) return;
    await sequelize.transaction(async (transaction) => {
      const [event] = await WebhookEvent.findOrCreate({
        where: { provider: 'meta_whatsapp', eventId: hash(`${messageId}:${state}:${stamp}`) },
        transaction,
        defaults: {
          provider: 'meta_whatsapp',
          eventId: hash(`${messageId}:${state}:${stamp}`),
          eventType: 'MESSAGE_STATUS',
          payloadJson: { messageId, state: mapped },
        },
      });
      const row = await CommunicationDelivery.findOne({
        where: { providerMessageId: messageId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (row) {
        const next = monotonicDeliveryState(row.state, mapped) as typeof row.state;
        await row.update(
          {
            state: next,
            error: next === 'FAILED' ? 'WhatsApp notificó un fallo de entrega.' : null,
          },
          { transaction },
        );
        await event.update({ processedAt: new Date() }, { transaction });
      }
      transaction.afterCommit(publishCommunicationChange);
    });
  },
  async webhook(payload: unknown) {
    const { config } = await messagingConfigService.runtime();
    const body = payload as {
      object?: string;
      entry?: Array<{
        changes?: Array<{
          value?: {
            metadata?: { phone_number_id?: string };
            contacts?: Array<{ wa_id: string; profile?: { name?: string } }>;
            messages?: Array<{
              id: string;
              from: string;
              timestamp: string;
              type?: string;
              text?: { body?: string };
              button?: { text?: string };
              interactive?: { button_reply?: { id?: string }; list_reply?: { id?: string } };
            }>;
            statuses?: Array<{ id: string; status: string; timestamp: string }>;
          };
        }>;
      }>;
    };
    if (body?.object !== 'whatsapp_business_account' || !Array.isArray(body.entry))
      throw ApiError.badRequest('Evento de WhatsApp no válido');
    for (const entry of body.entry.slice(0, 100))
      for (const change of (entry.changes ?? []).slice(0, 100)) {
        const value = change.value;
        if (!config.phoneNumberId || value?.metadata?.phone_number_id !== config.phoneNumberId)
          continue;
        for (const status of (value.statuses ?? []).slice(0, 100))
          if (status.id && status.status)
            await whatsappInbox.status(status.id, status.status, status.timestamp ?? '');
        for (const message of (value.messages ?? []).slice(0, 100)) {
          if (!message.id || !/^[1-9]\d{9,14}$/.test(message.from)) continue;
          const timestamp = new Date(Number(message.timestamp) * 1000);
          if (!Number.isFinite(timestamp.getTime())) continue;
          const text =
            message.text?.body ??
            message.button?.text ??
            message.interactive?.button_reply?.id ??
            message.interactive?.list_reply?.id ??
            '[Archivo recibido. Para reportar un pago, adjunta el comprobante desde tu pedido en la web.]';
          await whatsappInbox.incoming({
            id: message.id,
            phone: message.from,
            name: value.contacts?.find((contact) => contact.wa_id === message.from)?.profile?.name,
            text,
            timestamp,
            isTest: false,
          });
        }
      }
  },
};
