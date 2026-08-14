import { createHash } from 'node:crypto';
import { Op } from 'sequelize';
import webpush, { type PushSubscription } from 'web-push';
import { KitchenPushSubscription } from '@database/models';
import { env, isProduction } from '@config/env';
import { logger } from '@config/logger';
import { PERMISSIONS } from '@config/constants';
import { staffAudienceService } from '@modules/notifications/staffAudience.service';

const generated = !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY
  ? webpush.generateVAPIDKeys()
  : null;
const publicKey = env.VAPID_PUBLIC_KEY ?? generated?.publicKey ?? '';
const privateKey = env.VAPID_PRIVATE_KEY ?? generated?.privateKey ?? '';

if (publicKey && privateKey) webpush.setVapidDetails(env.VAPID_SUBJECT, publicKey, privateKey);
if (generated && !isProduction) {
  logger.warn('KDS Web Push usa claves efimeras de desarrollo; configura VAPID_* para conservar suscripciones tras reiniciar');
}

const hashEndpoint = (endpoint: string) => createHash('sha256').update(endpoint).digest('hex');

interface NotificationPayload {
  title: string;
  body: string;
  tag: string;
  url?: string;
  requireInteraction?: boolean;
}

export const kitchenPushService = {
  config() {
    return { enabled: Boolean(publicKey && privateKey), publicKey };
  },

  async subscribe(input: {
    endpoint: string;
    p256dh: string;
    auth: string;
    userId: number;
    branchId: number;
    userAgent?: string;
  }) {
    const endpointHash = hashEndpoint(input.endpoint);
    const [subscription, created] = await KitchenPushSubscription.findOrCreate({
      where: { endpointHash },
      defaults: {
        endpointHash,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userId: input.userId,
        branchId: input.branchId,
        userAgent: input.userAgent?.slice(0, 255) || null,
        isActive: true,
      },
    });
    if (!created) {
      await subscription.update({
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userId: input.userId,
        branchId: input.branchId,
        userAgent: input.userAgent?.slice(0, 255) || null,
        isActive: true,
      });
    }
    return subscription;
  },

  async unsubscribe(endpoint: string, userId: number): Promise<void> {
    await KitchenPushSubscription.update(
      { isActive: false },
      { where: { endpointHash: hashEndpoint(endpoint), userId } },
    );
  },

  async notifyBranch(branchId: number, payload: NotificationPayload): Promise<number> {
    if (!publicKey || !privateKey) return 0;
    const audience = await staffAudienceService.userIds(branchId, PERMISSIONS.KITCHEN_READ);
    if (audience.length === 0) return 0;
    const subscriptions = await KitchenPushSubscription.findAll({
      where: { branchId, userId: { [Op.in]: audience }, isActive: true },
      limit: 100,
    });
    let sent = 0;
    await Promise.all(subscriptions.map(async (row) => {
      const subscription: PushSubscription = {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      try {
        await webpush.sendNotification(subscription, JSON.stringify({
          ...payload,
          url: payload.url ?? '/admin/cocina?kds=1',
          requireInteraction: payload.requireInteraction ?? true,
        }), { TTL: 300, urgency: 'high' });
        sent += 1;
        await row.update({ lastSuccessAt: new Date() });
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) await row.update({ isActive: false });
        else logger.error(`No se pudo enviar Web Push KDS a la suscripcion ${row.id}`, error);
      }
    }));
    return sent;
  },
};
