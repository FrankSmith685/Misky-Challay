import { Op } from 'sequelize';
import { MobileDevice, Notification } from '@database/models';
import { NOTIFICATION_STATUS } from '@database/models/notification.model';
import { PUSH_CHANNEL, PUSH_TEMPLATE, type PermissionCode, type PushChannelId, type PushTemplate } from '@config/constants';
import { logger } from '@config/logger';
import { staffAudienceService } from './staffAudience.service';

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

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
}

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
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
   * Nunca lanza: que falle Expo no puede tumbar un pedido ni un plan ya cobrado.
   * Devuelve `true` si el aviso llegó (ahora o en un intento anterior) a algún
   * dispositivo, para que quien llama pueda darlo por entregado.
   */
  async sendToUser(message: MobilePushMessage): Promise<boolean> {
    const devices = await MobileDevice.findAll({
      where: { userId: message.userId, isActive: true },
      order: [['id', 'ASC']],
    });
    if (devices.length === 0) return false;

    // Una fila por dispositivo y aviso: si ya existe, ese teléfono ya lo recibió.
    const registered = await Notification.findAll({
      where: {
        idempotencyKey: {
          [Op.in]: devices.map((device) => pushKey(message.idempotencyKey, device.id)),
        },
      },
      attributes: ['idempotencyKey', 'status'],
    });
    const alreadyHandled = new Set(registered.map((row) => row.idempotencyKey));
    const deliveredBefore = registered.some((row) => row.status === NOTIFICATION_STATUS.SENT);

    const pending = devices.filter(
      (device) => !alreadyHandled.has(pushKey(message.idempotencyKey, device.id)),
    );
    if (pending.length === 0) return deliveredBefore;

    const title = compact(message.title, MAX_TITLE_LENGTH);
    const body = compact(message.body, MAX_BODY_LENGTH);
    const channelId = message.channel ?? PUSH_CHANNEL.ORDER_UPDATES;
    const template = message.template ?? PUSH_TEMPLATE.ORDER_STATUS;

    try {
      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(pending.map((device) => ({
          to: device.expoPushToken,
          sound: 'default',
          title,
          body,
          data: { actionUrl: message.actionUrl, orderId: message.orderId ?? null },
          channelId,
          priority: 'high',
        }))),
      });
      if (!response.ok) throw new Error(`Expo Push respondió ${response.status}`);

      const payload = await response.json() as { data?: ExpoTicket[] | ExpoTicket };
      const tickets = Array.isArray(payload.data)
        ? payload.data
        : payload.data ? [payload.data] : [];

      let delivered = deliveredBefore;
      await Promise.all(pending.map(async (device, index) => {
        const ticket = tickets[index];
        const succeeded = ticket?.status === 'ok';
        if (succeeded) {
          delivered = true;
          await device.update({ lastSuccessAt: new Date(), lastSeenAt: new Date() });
        }
        // El cliente desinstaló la app o revocó el permiso: el token ya no sirve.
        if (ticket?.details?.error === 'DeviceNotRegistered') await device.update({ isActive: false });

        await Notification.create({
          userId: message.userId,
          orderId: message.orderId ?? null,
          channel: 'PUSH',
          template,
          recipient: device.expoPushToken,
          subject: title,
          actionUrl: message.actionUrl,
          status: succeeded ? NOTIFICATION_STATUS.SENT : NOTIFICATION_STATUS.FAILED,
          provider: 'expo',
          providerMessageId: ticket?.id ?? null,
          errorMessage: succeeded ? null : ticket?.message ?? 'Expo no devolvió ticket',
          idempotencyKey: pushKey(message.idempotencyKey, device.id),
          sentAt: succeeded ? new Date() : null,
        });
      }));

      return delivered;
    } catch (error) {
      logger.error('No se pudo enviar la notificación push móvil', error);
      return deliveredBefore;
    }
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
  })));
  return results.filter(Boolean).length;
};
