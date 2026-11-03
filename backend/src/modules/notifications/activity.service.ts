import { CustomerOrderCase } from '@database/models/customerJourney.model';
import { Op, type Model, type ModelStatic, type Transaction } from 'sequelize';
import { AppEvent, CakeDesignQuote, CakeDesignRequest, CakeProductionTask, Delivery, Driver, ExperienceProject, Notification, Order, Subscription, SubscriptionCycle, models, sequelize } from '@database/models';
import { PERMISSIONS, type PermissionCode } from '@config/constants';
import { logger } from '@config/logger';
import type { TokenPayload } from '@shared/utils/jwt';
import { staffAudienceService } from './staffAudience.service';
import { notificationsService } from './notifications.service';
import { whatsappService } from '@integrations/whatsapp/whatsapp.service';
import { mobilePushService } from './mobilePush.service';
import { orderCommunicationIsRelevant } from '@modules/communications/orderCommunications.logic';

const topics: Record<string, string> = {
  CustomerOrderCase: 'orders', CustomerCarePolicy: 'settings', CustomerWorkspace: 'workspace',
  Order: 'orders', OrderItem: 'orders', OrderStatusHistory: 'orders', Payment: 'payments', MobilePaymentClaim: 'payments', Refund: 'payments',
  Delivery: 'delivery', Driver: 'delivery', DeliverySlot: 'availability',
  CakeProductionTask: 'production', CakeStationCapacity: 'availability', CakeCapacityReservation: 'availability',
  CakeDesignRequest: 'designs', CakeDesignQuote: 'designs',
  CakeFinanceEntry: 'finance', CakeCommission: 'finance', CakeCommissionSettlement: 'finance', CakeOrderCostSnapshot: 'finance',
  BranchInventory: 'inventory', InventoryMovement: 'inventory', InventoryLot: 'inventory', InventoryItem: 'inventory',
  PurchaseOrder: 'procurement', PurchaseOrderItem: 'procurement', Supplier: 'procurement',
  Subscription: 'subscriptions', SubscriptionCycle: 'subscriptions', SubscriptionPlan: 'catalog', WalletTransaction: 'wallet', UserPlan: 'wallet',
  ExperienceProject: 'experiences', ExperiencePackage: 'catalog', ExperienceTemplate: 'catalog',
  Product: 'catalog', ProductVariant: 'catalog', CustomizationOption: 'catalog', CustomizationGroup: 'catalog', CakeTheme: 'catalog', CakeProductProfile: 'catalog', Recipe: 'catalog', RecipeItem: 'catalog',
  DiningTable: 'dining', DiningOffering: 'dining',
  Branch: 'coverage', BranchSchedule: 'coverage', CoverageZone: 'coverage', ZoneBranch: 'coverage',
  BusinessSetting: 'settings', CheckoutTerms: 'settings', CommunicationSetting: 'settings', LocalPaymentSetting: 'settings', ReceiptSetting: 'settings',
  Notification: 'notifications', User: 'account', UserRole: 'account', RolePermission: 'account',
  KitchenTicket: 'orders', CommunicationDelivery: 'communications', WhatsappConversation: 'communications', WhatsappMessage: 'communications', MessagingSetting: 'settings',
};
const permissions: Record<string, string[]> = {
  orders: ['order.read', 'order.update_status', 'payment.read', 'payment.verify'], payments: ['payment.read', 'payment.verify', 'payment.refund'],
  delivery: ['delivery.read', 'delivery.assign', 'delivery.operate'], production: ['kitchen.read'], designs: ['catalog.customization.write'],
  finance: ['cake.finance.read'], inventory: ['inventory.read', 'inventory.manage'], procurement: ['procurement.read', 'procurement.manage'],
  dining: ['dining.read', 'dining.operate'], subscriptions: ['plan.read', 'plan.manage'], wallet: ['plan.read', 'plan.manage'], account: ['user.read', 'user.manage', 'role.manage'],
  communications: ['communication.read', 'communication.reply'], experiences: ['experience.read', 'experience.write'],
};
const noticeModels = new Set(['CustomerOrderCase', 'Order', 'CakeDesignQuote', 'CakeDesignRequest', 'CakeProductionTask', 'Delivery', 'Subscription', 'SubscriptionCycle', 'ExperienceProject']);
let installed = false;

/** Recheck mutable entities before a queued phone alert leaves the server. */
export async function activityIsCurrent(event: AppEvent) {
  const model = (models as Record<string, unknown>)[event.model] as ModelStatic<Model> | undefined;
  if (!model) return false;
  const fields = ['status', 'version', 'assignedTo', 'driverId', 'expiresAt', 'orderId', 'readAt'].filter((field) => model.getAttributes()[field]);
  const row = await model.findByPk(event.entityId, { attributes: ['id', ...fields] });
  if (!row) return false;
  for (const field of ['status', 'version', 'assignedTo', 'driverId']) {
    if (event.model === 'Order' && field === 'status' && event.payload.status === 'CONFIRMED' && orderCommunicationIsRelevant('ORDER_CONFIRMED', String(row.get('status')))) continue;
    if (event.payload[field] !== undefined && row.get(field) !== event.payload[field]) return false;
  }
  if (event.model === 'Notification' && row.get('readAt')) return false;
  if (event.model === 'SubscriptionCycle' && (row.get('orderId') || new Date(row.get('expiresAt') as Date) <= new Date())) return false;
  if (event.model === 'CakeDesignQuote') {
    const quote = await CakeDesignQuote.findByPk(event.entityId);
    if (!quote || quote.status !== 'PROPOSED' || quote.expiresAt <= new Date()) return false;
    return (await CakeDesignQuote.findOne({ where: { requestId: quote.requestId }, order: [['version', 'DESC']] }))?.id === quote.id;
  }
  return true;
}

export const activityVisible = (actor: TokenPayload, event: Pick<AppEvent, 'topic' | 'branchId' | 'userId'>) => {
  if (event.userId === actor.sub) return true;
  if (['catalog', 'settings', 'coverage', 'availability'].includes(event.topic)) return true;
  if (!actor.isSuperAdmin && event.branchId != null && actor.branchIds.length && !actor.branchIds.includes(event.branchId)) return false;
  if (!actor.isSuperAdmin && event.branchId == null && event.userId != null) return false;
  return actor.isSuperAdmin || (permissions[event.topic] ?? []).some((permission) => actor.permissions.includes(permission));
};

/** Register only after bootstrap/seed, so installing a release does not notify about seed data. */
export const installActivityHooks = () => {
  if (installed) return;
  installed = true;
  for (const [name, model] of Object.entries(models)) {
    const topic = topics[name];
    if (!topic) continue;
    const target = model as unknown as ModelStatic<Model>;
    const record = async (row: Model, options: { transaction?: Transaction | null; activityCustomerNotification?: boolean }, action: string) => {
      const changed = row.changed() || [];
      if (action === 'updated' && !changed.length) return;
      let branchId = Number(row.get('branchId')) || null;
      let userId = Number(row.get('userId')) || (name === 'User' ? Number(row.get('id')) : null);
      const orderId = Number(row.get('orderId')) || (name === 'Payment' && row.get('payableType') === 'ORDER' ? Number(row.get('payableId')) : 0);
      if (orderId) {
        const order = await Order.findByPk(orderId, { attributes: ['branchId', 'userId'], transaction: options.transaction });
        branchId ??= order?.branchId ?? null; userId ??= order?.userId ?? null;
      }
      if (name === 'SubscriptionCycle') {
        const subscription = await Subscription.findByPk(Number(row.get('subscriptionId')), { transaction: options.transaction });
        branchId = subscription?.branchId ?? null; userId = subscription?.userId ?? null;
      }
      if (name === 'CakeDesignQuote') {
        const request = await CakeDesignRequest.findByPk(Number(row.get('requestId')), { attributes: ['branchId', 'userId'], transaction: options.transaction });
        branchId = request?.branchId ?? null; userId = request?.userId ?? null;
      }
      if (name === 'Branch') branchId = Number(row.get('id'));
      const status = row.get('status');
      const previousStatus = row.previous('status');
      const payload = { action, status, previousStatus, skipCustomer: options.activityCustomerNotification === false, changed, assignedTo: row.get('assignedTo'), previousAssignedTo: row.previous('assignedTo'), driverId: row.get('driverId'), previousDriverId: row.previous('driverId'), version: row.get('version') };
      const paymentNotice = name === 'Notification' && action === 'created' && row.get('channel') === 'IN_APP' && String(row.get('template')).startsWith('PAYMENT_');
      const notify = paymentNotice || (action !== 'deleted' && noticeModels.has(name) && (action === 'created' || changed.some((key) => ['status', 'assignedTo', 'driverId', ...(name === 'CustomerOrderCase' ? ['version'] : [])].includes(key))));
      await AppEvent.create({ topic, model: name, entityId: Number(row.get('id')) || 0, branchId, userId, payload, state: notify ? 'PENDING' : 'DONE', availableAt: new Date() }, { transaction: options.transaction });
    };
    target.addHook('afterCreate', 'activity', (row, options) => record(row, options, 'created'));
    target.addHook('afterUpdate', 'activity', (row, options) => record(row, options, 'updated'));
    target.addHook('afterDestroy', 'activity', (row, options) => record(row, options, 'deleted'));
    target.addHook('afterBulkCreate', 'activity', async (rows, options) => { for (const row of rows) await record(row, options, 'created'); });
    target.addHook('afterBulkUpdate', 'activity', async (options) => {
      if (options.individualHooks) return;
      await AppEvent.create({ topic, model: name, entityId: 0, state: 'DONE', payload: { action: 'bulk' }, availableAt: new Date() }, { transaction: options.transaction });
    });
  }
};

async function deliverEvent(event: AppEvent) {
  const payload = event.payload;
  const branchId = event.branchId;
  const key = `activity-${event.id}`;
  if (event.model === 'Notification') {
    const notice = await Notification.findByPk(event.entityId);
    if (!notice?.userId) return;
    if (notice.permissionCode && notice.branchId && !(await staffAudienceService.userIds(notice.branchId, notice.permissionCode as PermissionCode)).includes(notice.userId)) return;
    await mobilePushService.sendToUser({ userId: notice.userId, title: notice.subject, body: notice.body ?? 'Consulta el detalle del pago.', actionUrl: notice.actionUrl ?? '/cuenta/pedidos', idempotencyKey: notice.idempotencyKey.replace(/:in-app$/, ''), branchId: notice.branchId ?? undefined, permission: notice.permissionCode as PermissionCode | undefined, sourceEventId: event.id });
    return;
  }
  const send = async (userId: number | null | undefined, title: string, body: string, actionUrl: string, permissionCode?: PermissionCode, category: 'ORDER' | 'PLAN' | 'OPERATIONS' = 'OPERATIONS') => {
    if (!userId) return;
    await notificationsService.notifyEvent({ userId, branchId, title, body, actionUrl, permissionCode, category, key: `${key}-${userId}`, template: `${event.topic.toUpperCase()}_${String(payload.status ?? payload.action).toUpperCase()}`.slice(0, 60), sendEmail: event.model !== 'ExperienceProject', sourceEventId: event.id });
  };
  const staff = async (permission: PermissionCode, title: string, body: string, url: string) => {
    if (!branchId) return;
    for (const id of await staffAudienceService.userIds(branchId, permission)) await send(id, title, body, url, permission);
  };
  if (event.model === 'CustomerOrderCase') {
    const entry = await CustomerOrderCase.findByPk(event.entityId);
    const order = entry ? await Order.findByPk(entry.orderId) : null;
    if (!entry || !order) return;
    const last = entry.messagesJson.at(-1);
    if (last?.author === 'STAFF') await send(order.userId, 'Actualización de tu pedido', 'Tienes una respuesta o propuesta para revisar.', `/cuenta/pedidos/${encodeURIComponent(order.orderNumber)}`, undefined, 'ORDER');
    else await staff(PERMISSIONS.ORDER_READ, 'Atención pendiente del cliente', `Revisa la consulta del pedido ${order.orderNumber}.`, `/admin/pedidos?pedido=${encodeURIComponent(order.orderNumber)}&branchId=${order.branchId}`);
    return;
  }
  if (event.model === 'Order') {
    const order = await Order.findByPk(event.entityId);
    if (!order) return;
    const url = `/admin/pedidos?branchId=${branchId}&pedido=${encodeURIComponent(order.orderNumber)}`;
    if (payload.action === 'created') {
      if (order.source !== 'WEB' || !order.userId) return;
      await staff(PERMISSIONS.ORDER_READ, `Nuevo pedido ${order.orderNumber}`, 'Revisa el pago y contacta al cliente para coordinar el diseño y la entrega o el recojo.', url);
      if (['PENDING_PAYMENT', 'CONFIRMED'].includes(order.status) && !payload.skipCustomer) {
        await notificationsService.notifyOrderStatus(order.id, order.status, true);
        await whatsappService.notifyOrder(order.id, order.status);
      }
      return;
    }
    if (!payload.status || payload.previousStatus === payload.status || !orderCommunicationIsRelevant(`ORDER_${payload.status}`, order.status)) return;
    const notifiedStatus = payload.status as typeof order.status;
    if (!payload.skipCustomer) {
      await notificationsService.notifyOrderStatus(order.id, notifiedStatus, true);
      await whatsappService.notifyOrder(order.id, notifiedStatus);
    }
    if (['CONFIRMED', 'READY', 'CANCELLED'].includes(notifiedStatus)) await staff(PERMISSIONS.ORDER_READ,
      notifiedStatus === 'CONFIRMED' ? `Pedido confirmado ${order.orderNumber}` : notifiedStatus === 'READY' ? `Pedido listo ${order.orderNumber}` : `Pedido cancelado ${order.orderNumber}`,
      notifiedStatus === 'CONFIRMED' ? 'Contacta al cliente para coordinar el diseño, las referencias y la entrega o el recojo.' : 'Consulta el pedido y coordina la siguiente etapa con el equipo.', url);
    if (notifiedStatus === 'CONFIRMED') await staff(PERMISSIONS.KITCHEN_READ, `Pedido confirmado ${order.orderNumber}`, 'Revisa su programación y preparación.', `/admin/cocina?branchId=${branchId}`);
    if (notifiedStatus === 'READY' && order.deliveryType === 'DELIVERY') await staff(PERMISSIONS.DELIVERY_READ, `Pedido listo para reparto ${order.orderNumber}`, 'Coordina el recojo desde cocina y la entrega al cliente.', `/admin/reparto?branchId=${branchId}`);
    return;
  }
  if (event.model === 'CakeDesignRequest') {
    const request = await CakeDesignRequest.findByPk(event.entityId);
    if (!request || request.status !== payload.status) return;
    if (payload.action === 'created' || request.status === 'ACCEPTED') await staff(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE,
      request.status === 'ACCEPTED' ? 'Diseño aceptado por el cliente' : 'Nueva solicitud de diseño', `Solicitud #${request.id}. Revisa los detalles y la fecha solicitada.`, `/admin/tortas?branchId=${branchId}&seccion=designs&solicitud=${request.id}`);
    if (request.status === 'REJECTED') await send(request.userId, 'Tu solicitud de diseño fue revisada', `Consulta la respuesta de la solicitud #${request.id}.`, `/cuenta/disenos?solicitud=${request.id}`, undefined, 'ORDER');
    return;
  }
  if (event.model === 'CakeDesignQuote') {
    const quote = await CakeDesignQuote.findByPk(event.entityId);
    if (!quote || quote.status !== 'PROPOSED' || quote.expiresAt <= new Date()) return;
    const request = await CakeDesignRequest.findByPk(quote.requestId, { attributes: ['id', 'userId', 'status'] });
    const latest = await CakeDesignQuote.findOne({ where: { requestId: quote.requestId }, order: [['version', 'DESC']] });
    if (!request || request.status !== 'QUOTED' || latest?.id !== quote.id) return;
    await send(request.userId, 'Tu cotización está lista', `Revisa la propuesta ${quote.version} de la solicitud #${request.id} antes de su vencimiento.`, `/cuenta/disenos?solicitud=${request.id}`, undefined, 'ORDER');
    return;
  }
  if (event.model === 'CakeProductionTask') {
    const task = await CakeProductionTask.findByPk(event.entityId);
    if (!task || task.status !== payload.status || task.assignedTo !== payload.assignedTo) return;
    const changed = payload.changed as string[] ?? [];
    if (payload.action === 'created') return;
    const body = `Revisa la etapa #${event.entityId} y sus materiales antes de continuar.`;
    const url = `/admin/tortas?branchId=${branchId}&seccion=production&tarea=${event.entityId}`;
    if (changed.includes('assignedTo') && payload.assignedTo) await send(Number(payload.assignedTo), 'Tienes una etapa de producción asignada', body, url, PERMISSIONS.KITCHEN_OPERATE);
    if (payload.status === 'BLOCKED' || payload.previousStatus === 'BLOCKED') await staff(PERMISSIONS.KITCHEN_OPERATE, payload.status === 'BLOCKED' ? 'Etapa de producción bloqueada' : 'Bloqueo de producción resuelto', body, url);
    return;
  }
  if (event.model === 'Delivery') {
    const delivery = await Delivery.findByPk(event.entityId);
    const order = delivery ? await Order.findByPk(delivery.orderId) : null;
    if (!delivery || !order || delivery.status !== payload.status) return;
    const url = `/admin/reparto?branchId=${branchId}&reparto=${delivery.id}`;
    if (delivery.driverId && (payload.previousDriverId !== delivery.driverId || payload.previousStatus !== payload.status)) {
      const driver = await Driver.findByPk(delivery.driverId);
      if (driver?.isActive && driver.branchId === branchId) await send(driver.userId, `Reparto ${order.orderNumber}`, 'Consulta la asignación y el estado de esta entrega.', url, PERMISSIONS.DELIVERY_OPERATE);
    }
    if (payload.previousDriverId && payload.previousDriverId !== delivery.driverId) {
      const previous = await Driver.findByPk(Number(payload.previousDriverId));
      if (previous?.isActive) await send(previous.userId, 'Tu reparto fue reasignado', `${order.orderNumber} tiene otro responsable.`, `/admin/reparto?branchId=${branchId}`, PERMISSIONS.DELIVERY_OPERATE);
    }
    if (delivery.driverId && payload.previousDriverId !== delivery.driverId) await staff(PERMISSIONS.DELIVERY_ASSIGN,
      payload.previousDriverId ? `Reparto reasignado ${order.orderNumber}` : `Reparto asignado ${order.orderNumber}`, 'Consulta el conductor responsable y el seguimiento de la entrega.', url);
    if (delivery.status === 'FAILED') await staff(PERMISSIONS.DELIVERY_ASSIGN, `Entrega fallida ${order.orderNumber}`, 'Revisa el motivo y coordina la solución con el cliente.', url);
    return;
  }
  if (event.model === 'Subscription') {
    const subscription = await Subscription.findByPk(event.entityId);
    if (!subscription || subscription.status !== payload.status || !['ACTIVE', 'PAST_DUE', 'CANCELED'].includes(subscription.status)) return;
    const title = subscription.status === 'ACTIVE' ? 'Tu suscripción está activa' : subscription.status === 'PAST_DUE' ? 'Revisa el cobro de tu suscripción' : 'La renovación de tu suscripción fue cancelada';
    await send(subscription.userId, title, subscription.planNameSnapshot, `/cuenta/suscripciones?suscripcion=${subscription.id}`, undefined, 'PLAN');
    return;
  }
  if (event.model === 'SubscriptionCycle') {
    const cycle = await SubscriptionCycle.findByPk(event.entityId);
    const subscription = cycle ? await Subscription.findByPk(cycle.subscriptionId) : null;
    if (!cycle || !subscription || cycle.orderId || cycle.expiresAt <= new Date()) return;
    await send(subscription.userId, payload.action === 'reminder' ? 'Programa tu caja antes de su vencimiento' : 'Ya puedes programar tu caja mensual', subscription.planNameSnapshot, `/cuenta/suscripciones?suscripcion=${subscription.id}`, undefined, 'PLAN');
    return;
  }
  if (event.model === 'ExperienceProject') {
    const project = await ExperienceProject.findByPk(event.entityId);
    const order = project ? await Order.findByPk(project.orderId) : null;
    if (!project || !order || project.status !== payload.status || project.version !== payload.version) return;
    if (['AWAITING_APPROVAL', 'PUBLISHED', 'PAUSED'].includes(project.status)) await send(order.userId,
      project.status === 'AWAITING_APPROVAL' ? 'Tu experiencia QR espera tu revisión' : project.status === 'PUBLISHED' ? 'Consulta la publicación de tu experiencia QR' : 'Tu experiencia QR fue pausada', order.orderNumber, `/cuenta/pedidos/${order.orderNumber}`, undefined, 'ORDER');
    if (project.status === 'APPROVED' || (project.status === 'IN_PROGRESS' && payload.previousStatus === 'AWAITING_APPROVAL')) await staff(PERMISSIONS.EXPERIENCE_WRITE, project.status === 'APPROVED' ? 'El cliente aprobó la experiencia QR' : 'El cliente solicitó cambios en la experiencia QR', order.orderNumber, `/admin/experiencias-qr?branchId=${branchId}&proyecto=${project.id}`);
  }
}

export const processActivityOutbox = async () => {
  await AppEvent.update({ state: 'PENDING', lockedAt: null }, { where: { state: 'PROCESSING', lockedAt: { [Op.lt]: new Date(Date.now() - 180000) } } });
  for (let i = 0; i < 30; i++) {
    const event = await sequelize.transaction(async (transaction) => {
      const row = await AppEvent.findOne({ where: { state: 'PENDING', availableAt: { [Op.lte]: new Date() } }, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE, skipLocked: true });
      if (!row) return null;
      await row.update({ state: 'PROCESSING', lockedAt: new Date(), attempts: row.attempts + 1 }, { transaction });
      return row;
    });
    if (!event) break;
    try { await deliverEvent(event); await event.update({ state: 'DONE', lockedAt: null, error: null }); }
    catch (error) {
      await event.update({ state: event.attempts >= 5 ? 'FAILED' : 'PENDING', lockedAt: null, availableAt: new Date(Date.now() + 30000 * 2 ** event.attempts), error: 'No se pudo completar el aviso; se conserva para revisión.' });
      logger.error('Fallo procesando un evento de actividad', error);
    }
  }
};

export const enqueueSubscriptionReminders = async () => {
  const cycles = await SubscriptionCycle.findAll({ where: { orderId: null, expiresAt: { [Op.between]: [new Date(), new Date(Date.now() + 48 * 3600000)] } }, attributes: ['id'], limit: 200 });
  for (const candidate of cycles) await sequelize.transaction(async (transaction) => {
    const cycle = await SubscriptionCycle.findByPk(candidate.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!cycle || cycle.orderId || cycle.expiresAt <= new Date()) return;
    const previous = await AppEvent.findOne({ where: { model: 'SubscriptionCycle', entityId: cycle.id, 'payload.action': 'reminder' }, transaction });
    if (previous) return;
    const subscription = await Subscription.findByPk(cycle.subscriptionId, { transaction });
    if (!subscription) return;
    await AppEvent.create({ topic: 'subscriptions', model: 'SubscriptionCycle', entityId: cycle.id, branchId: subscription.branchId, userId: subscription.userId, state: 'PENDING', payload: { action: 'reminder' }, availableAt: new Date() }, { transaction });
  });
  await AppEvent.destroy({ where: { state: 'DONE', createdAt: { [Op.lt]: new Date(Date.now() - 30 * 86400000) } } });
};
