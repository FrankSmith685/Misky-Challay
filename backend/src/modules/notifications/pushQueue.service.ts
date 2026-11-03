import { Op } from 'sequelize';
import { AppEvent, MobileDevice, Notification, PushDelivery, sequelize } from '@database/models';
import { logger } from '@config/logger';
import { staffAudienceService } from './staffAudience.service';
import type { PermissionCode } from '@config/constants';
import { activityIsCurrent } from './activity.service';
import { CustomerWorkspace } from '@database/models/customerJourney.model';

type ExpoResult = { status: 'ok' | 'error'; id?: string; message?: string; details?: { error?: string } };
const endpoint = 'https://exp.host/--/api/v2/push';
// An Expo receipt confirms handoff to FCM/APNs, not reception or reading on the phone.
const retryable = (code?: string) => ['MessageRateExceeded', 'ExpoServerError'].includes(code ?? '');
let running = false;

async function marker(row: PushDelivery, device: MobileDevice) {
  if (['QUEUED', 'ACCEPTED'].includes(row.state)) return;
  const delivered = row.state === 'PROVIDER_CONFIRMED';
  const values = { userId: row.userId, orderId: Number(row.payload.orderId) || null, channel: 'PUSH', template: String(row.payload.template),
    recipient: device.expoPushToken, subject: String(row.payload.title), body: String(row.payload.body), actionUrl: String(row.payload.actionUrl),
    status: delivered ? 'SENT' as const : 'FAILED' as const, deliveryState: row.state, provider: 'expo', providerMessageId: row.ticketId,
    errorMessage: row.error, idempotencyKey: row.idempotencyKey, sentAt: delivered ? new Date() : null };
  const [notification, created] = await Notification.findOrCreate({ where: { idempotencyKey: row.idempotencyKey }, defaults: values });
  if (!created) await notification.update(values);
}

async function send(row: PushDelivery) {
  if (!row.payload.permission && (await CustomerWorkspace.findByPk(row.userId))?.channelsJson.push === false) { await row.update({ state: 'FAILED', lockedAt: null, error: 'Canal desactivado por el cliente.' }); return; }
  if (row.payload.sourceEventId) {
    const event = await AppEvent.findByPk(Number(row.payload.sourceEventId));
    if (!event || !await activityIsCurrent(event)) { await row.update({ state: 'FAILED', lockedAt: null, error: 'El aviso corresponde a un estado anterior.' }); return; }
  }
  const device = await MobileDevice.findByPk(row.deviceId);
  if (!device || !device.isActive || device.userId !== row.userId) {
    await row.update({ state: 'FAILED', lockedAt: null, error: 'El dispositivo ya no pertenece a esta sesión.' }); return;
  }
  if (row.payload.permission && row.payload.branchId && !(await staffAudienceService.userIds(Number(row.payload.branchId), row.payload.permission as PermissionCode)).includes(row.userId)) {
    await row.update({ state: 'FAILED', lockedAt: null, error: 'La cuenta ya no tiene permiso para esta operación.' }); return;
  }
  let response: Response;
  try {
    response = await fetch(`${endpoint}/send`, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to: device.expoPushToken, title: row.payload.title, body: row.payload.body, sound: 'default', priority: 'high', channelId: row.payload.channel,
        data: { actionUrl: row.payload.actionUrl, orderId: row.payload.orderId } }) });
  } catch {
    // The provider may have accepted the request before the connection was lost.
    await row.update({ state: 'UNKNOWN', lockedAt: null, error: 'Respuesta del proveedor desconocida. Requiere revisión antes de reenviar.' });
    await marker(row, device); return;
  }
  if (!response.ok) {
    const canRetry = response.status === 429 || response.status >= 500;
    await row.update({ state: canRetry && row.attempts < 5 ? 'QUEUED' : 'FAILED', availableAt: new Date(Date.now() + 30000 * 2 ** row.attempts), lockedAt: null, error: `Proveedor HTTP ${response.status}` });
    await marker(row, device); return;
  }
  let ticket: ExpoResult | undefined;
  try { const data = await response.json() as { data?: ExpoResult | ExpoResult[] }; ticket = Array.isArray(data.data) ? data.data[0] : data.data; }
  catch { /* A malformed response cannot establish whether the provider accepted the push. */ }
  if (ticket?.status === 'ok' && ticket.id) {
    await row.update({ state: 'ACCEPTED', ticketId: ticket.id, availableAt: new Date(Date.now() + 900000), lockedAt: null, error: null });
  } else {
    if (ticket?.details?.error === 'DeviceNotRegistered') await device.update({ isActive: false });
    await row.update({ state: ticket ? retryable(ticket.details?.error) && row.attempts < 5 ? 'QUEUED' : 'FAILED' : 'UNKNOWN', availableAt: new Date(Date.now() + 30000 * 2 ** row.attempts), lockedAt: null, error: ticket?.message ?? 'El proveedor no devolvió un ticket.' });
  }
  await marker(row, device);
}

async function receipts() {
  const rows = await PushDelivery.findAll({ where: { state: 'ACCEPTED', availableAt: { [Op.lte]: new Date() } }, limit: 100 });
  if (!rows.length) return;
  const response = await fetch(`${endpoint}/getReceipts`, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: rows.map((row) => row.ticketId) }) });
  if (!response.ok) return;
  const data = await response.json() as { data?: Record<string, ExpoResult> };
  for (const row of rows) {
    const update = async (values: Partial<PushDelivery>) => {
      const [changed] = await PushDelivery.update(values, { where: { id: row.id, state: 'ACCEPTED', ticketId: row.ticketId } });
      if (changed) row.set(values);
      return changed > 0;
    };
    const receipt = data.data?.[row.ticketId!];
    if (!receipt) {
      await update({ state: Date.now() - row.createdAt.getTime() > 86400000 ? 'UNKNOWN' : 'ACCEPTED', availableAt: new Date(Date.now() + 900000), error: 'Receipt pendiente.' }); continue;
    }
    const device = await MobileDevice.findByPk(row.deviceId);
    const succeeded = receipt.status === 'ok';
    const retry = !succeeded && retryable(receipt.details?.error) && row.attempts < 5;
    if (!await update({ state: succeeded ? 'PROVIDER_CONFIRMED' : retry ? 'QUEUED' : 'FAILED', ticketId: retry ? null : row.ticketId, availableAt: new Date(Date.now() + 30000 * 2 ** row.attempts), error: succeeded ? null : receipt.message ?? 'Entrega rechazada.' })) continue;
    if (device) {
      if (succeeded) await device.update({ lastSuccessAt: new Date() });
      if (receipt.details?.error === 'DeviceNotRegistered') await device.update({ isActive: false });
      await marker(row, device);
    }
  }
}

export async function processPushQueue() {
  if (running) return;
  running = true;
  try {
    // A crashed sender has an uncertain outcome; replaying could duplicate the push.
    await PushDelivery.update({ state: 'UNKNOWN', lockedAt: null, error: 'El proceso se interrumpió durante el envío.' }, { where: { state: 'SENDING', lockedAt: { [Op.lt]: new Date(Date.now() - 180000) } } });
    for (let index = 0; index < 30; index++) {
      const row = await sequelize.transaction(async (transaction) => {
        const delivery = await PushDelivery.findOne({ where: { state: 'QUEUED', availableAt: { [Op.lte]: new Date() } }, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE, skipLocked: true });
        if (delivery) await delivery.update({ state: 'SENDING', attempts: delivery.attempts + 1, lockedAt: new Date() }, { transaction });
        return delivery;
      });
      if (!row) break;
      await send(row);
    }
    await receipts();
  } catch (error) { logger.error('Fallo la cola durable de push', error); }
  finally { running = false; }
}
