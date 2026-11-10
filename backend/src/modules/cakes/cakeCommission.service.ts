import { Op, type Transaction } from 'sequelize';
import { Branch, BusinessSetting, CakeCommission, CakeCommissionSettlement, CakeProductProfile, Order, OrderItem, Payment, sequelize } from '@database/models';
import { PAYABLE_TYPE } from '@database/models/payment.model';
import { CAKE_COMMISSION_STATUS } from '@database/models/cakeCommission.model';
import { ApiError } from '@shared/errors/ApiError';
import { round2 } from '@shared/utils/money';
import { PAYMENT_STATUS } from '@config/constants';
import { ORDER_STATUS } from '@config/constants';
import { accruedCakeBase, cakeCommissionAmount, cakeRefundShare, orderProductBase } from './cakeCommission.math';

const salesBaseForOrder = async (orderId: number, transaction: Transaction): Promise<number> => {
  const [lines, order] = await Promise.all([OrderItem.findAll({ where: { orderId }, transaction }), Order.findByPk(orderId, { attributes: ['discountTotal'], transaction })]);
  return orderProductBase(lines, Number(order?.discountTotal ?? 0));
};

export const DEFAULT_PLATFORM_COMMISSION_RATE = 0.15;

/** Lee la tasa futura; cada CakeCommission conserva su propia tasa histórica. */
export const getPlatformCommissionRate = async (transaction?: Transaction): Promise<number> => {
  const row = await BusinessSetting.findByPk(1, { attributes: ['platformCommissionRate'], transaction });
  const rate = Number(row?.platformCommissionRate ?? DEFAULT_PLATFORM_COMMISSION_RATE);
  return Number.isFinite(rate) ? Math.min(1, Math.max(0, rate)) : DEFAULT_PLATFORM_COMMISSION_RATE;
};

export const cakeCommissionService = {
  async ensureForOrder(order: Order, transaction: Transaction): Promise<CakeCommission | null> {
    const fullProductBase = await salesBaseForOrder(order.id, transaction);
    if (fullProductBase <= 0) return null;
    const paid = Number(await Payment.sum('amount', { where: { payableType: PAYABLE_TYPE.ORDER, payableId: order.id, status: { [Op.in]: [PAYMENT_STATUS.SUCCEEDED, PAYMENT_STATUS.REFUNDED] } }, transaction }) ?? 0);
    const collectible = Number(order.grandTotal) + Number(order.walletAmount);
    const paidValue = paid + Number(order.walletAmount);
    // Con anticipo se devenga solo la parte efectivamente cobrada.
    if (paidValue <= 0 && collectible > 0) return null;
    const base = accruedCakeBase(fullProductBase, paidValue, collectible);
    const existing = await CakeCommission.findOne({ where: { orderId: order.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (existing) {
      if (Number(existing.baseAmount) !== base) {
        existing.baseAmount = base;
        existing.commissionAmount = cakeCommissionAmount(base, Number(existing.adjustmentAmount), Number(existing.refundAmount), Number(existing.rate));
        const settled = Number(await CakeCommissionSettlement.sum('amount', { where: { commissionId: existing.id }, transaction }) ?? 0);
        existing.status = settled > 0 && settled >= Number(existing.commissionAmount) ? CAKE_COMMISSION_STATUS.LIQUIDATED : CAKE_COMMISSION_STATUS.PENDING;
        if (existing.status === CAKE_COMMISSION_STATUS.PENDING) { existing.liquidatedAt = null; existing.liquidatedBy = null; }
        await existing.save({ transaction });
      }
      return existing;
    }
    const rate = await getPlatformCommissionRate(transaction);
    return CakeCommission.create({
      orderId: order.id,
      baseAmount: base,
      rate,
      adjustmentAmount: 0,
      refundAmount: 0,
      commissionAmount: cakeCommissionAmount(base, 0, 0, rate),
      status: CAKE_COMMISSION_STATUS.PENDING,
    }, { transaction });
  },

  async applyRefund(paymentId: number, amount: number, transaction: Transaction) {
    const payment = await Payment.findByPk(paymentId, { transaction });
    if (!payment || payment.payableType !== PAYABLE_TYPE.ORDER) return null;
    const commission = await CakeCommission.findOne({ where: { orderId: payment.payableId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!commission) return null;
    const order = await Order.findByPk(payment.payableId, { transaction });
    if (!order) return null;
    // Un reembolso parcial sin detalle de lineas se reparte entre productos y
    // delivery en la misma proporcion en que participaron del cobro.
    const collectible = Number(order.grandTotal) + Number(order.walletAmount);
    const fullProductBase = await salesBaseForOrder(order.id, transaction);
    const productShare = cakeRefundShare(fullProductBase, collectible);
    commission.refundAmount = Math.min(Number(commission.baseAmount), round2(Number(commission.refundAmount) + amount * productShare));
    commission.commissionAmount = cakeCommissionAmount(Number(commission.baseAmount), Number(commission.adjustmentAmount), Number(commission.refundAmount), Number(commission.rate));
    const settled = Number(await CakeCommissionSettlement.sum('amount', { where: { commissionId: commission.id }, transaction }) ?? 0);
    commission.status = settled >= Number(commission.commissionAmount) && settled > 0 ? CAKE_COMMISSION_STATUS.LIQUIDATED : CAKE_COMMISSION_STATUS.PENDING;
    if (commission.status === CAKE_COMMISSION_STATUS.PENDING) { commission.liquidatedAt = null; commission.liquidatedBy = null; }
    await commission.save({ transaction });
    return commission;
  },

  async report(filters: { branchId?: number; from?: string; to?: string; status?: string }) {
    const whereOrder: Record<string, unknown> = {};
    if (filters.branchId) whereOrder.branchId = filters.branchId;
    if (filters.from || filters.to) whereOrder.placedAt = { ...(filters.from ? { [Op.gte]: new Date(`${filters.from}T00:00:00-05:00`) } : {}), ...(filters.to ? { [Op.lte]: new Date(`${filters.to}T23:59:59.999-05:00`) } : {}) };
    const rows = await CakeCommission.findAll({
      where: filters.status ? { status: filters.status } : undefined,
      include: [{ model: Order, as: 'order', required: true, attributes: ['id', 'orderNumber', 'branchId', 'status', 'placedAt', 'grandTotal'], where: { ...whereOrder, status: { [Op.in]: [ORDER_STATUS.CONFIRMED, ORDER_STATUS.PREPARING, ORDER_STATUS.READY, ORDER_STATUS.OUT_FOR_DELIVERY, ORDER_STATUS.DELIVERED] } }, include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'], required: false }] }],
      order: [['createdAt', 'DESC']],
    });
    const settlements = rows.length ? await CakeCommissionSettlement.findAll({ where: { commissionId: rows.map((row) => row.id) }, order: [['createdAt', 'ASC']] }) : [];
    const paidByCommission = new Map<number, number>();
    for (const entry of settlements) paidByCommission.set(entry.commissionId, round2((paidByCommission.get(entry.commissionId) ?? 0) + Number(entry.amount)));
    const shaped = rows.map((row) => ({ ...row.toJSON(), settledAmount: paidByCommission.get(row.id) ?? 0,
      outstandingAmount: round2(Math.max(0, Number(row.commissionAmount) - (paidByCommission.get(row.id) ?? 0))),
      overpaidAmount: round2(Math.max(0, (paidByCommission.get(row.id) ?? 0) - Number(row.commissionAmount))),
      settlements: settlements.filter((entry) => entry.commissionId === row.id) }));
    const summary = rows.reduce((acc: { baseAmount: number; adjustments: number; refunds: number; commission: number; settled: number; outstanding: number; overpaid: number }, row: CakeCommission) => ({
      baseAmount: round2(acc.baseAmount + Number(row.baseAmount)),
      adjustments: round2(acc.adjustments + Number(row.adjustmentAmount)),
      refunds: round2(acc.refunds + Number(row.refundAmount)),
      commission: round2(acc.commission + Number(row.commissionAmount)),
      settled: round2(acc.settled + (paidByCommission.get(row.id) ?? 0)),
      outstanding: round2(acc.outstanding + Math.max(0, Number(row.commissionAmount) - (paidByCommission.get(row.id) ?? 0))),
      overpaid: round2(acc.overpaid + Math.max(0, (paidByCommission.get(row.id) ?? 0) - Number(row.commissionAmount))),
    }), { baseAmount: 0, adjustments: 0, refunds: 0, commission: 0, settled: 0, outstanding: 0, overpaid: 0 });
    const cakeProductIds = (await CakeProductProfile.findAll({ attributes: ['productId'] })).map((profile) => profile.productId);
    const cakeOrderIds = cakeProductIds.length
      ? [...new Set((await OrderItem.findAll({ where: { productId: { [Op.in]: cakeProductIds } }, attributes: ['orderId'], raw: true })).map((line) => line.orderId))]
      : [];
    const candidateOrders = cakeOrderIds.length ? await Order.findAll({
      where: { id: { [Op.in]: cakeOrderIds }, ...whereOrder, status: { [Op.in]: [ORDER_STATUS.CONFIRMED, ORDER_STATUS.PREPARING, ORDER_STATUS.READY, ORDER_STATUS.OUT_FOR_DELIVERY, ORDER_STATUS.DELIVERED] } },
      attributes: ['id', 'orderNumber', 'branchId'],
    }) : [];
    const commissionIds = candidateOrders.length
      ? new Set((await CakeCommission.findAll({ where: { orderId: candidateOrders.map((order) => order.id) }, attributes: ['orderId'] })).map((commission) => commission.orderId))
      : new Set<number>();
    const candidatePayments = candidateOrders.length ? await Payment.findAll({ where: { payableType: PAYABLE_TYPE.ORDER, payableId: candidateOrders.map((order) => order.id), status: { [Op.in]: [PAYMENT_STATUS.SUCCEEDED, PAYMENT_STATUS.REFUNDED] } }, attributes: ['payableId', 'amount'] }) : [];
    const paidByOrder = new Map<number, number>();
    for (const payment of candidatePayments) paidByOrder.set(payment.payableId, round2((paidByOrder.get(payment.payableId) ?? 0) + Number(payment.amount)));
    const missingCommissionOrders = candidateOrders
      .filter((order) => !commissionIds.has(order.id) && (paidByOrder.get(order.id) ?? 0) > 0)
      .map((order) => ({ orderId: order.id, orderNumber: order.orderNumber, branchId: order.branchId, paidAmount: paidByOrder.get(order.id) ?? 0 }));
    return { rows: shaped, summary, missingCommissionOrders };
  },

  async adjust(id: number, adjustmentAmount: number, notes: string | undefined, actorId: number) {
    return sequelize.transaction(async (transaction: Transaction) => {
      const row = await CakeCommission.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!row) throw ApiError.notFound('Liquidacion de pedido no encontrada');
      if (row.status === CAKE_COMMISSION_STATUS.LIQUIDATED) throw ApiError.conflict('La liquidacion ya fue cerrada');
      row.adjustmentAmount = round2(adjustmentAmount);
      row.commissionAmount = cakeCommissionAmount(Number(row.baseAmount), Number(row.adjustmentAmount), Number(row.refundAmount), Number(row.rate));
      const settled = Number(await CakeCommissionSettlement.sum('amount', { where: { commissionId: id }, transaction }) ?? 0);
      if (settled > 0 && settled >= Number(row.commissionAmount)) {
        row.status = CAKE_COMMISSION_STATUS.LIQUIDATED;
        row.liquidatedAt = new Date();
        row.liquidatedBy = actorId;
      }
      row.notes = `${notes?.trim() || ''}${notes?.trim() ? ' · ' : ''}Ajuste por usuario ${actorId}`.slice(0, 500);
      await row.save({ transaction });
      return row;
    });
  },

  async liquidate(id: number, actorId: number, reference: string, requestedAmount?: number, notes?: string) {
    return sequelize.transaction(async (transaction: Transaction) => {
      const row = await CakeCommission.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!row) throw ApiError.notFound('Liquidacion de pedido no encontrada');
      const prior = await CakeCommissionSettlement.findOne({ where: { reference }, transaction });
      if (prior) {
        if (prior.commissionId === id && (requestedAmount === undefined || Number(prior.amount) === round2(requestedAmount))) return row;
        throw ApiError.conflict('La referencia de transferencia ya esta registrada');
      }
      const settled = Number(await CakeCommissionSettlement.sum('amount', { where: { commissionId: id }, transaction }) ?? 0);
      const due = round2(Number(row.commissionAmount) - settled);
      if (due <= 0) throw ApiError.conflict('No hay saldo pendiente para liquidar');
      const amount = round2(requestedAmount ?? due);
      if (!Number.isFinite(amount) || amount <= 0 || amount > due) throw ApiError.unprocessable('La transferencia debe ser mayor que cero y no superar el saldo pendiente');
      await CakeCommissionSettlement.create({ commissionId: id, amount, reference, actorId, notes: notes?.trim() || null }, { transaction });
      row.status = amount === due ? CAKE_COMMISSION_STATUS.LIQUIDATED : CAKE_COMMISSION_STATUS.PENDING;
      row.liquidatedAt = amount === due ? new Date() : null;
      row.liquidatedBy = amount === due ? actorId : null;
      if (notes?.trim()) row.notes = notes.trim().slice(0, 500);
      await row.save({ transaction });
      return row;
    });
  },
};

