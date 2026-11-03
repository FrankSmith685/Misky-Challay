import { Router } from 'express';
import { z } from 'zod';
import { ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { audit } from '@shared/utils/audit';
import { isValidRuc } from '@shared/utils/peruDocs';
import { authenticate } from '@middlewares/auth.middleware';
import { requireSuperAdmin } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import { env, isProduction } from '@config/env';
import { getMailProvider } from '@integrations/mail';
import { ApiError } from '@shared/errors/ApiError';
import { logger } from '@config/logger';
import { messagingConfigService } from '@modules/communications/communications.config';
import { settingsService, type MobilePlatform } from './settings.service';
import { storefrontService } from './storefront.service';
import { storefrontUpdateSchema } from './storefront.schema';
import { checkoutTermsService, checkoutTermsUpdateSchema } from './checkoutTerms.service';

const router = Router();

const businessBody = z.object({
  legalName: z.string().trim().min(3).max(180),
  commercialName: z.string().trim().min(2).max(100),
  ruc: z.string().trim().refine(isValidRuc, 'Ingresa un RUC peruano válido'),
  address: z.string().trim().min(8).max(255),
  phone: z.string().trim().min(6).max(30),
  email: z.string().trim().email().max(160),
  supportEmail: z.string().trim().email().max(160),
  complaintResponseDays: z.coerce.number().int().min(1).max(30),
});

const communicationBody = z.object({
  emailNotificationsEnabled: z.boolean(),
  inAppNotificationsEnabled: z.boolean(),
  orderUpdatesEnabled: z.boolean(),
  whatsappUpdatesEnabled: z.boolean(),
  planUpdatesEnabled: z.boolean(),
  staffAccessEnabled: z.boolean(),
  availabilityAlertsEnabled: z.boolean(),
  availabilityEmailSubject: z.string().trim().min(3).max(200),
  availabilityEmailBody: z.string().trim().min(10).max(2000),
  smtpHost: z.string().trim().max(180),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  smtpSecure: z.boolean(),
  smtpUser: z.string().trim().max(180),
  smtpPassword: z.string().max(500).optional(),
  clearSmtpPassword: z.boolean().optional(),
  fromEmail: z.string().trim().email().max(160),
  fromName: z.string().trim().min(2).max(100),
  replyToEmail: z.union([z.string().trim().email().max(160), z.literal('')]),
}).superRefine((value, context) => {
  if (isProduction && !value.smtpHost) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['smtpHost'], message: 'SMTP es obligatorio en producción' });
  }
});

const qrImageUrl = z.union([
  z.string().trim().url().max(500).refine((value) => /^https?:\/\//i.test(value), 'Usa una URL HTTP o HTTPS'),
  z.string().trim().max(500).regex(/^\/(?:images\/payments\/|api\/v1\/media\/files\/)[a-zA-Z0-9_./-]+$/, 'Usa la ruta de una imagen de la tienda'),
  z.literal(''),
]);

export const localPaymentsBody = z.object({
  paymentWindowMinutes: z.coerce.number().int().min(5).max(120).default(15),
  reviewAlertMinutes: z.coerce.number().int().min(1).max(120).default(10),
  yapeEnabled: z.boolean(),
  yapePhone: z.string().trim().max(30),
  yapeRecipient: z.string().trim().max(120),
  yapeQrImageUrl: qrImageUrl,
  plinEnabled: z.boolean(),
  plinPhone: z.string().trim().max(30),
  plinRecipient: z.string().trim().max(120),
  plinQrImageUrl: qrImageUrl,
  instructions: z.string().trim().min(10).max(500),
}).superRefine((value, context) => {
  for (const provider of ['yape', 'plin'] as const) {
    if (!value[`${provider}Enabled`]) continue;
    if (!/^\+?\d[\d\s-]{7,18}$/.test(value[`${provider}Phone`])) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [`${provider}Phone`], message: 'Configura un telefono valido' });
    }
    if (value[`${provider}Recipient`].length < 3) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [`${provider}Recipient`], message: 'Indica el titular que vera el cliente' });
    }
  }
});

const receiptBody = z.object({
  mode: z.enum(['INTERNAL_ONLY', 'EXTERNAL_MANUAL', 'INTEGRATED']),
  autoPrintKitchenTicket: z.boolean(),
  autoPrintCustomerTicket: z.boolean(),
  paperWidth: z.union([z.literal(58), z.literal(80)]),
});

/**
 * De dónde sale el enlace de actualización. Un valor desconocido no es un error:
 * este endpoint también lo consume la web, que no tiene tienda a la que ir.
 */
const requestedPlatform = (value: unknown): MobilePlatform | null =>
  value === 'android' || value === 'ios' ? value : null;

/** Configuración pública consumida por footer, checkout, documentos legales y la app móvil. */
router.get(
  '/public',
  asyncHandler(async (req, res) => {
    const [business, localPayments, receipts] = await Promise.all([
      settingsService.getBusinessInfo(),
      settingsService.getLocalPaymentSettings(),
      settingsService.getReceiptSettings(),
    ]);
    return ok(res, {
      business: { ...business, whatsappPhone: (await messagingConfigService.public()).supportPhone },
      igvRate: env.IGV_RATE,
      cod: { enabled: false, maxAmount: env.COD_MAX_AMOUNT },
      invoicing: { boletaDniThreshold: env.BOLETA_DNI_THRESHOLD },
      localPayments,
      receipts,
      /*
       * Interruptor explícito del pago con tarjeta. Hasta ahora se publicaban COD
       * y los pagos locales pero nada de ONLINE, así que la única condición
       * posible en el cliente era «hay importe que cobrar»: un negocio sin
       * pasarela configurada seguía ofreciendo un medio que el backend rechazaría
       * al confirmar. Fuera de producción vale el simulador local, que cumple el
       * mismo ciclo y su webhook.
       */
      payments: {
        onlineEnabled: Boolean(env.STRIPE_SECRET_KEY || env.MERCADOPAGO_ACCESS_TOKEN) || !isProduction,
        onlineProvider: env.MERCADOPAGO_ACCESS_TOKEN ? 'mercadopago' : env.STRIPE_SECRET_KEY ? 'stripe' : 'mock',
      },
      // La app compara su propia versión con esto al arrancar: es la unica forma de
      // forzar una actualización en instalaciones que ya están en la calle.
      mobile: settingsService.getMobileAppSettings(requestedPlatform(req.query.platform)),
    });
  }),
);

// Editorial content is public; writing it requires the same authority as business settings.
router.get('/storefront', asyncHandler(async (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  return ok(res, await storefrontService.get());
}));

router.get('/terms', asyncHandler(async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return ok(res, await checkoutTermsService.get());
}));

router.use(authenticate, requireSuperAdmin);

router.put('/terms', validate(checkoutTermsUpdateSchema), asyncHandler(async (req, res) => {
  const result = await checkoutTermsService.update(req.body, req.user!.sub);
  await audit(req, { action: 'CHECKOUT_TERMS_PUBLISHED', entity: 'checkout_terms', entityId: 1, before: result.before, after: result.after });
  return ok(res, result.after);
}));

router.put('/storefront', validate(storefrontUpdateSchema), asyncHandler(async (req, res) => {
  const result = await storefrontService.update(req.body.content, req.body.version, req.user!.sub);
  await audit(req, { action: 'STOREFRONT_UPDATED', entity: 'storefront_settings', entityId: 1, before: result.before, after: result.after });
  return ok(res, result.after);
}));

router.get(
  '/business',
  asyncHandler(async (_req, res) => ok(res, await settingsService.getBusinessInfoForAdmin())),
);

router.put(
  '/business',
  validate(z.object({ body: businessBody })),
  asyncHandler(async (req, res) => {
    const result = await settingsService.updateBusinessInfo(req.body, req.user!.sub);
    await audit(req, {
      action: 'settings.business.update',
      entity: 'business_settings',
      entityId: 1,
      before: { ...result.before },
      after: { ...result.business },
    });
    return ok(
      res,
      { business: result.business, source: 'database', isConfigured: true, updatedAt: result.updatedAt },
      'Datos legales actualizados',
    );
  }),
);

router.get(
  '/local-payments',
  asyncHandler(async (_req, res) => ok(res, await settingsService.getLocalPaymentSettingsForAdmin())),
);

router.put(
  '/local-payments',
  validate(z.object({ body: localPaymentsBody })),
  asyncHandler(async (req, res) => {
    const result = await settingsService.updateLocalPaymentSettings(req.body, req.user!.sub);
    await audit(req, {
      action: 'settings.local_payments.update',
      entity: 'local_payment_settings',
      entityId: 1,
      before: { ...result.before },
      after: { ...result.localPayments },
    });
    return ok(res, {
      localPayments: result.localPayments,
      isConfigured: true,
      updatedAt: result.updatedAt,
    }, 'Yape y Plin actualizados');
  }),
);

router.get(
  '/receipts',
  asyncHandler(async (_req, res) => ok(res, await settingsService.getReceiptSettingsForAdmin())),
);

router.put(
  '/receipts',
  validate(z.object({ body: receiptBody })),
  asyncHandler(async (req, res) => {
    const result = await settingsService.updateReceiptSettings(req.body, req.user!.sub);
    await audit(req, {
      action: 'settings.receipts.update',
      entity: 'receipt_settings',
      entityId: 1,
      before: { ...result.before },
      after: { ...result.receipts },
    });
    return ok(res, {
      receipts: result.receipts,
      isConfigured: true,
      updatedAt: result.updatedAt,
    }, 'Configuracion de tickets actualizada');
  }),
);

router.get(
  '/communication',
  asyncHandler(async (_req, res) => ok(res, await settingsService.getCommunicationSettingsForAdmin())),
);

router.put(
  '/communication',
  validate(z.object({ body: communicationBody })),
  asyncHandler(async (req, res) => {
    const result = await settingsService.updateCommunicationSettings(req.body, req.user!.sub);
    await audit(req, {
      action: 'settings.communication.update',
      entity: 'communication_settings',
      entityId: 1,
      before: result.before,
      after: result.communication,
    });
    return ok(
      res,
      {
        communication: result.communication,
        source: 'database',
        isConfigured: true,
        updatedAt: result.updatedAt,
      },
      'Correo y notificaciones actualizados',
    );
  }),
);

router.get(
  '/notification-history',
  asyncHandler(async (_req, res) => ok(res, await settingsService.getNotificationOverview())),
);

router.get(
  '/integrations',
  asyncHandler(async (_req, res) => ok(res, await settingsService.getIntegrationStatus())),
);

router.post(
  '/communication/test',
  validate(z.object({ body: z.object({ recipient: z.string().trim().email().max(160) }) })),
  asyncHandler(async (req, res) => {
    const settings = await settingsService.getCommunicationSettings();
    try {
      const provider = getMailProvider({
        host: settings.smtpHost,
        port: settings.smtpPort,
        secure: settings.smtpSecure,
        user: settings.smtpUser || undefined,
        password: settings.smtpPassword,
        fromEmail: settings.fromEmail,
        fromName: settings.fromName,
        replyToEmail: settings.replyToEmail || undefined,
      });
      const result = await provider.send({
        to: req.body.recipient,
        subject: 'Prueba de correo de Misky Challay',
        text: 'La configuracion de correo funciona correctamente.',
        html: '<div style="font-family:Arial,sans-serif"><h2>Configuracion correcta</h2><p>Misky Challay puede enviar correos con esta cuenta.</p></div>',
      });
      await audit(req, {
        action: 'settings.communication.test',
        entity: 'communication_settings',
        entityId: 1,
        after: { recipient: req.body.recipient, provider: provider.name },
      });
      return ok(res, { provider: provider.name, messageId: result.messageId }, 'Correo de prueba enviado');
    } catch (error) {
      logger.error('Fallo la prueba de configuracion SMTP', error);
      const detail = error instanceof Error ? error.message : '';
      const message = /535|EAUTH|Username and Password not accepted/i.test(detail)
        ? 'Gmail rechazo las credenciales. Usa una contrasena de aplicacion de 16 caracteres, no la clave normal de la cuenta.'
        : /from|sender|alias/i.test(detail)
          ? 'Gmail rechazo el remitente. Usa el mismo correo autenticado o configura el alias en Gmail.'
          : 'No se pudo conectar con SMTP. Revisa servidor, puerto, usuario, contrasena y conexion segura.';
      throw ApiError.badRequest(message);
    }
  }),
);

export default router;
