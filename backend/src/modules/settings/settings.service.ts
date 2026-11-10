import { BusinessSetting, CommunicationSetting, LocalPaymentSetting, Notification, ReceiptSetting, SettingRevision, ThemeSetting } from '@database/models';
import { RECEIPT_MODE, type ReceiptMode } from '@database/models/receiptSetting.model';
import { businessInfo as environmentBusinessInfo } from '@config/business';
import { env, isProduction } from '@config/env';
import { MOBILE_APP, MOBILE_VERSION_PATTERN } from '@config/constants';
import { logger } from '@config/logger';
import { NOTIFICATION_STATUS } from '@database/models/notification.model';
import { decryptSetting, encryptSetting } from '@shared/security/settingsEncryption';
import { messagingConfigService } from '@modules/communications/communications.config';
import { ApiError } from '@shared/errors/ApiError';
import { DEFAULT_THEME_TOKENS, type ThemeTokens } from '@config/theme';

export interface EditableBusinessInfo {
  legalName: string;
  commercialName: string;
  ruc: string;
  address: string;
  phone: string;
  email: string;
  supportEmail: string;
  complaintResponseDays: number;
  timeZone: string;
  currency: string;
  taxRate: number;
  platformCommissionRate: number;
}

export interface EditableLocalPaymentSettings {
  paymentWindowMinutes: number;
  reviewAlertMinutes: number;
  yapeEnabled: boolean;
  yapePhone: string;
  yapeRecipient: string;
  yapeQrImageUrl: string;
  plinEnabled: boolean;
  plinPhone: string;
  plinRecipient: string;
  plinQrImageUrl: string;
  instructions: string;
}

export interface EditableReceiptSettings {
  mode: ReceiptMode;
  autoPrintKitchenTicket: boolean;
  autoPrintCustomerTicket: boolean;
  paperWidth: 58 | 80;
}

const receiptFallback = (): EditableReceiptSettings => ({
  mode: RECEIPT_MODE.INTERNAL_ONLY,
  autoPrintKitchenTicket: true,
  autoPrintCustomerTicket: false,
  paperWidth: 80,
});

const receiptFromRow = (row: ReceiptSetting): EditableReceiptSettings => ({
  mode: row.mode,
  autoPrintKitchenTicket: row.autoPrintKitchenTicket,
  autoPrintCustomerTicket: row.autoPrintCustomerTicket,
  paperWidth: row.paperWidth,
});

const localPaymentsFromRow = (row: LocalPaymentSetting): EditableLocalPaymentSettings => ({
  paymentWindowMinutes: row.paymentWindowMinutes ?? 15,
  reviewAlertMinutes: row.reviewAlertMinutes ?? 10,
  yapeEnabled: row.yapeEnabled,
  yapePhone: row.yapePhone ?? '',
  yapeRecipient: row.yapeRecipient ?? '',
  yapeQrImageUrl: row.yapeQrImageUrl ?? '',
  plinEnabled: row.plinEnabled,
  plinPhone: row.plinPhone ?? '',
  plinRecipient: row.plinRecipient ?? '',
  plinQrImageUrl: row.plinQrImageUrl ?? '',
  instructions: row.instructions ?? 'Paga el importe exacto y escribe el codigo de operacion que aparece en tu aplicativo.',
});

const localPaymentsFallback = (): EditableLocalPaymentSettings => ({
  paymentWindowMinutes: 15,
  reviewAlertMinutes: 10,
  yapeEnabled: false,
  yapePhone: '',
  yapeRecipient: '',
  yapeQrImageUrl: '',
  plinEnabled: false,
  plinPhone: '',
  plinRecipient: '',
  plinQrImageUrl: '',
  instructions: 'Paga el importe exacto y escribe el codigo de operacion que aparece en tu aplicativo.',
});

const assertSettingVersion = (actual: number, expected?: number): void => {
  if (expected !== undefined && actual !== expected) {
    throw ApiError.conflict('La configuración cambió mientras la editabas. Recarga la pantalla antes de guardar.');
  }
};

const recordRevision = async (scope: 'business' | 'local-payments' | 'receipts' | 'communication' | 'theme', version: number, snapshot: unknown, actorId: number, reason: string): Promise<void> => {
  await SettingRevision.create({ scope, version, snapshotEncrypted: encryptSetting(JSON.stringify(snapshot)), actorId, reason });
};

const themeFromRow = (row: ThemeSetting): ThemeTokens => ({ ...DEFAULT_THEME_TOKENS, ...row.draftTokensJson });
const publishedThemeFromRow = (row: ThemeSetting): ThemeTokens => ({ ...DEFAULT_THEME_TOKENS, ...row.publishedTokensJson });

const fromRow = (row: BusinessSetting): EditableBusinessInfo => ({
  legalName: row.legalName,
  commercialName: row.commercialName,
  ruc: row.ruc,
  address: row.address,
  phone: row.phone,
  email: row.email,
  supportEmail: row.supportEmail,
  complaintResponseDays: row.complaintResponseDays,
  timeZone: row.timeZone,
  currency: row.currency,
  taxRate: Number(row.taxRate),
  platformCommissionRate: Number(row.platformCommissionRate ?? 0.15),
});

const fallback = (): EditableBusinessInfo => ({ ...environmentBusinessInfo, platformCommissionRate: 0.15 });

export interface EditableCommunicationSettings {
  emailNotificationsEnabled: boolean;
  inAppNotificationsEnabled: boolean;
  orderUpdatesEnabled: boolean;
  whatsappUpdatesEnabled: boolean;
  planUpdatesEnabled: boolean;
  staffAccessEnabled: boolean;
  availabilityAlertsEnabled: boolean;
  availabilityEmailSubject: string;
  availabilityEmailBody: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword?: string;
  clearSmtpPassword?: boolean;
  fromEmail: string;
  fromName: string;
  replyToEmail: string;
}

export interface RuntimeCommunicationSettings extends Omit<EditableCommunicationSettings, 'clearSmtpPassword'> {
  smtpPassword?: string;
  source: 'database' | 'environment';
}

const communicationFallback = (): RuntimeCommunicationSettings => ({
  emailNotificationsEnabled: true,
  inAppNotificationsEnabled: true,
  orderUpdatesEnabled: true,
  whatsappUpdatesEnabled: false,
  planUpdatesEnabled: true,
  staffAccessEnabled: true,
  availabilityAlertsEnabled: true,
  availabilityEmailSubject: '{{product}} volvio a estar disponible',
  availabilityEmailBody: 'El plato {{product}} ya esta disponible nuevamente en {{branch}}. Puedes pedirlo antes de que se agote.',
  smtpHost: env.MAIL_HOST ?? '',
  smtpPort: env.MAIL_PORT,
  smtpSecure: env.MAIL_PORT === 465,
  smtpUser: env.MAIL_USER ?? '',
  smtpPassword: env.MAIL_PASSWORD,
  fromEmail: env.MAIL_FROM,
  fromName: env.MAIL_FROM_NAME,
  replyToEmail: env.MAIL_FROM,
  source: 'environment',
});

const runtimeFromCommunicationRow = (row: CommunicationSetting): RuntimeCommunicationSettings => {
  let smtpPassword: string | undefined;
  if (row.smtpPasswordEncrypted === null) smtpPassword = env.MAIL_PASSWORD;
  else if (row.smtpPasswordEncrypted) smtpPassword = decryptSetting(row.smtpPasswordEncrypted);

  return {
    emailNotificationsEnabled: row.emailNotificationsEnabled,
    inAppNotificationsEnabled: row.inAppNotificationsEnabled,
    orderUpdatesEnabled: row.orderUpdatesEnabled,
    whatsappUpdatesEnabled: row.whatsappUpdatesEnabled,
    planUpdatesEnabled: row.planUpdatesEnabled,
    staffAccessEnabled: row.staffAccessEnabled,
    availabilityAlertsEnabled: row.availabilityAlertsEnabled,
    availabilityEmailSubject: row.availabilityEmailSubject,
    availabilityEmailBody: row.availabilityEmailBody,
    smtpHost: row.smtpHost ?? '',
    smtpPort: row.smtpPort,
    smtpSecure: row.smtpSecure,
    smtpUser: row.smtpUser ?? '',
    smtpPassword,
    fromEmail: row.fromEmail,
    fromName: row.fromName,
    replyToEmail: row.replyToEmail ?? '',
    source: 'database',
  };
};

const sanitizeCommunication = (settings: RuntimeCommunicationSettings) => {
  const { smtpPassword: _smtpPassword, ...safe } = settings;
  return {
    ...safe,
    smtpPasswordConfigured: Boolean(_smtpPassword),
    deliveryMode: settings.smtpHost ? ('smtp' as const) : isProduction ? ('unavailable' as const) : ('console' as const),
  };
};

export type MobilePlatform = 'android' | 'ios';

/**
 * Lo que la app móvil necesita saber antes de dejar comprar a nadie.
 *
 * `minSupportedVersion` es la compuerta dura (por debajo, la app se bloquea y manda
 * a la tienda), `latestVersion` es el aviso suave de "hay algo nuevo" y
 * `maintenance` corta el servicio con un mensaje propio durante una ventana de
 * mantenimiento, sin tener que publicar una versión nueva.
 */
export interface MobileAppSettings {
  minSupportedVersion: string;
  latestVersion: string;
  updateUrl: string;
  maintenance: { activo: boolean; mensaje: string };
}

/**
 * Nombres que la compuerta móvil puede leer. Van por `env`, el esquema validado,
 * como el resto del proyecto; el formato exacto (versión y URL) se comprueba
 * aquí abajo porque el esquema los acepta como texto libre a propósito: una
 * variable mal escrita no puede tumbar el arranque del servidor entero.
 */
type MobileSettingName =
  | 'MOBILE_MIN_SUPPORTED_VERSION'
  | 'MOBILE_LATEST_VERSION'
  | 'MOBILE_UPDATE_URL'
  | 'MOBILE_UPDATE_URL_ANDROID'
  | 'MOBILE_UPDATE_URL_IOS'
  | 'MOBILE_MAINTENANCE_MESSAGE';

const readSetting = (name: MobileSettingName): string => env[name]?.trim() ?? '';

/**
 * Solo acepta versiones bien formadas. Una variable mal escrita en el servidor no
 * puede dejar fuera del servicio a todos los teléfonos: ante la duda, no bloquea.
 */
const readVersionSetting = (name: MobileSettingName, fallbackVersion: string): string => {
  const raw = readSetting(name);
  if (!raw) return fallbackVersion;
  if (!MOBILE_VERSION_PATTERN.test(raw)) {
    logger.warn(`${name} no tiene formato MAYOR.MENOR.PARCHE ("${raw}"): se ignora`);
    return fallbackVersion;
  }
  return raw;
};

const readUrlSetting = (name: MobileSettingName): string => {
  const raw = readSetting(name);
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw)) {
    logger.warn(`${name} no es una URL http(s) ("${raw}"): se ignora`);
    return '';
  }
  return raw;
};

const compareVersions = (left: string, right: string): number => {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
};

/**
 * Adónde mandamos a actualizar. Cada tienda tiene su enlace; mientras no estén
 * configurados se cae a la web, que siempre existe y permite seguir pidiendo.
 */
const updateUrlFor = (platform: MobilePlatform | null): string => {
  const generic = readUrlSetting('MOBILE_UPDATE_URL');
  if (platform === 'android') {
    return readUrlSetting('MOBILE_UPDATE_URL_ANDROID')
      || generic
      || `https://play.google.com/store/apps/details?id=${MOBILE_APP.BUNDLE_ID}`;
  }
  if (platform === 'ios') {
    // Sin el identificador numérico que asigna App Store no se puede construir el
    // enlace: hasta la primera publicación, la web es el destino honesto.
    return readUrlSetting('MOBILE_UPDATE_URL_IOS') || generic || env.FRONTEND_URL;
  }
  return generic || env.FRONTEND_URL;
};

export const settingsService = {
  /**
   * Compuerta de versión de la app móvil. Es de solo lectura y sin base de datos:
   * si la respondiera una tabla, un problema de base de datos dejaría a los
   * teléfonos sin saber si pueden operar.
   */
  getMobileAppSettings(platform: MobilePlatform | null = null): MobileAppSettings {
    const minSupportedVersion = readVersionSetting(
      'MOBILE_MIN_SUPPORTED_VERSION',
      MOBILE_APP.MIN_SUPPORTED_VERSION,
    );
    const publishedVersion = readVersionSetting('MOBILE_LATEST_VERSION', MOBILE_APP.LATEST_VERSION);
    const maintenanceActive = env.MOBILE_MAINTENANCE;

    return {
      minSupportedVersion,
      // Anunciar una versión menor que la mínima dejaría a la app pidiendo una
      // actualización que no la desbloquea.
      latestVersion: compareVersions(publishedVersion, minSupportedVersion) < 0
        ? minSupportedVersion
        : publishedVersion,
      updateUrl: updateUrlFor(platform),
      maintenance: {
        activo: maintenanceActive,
        mensaje: maintenanceActive
          ? readSetting('MOBILE_MAINTENANCE_MESSAGE') || MOBILE_APP.MAINTENANCE_MESSAGE
          : '',
      },
    };
  },

  async getTheme(): Promise<ThemeTokens> {
    const row = await ThemeSetting.findByPk(1);
    return row ? publishedThemeFromRow(row) : DEFAULT_THEME_TOKENS;
  },

  async getThemeForAdmin() {
    const row = await ThemeSetting.findByPk(1);
    return {
      draft: row ? themeFromRow(row) : DEFAULT_THEME_TOKENS,
      published: row ? publishedThemeFromRow(row) : DEFAULT_THEME_TOKENS,
      draftVersion: row?.draftVersion ?? 0,
      publishedVersion: row?.publishedVersion ?? 0,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
      publishedBy: row?.publishedBy ?? null,
      source: row ? ('database' as const) : ('default' as const),
    };
  },

  async updateThemeDraft(tokens: ThemeTokens, actorId: number, expectedVersion?: number) {
    const [row] = await ThemeSetting.findOrCreate({
      where: { id: 1 },
      defaults: {
        id: 1,
        draftTokensJson: DEFAULT_THEME_TOKENS,
        publishedTokensJson: DEFAULT_THEME_TOKENS,
        draftVersion: 1,
        publishedVersion: 1,
        updatedBy: null,
        publishedBy: null,
      },
    });
    assertSettingVersion(row.draftVersion, expectedVersion);
    row.set({ draftTokensJson: tokens, draftVersion: row.draftVersion + 1, updatedBy: actorId });
    await row.save();
    await recordRevision('theme', row.draftVersion, tokens, actorId, 'Borrador del sistema de diseño guardado');
    return this.getThemeForAdmin();
  },

  async publishTheme(actorId: number, expectedVersion?: number) {
    const [row] = await ThemeSetting.findOrCreate({
      where: { id: 1 },
      defaults: {
        id: 1,
        draftTokensJson: DEFAULT_THEME_TOKENS,
        publishedTokensJson: DEFAULT_THEME_TOKENS,
        draftVersion: 1,
        publishedVersion: 1,
        updatedBy: null,
        publishedBy: null,
      },
    });
    assertSettingVersion(row.draftVersion, expectedVersion);
    row.set({ publishedTokensJson: row.draftTokensJson, publishedVersion: row.draftVersion, publishedBy: actorId });
    await row.save();
    await recordRevision('theme', row.publishedVersion, publishedThemeFromRow(row), actorId, 'Tema publicado');
    return this.getThemeForAdmin();
  },

  /** Base de datos primero; variables de entorno solo como respaldo de primera instalación. */
  async getBusinessInfo(): Promise<EditableBusinessInfo> {
    const row = await BusinessSetting.findByPk(1);
    return row ? fromRow(row) : fallback();
  },

  async getBusinessInfoForAdmin() {
    const row = await BusinessSetting.findByPk(1);
    return {
      business: row ? fromRow(row) : fallback(),
      source: row ? ('database' as const) : ('environment' as const),
      isConfigured: Boolean(row),
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
      version: row?.version ?? 0,
    };
  },

  async updateBusinessInfo(input: EditableBusinessInfo, actorId: number, expectedVersion?: number) {
    const before = await settingsService.getBusinessInfo();
    const [row] = await BusinessSetting.findOrCreate({
      where: { id: 1 },
      defaults: { id: 1, ...input, updatedBy: actorId },
    });
    assertSettingVersion(row.version ?? 1, expectedVersion);
    row.set({ ...input, updatedBy: actorId, version: (row.version ?? 0) + 1 });
    await row.save();
    await recordRevision('business', row.version, input, actorId, 'Actualización desde configuración del negocio');
    return { before, business: fromRow(row), updatedAt: row.updatedAt, version: row.version };
  },

  async getLocalPaymentSettings(): Promise<EditableLocalPaymentSettings> {
    const row = await LocalPaymentSetting.findByPk(1);
    return row ? localPaymentsFromRow(row) : localPaymentsFallback();
  },

  async getLocalPaymentSettingsForAdmin() {
    const row = await LocalPaymentSetting.findByPk(1);
    return {
      localPayments: row ? localPaymentsFromRow(row) : localPaymentsFallback(),
      isConfigured: Boolean(row),
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
      version: row?.version ?? 0,
    };
  },

  async updateLocalPaymentSettings(input: EditableLocalPaymentSettings, actorId: number, expectedVersion?: number) {
    const before = await settingsService.getLocalPaymentSettings();
    const values = {
      paymentWindowMinutes: input.paymentWindowMinutes,
      reviewAlertMinutes: input.reviewAlertMinutes,
      yapeEnabled: input.yapeEnabled,
      yapePhone: input.yapePhone.trim() || null,
      yapeRecipient: input.yapeRecipient.trim() || null,
      yapeQrImageUrl: input.yapeQrImageUrl.trim() || null,
      plinEnabled: input.plinEnabled,
      plinPhone: input.plinPhone.trim() || null,
      plinRecipient: input.plinRecipient.trim() || null,
      plinQrImageUrl: input.plinQrImageUrl.trim() || null,
      instructions: input.instructions.trim() || null,
      updatedBy: actorId,
    };
    const [row] = await LocalPaymentSetting.findOrCreate({
      where: { id: 1 },
      defaults: { id: 1, ...values },
    });
    assertSettingVersion(row.version ?? 1, expectedVersion);
    row.set({ ...values, version: (row.version ?? 0) + 1 });
    await row.save();
    await recordRevision('local-payments', row.version, values, actorId, 'Actualización de cuentas Yape y Plin');
    return { before, localPayments: localPaymentsFromRow(row), updatedAt: row.updatedAt, version: row.version };
  },

  async getReceiptSettings(): Promise<EditableReceiptSettings> {
    const row = await ReceiptSetting.findByPk(1);
    return row ? receiptFromRow(row) : receiptFallback();
  },

  async getReceiptSettingsForAdmin() {
    const row = await ReceiptSetting.findByPk(1);
    return {
      receipts: row ? receiptFromRow(row) : receiptFallback(),
      isConfigured: Boolean(row),
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
      version: row?.version ?? 0,
    };
  },

  async updateReceiptSettings(input: EditableReceiptSettings, actorId: number, expectedVersion?: number) {
    const before = await settingsService.getReceiptSettings();
    const values = { ...input, updatedBy: actorId };
    const [row] = await ReceiptSetting.findOrCreate({
      where: { id: 1 },
      defaults: { id: 1, ...values },
    });
    assertSettingVersion(row.version ?? 1, expectedVersion);
    row.set({ ...values, version: (row.version ?? 0) + 1 });
    await row.save();
    await recordRevision('receipts', row.version, input, actorId, 'Actualización del flujo de comprobantes');
    return { before, receipts: receiptFromRow(row), updatedAt: row.updatedAt, version: row.version };
  },

  async getCommunicationSettings(): Promise<RuntimeCommunicationSettings> {
    const row = await CommunicationSetting.findByPk(1);
    return row ? runtimeFromCommunicationRow(row) : communicationFallback();
  },

  async getCommunicationSettingsForAdmin() {
    const row = await CommunicationSetting.findByPk(1);
    const runtime = row ? runtimeFromCommunicationRow(row) : communicationFallback();
    return {
      communication: sanitizeCommunication(runtime),
      source: runtime.source,
      isConfigured: Boolean(row),
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
      version: row?.version ?? 0,
    };
  },

  async updateCommunicationSettings(input: EditableCommunicationSettings, actorId: number, expectedVersion?: number) {
    const existing = await CommunicationSetting.findByPk(1);
    const beforeRuntime = existing ? runtimeFromCommunicationRow(existing) : communicationFallback();
    let storedPassword = existing?.smtpPasswordEncrypted ?? null;
    if (input.clearSmtpPassword) storedPassword = '';
    else if (input.smtpPassword?.trim()) storedPassword = encryptSetting(input.smtpPassword);

    const values = {
      emailNotificationsEnabled: input.emailNotificationsEnabled,
      inAppNotificationsEnabled: input.inAppNotificationsEnabled,
      orderUpdatesEnabled: input.orderUpdatesEnabled,
      whatsappUpdatesEnabled: input.whatsappUpdatesEnabled,
      planUpdatesEnabled: input.planUpdatesEnabled,
      staffAccessEnabled: input.staffAccessEnabled,
      availabilityAlertsEnabled: input.availabilityAlertsEnabled,
      availabilityEmailSubject: input.availabilityEmailSubject.trim(),
      availabilityEmailBody: input.availabilityEmailBody.trim(),
      smtpHost: input.smtpHost.trim() || null,
      smtpPort: input.smtpPort,
      smtpSecure: input.smtpSecure,
      smtpUser: input.smtpUser.trim() || null,
      smtpPasswordEncrypted: storedPassword,
      fromEmail: input.fromEmail.trim(),
      fromName: input.fromName.trim(),
      replyToEmail: input.replyToEmail.trim() || null,
      updatedBy: actorId,
    };

    const row = existing ?? CommunicationSetting.build({ id: 1, ...values });
    assertSettingVersion(row.version ?? 1, expectedVersion);
    row.set({ ...values, version: (row.version ?? 0) + 1 });
    await row.save();
    await recordRevision('communication', row.version, values, actorId, 'Actualización de comunicaciones');
    const runtime = runtimeFromCommunicationRow(row);
    return {
      before: sanitizeCommunication(beforeRuntime),
      communication: sanitizeCommunication(runtime),
      updatedAt: row.updatedAt,
      version: row.version,
    };
  },

  async getNotificationOverview() {
    const [recent, sent, failed] = await Promise.all([
      Notification.findAll({
        attributes: ['id', 'channel', 'template', 'recipient', 'subject', 'status', 'provider', 'errorMessage', 'sentAt', 'createdAt'],
        order: [['id', 'DESC']],
        limit: 25,
      }),
      Notification.count({ where: { status: NOTIFICATION_STATUS.SENT } }),
      Notification.count({ where: { status: NOTIFICATION_STATUS.FAILED } }),
    ]);
    return { totals: { sent, failed }, recent };
  },

  async listSettingRevisions(scope: 'business' | 'local-payments' | 'receipts' | 'communication' | 'theme') {
    return SettingRevision.findAll({ where: { scope }, attributes: ['id', 'scope', 'version', 'actorId', 'reason', 'createdAt'], order: [['version', 'DESC']], limit: 50 });
  },

  async rollbackSetting(scope: 'business' | 'local-payments' | 'receipts' | 'communication' | 'theme', revisionId: number, actorId: number, expectedVersion?: number) {
    const revision = await SettingRevision.findOne({ where: { id: revisionId, scope } });
    if (!revision) throw ApiError.notFound('Versión de configuración no encontrada');
    const snapshot = JSON.parse(decryptSetting(revision.snapshotEncrypted)) as Record<string, unknown>;
    if (scope === 'business') return this.updateBusinessInfo(snapshot as unknown as EditableBusinessInfo, actorId, expectedVersion);
    if (scope === 'local-payments') return this.updateLocalPaymentSettings(snapshot as unknown as EditableLocalPaymentSettings, actorId, expectedVersion);
    if (scope === 'receipts') return this.updateReceiptSettings(snapshot as unknown as EditableReceiptSettings, actorId, expectedVersion);
    if (scope === 'theme') return this.updateThemeDraft(snapshot as unknown as ThemeTokens, actorId, expectedVersion);
    const current = await this.getCommunicationSettings();
    return this.updateCommunicationSettings({ ...current, ...snapshot, smtpPassword: '', clearSmtpPassword: false } as EditableCommunicationSettings, actorId, expectedVersion);
  },

  /** Estado seguro de las conexiones externas; nunca devuelve secretos. */
  async getIntegrationStatus() {
    const communication = await settingsService.getCommunicationSettings();
    const stripe = Boolean(env.STRIPE_SECRET_KEY);
    const mercadoPago = Boolean(env.MERCADOPAGO_ACCESS_TOKEN);
    const webhook = Boolean(mercadoPago ? env.MERCADOPAGO_WEBHOOK_SECRET : env.STRIPE_WEBHOOK_SECRET);
    const paymentsReady = (mercadoPago || stripe) && webhook;
    const webPush = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
    const messaging = await messagingConfigService.admin();
    const whatsappConnectionReady = messaging.connectionReady && messaging.webhookReady;
    const whatsappTemplatesReady = !communication.whatsappUpdatesEnabled || Object.values(messaging.config.events).filter((rule) => rule.whatsapp).every((rule) => Boolean(rule.template));
    return {
      checkedAt: new Date().toISOString(),
      integrations: [
        {
          key: 'email',
          name: 'Correo transaccional',
          provider: communication.smtpHost ? 'SMTP' : isProduction ? 'Sin configurar' : 'Consola de desarrollo',
          status: communication.smtpHost ? 'READY' : isProduction ? 'ACTION_REQUIRED' : 'DEVELOPMENT',
          detail: communication.smtpHost ? `Remitente ${communication.fromEmail}` : 'Configura SMTP para enviar correos reales.',
        },
        {
          key: 'payments',
          name: 'Pagos online',
          provider: mercadoPago
            ? (env.MERCADOPAGO_MODE === 'live' ? 'Mercado Pago live' : 'Mercado Pago test')
            : stripe ? (env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ? 'Stripe live' : 'Stripe test') : 'Simulador local',
          status: paymentsReady ? 'READY' : isProduction ? 'ACTION_REQUIRED' : 'DEVELOPMENT',
          detail: paymentsReady ? 'Clave y firma de webhook configuradas.' : (mercadoPago || stripe) ? 'Falta la firma de webhook.' : 'Configura Mercado Pago o Stripe para cobrar online.',
        },
        {
          key: 'web_push',
          name: 'Avisos de cocina web',
          provider: 'Web Push VAPID',
          status: webPush ? 'READY' : isProduction ? 'ACTION_REQUIRED' : 'DEVELOPMENT',
          detail: webPush ? 'Las estaciones pueden recibir alertas en tiempo real.' : 'Configura VAPID para conservar suscripciones.',
        },
        {
          key: 'whatsapp',
          name: 'WhatsApp para pedidos y diseños',
          provider: 'WhatsApp Business Platform',
          status: messaging.config.testMode ? 'DEVELOPMENT' : whatsappConnectionReady && whatsappTemplatesReady && communication.whatsappUpdatesEnabled && messaging.config.enabled ? 'READY' : 'ACTION_REQUIRED',
          detail: messaging.config.testMode ? 'Modo de prueba: los avisos se simulan sin envío real. Gestiona Meta, el bot y las plantillas en Comunicaciones.' : !whatsappConnectionReady
            ? 'Completa el número, token, versión Graph y webhook desde Comunicaciones.'
            : !whatsappTemplatesReady
              ? 'Configura las plantillas aprobadas de los eventos habilitados desde Comunicaciones.'
              : communication.whatsappUpdatesEnabled ? 'Avisos activos para clientes que dieron su consentimiento.' : 'Conexión lista. Activa los avisos en Correo y avisos.',
        },
        {
          key: 'mobile',
          name: 'Aplicación móvil',
          provider: 'API Misky Challay',
          status: 'READY',
          detail: 'Versionado, mantenimiento y notificaciones push gestionados desde el servidor.',
        },
      ],
    };
  },
};

export type SettingsService = typeof settingsService;
