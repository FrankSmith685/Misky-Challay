import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { MessagingSetting } from '@database/models/messaging.model';
import { env } from '@config/env';
import { decryptSetting, encryptSetting } from '@shared/security/settingsEncryption';
import { ApiError } from '@shared/errors/ApiError';

export const COMMUNICATION_EVENTS = [
  'PAYMENT_PENDING',
  'PAYMENT_REMINDER',
  'PAYMENT_FAILED',
  'PAYMENT_EXPIRED',
  'PAYMENT_REPORTED',
  'PAYMENT_OBSERVED',
  'PAYMENT_APPROVED',
  'PAYMENT_REJECTED',
  'PAYMENT_REFUNDED',
  'EXPERIENCE_REVIEW_READY',
  'EXPERIENCE_PUBLISHED',
  'ORDER_RECEIVED',
  'ORDER_CONFIRMED',
  'ORDER_PREPARING',
  'ORDER_READY',
  'ORDER_OUT_FOR_DELIVERY',
  'ORDER_DELIVERED',
  'ORDER_CANCELLED',
  'DESIGN_QUOTED',
] as const;
export type CommunicationEvent = (typeof COMMUNICATION_EVENTS)[number];
export const eventRule = z.object({
  email: z.boolean(),
  whatsapp: z.boolean(),
  template: z
    .string()
    .trim()
    .max(60)
    .regex(/^[a-z0-9_]*$/),
  emailText: z.string().trim().max(2000).default(''),
});
export const messagingConfigSchema = z.object({
  enabled: z.boolean(),
  testMode: z.boolean(),
  supportPhone: z
    .string()
    .trim()
    .regex(/^9\d{8}$/),
  botEnabled: z.boolean(),
  paymentReminders: z
    .object({
      enabled: z.boolean().default(false),
      delayMinutes: z.number().int().min(1).max(60).default(5),
      activatedAt: z.string().datetime().nullable().default(null),
    })
    .default({ enabled: false, delayMinutes: 5, activatedAt: null }),
  phoneNumberId: z.string().trim().max(60).regex(/^\d*$/),
  graphVersion: z
    .string()
    .trim()
    .regex(/^(v\d+\.\d+)?$/),
  language: z
    .string()
    .trim()
    .regex(/^[a-z]{2,3}(_[A-Z]{2})?$/),
  welcome: z.string().trim().min(3).max(1000),
  deliveryInfo: z.string().trim().min(3).max(1000),
  humanReply: z.string().trim().min(3).max(1000),
  closedReply: z.string().trim().min(3).max(1000),
  openingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  closingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  workingDays: z.array(z.number().int().min(0).max(6)).max(7),
  events: z.record(z.enum(COMMUNICATION_EVENTS), eventRule),
});
export type MessagingConfig = z.infer<typeof messagingConfigSchema>;

const missingWhatsappTemplates = (config: MessagingConfig): string[] =>
  Object.entries(config.events)
    .filter(([, rule]) => rule.whatsapp && !rule.template.trim())
    .map(([event]) => event);

const readiness = (config: MessagingConfig, accessToken: string, appSecret: string) => {
  const connectionReady = Boolean(accessToken && config.phoneNumberId && config.graphVersion);
  const webhookReady = Boolean(appSecret);
  const missingTemplates = missingWhatsappTemplates(config);
  return {
    connectionReady,
    webhookReady,
    templatesReady: missingTemplates.length === 0,
    missingWhatsappTemplates: missingTemplates,
    readyToSend: connectionReady && webhookReady && missingTemplates.length === 0,
  };
};
export const messagingUpdateSchema = z.object({
  config: messagingConfigSchema,
  accessToken: z.string().trim().max(4000).optional(),
  appSecret: z.string().trim().max(500).optional(),
  clearAccessToken: z.boolean().optional(),
  clearAppSecret: z.boolean().optional(),
  rotateVerifyToken: z.boolean().optional(),
});
const defaults = (): MessagingConfig => ({
  enabled: true,
  testMode: true,
  supportPhone: '926749330',
  botEnabled: true,
  paymentReminders: { enabled: false, delayMinutes: 5, activatedAt: null },
  phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID ?? '',
  graphVersion: env.WHATSAPP_GRAPH_API_VERSION ?? '',
  language: env.WHATSAPP_TEMPLATE_LANGUAGE,
  welcome: 'Hola, somos Misky Challay. ¿En qué podemos ayudarte?',
  deliveryInfo:
    'Calculamos el costo de delivery según tu dirección antes de pagar. También puedes recoger tu pedido en el taller. Consulta las opciones y horarios en la web.',
  humanReply:
    'Te atenderá una persona de nuestro equipo. Déjanos tu consulta y el número de pedido, si lo tienes.',
  closedReply:
    'Ahora estamos fuera del horario de atención. Dejamos tu consulta pendiente para que el equipo te responda al volver.',
  openingTime: '09:00',
  closingTime: '19:00',
  workingDays: [1, 2, 3, 4, 5, 6],
  events: Object.fromEntries(
    COMMUNICATION_EVENTS.map((event) => [
      event,
      {
        email: true,
        whatsapp: true,
        template:
          (
            {
              ORDER_CONFIRMED: env.WHATSAPP_TEMPLATE_ORDER_CONFIRMED,
              ORDER_READY: env.WHATSAPP_TEMPLATE_ORDER_READY,
              ORDER_OUT_FOR_DELIVERY: env.WHATSAPP_TEMPLATE_ORDER_OUT_FOR_DELIVERY,
              DESIGN_QUOTED: env.WHATSAPP_TEMPLATE_DESIGN_QUOTED,
            } as Record<string, string | undefined>
          )[event] ?? '',
      },
    ]),
  ),
});
export const messagingConfigService = {
  async public() {
    const row = await MessagingSetting.findByPk(1, { attributes: ['config'] });
    return {
      supportPhone:
        typeof row?.config.supportPhone === 'string'
          ? row.config.supportPhone
          : defaults().supportPhone,
    };
  },
  async runtime() {
    const row = await MessagingSetting.findByPk(1);
    const base = defaults();
    const config = row
      ? messagingConfigSchema.parse({
          ...base,
          ...row.config,
          events: { ...base.events, ...((row.config.events as object) ?? {}) },
        })
      : base;
    const secret = (key: string, fallback = '') =>
      row?.secrets?.[key] !== undefined
        ? row.secrets[key]
          ? decryptSetting(row.secrets[key])
          : ''
        : fallback;
    return {
      config,
      accessToken: secret('accessToken', env.WHATSAPP_ACCESS_TOKEN),
      appSecret: secret('appSecret'),
      verifyToken: secret('verifyToken'),
      updatedAt: row?.updatedAt ?? null,
    };
  },
  async admin() {
    const runtime = await messagingConfigService.runtime();
    const status = readiness(runtime.config, runtime.accessToken, runtime.appSecret);
    return {
      config: runtime.config,
      accessTokenConfigured: Boolean(runtime.accessToken),
      appSecretConfigured: Boolean(runtime.appSecret),
      verifyToken: runtime.verifyToken,
      connectionReady: status.connectionReady,
      webhookReady: status.webhookReady && Boolean(runtime.verifyToken),
      templatesReady: status.templatesReady,
      missingWhatsappTemplates: status.missingWhatsappTemplates,
      readyToSend: status.readyToSend && Boolean(runtime.verifyToken),
      updatedAt: runtime.updatedAt,
    };
  },
  async update(input: z.infer<typeof messagingUpdateSchema>, actorId: number, whatsappEnabled = true) {
    const [row] = await MessagingSetting.findOrCreate({
      where: { id: 1 },
      defaults: { id: 1, config: defaults() },
    });
    const secrets = { ...row.secrets };
    for (const key of ['accessToken', 'appSecret'] as const) {
      if (input[key]) secrets[key] = encryptSetting(input[key]!);
      if (input[key === 'accessToken' ? 'clearAccessToken' : 'clearAppSecret']) secrets[key] = '';
    }
    if (!secrets.verifyToken || input.rotateVerifyToken)
      secrets.verifyToken = encryptSetting(randomBytes(24).toString('hex'));
    const previousConfig = row.config as Partial<MessagingConfig> | undefined;
    const activatingReal =
      input.config.enabled &&
      !input.config.testMode &&
      (!previousConfig || previousConfig.testMode !== false || previousConfig.enabled !== true);
    if (activatingReal && whatsappEnabled) {
      const accessToken = input.accessToken?.trim()
        ? input.accessToken.trim()
        : secrets.accessToken
          ? decryptSetting(secrets.accessToken)
          : '';
      const appSecret = input.appSecret?.trim()
        ? input.appSecret.trim()
        : secrets.appSecret
          ? decryptSetting(secrets.appSecret)
          : '';
      const status = readiness(input.config, accessToken, appSecret);
      if (!status.readyToSend || !secrets.verifyToken) {
        const problems = [
          !status.connectionReady ? 'la conexión con Meta' : '',
          !status.webhookReady || !secrets.verifyToken ? 'el webhook' : '',
          !status.templatesReady ? `las plantillas: ${status.missingWhatsappTemplates.join(', ')}` : '',
        ].filter(Boolean);
        throw ApiError.unprocessable(`Completa antes de activar envíos reales: ${problems.join('; ')}.`);
      }
    }
    // La fecha de activación pertenece al servidor: no se contactan pedidos antiguos.
    const previous = row.config.paymentReminders as MessagingConfig['paymentReminders'] | undefined;
    const paymentReminders = {
      ...input.config.paymentReminders,
      activatedAt: input.config.paymentReminders.enabled
        ? previous?.enabled && previous.activatedAt
          ? previous.activatedAt
          : new Date().toISOString()
        : null,
    };
    await row.update({
      config: { ...input.config, paymentReminders },
      secrets,
      updatedBy: actorId,
    });
    return messagingConfigService.admin();
  },
};
