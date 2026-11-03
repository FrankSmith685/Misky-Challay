import { CustomerWorkspace } from '@database/models/customerJourney.model';
import { Op, type Transaction } from 'sequelize';
import { ExperienceProject } from '@database/models/experience.model';
import { paymentAllows } from '@modules/experiences/experience.logic';
import {
  CommunicationDelivery,
  WhatsappConversation,
  WhatsappMessage,
  type DeliveryState,
} from '@database/models/messaging.model';
import {
  CakeDesignRequest,
  MobilePaymentClaim,
  Notification,
  Order,
  Payment,
  User,
  WebhookEvent,
  sequelize,
} from '@database/models';
import { settingsService } from '@modules/settings/settings.service';
import { getMailProvider } from '@integrations/mail';
import { logger } from '@config/logger';
import { whatsappRecipient } from '@shared/utils/whatsappPhone';
import { messagingConfigService, type CommunicationEvent } from './communications.config';
import {
  escapeMessageHtml,
  monotonicDeliveryState,
  withinServiceWindow,
} from './communications.logic';
import { publishCommunicationChange } from './communications.events';
import { orderCommunicationIsRelevant } from './orderCommunications.logic';
import {
  FOLLOWUP_EVENTS,
  paymentFollowupSkipReason,
  type PaymentFollowupEvent,
} from './paymentFollowup.logic';
import { paymentFollowupState } from './paymentFollowup.state';

type Enqueue = {
  channel: 'EMAIL' | 'WHATSAPP';
  recipient: string;
  subject: string;
  event: string;
  payload: Record<string, unknown>;
  key: string;
  orderId?: number | null;
  userId?: number | null;
  messageId?: number;
  simulation?: boolean;
  transaction?: Transaction;
};
class DispatchError extends Error {
  constructor(
    message: string,
    readonly disposition: 'FAILED' | 'QUEUED' | 'UNKNOWN' | 'BLOCKED' | 'SKIPPED',
  ) {
    super(message);
  }
}

export const communicationQueue = {
  async enqueue(input: Enqueue) {
    const { config } = await messagingConfigService.runtime();
    const rule = config.events[input.event as CommunicationEvent];
    const payload = { ...input.payload };
    if (input.channel === 'EMAIL' && rule?.emailText) {
      const variables: Record<string, string> = {
        mensaje: String(payload.text ?? ''),
        enlace: '',
        ...((payload.variables as Record<string, string>) ?? {}),
      };
      const text = rule.emailText.replace(
        /\{\{\s*(\w+)\s*\}\}/g,
        (_match, name: string) => variables[name] ?? '',
      );
      payload.text = text;
      payload.html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>${escapeMessageHtml(input.subject)}</h2><p>${escapeMessageHtml(text).replace(/\n/g, '<br>')}</p></div>`;
    }
    const disabled = rule && !(input.channel === 'EMAIL' ? rule.email : rule.whatsapp);
    const [row] = await CommunicationDelivery.findOrCreate({
      where: { idempotencyKey: input.key },
      transaction: input.transaction,
      defaults: {
        channel: input.channel,
        recipient: input.recipient,
        subject: input.subject.slice(0, 200),
        event: input.event,
        payload,
        idempotencyKey: input.key,
        simulation: input.simulation ?? config.testMode,
        state: disabled ? 'SKIPPED' : 'QUEUED',
        orderId: input.orderId ?? null,
        userId: input.userId ?? null,
        messageId: input.messageId ?? null,
        nextAttemptAt: new Date(),
        error: disabled ? 'Este evento está desactivado para el canal.' : null,
      },
    });
    if (input.transaction) input.transaction.afterCommit(publishCommunicationChange);
    else publishCommunicationChange();
    return row;
  },
  async process(limit = 10, onlySimulation = false) {
    await communicationQueue.reconcileStatuses();
    // Nunca se reenvía automáticamente un intento cuyo resultado externo se desconoce.
    await CommunicationDelivery.update(
      {
        state: 'UNKNOWN',
        error:
          'El proceso se interrumpió durante el envío. Comprueba el historial antes de reintentar.',
        lockedAt: null,
      },
      { where: { state: 'PROCESSING', lockedAt: { [Op.lt]: new Date(Date.now() - 3 * 60000) } } },
    );
    for (let i = 0; i < limit; i++) {
      const row = await sequelize.transaction(async (transaction) => {
        const found = await CommunicationDelivery.findOne({
          where: {
            state: 'QUEUED',
            ...(onlySimulation ? { simulation: true } : {}),
            nextAttemptAt: { [Op.lte]: new Date() },
          },
          order: [['id', 'ASC']],
          transaction,
          lock: transaction.LOCK.UPDATE,
          skipLocked: true,
        });
        if (!found) return null;
        await found.update(
          { state: 'PROCESSING', lockedAt: new Date(), attempts: found.attempts + 1 },
          { transaction },
        );
        return found;
      });
      if (!row) break;
      try {
        await communicationQueue.dispatch(row);
      } catch (error) {
        const disposition = error instanceof DispatchError ? error.disposition : 'UNKNOWN';
        const retry = disposition === 'QUEUED' && row.attempts < 5;
        await row.update({
          state: retry ? 'QUEUED' : disposition === 'QUEUED' ? 'FAILED' : disposition,
          error: (error instanceof DispatchError
            ? error.message
            : 'No se pudo confirmar el resultado del envío; revisa antes de reintentar.'
          ).slice(0, 500),
          lockedAt: null,
          nextAttemptAt: new Date(Date.now() + Math.min(900, 30 * 2 ** row.attempts) * 1000),
        });
      }
      publishCommunicationChange();
    }
  },
  async dispatch(row: CommunicationDelivery) {
    if (row.userId && (row.payload.customerNotice === true || row.channel === 'WHATSAPP' && row.event !== 'CONVERSATION' && row.event !== 'TEST')) {
      const prefs = (await CustomerWorkspace.findByPk(row.userId))?.channelsJson;
      if (prefs && (row.channel === 'WHATSAPP' ? !prefs.whatsapp : !prefs.email)) throw new DispatchError('Canal desactivado por el cliente.', 'SKIPPED');
    }
    const runtime = await messagingConfigService.runtime();
    const { config } = runtime;
    if (!config.enabled)
      throw new DispatchError('Los envíos están pausados desde Comunicaciones.', 'BLOCKED');
    const rule = config.events[row.event as CommunicationEvent];
    if (rule && !(row.channel === 'EMAIL' ? rule.email : rule.whatsapp))
      throw new DispatchError('El aviso está desactivado para este canal.', 'SKIPPED');
    const communication = await settingsService.getCommunicationSettings();
    if (FOLLOWUP_EVENTS.includes(row.event as PaymentFollowupEvent)) {
      if (!communication.orderUpdatesEnabled)
        throw new DispatchError('Los avisos de pedidos están desactivados.', 'SKIPPED');
      const event = row.event as PaymentFollowupEvent;
      if (!row.orderId || !row.payload.paymentId)
        throw new DispatchError('El aviso no tiene un pedido y un pago válidos.', 'SKIPPED');
      let context = await paymentFollowupState.read(row.orderId);
      let skip = paymentFollowupSkipReason(event, context, Number(row.payload.paymentId), config);
      if (skip) throw new DispatchError(skip, 'SKIPPED');
      try {
        if (!context || !(await paymentFollowupState.verifyProvider(context)))
          throw new Error('Resultado de pago sin confirmar');
      } catch {
        throw new DispatchError(
          'No se pudo confirmar el estado del pago con la pasarela; se aplaza el aviso.',
          'QUEUED',
        );
      }
      context = await paymentFollowupState.read(row.orderId);
      skip = paymentFollowupSkipReason(event, context, Number(row.payload.paymentId), config);
      if (skip) throw new DispatchError(skip, 'SKIPPED');
      const user = context?.order.userId ? await User.findByPk(context.order.userId) : null;
      if (
        !user ||
        user.status !== 'ACTIVE' ||
        Number(row.userId) !== Number(user.id) ||
        (row.channel === 'EMAIL' && user.email !== row.recipient)
      )
        throw new DispatchError('La cuenta o el destinatario del pedido cambiaron.', 'SKIPPED');
    }
    if (row.orderId) {
      const order = await Order.findByPk(row.orderId);
      if (!order) throw new DispatchError('El pedido ya no está disponible.', 'SKIPPED');
      if (row.event.startsWith('EXPERIENCE_')) {
        const customer = order.userId ? await User.findByPk(order.userId) : null;
        if (!customer || customer.status !== 'ACTIVE' || customer.id !== row.userId || (row.channel === 'EMAIL' && customer.email !== row.recipient)) throw new DispatchError('La cuenta o el destinatario de la experiencia cambió.', 'SKIPPED');
        const project = await ExperienceProject.findByPk(Number(row.payload.experienceId));
        const expectedStatus = row.event === 'EXPERIENCE_REVIEW_READY' ? 'AWAITING_APPROVAL' : 'PUBLISHED';
        if (!project || project.orderId !== order.id || project.version !== row.payload.experienceVersion || project.status !== expectedStatus || !paymentAllows(order, project.packageSnapshotJson.paymentRequirement)) throw new DispatchError('La propuesta o su publicación cambió; se omite este aviso anterior.', 'SKIPPED');
        const expires = row.event === 'EXPERIENCE_REVIEW_READY' ? project.previewExpiresAt : project.expiresAt;
        if (!expires || expires.getTime() <= Date.now()) throw new DispatchError('El acceso de esta experiencia venció.', 'SKIPPED');
      }
      if (row.event.startsWith('ORDER_') && !orderCommunicationIsRelevant(row.event, order.status))
        throw new DispatchError(
          'El pedido ya avanzó a otro estado; se omite este aviso anterior.',
          'SKIPPED',
        );
      if (row.payload.paymentId) {
        const paymentId = Number(row.payload.paymentId);
        const payment = await Payment.findByPk(paymentId);
        const claim = await MobilePaymentClaim.findOne({ where: { paymentId } });
        if (
          row.event === 'PAYMENT_PENDING' &&
          (payment?.status !== 'PENDING' ||
            claim ||
            ['CANCELLED', 'REFUNDED'].includes(order.status))
        )
          throw new DispatchError('El pago ya fue reportado o resuelto.', 'SKIPPED');
        if (row.event === 'PAYMENT_REPORTED' && claim?.status !== 'PENDING')
          throw new DispatchError('El reporte ya fue revisado.', 'SKIPPED');
        if (row.event === 'PAYMENT_OBSERVED' && claim?.status !== 'OBSERVED')
          throw new DispatchError('La observación ya fue corregida o resuelta.', 'SKIPPED');
      }
    }
    if (row.channel === 'EMAIL' && !communication.emailNotificationsEnabled)
      throw new DispatchError('El correo está desactivado.', 'SKIPPED');
    if (row.channel === 'WHATSAPP') {
      if (row.userId) {
        const user = await User.findByPk(row.userId);
        if (user?.status !== 'ACTIVE' || whatsappRecipient(user.phone) !== row.recipient)
          throw new DispatchError(
            'El celular de la cuenta cambió o la cuenta no está activa.',
            'SKIPPED',
          );
      }
      if (row.payload.designRequestId) {
        const design = await CakeDesignRequest.findByPk(Number(row.payload.designRequestId));
        if (!design?.whatsappOptInAt)
          throw new DispatchError('Los avisos de esta solicitud fueron desactivados.', 'SKIPPED');
      }
      if (
        row.event !== 'CONVERSATION' &&
        row.event !== 'TEST' &&
        !communication.whatsappUpdatesEnabled
      )
        throw new DispatchError(
          'Los avisos de WhatsApp están desactivados en Correo y avisos.',
          'BLOCKED',
        );
      const conversation = await WhatsappConversation.findOne({
        where: { phone: row.recipient, isTest: Boolean(row.payload.isTest) },
      });
      if (conversation?.optedOutAt && !row.payload.optOutConfirmation)
        throw new DispatchError('El destinatario desactivó los avisos.', 'SKIPPED');
      if (row.orderId) {
        const order = await Order.findByPk(row.orderId);
        if (!order?.whatsappOptInAt)
          throw new DispatchError('No hay consentimiento vigente para este pedido.', 'SKIPPED');
      }
      if (row.payload.kind === 'text' && !withinServiceWindow(conversation?.lastInboundAt))
        throw new DispatchError(
          'Pasaron 24 horas desde el último mensaje del cliente. Espera su respuesta o usa una plantilla aprobada.',
          'BLOCKED',
        );
    }
    if (row.simulation || config.testMode) {
      await row.update({ state: 'SIMULATED', error: null, lockedAt: null });
      return;
    }
    let providerMessageId: string;
    if (row.channel === 'WHATSAPP') {
      if (!runtime.accessToken || !config.phoneNumberId || !config.graphVersion)
        throw new DispatchError('Completa la conexión de Meta en Comunicaciones.', 'BLOCKED');
      const template = String(row.payload.template || rule?.template || '');
      if (row.payload.kind !== 'text' && !template)
        throw new DispatchError('Configura una plantilla aprobada para este evento.', 'BLOCKED');
      const payload =
        row.payload.kind === 'text'
          ? { type: 'text', text: { body: String(row.payload.text ?? ''), preview_url: false } }
          : {
              type: 'template',
              template: {
                name: template,
                language: { code: config.language },
                components: [
                  {
                    type: 'body',
                    parameters: ((row.payload.parameters as string[]) ?? []).map((text) => ({
                      type: 'text',
                      text,
                    })),
                  },
                ],
              },
            };
      const response = await fetch(
        `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${runtime.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ messaging_product: 'whatsapp', to: row.recipient, ...payload }),
          signal: AbortSignal.timeout(10000),
        },
      );
      const result = (await response.json()) as {
        messages?: Array<{ id: string }>;
        error?: { code?: number };
      };
      if (!response.ok)
        throw new DispatchError(
          `Meta rechazó el envío (HTTP ${response.status}, código ${result.error?.code ?? 'sin código'}).`,
          response.status === 429 || response.status >= 500 ? 'QUEUED' : 'FAILED',
        );
      if (!result.messages?.[0]?.id)
        throw new DispatchError('Meta no devolvió un identificador de mensaje.', 'UNKNOWN');
      providerMessageId = result.messages[0].id;
    } else {
      if (!communication.smtpHost)
        throw new DispatchError(
          'Configura SMTP en Correo y avisos para enviar correos reales.',
          'BLOCKED',
        );
      try {
        const result = await getMailProvider({
          host: communication.smtpHost,
          port: communication.smtpPort,
          secure: communication.smtpSecure,
          user: communication.smtpUser || undefined,
          password: communication.smtpPassword,
          fromEmail: communication.fromEmail,
          fromName: communication.fromName,
          replyToEmail: communication.replyToEmail || undefined,
        }).send({
          to: row.recipient,
          subject: row.subject,
          html: String(row.payload.html ?? ''),
          text: String(row.payload.text ?? ''),
        });
        providerMessageId = result.messageId;
      } catch (error) {
        const smtpCode = (error as { responseCode?: number }).responseCode;
        throw new DispatchError(
          smtpCode
            ? `SMTP rechazó el mensaje (${smtpCode}).`
            : 'No se pudo confirmar la respuesta de SMTP.',
          smtpCode ? (smtpCode < 500 ? 'QUEUED' : 'FAILED') : 'UNKNOWN',
        );
      }
    }
    // Un callback de Meta puede adelantarse a esta escritura. No se degrada su estado.
    await sequelize.transaction(async (transaction) => {
      await row.reload({ transaction, lock: transaction.LOCK.UPDATE });
      await row.update(
        {
          providerMessageId,
          state: ['DELIVERED', 'READ'].includes(row.state) ? row.state : 'ACCEPTED',
          acceptedAt: new Date(),
          error: null,
          lockedAt: null,
        },
        { transaction },
      );
      if (row.messageId)
        await WhatsappMessage.update(
          { providerMessageId },
          { where: { id: row.messageId }, transaction },
        );
      await Notification.findOrCreate({
        where: { idempotencyKey: `delivery:${row.id}` },
        transaction,
        defaults: {
          userId: null,
          orderId: row.orderId,
          channel: row.channel,
          template: row.event,
          recipient: row.recipient,
          subject: row.subject,
          status: 'SENT',
          provider: row.channel === 'WHATSAPP' ? 'meta_cloud_api' : 'smtp',
          providerMessageId,
          idempotencyKey: `delivery:${row.id}`,
          sentAt: new Date(),
        },
      });
    });
  },
  async retry(id: number, acknowledgeUnknown = false) {
    return sequelize.transaction(async (transaction) => {
      const row = await CommunicationDelivery.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!row || !['FAILED', 'BLOCKED', 'UNKNOWN'].includes(row.state)) return false;
      if (row.state === 'UNKNOWN' && !acknowledgeUnknown) return false;
      await row.update(
        { state: 'QUEUED', attempts: 0, error: null, nextAttemptAt: new Date(), lockedAt: null },
        { transaction },
      );
      return true;
    });
  },
  async reconcileStatuses() {
    const pending = await WebhookEvent.findAll({
      where: { provider: 'meta_whatsapp', processedAt: null, eventType: 'MESSAGE_STATUS' },
      order: [['id', 'ASC']],
      limit: 100,
    });
    for (const event of pending)
      await sequelize.transaction(async (transaction) => {
        const locked = await WebhookEvent.findByPk(event.id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!locked || locked.processedAt) return;
        const messageId = String(locked.payloadJson?.messageId ?? '');
        const state = String(locked.payloadJson?.state ?? '');
        const row = await CommunicationDelivery.findOne({
          where: { providerMessageId: messageId },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (row) {
          const next = monotonicDeliveryState(row.state, state) as DeliveryState;
          await row.update(
            {
              state: next,
              error: next === 'FAILED' ? 'WhatsApp notificó un fallo de entrega.' : null,
            },
            { transaction },
          );
        }
        if (row || locked.createdAt.getTime() < Date.now() - 3600000)
          await locked.update({ processedAt: new Date() }, { transaction });
      });
  },
};

let processing = false;
export const processCommunicationQueue = async () => {
  if (processing) return;
  processing = true;
  try {
    await communicationQueue.process();
  } catch (error) {
    logger.error('No se pudo procesar la cola de comunicaciones', error);
  } finally {
    processing = false;
  }
};
