import { monitorStreamSession } from '@modules/notifications/activityStream';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { Op } from 'sequelize';
import { z } from 'zod';
import {
  CommunicationDelivery,
  WhatsappConversation,
  WhatsappMessage,
} from '@database/models/messaging.model';
import { PERMISSIONS } from '@config/constants';
import { authenticate } from '@middlewares/auth.middleware';
import {
  requireAnyPermission,
  requirePermissions,
  requireSuperAdmin,
} from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import { ApiError } from '@shared/errors/ApiError';
import { ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { audit } from '@shared/utils/audit';
import { whatsappRecipient } from '@shared/utils/whatsappPhone';
import { settingsService } from '@modules/settings/settings.service';
import { messagingConfigService, messagingUpdateSchema } from './communications.config';
import { validWebhookSignature } from './communications.logic';
import { communicationQueue } from './communications.queue';
import { whatsappInbox } from './whatsapp.inbox';
import { subscribeCommunicationChanges } from './communications.events';

const router = Router();
router.get(
  '/webhook',
  asyncHandler(async (req, res) => {
    const { verifyToken } = await messagingConfigService.runtime();
    if (
      !verifyToken ||
      req.query['hub.mode'] !== 'subscribe' ||
      req.query['hub.verify_token'] !== verifyToken ||
      typeof req.query['hub.challenge'] !== 'string'
    )
      throw ApiError.forbidden('Verificación de webhook no válida');
    res.status(200).type('text/plain').send(req.query['hub.challenge']);
  }),
);
router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const { appSecret } = await messagingConfigService.runtime();
    if (
      !Buffer.isBuffer(req.body) ||
      !validWebhookSignature(req.body, req.get('x-hub-signature-256'), appSecret)
    )
      throw ApiError.unauthorized('Firma de webhook no válida');
    let payload: unknown;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      throw ApiError.badRequest('JSON no válido');
    }
    await whatsappInbox.webhook(payload);
    res.sendStatus(200);
  }),
);

router.use(authenticate, (req, _res, next) => {
  // Una conversación del número central puede contener pedidos de varias sedes.
  if (!req.user?.isSuperAdmin && req.user?.branchIds?.length)
    return next(
      ApiError.forbidden(
        'La bandeja central requiere un permiso de comunicaciones con alcance global.',
      ),
    );
  next();
});
router.get(
  '/events',
  requireAnyPermission(PERMISSIONS.COMMUNICATION_READ, PERMISSIONS.COMMUNICATION_REPLY),
  (req, res) => {
    monitorStreamSession(req, res);
    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    const send = () => {
      res.write('event: change\ndata: {}\n\n');
      (res as typeof res & { flush?: () => void }).flush?.();
    };
    send();
    const unsubscribe = subscribeCommunicationChanges(send);
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
      (res as typeof res & { flush?: () => void }).flush?.();
    }, 15000);
    const rotate = setTimeout(() => res.end(), 10 * 60000);
    res.once('close', () => {
      unsubscribe();
      clearInterval(heartbeat);
      clearTimeout(rotate);
    });
  },
);
router.get(
  '/settings',
  requireSuperAdmin,
  asyncHandler(async (_req, res) => {
    const communication = await settingsService.getCommunicationSettings();
    return ok(res, {
      ...(await messagingConfigService.admin()),
      smtpConfigured: Boolean(communication.smtpHost),
      whatsappUpdatesEnabled: communication.whatsappUpdatesEnabled,
      emailNotificationsEnabled: communication.emailNotificationsEnabled,
      webhookPath: '/api/v1/communications/webhook',
    });
  }),
);
router.put(
  '/settings',
  requireSuperAdmin,
  validate(z.object({ body: messagingUpdateSchema })),
  asyncHandler(async (req, res) => {
    const result = await messagingConfigService.update(req.body, req.user!.sub);
    await audit(req, {
      action: 'communications.settings.update',
      entity: 'messaging_settings',
      entityId: 1,
      after: {
        config: result.config,
        accessTokenConfigured: result.accessTokenConfigured,
        appSecretConfigured: result.appSecretConfigured,
      },
    });
    return ok(res, result, 'Configuración de comunicaciones guardada');
  }),
);
router.post(
  '/connection/check',
  requireSuperAdmin,
  asyncHandler(async (_req, res) => {
    const { config, accessToken } = await messagingConfigService.runtime();
    if (!accessToken || !config.phoneNumberId || !config.graphVersion)
      throw ApiError.unprocessable(
        'Guarda el token, el identificador del número y la versión Graph antes de verificar.',
      );
    const response = await fetch(
      `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10000) },
    );
    const result = (await response.json()) as {
      display_phone_number?: string;
      verified_name?: string;
      error?: { code?: number };
    };
    if (!response.ok || !result.display_phone_number)
      throw ApiError.badRequest(
        `Meta no pudo verificar el número (HTTP ${response.status}, código ${result.error?.code ?? 'sin código'}). Revisa el token y sus permisos.`,
      );
    const digits = result.display_phone_number.replace(/\D/g, '');
    return ok(
      res,
      {
        displayPhone: result.display_phone_number,
        verifiedName: result.verified_name ?? '',
        matchesSupportPhone: digits === `51${config.supportPhone}`,
      },
      'Conexión consultada; no se enviaron mensajes',
    );
  }),
);
router.get(
  '/deliveries',
  requireAnyPermission(PERMISSIONS.COMMUNICATION_READ, PERMISSIONS.COMMUNICATION_REPLY),
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        page: z.coerce.number().int().min(1).max(10000).default(1),
        state: z.string().max(20).optional(),
        channel: z.enum(['EMAIL', 'WHATSAPP']).optional(),
        event: z.string().max(60).optional(),
      })
      .parse(req.query);
    const result = await CommunicationDelivery.findAndCountAll({
      where: {
        ...(query.state ? { state: query.state } : {}),
        ...(query.channel ? { channel: query.channel } : {}),
        ...(query.event ? { event: query.event } : {}),
      },
      attributes: { exclude: ['payload', 'lockedAt'] },
      order: [['id', 'DESC']],
      limit: 30,
      offset: (query.page - 1) * 30,
    });
    return ok(res, { items: result.rows, total: result.count, page: query.page, pageSize: 30 });
  }),
);
router.post(
  '/deliveries/:id/retry',
  requirePermissions(PERMISSIONS.COMMUNICATION_REPLY),
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({ acknowledgeUnknown: z.boolean().default(false) }).parse(req.body);
    if (!(await communicationQueue.retry(id, body.acknowledgeUnknown)))
      throw ApiError.conflict(
        'Este aviso no admite reintento, o requiere confirmar que ya comprobaste el envío anterior.',
      );
    await audit(req, {
      action: 'communications.retry',
      entity: 'communication_deliveries',
      entityId: id,
      after: body,
    });
    return ok(res, null, 'Aviso en cola para reintentar');
  }),
);
router.get(
  '/conversations',
  requireAnyPermission(PERMISSIONS.COMMUNICATION_READ, PERMISSIONS.COMMUNICATION_REPLY),
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        search: z.string().trim().max(100).default(''),
        page: z.coerce.number().int().min(1).max(10000).default(1),
        mode: z.enum(['BOT', 'HUMAN']).optional(),
      })
      .parse(req.query);
    const result = await WhatsappConversation.findAndCountAll({
      where: {
        ...(query.mode ? { mode: query.mode } : {}),
        ...(query.search
          ? {
              [Op.or]: [
                { phone: { [Op.like]: `%${query.search}%` } },
                { name: { [Op.like]: `%${query.search}%` } },
              ],
            }
          : {}),
      },
      order: [
        ['updatedAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: 30,
      offset: (query.page - 1) * 30,
    });
    return ok(res, { items: result.rows, total: result.count, page: query.page, pageSize: 30 });
  }),
);
router.get(
  '/conversations/:id',
  requireAnyPermission(PERMISSIONS.COMMUNICATION_READ, PERMISSIONS.COMMUNICATION_REPLY),
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const before = z.coerce.number().int().positive().optional().parse(req.query.before);
    const conversation = await WhatsappConversation.findByPk(id);
    if (!conversation) throw ApiError.notFound('Conversación no encontrada');
    const messages = await WhatsappMessage.findAll({
      where: { conversationId: id, ...(before ? { id: { [Op.lt]: before } } : {}) },
      order: [['id', 'DESC']],
      limit: 51,
    });
    const visible = messages.slice(0, 50).reverse();
    const deliveries = visible.length
      ? await CommunicationDelivery.findAll({
          where: { messageId: { [Op.in]: visible.map((message) => message.id) } },
          attributes: ['messageId', 'state'],
        })
      : [];
    return ok(res, {
      conversation,
      messages: visible.map((message) => ({
        ...message.toJSON(),
        state:
          deliveries.find((delivery) => delivery.messageId === message.id)?.state ??
          (message.direction === 'IN' ? 'RECEIVED' : 'QUEUED'),
      })),
      hasMore: messages.length > 50,
    });
  }),
);
router.post(
  '/conversations/:id/mode',
  requirePermissions(PERMISSIONS.COMMUNICATION_REPLY),
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { mode } = z.object({ mode: z.enum(['BOT', 'HUMAN']) }).parse(req.body);
    const conversation = await whatsappInbox.setMode(
      id,
      mode,
      req.user!.sub,
      Boolean(req.user!.isSuperAdmin),
    );
    await audit(req, {
      action: 'communications.conversation.mode',
      entity: 'whatsapp_conversations',
      entityId: id,
      after: { mode },
    });
    return ok(res, conversation);
  }),
);
router.post(
  '/conversations/:id/reply',
  requirePermissions(PERMISSIONS.COMMUNICATION_REPLY),
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { text, key } = z
      .object({ text: z.string().trim().min(1).max(4000), key: z.string().uuid() })
      .parse(req.body);
    await whatsappInbox.reply(id, text, req.user!.sub, Boolean(req.user!.isSuperAdmin), key);
    await audit(req, {
      action: 'communications.conversation.reply',
      entity: 'whatsapp_conversations',
      entityId: id,
    });
    return ok(res, null, 'Respuesta en cola');
  }),
);
router.post(
  '/test/incoming',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const { config } = await messagingConfigService.runtime();
    if (!config.testMode)
      throw ApiError.unprocessable('Activa el modo de prueba para simular conversaciones.');
    const body = z
      .object({ phone: z.string().trim().max(30), text: z.string().trim().min(1).max(1000) })
      .parse(req.body);
    const phone = whatsappRecipient(body.phone);
    if (!phone) throw ApiError.badRequest('Ingresa un celular válido de Perú');
    const conversation = await whatsappInbox.incoming({
      id: `simulation:${randomUUID()}`,
      phone,
      text: body.text,
      name: 'Conversación de prueba',
      timestamp: new Date(),
      isTest: true,
    });
    await communicationQueue.process(10, true);
    return ok(res, { conversationId: conversation.id }, 'Mensaje simulado sin envíos externos');
  }),
);
router.post(
  '/test/delivery',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const body = z
      .object({ channel: z.enum(['EMAIL', 'WHATSAPP']), recipient: z.string().trim().max(160) })
      .parse(req.body);
    const { config } = await messagingConfigService.runtime();
    const recipient =
      body.channel === 'EMAIL'
        ? z.string().email().parse(body.recipient)
        : whatsappRecipient(body.recipient);
    if (!recipient) throw ApiError.badRequest('Ingresa un destinatario válido');
    const text =
      'Prueba de comunicaciones de Misky Challay. Este mensaje no confirma un pago ni crea un pedido.';
    const row = await communicationQueue.enqueue({
      channel: body.channel,
      recipient,
      subject: 'Prueba de comunicaciones de Misky Challay',
      event: 'TEST',
      key: `test:${randomUUID()}`,
      payload: {
        text,
        html: `<p>${text}</p>`,
        kind: 'template',
        template: config.events.ORDER_CONFIRMED?.template,
        parameters: [
          'PRUEBA',
          new URL('/cuenta/pedidos', (await import('@config/env')).env.FRONTEND_URL).toString(),
        ],
      },
    });
    if (config.testMode) await communicationQueue.process(10, true);
    await audit(req, {
      action: 'communications.test',
      entity: 'communication_deliveries',
      entityId: row.id,
      after: { channel: row.channel, simulation: row.simulation },
    });
    return ok(
      res,
      { deliveryId: row.id, simulation: row.simulation },
      row.simulation
        ? 'Prueba registrada; no se enviaron mensajes reales'
        : 'Prueba en cola para envío real',
    );
  }),
);
export default router;
