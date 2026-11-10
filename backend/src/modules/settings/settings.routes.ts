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
import type { ThemeTokens } from '@config/theme';
import { storefrontService } from './storefront.service';
import { storefrontUpdateSchema } from './storefront.schema';
import { checkoutTermsService, checkoutTermsUpdateSchema } from './checkoutTerms.service';

const router = Router();

const isValidTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
};

const colorLuminance = (hex: string): number => {
  const channels = [0, 2, 4].map((index) => parseInt(hex.slice(index + 1, index + 3), 16) / 255);
  const linear = channels.map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

const colorContrast = (foreground: string, background: string): number => {
  const a = colorLuminance(foreground); const b = colorLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

const readableThemeText = (background: string): string => colorContrast('#ffffff', background) >= colorContrast('#17324d', background) ? '#ffffff' : '#17324d';

const themeTokensShape = z.object({
  primary: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'primary debe ser un color hexadecimal'),
  secondary: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'secondary debe ser un color hexadecimal'),
  tertiary: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'tertiary debe ser un color hexadecimal'),
  radius: z.coerce.number().int().min(0).max(5),
  fontFamily: z.enum(['inter', 'system', 'serif']),
  baseFontSize: z.coerce.number().int().min(14).max(18),
  density: z.enum(['comfortable', 'compact']),
  shadowStrength: z.coerce.number().int().min(0).max(150),
});

const withThemeContrast = <T extends z.ZodTypeAny>(schema: T) => schema.superRefine((value: z.infer<T>, context) => {
  for (const key of ['primary', 'secondary', 'tertiary'] as const) {
    const color = (value as ThemeTokens)[key];
    const ratio = colorContrast(readableThemeText(color), color);
    if (ratio < 4.5) context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `El contraste calculado es ${ratio.toFixed(2)}:1; debe ser al menos 4.5:1` });
  }
});

// El sistema de diseño es una política global de marca. Ocultar la entrada del
// menú no basta: todas sus mutaciones y lecturas administrativas requieren
// superadmin también en la API.
const designRead = requireSuperAdmin;
const designManage = requireSuperAdmin;
const designPublish = requireSuperAdmin;

const businessBody = z.object({
  legalName: z.string().trim().min(3).max(180),
  commercialName: z.string().trim().min(2).max(100),
  ruc: z.string().trim().refine(isValidRuc, 'Ingresa un RUC peruano válido'),
  address: z.string().trim().min(8).max(255),
  phone: z.string().trim().min(6).max(30),
  email: z.string().trim().email().max(160),
  supportEmail: z.string().trim().email().max(160),
  complaintResponseDays: z.coerce.number().int().min(1).max(15),
  timeZone: z.string().trim().min(1).max(64).refine(isValidTimeZone, 'Selecciona una zona horaria válida'),
  currency: z.literal('PEN'),
  taxRate: z.coerce.number().min(0).max(1),
  platformCommissionRate: z.coerce.number().min(0).max(1),
  expectedVersion: z.coerce.number().int().min(1).optional(),
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
  expectedVersion: z.coerce.number().int().min(1).optional(),
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
  expectedVersion: z.coerce.number().int().min(1).optional(),
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
  expectedVersion: z.coerce.number().int().min(1).optional(),
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
    const { platformCommissionRate: _platformCommissionRate, ...publicBusiness } = business;
    return ok(res, {
      business: { ...publicBusiness, whatsappPhone: (await messagingConfigService.public()).supportPhone },
      igvRate: business.taxRate,
      timeZone: business.timeZone,
      currency: business.currency,
      cod: { enabled: env.COD_ENABLED, maxAmount: env.COD_MAX_AMOUNT },
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

router.get('/theme', asyncHandler(async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return ok(res, { tokens: await settingsService.getTheme() });
}));

router.get('/theme/admin', authenticate, designRead, asyncHandler(async (_req, res) => ok(res, await settingsService.getThemeForAdmin())));

router.put('/theme/draft', authenticate, designManage, validate(z.object({ body: withThemeContrast(themeTokensShape.extend({ expectedVersion: z.coerce.number().int().min(1).optional() })) })), asyncHandler(async (req, res) => {
  const { expectedVersion, ...tokens } = req.body as ThemeTokens & { expectedVersion?: number };
  const result = await settingsService.updateThemeDraft(tokens, req.user!.sub, expectedVersion);
  await audit(req, { action: 'settings.theme.draft.update', entity: 'theme_settings', entityId: 1, after: { version: result.draftVersion, tokens } });
  return ok(res, result, 'Borrador del tema guardado');
}));

router.post('/theme/publish', authenticate, designPublish, validate(z.object({ body: z.object({ expectedVersion: z.coerce.number().int().min(1).optional() }) })), asyncHandler(async (req, res) => {
  const result = await settingsService.publishTheme(req.user!.sub, req.body.expectedVersion);
  await audit(req, { action: 'settings.theme.publish', entity: 'theme_settings', entityId: 1, after: { version: result.publishedVersion, tokens: result.published } });
  return ok(res, result, 'Tema publicado');
}));

router.post('/theme/reset', authenticate, designManage, validate(z.object({ body: z.object({ expectedVersion: z.coerce.number().int().min(1).optional() }) })), asyncHandler(async (req, res) => {
  const result = await settingsService.updateThemeDraft({ primary: '#006fb9', secondary: '#ffbd16', tertiary: '#f15b3a', radius: 5, fontFamily: 'inter', baseFontSize: 16, density: 'comfortable', shadowStrength: 100 }, req.user!.sub, req.body.expectedVersion);
  await audit(req, { action: 'settings.theme.reset', entity: 'theme_settings', entityId: 1, after: { version: result.draftVersion } });
  return ok(res, result, 'Borrador restablecido');
}));

router.get('/theme/revisions', authenticate, designRead, asyncHandler(async (_req, res) => ok(res, await settingsService.listSettingRevisions('theme'))));
router.post('/theme/rollback/:revisionId', authenticate, designManage, validate(z.object({ params: z.object({ revisionId: z.coerce.number().int().positive() }), body: z.object({ expectedVersion: z.coerce.number().int().min(1).optional() }) })), asyncHandler(async (req, res) => {
  const result = await settingsService.rollbackSetting('theme', Number(req.params.revisionId), req.user!.sub, req.body.expectedVersion);
  const themeResult = result as Awaited<ReturnType<typeof settingsService.getThemeForAdmin>>;
  await audit(req, { action: 'settings.theme.rollback', entity: 'theme_settings', entityId: req.params.revisionId, after: { version: themeResult.draftVersion } });
  return ok(res, themeResult, 'Versión del tema restaurada');
}));

router.use(authenticate, requireSuperAdmin);

const revisionScope = z.enum(['business', 'local-payments', 'receipts', 'communication', 'theme']);
router.get('/revisions/:scope', validate(z.object({ params: z.object({ scope: revisionScope }) })), asyncHandler(async (req, res) => ok(res, await settingsService.listSettingRevisions(req.params.scope as 'business' | 'local-payments' | 'receipts' | 'communication' | 'theme'))));
router.post('/revisions/:scope/:revisionId/rollback', validate(z.object({ params: z.object({ scope: revisionScope, revisionId: z.coerce.number().int().positive() }), body: z.object({ expectedVersion: z.coerce.number().int().positive().optional() }) })), asyncHandler(async (req, res) => {
  const result = await settingsService.rollbackSetting(req.params.scope as 'business' | 'local-payments' | 'receipts' | 'communication' | 'theme', Number(req.params.revisionId), req.user!.sub, req.body.expectedVersion);
  await audit(req, { action: 'settings.revision.rollback', entity: `${req.params.scope}_settings`, entityId: req.params.revisionId, after: { version: 'version' in result ? result.version : result.draftVersion } });
  return ok(res, result, 'Versión restaurada');
}));

router.get('/storefront/admin', asyncHandler(async (_req, res) => ok(res, await storefrontService.getAdmin())));

router.put(
  '/storefront/draft',
  validate(z.object({ body: z.object({ version: z.number().int().min(0), content: storefrontUpdateSchema.shape.body.shape.content, publishAt: z.string().datetime().nullable().optional() }).strict() })),
  asyncHandler(async (req, res) => {
    const result = await storefrontService.saveDraft(req.body.content, req.body.version, req.user!.sub, req.body.publishAt);
    await audit(req, { action: 'STOREFRONT_DRAFT_SAVED', entity: 'storefront_settings', entityId: 1, after: { publishAt: req.body.publishAt ?? null, version: req.body.version } });
    return ok(res, result, req.body.publishAt ? 'Publicación programada' : 'Borrador guardado');
  }),
);

router.post(
  '/storefront/publish',
  validate(z.object({ body: z.object({ idempotencyKey: z.string().trim().min(8).max(100).optional() }).strict() })),
  asyncHandler(async (req, res) => {
    const result = await storefrontService.publishDraft(req.user!.sub, req.body.idempotencyKey);
    if (!result.reused) await audit(req, { action: 'STOREFRONT_PUBLISHED', entity: 'storefront_settings', entityId: 1, before: result.before, after: result.after });
    return ok(res, result.after, result.reused ? 'La publicación ya estaba aplicada' : 'Contenido publicado');
  }),
);

router.delete('/storefront/draft', asyncHandler(async (_req, res) => ok(res, await storefrontService.discardDraft(), 'Borrador descartado')));

router.get('/storefront/history', validate(z.object({ query: z.object({ limit: z.coerce.number().int().min(1).max(50).optional() }) })), asyncHandler(async (req, res) => ok(res, await storefrontService.history(req.query.limit ? Number(req.query.limit) : undefined))));

router.post(
  '/storefront/rollback/:auditId',
  validate(z.object({ params: z.object({ auditId: z.coerce.number().int().positive() }), body: z.object({ idempotencyKey: z.string().trim().min(8).max(100).optional() }).strict() })),
  asyncHandler(async (req, res) => {
    const result = await storefrontService.rollback(Number(req.params.auditId), req.user!.sub, req.body.idempotencyKey);
    await audit(req, { action: 'STOREFRONT_ROLLBACK', entity: 'storefront_settings', entityId: 1, before: result.before, after: result.after });
    return ok(res, result.after, 'Versión restaurada y publicada');
  }),
);

router.put('/terms', validate(checkoutTermsUpdateSchema), asyncHandler(async (req, res) => {
  const result = await checkoutTermsService.update(req.body, req.user!.sub);
  await audit(req, { action: 'CHECKOUT_TERMS_PUBLISHED', entity: 'checkout_terms', entityId: 1, before: result.before, after: result.after });
  return ok(res, result.after);
}));

router.put('/storefront', validate(storefrontUpdateSchema.extend({ body: storefrontUpdateSchema.shape.body.extend({ idempotencyKey: z.string().trim().min(8).max(100).optional() }) })), asyncHandler(async (req, res) => {
  const result = await storefrontService.update(req.body.content, req.body.version, req.user!.sub, req.body.idempotencyKey);
  if (!result.reused) await audit(req, { action: 'STOREFRONT_UPDATED', entity: 'storefront_settings', entityId: 1, before: result.before, after: result.after });
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
    const { expectedVersion, ...input } = req.body;
    const result = await settingsService.updateBusinessInfo(input, req.user!.sub, expectedVersion);
    await audit(req, {
      action: 'settings.business.update',
      entity: 'business_settings',
      entityId: 1,
      before: { ...result.before },
      after: { ...result.business },
    });
    return ok(
      res,
      { business: result.business, source: 'database', isConfigured: true, updatedAt: result.updatedAt, version: result.version },
      'Datos legales actualizados',
    );
  }),
);

router.get(
  '/local-payments',
  asyncHandler(async (_req, res) => ok(res, await settingsService.getLocalPaymentSettingsForAdmin())),
);

router.post(
  '/local-payments/check',
  asyncHandler(async (req, res) => {
    const settings = await settingsService.getLocalPaymentSettings();
    const providers = (['yape', 'plin'] as const).map((provider) => ({
      provider,
      enabled: settings[`${provider}Enabled`],
      valid: !settings[`${provider}Enabled`] || (settings[`${provider}Phone`].replace(/\D/g, '').length >= 9 && settings[`${provider}Recipient`].trim().length >= 3),
      qrConfigured: Boolean(settings[`${provider}QrImageUrl`]),
    }));
    await audit(req, { action: 'settings.local_payments.check', entity: 'local_payment_settings', entityId: 1, after: { providers } });
    return ok(res, { providers, checkedAt: new Date().toISOString() }, 'Pagos locales comprobados');
  }),
);

router.put(
  '/local-payments',
  validate(z.object({ body: localPaymentsBody })),
  asyncHandler(async (req, res) => {
    const { expectedVersion, ...input } = req.body;
    const result = await settingsService.updateLocalPaymentSettings(input, req.user!.sub, expectedVersion);
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
      version: result.version,
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
    const { expectedVersion, ...input } = req.body;
    const result = await settingsService.updateReceiptSettings(input, req.user!.sub, expectedVersion);
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
      version: result.version,
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
    const { expectedVersion, ...input } = req.body;
    const result = await settingsService.updateCommunicationSettings(input, req.user!.sub, expectedVersion);
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
        version: result.version,
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
  '/integrations/check',
  asyncHandler(async (req, res) => {
    const status = await settingsService.getIntegrationStatus();
    await audit(req, { action: 'settings.integrations.check', entity: 'integrations', after: { statuses: status.integrations.map((item) => ({ key: item.key, status: item.status })) } });
    return ok(res, status, 'Integraciones comprobadas');
  }),
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
