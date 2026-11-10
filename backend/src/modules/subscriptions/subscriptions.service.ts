import { checkoutTermsService } from '@modules/settings/checkoutTerms.service';
import { settingsService } from '@modules/settings/settings.service';
import { geoService } from '@modules/geo/geo.service';
import { Op } from 'sequelize';
import { Branch, CakeCommission, City, DeliverySlot, Order, OrderItem, Payment, Product, ProductVariant, Subscription, SubscriptionCycle, SubscriptionPlan, User, sequelize } from '@database/models';
import type { BoxItem } from '@database/models/subscription.model';
import { SUBSCRIPTION_STATUS } from '@database/models/subscription.model';
import { PAYABLE_TYPE } from '@database/models/payment.model';
import { DELIVERY_TYPE, ORDER_STATUS, PAYMENT_PROVIDER, PAYMENT_STATUS, SERVICE_MODE } from '@config/constants';
import { env } from '@config/env';
import { ApiError } from '@shared/errors/ApiError';
import { round2 } from '@shared/utils/money';
import { addDaysToIsoDate, zonedDateAt, zonedParts } from '@shared/utils/datetime';
import { splitTaxFromGross } from '@shared/utils/tax';
import { confirmPaidOrder } from '@modules/payments/payments.service';
import { validateMercadoPagoSignature } from '@integrations/payments/mercadopago.provider';
import { mpSubscriptions, type MpInvoice, type MpSubscription } from './mercadoPagoSubscriptions';

export const SUBSCRIPTION_TERMS_VERSION = '2026-10-27';

const monthAfter = (date: Date) => {
  const next = new Date(date);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, last));
  return next;
};

const snapshotItems = async (items: Array<{ variantId: number; quantity: number }>): Promise<BoxItem[]> => {
  if (!items.length || items.length > 12 || items.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 24)) {
    throw ApiError.badRequest('Configura de 1 a 12 presentaciones con cantidades válidas');
  }
  if (new Set(items.map((item) => item.variantId)).size !== items.length) throw ApiError.badRequest('No repitas la misma presentación');
  const variants = await ProductVariant.findAll({ where: { id: items.map((item) => item.variantId), isActive: true }, include: [{ model: Product, as: 'product' }] });
  if (variants.length !== items.length) throw ApiError.badRequest('Una presentación de la caja no está disponible');
  return items.map(({ variantId, quantity }) => {
    const variant = variants.find((entry) => entry.id === variantId)!;
    const product = variant.get('product') as Product;
    if (!product || product.status !== 'ACTIVE' || product.type !== 'FIXED' || product.family === 'CAKE') {
      throw ApiError.badRequest('La caja solo puede incluir postres y bocaditos de catálogo con precio fijo');
    }
    return { variantId, productId: product.id, productName: product.name, productSlug: product.slug, variantName: variant.name, imageUrl: product.imageUrl, quantity, catalogPrice: Number(variant.basePrice) };
  });
};

const describePlanItems = async (items: Array<{ variantId: number; quantity: number }>): Promise<BoxItem[]> => {
  const variants = await ProductVariant.findAll({ where: { id: items.map((item) => item.variantId) }, include: [{ model: Product, as: 'product' }] });
  return items.map(({ variantId, quantity }) => {
    const variant = variants.find((entry) => entry.id === variantId);
    const product = variant?.get('product') as Product | undefined;
    return { variantId, productId: product?.id ?? 0, productName: product?.name ?? 'Producto retirado', productSlug: product?.slug,
      variantName: variant?.name ?? 'Presentación retirada', imageUrl: product?.imageUrl, quantity, catalogPrice: variant ? Number(variant.basePrice) : 0 };
  });
};

const publicPlan = async (plan: SubscriptionPlan) => {
  const activeCount = await Subscription.count({
    where: { planId: plan.id, status: { [Op.in]: [SUBSCRIPTION_STATUS.PENDING, SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.PAST_DUE] } },
  });
  const retailValue = round2((await describePlanItems(plan.itemsJson)).reduce((sum, item) => sum + item.catalogPrice * item.quantity, 0));
  const monthlyPrice = Number(plan.monthlyPrice);
  const customerSavings = round2(Math.max(0, retailValue - monthlyPrice));
  return {
    id: plan.id, code: plan.code, name: plan.name, description: plan.description,
    monthlyPrice, items: await describePlanItems(plan.itemsJson),
    branchIds: plan.branchIdsJson, leadDays: plan.leadDays,
    maxActiveSubscribers: plan.maxActiveSubscribers,
    remainingSubscriptions: Math.max(0, plan.maxActiveSubscribers - activeCount),
    maxDailyPickups: plan.maxDailyPickups,
    isActive: plan.isActive, sortOrder: plan.sortOrder, version: plan.version,
    effectiveFrom: plan.effectiveFrom, archivedAt: plan.archivedAt,
    publicationStatus: plan.archivedAt ? 'ARCHIVED' : !plan.isActive ? 'DRAFT' : plan.effectiveFrom && plan.effectiveFrom > new Date() ? 'SCHEDULED' : 'PUBLISHED',
    retailValue, customerSavings,
    savingsPercent: retailValue > 0 ? round2((customerSavings / retailValue) * 100) : 0,
  };
};

const resolveRemote = async (subscription: Subscription): Promise<MpSubscription | null> => {
  const payer = subscription.providerReference ? null : await User.findByPk(subscription.userId);
  const remote = subscription.providerReference
    ? await mpSubscriptions.get(subscription.providerReference)
    : payer?.email ? await mpSubscriptions.findByExternalReference(`BOX-${subscription.id}`, payer.email) : null;
  if (!remote) return null;
  if (remote.external_reference !== `BOX-${subscription.id}`) throw ApiError.conflict('La referencia de la suscripción no coincide');
  if (subscription.providerReference && remote.id !== subscription.providerReference) throw ApiError.conflict('La suscripción del proveedor no coincide');
  if (!subscription.providerReference) {
    subscription.providerReference = remote.id;
    await subscription.save();
  }
  return remote;
};

const reconcileInvoice = async (invoice: MpInvoice): Promise<boolean> => {
  const reference = String(invoice.preapproval_id ?? '');
  if (!reference) return false;
  let subscription = await Subscription.findOne({ where: { providerReference: reference } });
  if (!subscription) {
    // El primer webhook puede llegar antes de guardar el ID devuelto por POST
    // /preapproval. Recuperar el contrato solo tras verificar la referencia remota.
    const remote = await mpSubscriptions.get(reference);
    const localId = Number(remote.external_reference?.replace(/^BOX-/, ''));
    if (!Number.isSafeInteger(localId) || localId < 1 || remote.id !== reference) return false;
    subscription = await Subscription.findByPk(localId);
    if (!subscription || (subscription.providerReference && subscription.providerReference !== reference)) return false;
    if (!subscription.providerReference) {
      subscription.providerReference = reference;
      await subscription.save();
    }
  }
  if (!subscription) return false;
  const invoiceId = String(invoice.id);
  const providerPaymentId = invoice.payment?.id;
  if (invoice.payment?.status !== 'approved' || !providerPaymentId) {
    if (subscription.status === SUBSCRIPTION_STATUS.ACTIVE && ['rejected', 'failed'].includes(invoice.payment?.status ?? '')) {
      subscription.status = SUBSCRIPTION_STATUS.PAST_DUE;
      await subscription.save();
    }
    return false;
  }
  if (await SubscriptionCycle.count({ where: { providerInvoiceId: invoiceId } })) return true;
  if (invoice.currency_id !== 'PEN' || round2(Number(invoice.transaction_amount)) !== round2(Number(subscription.priceSnapshot))) {
    throw ApiError.unprocessable('La cuota recibida no coincide con la suscripción contratada');
  }
  const payment = await mpSubscriptions.payment(String(providerPaymentId));
  if (String(payment.id) !== String(providerPaymentId) || payment.status !== 'approved') return false;
  if (payment.currency_id !== 'PEN' || round2(Number(payment.transaction_amount)) !== round2(Number(subscription.priceSnapshot))) {
    throw ApiError.unprocessable('El pago recibido no coincide con la suscripción contratada');
  }
  const paidDate = payment.date_approved ?? invoice.date_created;
  const paidAt = paidDate && !Number.isNaN(Date.parse(paidDate)) ? new Date(paidDate) : new Date();
  await sequelize.transaction(async (transaction) => {
    const locked = await Subscription.findByPk(subscription.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!locked) return;
    const [cycle, created] = await SubscriptionCycle.findOrCreate({
      where: { providerInvoiceId: invoiceId },
      defaults: { subscriptionId: locked.id, providerInvoiceId: invoiceId, providerPaymentId: String(providerPaymentId),
        amount: Number(locked.priceSnapshot), paidAt, expiresAt: monthAfter(paidAt) },
      transaction,
    });
    if (cycle.subscriptionId !== locked.id) throw ApiError.conflict('La cuota corresponde a otra suscripción');
    if (created && locked.status !== SUBSCRIPTION_STATUS.CANCELED) locked.status = SUBSCRIPTION_STATUS.ACTIVE;
    await locked.save({ transaction });
  });
  subscription.lastSyncAt = paidAt;
  subscription.lastSyncError = null;
  await subscription.save();
  return true;
};

export const subscriptionsService = {
  async listPublic() {
    if (!mpSubscriptions.enabled()) return [];
    const plans = await SubscriptionPlan.findAll({ where: { isActive: true, archivedAt: null, [Op.or]: [{ effectiveFrom: null }, { effectiveFrom: { [Op.lte]: new Date() } }] }, order: [['sortOrder', 'ASC'], ['id', 'ASC']] });
    const visible = [];
    for (const plan of plans) {
      try { await snapshotItems(plan.itemsJson); visible.push(await publicPlan(plan)); }
      catch (error) { if (!(error instanceof ApiError)) throw error; }
    }
    return visible;
  },
  async listAdmin() {
    const plans = await SubscriptionPlan.findAll({ order: [['sortOrder', 'ASC'], ['id', 'ASC']] });
    return Promise.all(plans.map(publicPlan));
  },
  async availableProducts() {
    const variants = await ProductVariant.findAll({ where: { isActive: true }, include: [{ model: Product, as: 'product', where: { status: 'ACTIVE', type: 'FIXED', family: { [Op.ne]: 'CAKE' } } }], order: [['productId', 'ASC'], ['sortOrder', 'ASC']] });
    return variants.map((variant) => ({ id: variant.id, name: `${(variant.get('product') as Product).name} · ${variant.name}`, price: Number(variant.basePrice) }));
  },
  async savePlan(input: { code: string; name: string; description: string; monthlyPrice: number; items: Array<{ variantId: number; quantity: number }>; branchIds: number[];
    leadDays: number; maxActiveSubscribers: number; maxDailyPickups: number; isActive: boolean; sortOrder: number; effectiveFrom?: string | null; expectedVersion?: number }, id?: number) {
    if (!Number.isFinite(input.monthlyPrice) || input.monthlyPrice <= 0) throw ApiError.badRequest('El precio mensual debe ser positivo');
    const code = input.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) throw ApiError.badRequest('Código de plan inválido');
    const items = await snapshotItems(input.items);
    const branchIds = [...new Set(input.branchIds)];
    if (!branchIds.length) throw ApiError.badRequest('Selecciona al menos una sucursal');
    const branches = await Branch.findAll({ where: { id: branchIds, isActive: true, acceptsPickup: true } });
    if (branches.length !== branchIds.length) throw ApiError.badRequest('Una sucursal no admite recojo');
    if (items.reduce((sum, item) => sum + item.catalogPrice * item.quantity, 0) <= 0) throw ApiError.badRequest('La caja necesita productos con precio');
    const plan = id ? await SubscriptionPlan.findByPk(id) : null;
    if (id && !plan) throw ApiError.notFound('Suscripción no encontrada');
    if (input.isActive && !mpSubscriptions.enabled()) throw new ApiError(503, 'Configura Mercado Pago antes de publicar una caja mensual', 'SUBSCRIPTIONS_UNAVAILABLE');
    if (plan && input.expectedVersion !== undefined && input.expectedVersion !== plan.version) throw ApiError.conflict('La caja cambió mientras la editabas. Recarga la página e inténtalo otra vez');
    const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : null;
    if (effectiveFrom && Number.isNaN(effectiveFrom.getTime())) throw ApiError.badRequest('La fecha de publicación no es válida');
    const duplicate = await SubscriptionPlan.findOne({ where: { code, ...(id ? { id: { [Op.ne]: id } } : {}) } });
    if (duplicate) throw ApiError.conflict('El código ya existe');
    const values = { code, name: input.name.trim(), description: input.description.trim(), monthlyPrice: round2(input.monthlyPrice),
      itemsJson: input.items, branchIdsJson: branchIds, leadDays: input.leadDays, maxActiveSubscribers: input.maxActiveSubscribers,
      maxDailyPickups: input.maxDailyPickups, isActive: input.isActive, sortOrder: input.sortOrder, effectiveFrom, archivedAt: plan?.archivedAt ?? null };
    if (plan) { await plan.update({ ...values, version: plan.version + 1 }); return publicPlan(plan); }
    return publicPlan(await SubscriptionPlan.create({ ...values, version: 1 }));
  },

  async archivePlan(id: number, expectedVersion?: number) {
    const plan = await SubscriptionPlan.findByPk(id);
    if (!plan) throw ApiError.notFound('Caja mensual no encontrada');
    if (expectedVersion !== undefined && expectedVersion !== plan.version) throw ApiError.conflict('La caja cambió mientras la editabas. Recarga la página e inténtalo otra vez');
    plan.isActive = false;
    plan.archivedAt = new Date();
    plan.version += 1;
    await plan.save();
    return publicPlan(plan);
  },
  async subscribe(userId: number, planId: number, branchId: number, termsVersion: string, client: 'WEB' | 'MOBILE' = 'WEB') {

    if (!mpSubscriptions.enabled()) throw new ApiError(503, 'Las suscripciones aún no tienen una pasarela configurada', 'SUBSCRIPTIONS_UNAVAILABLE');
    const user = await User.findByPk(userId);
    if (!user?.email) throw ApiError.badRequest('Añade un correo a tu perfil antes de suscribirte');
    const plan = await SubscriptionPlan.findByPk(planId);
    if (!plan?.isActive) throw ApiError.notFound('Este plan no está disponible');
    if (!plan.branchIdsJson.includes(branchId)) throw ApiError.badRequest('El plan no está disponible en esa sucursal');
    const items = await snapshotItems(plan.itemsJson);
    const subscription = await sequelize.transaction(async (transaction) => {
      const terms = await checkoutTermsService.get(transaction, 2);
      if (termsVersion !== String(terms.version)) throw ApiError.conflict('Revisa y acepta las condiciones vigentes de la suscripción');
      const currentPlan = await SubscriptionPlan.findByPk(planId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!currentPlan?.isActive || !currentPlan.branchIdsJson.includes(branchId)) throw ApiError.conflict('El plan cambió; vuelve a revisar sus condiciones');
      await User.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
      const existing = await Subscription.findOne({ where: { userId, planId, status: { [Op.in]: [SUBSCRIPTION_STATUS.PENDING, SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.PAST_DUE] } }, transaction });
      if (existing) throw ApiError.conflict('Ya tienes una suscripción de este plan; revísala en tu cuenta');
      const activeCount = await Subscription.count({ where: { planId, status: { [Op.in]: [SUBSCRIPTION_STATUS.PENDING, SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.PAST_DUE] } }, transaction });
      if (activeCount >= currentPlan.maxActiveSubscribers) throw ApiError.conflict('Se agotaron los cupos de este plan');
      return Subscription.create({ planId, userId, branchId, planNameSnapshot: currentPlan.name, priceSnapshot: Number(currentPlan.monthlyPrice),
        itemsSnapshotJson: items, leadDaysSnapshot: currentPlan.leadDays, termsSnapshotJson: { ...terms, acceptedAt: new Date().toISOString(), channel: client }, termsVersion, termsAcceptedAt: new Date() }, { transaction });
    });
      const back = new URL(client === 'MOBILE' ? '/planes/movil' : '/cuenta/suscripciones', client === 'MOBILE' ? (env.MOBILE_RETURN_BASE_URL ?? env.FRONTEND_URL) : env.FRONTEND_URL);
      if (client === 'MOBILE') back.searchParams.set('subscription', String(subscription.id));
      const remote = await mpSubscriptions.create({ id: subscription.id, email: user.email, name: subscription.planNameSnapshot, amount: Number(subscription.priceSnapshot), backUrl: back.toString() });
      if (!remote.id || !remote.init_point) throw ApiError.internal('La pasarela no devolvió un enlace para suscribirse');
      subscription.providerReference = remote.id;
      await subscription.save();
      return { id: subscription.id, checkoutUrl: remote.init_point };
  },
  async mine(userId: number) {
    const rows = await Subscription.findAll({ where: { userId }, order: [['createdAt', 'DESC']], limit: 30 });
    const ids = rows.map((row) => row.id);
    const cycles = ids.length ? await SubscriptionCycle.findAll({ where: { subscriptionId: ids }, order: [['paidAt', 'DESC']] }) : [];
    return rows.map((row) => ({ id: row.id, planId: row.planId, name: row.planNameSnapshot, price: Number(row.priceSnapshot), items: row.itemsSnapshotJson,
      termsAcceptance: row.termsSnapshotJson, branchId: row.branchId, leadDays: row.leadDaysSnapshot, status: row.status, nextChargeAt: row.nextChargeAt, canceledAt: row.canceledAt,
      cycles: cycles.filter((cycle) => cycle.subscriptionId === row.id).map((cycle) => ({ id: cycle.id, amount: Number(cycle.amount), paidAt: cycle.paidAt,
        expiresAt: cycle.expiresAt, scheduledAt: cycle.scheduledAt, orderId: cycle.orderId })) }));
  },
  async adminSubscribers(filters: { planId?: number; branchIds?: number[]; page?: number; pageSize?: number; status?: string } = {}) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 50));
    const where = {
      ...(filters.planId ? { planId: filters.planId } : {}),
      ...(filters.branchIds?.length ? { branchId: filters.branchIds } : {}),
      ...(filters.status && Object.values(SUBSCRIPTION_STATUS).includes(filters.status as typeof SUBSCRIPTION_STATUS[keyof typeof SUBSCRIPTION_STATUS]) ? { status: filters.status } : {}),
    };
    const result = await Subscription.findAndCountAll({ where, include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }], order: [['createdAt', 'DESC']], limit: pageSize, offset: (page - 1) * pageSize, distinct: true });
    const rows = result.rows;
    const cycles = rows.length ? await SubscriptionCycle.findAll({ where: { subscriptionId: rows.map((row) => row.id) }, attributes: ['subscriptionId', 'orderId', 'expiresAt'] }) : [];
    return { rows: rows.map((row) => ({ id: row.id, planId: row.planId, planName: row.planNameSnapshot, status: row.status,
      user: row.get('user'), price: Number(row.priceSnapshot), nextChargeAt: row.nextChargeAt, branchId: row.branchId, createdAt: row.createdAt,
      lastSyncAt: row.lastSyncAt, lastSyncError: row.lastSyncError, cancellationReason: row.cancellationReason,
      paidCycles: cycles.filter((cycle) => cycle.subscriptionId === row.id).length,
      pendingBoxes: cycles.filter((cycle) => cycle.subscriptionId === row.id && !cycle.orderId && cycle.expiresAt > new Date()).length,
      expiredBoxes: cycles.filter((cycle) => cycle.subscriptionId === row.id && !cycle.orderId && cycle.expiresAt <= new Date()).length,
      scheduledBoxes: cycles.filter((cycle) => cycle.subscriptionId === row.id && cycle.orderId).length })), total: result.count, page, pageSize };
  },

  async adminDashboard(branchIds: number[] = []) {
    const subscriptions = await Subscription.findAll({ where: branchIds.length ? { branchId: branchIds } : undefined, attributes: ['id', 'planId', 'branchId', 'status', 'priceSnapshot'] });
    const ids = subscriptions.map((row) => row.id);
    const cycles = ids.length ? await SubscriptionCycle.findAll({ where: { subscriptionId: ids }, attributes: ['id', 'subscriptionId', 'amount', 'orderId', 'expiresAt', 'paidAt'] }) : [];
    const orderIds = cycles.map((cycle) => cycle.orderId).filter((id): id is number => id !== null);
    const commissions = orderIds.length ? await CakeCommission.findAll({ where: { orderId: orderIds }, attributes: ['orderId', 'commissionAmount'] }) : [];
    const commissionByOrder = new Map(commissions.map((row) => [row.orderId, Number(row.commissionAmount)]));
    const active = subscriptions.filter((row) => row.status === SUBSCRIPTION_STATUS.ACTIVE);
    const pastDue = subscriptions.filter((row) => row.status === SUBSCRIPTION_STATUS.PAST_DUE);
    const canceled = subscriptions.filter((row) => row.status === SUBSCRIPTION_STATUS.CANCELED);
    const pending = subscriptions.filter((row) => row.status === SUBSCRIPTION_STATUS.PENDING);
    const grossCollected = round2(cycles.reduce((sum, cycle) => sum + Number(cycle.amount), 0));
    const redeemed = cycles.filter((cycle) => cycle.orderId !== null);
    const unredeemed = cycles.filter((cycle) => cycle.orderId === null && cycle.expiresAt > new Date());
    const expiredUnredeemed = cycles.filter((cycle) => cycle.orderId === null && cycle.expiresAt <= new Date());
    const commissionAccrued = round2(redeemed.reduce((sum, cycle) => sum + (commissionByOrder.get(cycle.orderId!) ?? 0), 0));
    const byPlan = [...new Set(subscriptions.map((row) => row.planId))].map((planId) => {
      const planSubscriptions = subscriptions.filter((row) => row.planId === planId);
      const planCycles = cycles.filter((cycle) => planSubscriptions.some((row) => row.id === cycle.subscriptionId));
      return { planId, active: planSubscriptions.filter((row) => row.status === SUBSCRIPTION_STATUS.ACTIVE).length, pastDue: planSubscriptions.filter((row) => row.status === SUBSCRIPTION_STATUS.PAST_DUE).length, grossCollected: round2(planCycles.reduce((sum, cycle) => sum + Number(cycle.amount), 0)), pendingRedemption: planCycles.filter((cycle) => cycle.orderId === null && cycle.expiresAt > new Date()).length };
    });
    return {
      providerAvailable: mpSubscriptions.enabled(),
      mrr: round2(active.reduce((sum, row) => sum + Number(row.priceSnapshot), 0)),
      active: active.length,
      pastDue: pastDue.length,
      canceled: canceled.length,
      pending: pending.length,
      churnRate: active.length + canceled.length ? round2((canceled.length / (active.length + canceled.length)) * 100) : 0,
      grossCollected,
      redeemedCycles: redeemed.length,
      pendingRedemption: unredeemed.length,
      expiredUnredeemed: expiredUnredeemed.length,
      commissionAccrued,
      byPlan,
    };
  },
  async sync(id: number, userId?: number) {
    const subscription = await Subscription.findByPk(id);
    if (!subscription || (userId !== undefined && subscription.userId !== userId)) throw ApiError.notFound('Suscripción no encontrada');
    const remote = await resolveRemote(subscription);
    if (!remote) {
      subscription.lastSyncAt = new Date();
      subscription.lastSyncError = null;
      await subscription.save();
      if (subscription.status === SUBSCRIPTION_STATUS.CANCELED) await subscription.update({ updatedAt: new Date() });
      return { status: subscription.status, paidCycles: 0 };
    }
    if (subscription.status === SUBSCRIPTION_STATUS.CANCELED && remote.status !== 'canceled') {
      await mpSubscriptions.cancel(remote.id);
    }
    if (remote.status === 'canceled') { subscription.status = SUBSCRIPTION_STATUS.CANCELED; subscription.canceledAt ??= new Date(); }
    else if (remote.status === 'paused') subscription.status = SUBSCRIPTION_STATUS.PAST_DUE;
    subscription.nextChargeAt = subscription.status === SUBSCRIPTION_STATUS.CANCELED ? null : remote.next_payment_date ? new Date(remote.next_payment_date) : null;
    await subscription.save();
    let paidCycles = 0;
    for (const invoice of await mpSubscriptions.invoices(remote.id)) {
      if (await reconcileInvoice(invoice)) paidCycles += 1;
    }
    subscription.lastSyncAt = new Date();
    subscription.lastSyncError = null;
    await subscription.save();
    return { status: subscription.status, paidCycles };
  },
  async checkout(id: number, userId: number) {
    const subscription = await Subscription.findByPk(id);
    if (!subscription || subscription.userId !== userId) throw ApiError.notFound('Suscripción no encontrada');
    if (subscription.status !== SUBSCRIPTION_STATUS.PENDING) throw ApiError.conflict('Esta suscripción ya no espera autorización');
    const remote = await resolveRemote(subscription);
    if (!remote?.init_point) throw ApiError.conflict('El enlace aún no está disponible. Actualiza el estado o contacta a soporte.');
    return { checkoutUrl: remote.init_point };
  },
  async cancel(id: number, userId?: number, reason?: string) {
    const subscription = await Subscription.findByPk(id);
    if (!subscription || (userId !== undefined && subscription.userId !== userId)) throw ApiError.notFound('Suscripción no encontrada');
    if (subscription.status === SUBSCRIPTION_STATUS.CANCELED) return;
    const remote = await resolveRemote(subscription);
    if (remote && remote.status !== 'canceled') await mpSubscriptions.cancel(remote.id);
    subscription.status = SUBSCRIPTION_STATUS.CANCELED;
    subscription.canceledAt = new Date();
    subscription.nextChargeAt = null;
    subscription.cancellationReason = reason?.trim().slice(0, 500) || null;
    await subscription.save();
  },
  async handleWebhook(signature: string | undefined, requestId: string | undefined, resourceId: string | undefined, type: string) {
    const id = validateMercadoPagoSignature(signature, { requestId, resourceId }, env.MERCADOPAGO_WEBHOOK_SECRET ?? '');
    if (type === 'subscription_preapproval') {
      const remote = await mpSubscriptions.get(id);
      const localId = Number(remote.external_reference?.replace(/^BOX-/, ''));
      if (!Number.isSafeInteger(localId) || localId < 1) return { handled: false };
      const subscription = await Subscription.findByPk(localId);
      if (!subscription) return { handled: false };
      await subscriptionsService.sync(localId);
      return { handled: true };
    }
    if (type === 'subscription_authorized_payment') {
      const invoice = await mpSubscriptions.invoice(id);
      return { handled: await reconcileInvoice(invoice) };
    }
    if (type === 'payment') {
      // Mercado Pago también envía el tópico de pagos para suscripciones. Su ID
      // es el del pago, no el de una order de Checkout Pro.
      if (!/^\d+$/.test(id)) return { handled: false };
      const invoice = await mpSubscriptions.invoiceByPayment(id);
      return { handled: invoice ? await reconcileInvoice(invoice) : false };
    }
    return { handled: false };
  },
  async redeem(userId: number, cycleId: number, slotId: number) {
    const paidCycle = await SubscriptionCycle.findByPk(cycleId);
    const owner = paidCycle ? await Subscription.findByPk(paidCycle.subscriptionId) : null;
    if (!paidCycle || !owner || owner.userId !== userId) throw ApiError.notFound('Mensualidad no encontrada');
    if (!paidCycle.providerPaymentId) throw ApiError.conflict('El pago de esta mensualidad no está verificado');
    const livePayment = await mpSubscriptions.payment(paidCycle.providerPaymentId);
    if (livePayment.status !== 'approved' || livePayment.currency_id !== 'PEN' || round2(Number(livePayment.transaction_amount)) !== round2(Number(paidCycle.amount))) {
      throw ApiError.conflict('Esta mensualidad ya no figura pagada. Contacta a soporte antes de programar el recojo');
    }
    return sequelize.transaction(async (transaction) => {
      const cycle = await SubscriptionCycle.findByPk(cycleId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!cycle) throw ApiError.notFound('Mensualidad no encontrada');
      const subscription = await Subscription.findByPk(cycle.subscriptionId, { transaction });
      if (!subscription || subscription.userId !== userId) throw ApiError.notFound('Mensualidad no encontrada');
      if (cycle.orderId) throw ApiError.conflict('La caja de este mes ya fue programada');
      if (new Date() > cycle.expiresAt) throw ApiError.conflict('Terminó el plazo para programar esta caja');
      const plan = await SubscriptionPlan.findByPk(subscription.planId, { transaction, lock: transaction.LOCK.UPDATE });
      const branch = await Branch.findByPk(subscription.branchId, { transaction });
      if (!plan || !branch?.isActive || !branch.acceptsPickup) throw ApiError.conflict('La sucursal ya no admite recojo. Contacta a soporte');
      const slot = await DeliverySlot.findOne({ where: { id: slotId, branchId: branch.id, coverageZoneId: null, isActive: true }, transaction, lock: transaction.LOCK.UPDATE });
      if (!slot || slot.availableCount < 1 || slot.orderCutoffAt < new Date()) throw ApiError.conflict('La franja ya no tiene cupos');
      if (!geoService.slotWithinSchedule(await geoService.getBranchOrFail(branch.id), slot)) throw ApiError.conflict('La franja ya no coincide con el horario de atención de la sucursal.');
      if (slot.startsAt.getTime() < Date.now() + subscription.leadDaysSnapshot * 86_400_000) throw ApiError.badRequest(`Elige una fecha con al menos ${subscription.leadDaysSnapshot} días de anticipación`);
      if (slot.startsAt.getTime() > cycle.expiresAt.getTime()) throw ApiError.badRequest('Elige una fecha dentro del plazo de esta caja');
      const city = await City.findByPk(branch.cityId, { transaction });
      const zone = city?.timezone ?? env.TZ;
      const localDay = zonedParts(slot.startsAt, zone).isoDate;
      const dayStart = zonedDateAt(localDay, 0, 0, zone);
      const dayEnd = zonedDateAt(addDaysToIsoDate(localDay, 1), 0, 0, zone);
      const daily = await SubscriptionCycle.count({ where: { scheduledAt: { [Op.gte]: dayStart, [Op.lt]: dayEnd }, orderId: { [Op.ne]: null } }, include: [{ model: Subscription, as: 'subscription', where: { planId: plan.id, branchId: branch.id } }], transaction });
      if (daily >= plan.maxDailyPickups) throw ApiError.conflict('El cupo diario de esta caja está completo');
      slot.reservedCount += 1;
      await slot.save({ transaction });
      const price = Number(cycle.amount);
      const { taxRate, currency } = await settingsService.getBusinessInfo();
      const tax = splitTaxFromGross(price, taxRate);
      const order = await Order.create({ orderNumber: `BOX-${cycle.id}`, userId, branchId: branch.id, deliveryType: DELIVERY_TYPE.PICKUP,
        serviceMode: SERVICE_MODE.SCHEDULED, deliverySlotId: slot.id, scheduledAt: slot.startsAt, status: ORDER_STATUS.PENDING_PAYMENT,
        subtotal: price, grandTotal: price, taxRate, taxableBase: tax.base, taxTotal: tax.tax, currency,
        notes: `Caja mensual de ${subscription.planNameSnapshot}. Cuota ${cycle.providerInvoiceId}.`, idempotencyKey: `subscription-cycle-${cycle.id}` }, { transaction });
      const items = subscription.itemsSnapshotJson;
      const weight = items.reduce((sum, item) => sum + item.catalogPrice * item.quantity, 0);
      let allocated = 0;
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const line = index === items.length - 1 ? round2(price - allocated) : round2(price * item.catalogPrice * item.quantity / weight);
        allocated = round2(allocated + line);
        const lineTax = splitTaxFromGross(line, taxRate);
        await OrderItem.create({ orderId: order.id, productId: item.productId, variantId: item.variantId,
          productNameSnapshot: item.productName, variantNameSnapshot: item.variantName, descriptionSnapshot: `Caja mensual ${subscription.planNameSnapshot}`,
          quantity: item.quantity, unitPrice: round2(line / item.quantity), lineTotal: line, taxableBase: lineTax.base, taxTotal: lineTax.tax }, { transaction });
      }
      const payment = await Payment.create({ payableType: PAYABLE_TYPE.ORDER, payableId: order.id, userId, provider: PAYMENT_PROVIDER.MERCADOPAGO_SUBSCRIPTION,
        providerReference: cycle.providerPaymentId, amount: price, status: PAYMENT_STATUS.SUCCEEDED, idempotencyKey: `subscription-cycle-${cycle.id}-payment`, capturedAt: cycle.paidAt }, { transaction });
      cycle.orderId = order.id;
      cycle.scheduledAt = slot.startsAt;
      await cycle.save({ transaction });
      await confirmPaidOrder(order, transaction, 'SUBSCRIPTION', `Mensualidad ${cycle.providerInvoiceId} pagada`, payment);
      return { orderNumber: order.orderNumber, orderId: order.id };
    });
  },
};
