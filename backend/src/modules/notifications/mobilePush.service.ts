import { CustomerWorkspace } from '@database/models/customerJourney.model';
import { MobileDevice, Notification, PushDelivery } from '@database/models';
import { NOTIFICATION_STATUS } from '@database/models/notification.model';
import { PUSH_CHANNEL, PUSH_TEMPLATE, type PermissionCode, type PushChannelId, type PushTemplate } from '@config/constants';
import { staffAudienceService } from './staffAudience.service';

export interface MobilePushMessage {
  userId: number;
  title: string;
  body: string;
  /** Ruta interna de la app a la que lleva el aviso al tocarlo. */
  actionUrl: string;
  /** Canal del teléfono. Android permite silenciar cada uno por separado. */
  channel?: PushChannelId;
  template?: PushTemplate;
  orderId?: number | null;
  /** Misma clave que el correo del mismo aviso: garantiza un envío por dispositivo. */
  idempotencyKey: string;
  branchId?: number;
  permission?: PermissionCode;
  sourceEventId?: number;
}

/** `notifications.subject` es STRING(200): un título más largo rompería el registro. */
const MAX_TITLE_LENGTH = 200;
const MAX_BODY_LENGTH = 178;

/**
 * Los textos vienen de plantillas de correo, con saltos de línea y párrafos.
 * En la barra de avisos del teléfono solo cabe una línea corta.
 */
const compact = (value: string, maxLength: number): string => {
  const singleLine = value.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, maxLength - 1).trimEnd()}…`;
};

const pushKey = (idempotencyKey: string, deviceId: number): string =>
  `${idempotencyKey}:push:${deviceId}`;

export const mobilePushService = {
  async register(userId: number, input: {
    expoPushToken: string;
    platform: 'android' | 'ios';
    deviceId?: string;
    appVersion?: string;
  }) {
    const [device, created] = await MobileDevice.findOrCreate({
      where: { expoPushToken: input.expoPushToken },
      defaults: {
        userId,
        expoPushToken: input.expoPushToken,
        platform: input.platform,
        deviceId: input.deviceId ?? null,
        appVersion: input.appVersion ?? null,
        isActive: true,
        lastSeenAt: new Date(),
      },
    });

    if (!created) {
      await device.update({
        userId,
        platform: input.platform,
        deviceId: input.deviceId ?? device.deviceId,
        appVersion: input.appVersion ?? device.appVersion,
        isActive: true,
        lastSeenAt: new Date(),
      });
    }

    return { id: device.id, platform: device.platform, isActive: device.isActive };
  },

  async unregister(userId: number, expoPushToken: string) {
    await MobileDevice.update(
      { isActive: false, lastSeenAt: new Date() },
      { where: { userId, expoPushToken } },
    );
  },

  /**
   * Manda el aviso a todos los teléfonos activos del cliente.
   *
   * Persiste el aviso antes de contactar a Expo. Los fallos de persistencia los maneja el outbox o el llamador.
   * Devuelve true cuando el aviso queda en una cola durable. Los receipts confirman el traspaso a FCM/APNs; no garantizan recepci?n ni lectura en el tel?fono.
   */
  async sendToUser(message: MobilePushMessage): Promise<boolean> {
    if (!message.permission && (await CustomerWorkspace.findByPk(message.userId))?.channelsJson.push === false) return false;
    const devices = await MobileDevice.findAll({ where: { userId: message.userId, isActive: true }, order: [['id', 'ASC']] });
    if (!devices.length) return false;
    let queued = false;
    for (const device of devices) {
      const key = pushKey(message.idempotencyKey, device.id);
      const legacy = await Notification.findOne({ where: { idempotencyKey: key } });
      if (legacy?.status === NOTIFICATION_STATUS.SENT) { queued = true; continue; }
      const [delivery] = await PushDelivery.findOrCreate({ where: { idempotencyKey: key }, defaults: {
        userId: message.userId, deviceId: device.id, idempotencyKey: key,
        payload: { title: compact(message.title, MAX_TITLE_LENGTH), body: compact(message.body, MAX_BODY_LENGTH), actionUrl: message.actionUrl, orderId: message.orderId ?? null, channel: message.channel ?? PUSH_CHANNEL.ORDER_UPDATES, template: message.template ?? PUSH_TEMPLATE.ORDER_STATUS, branchId: message.branchId, permission: message.permission, sourceEventId: message.sourceEventId },
        availableAt: new Date(),
        state: legacy?.status === NOTIFICATION_STATUS.FAILED && /no devolvi[oó].*ticket|desconocid|unknown|timeout/i.test(legacy.errorMessage ?? '') ? 'UNKNOWN' : 'QUEUED',
      } });
      queued ||= !['FAILED', 'UNKNOWN'].includes(delivery.state);
    }
    return queued;
  },
};

/** Envía una alerta operativa a cada cuenta autorizada y a todos sus teléfonos. */
export const sendMobilePushToStaff = async (
  input: Omit<MobilePushMessage, 'userId'> & { branchId: number; permission: PermissionCode },
): Promise<number> => {
  const userIds = await staffAudienceService.userIds(input.branchId, input.permission);
  const results = await Promise.all(userIds.map((userId) => mobilePushService.sendToUser({
    userId,
    title: input.title,
    body: input.body,
    actionUrl: input.actionUrl,
    channel: input.channel,
    template: input.template,
    orderId: input.orderId,
    idempotencyKey: input.idempotencyKey,
    branchId: input.branchId,
    permission: input.permission,
  })));
  return results.filter(Boolean).length;
};
