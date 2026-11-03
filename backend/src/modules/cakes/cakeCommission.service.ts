import { Op, type Transaction } from 'sequelize';
import { CakeCommission, CakeCommissionSettlement, CakeProductProfile, Order, OrderItem, Payment, sequelize } from '@database/models';
import { PAYABLE_TYPE } from '@database/models/payment.model';
import { CAKE_COMMISSION_STATUS } from '@database/models/cakeCommission.model';
import { ApiError } from '@shared/errors/ApiError';
import { round2 } from '@shared/utils/money';
import { PAYMENT_STATUS } from '@config/constants';
import { accruedCakeBase, cakeCommissionAmount, cakeLineBase, cakeRefundShare } from './cakeCommission.math';

const cakeBaseForOrder = async (orderId: number, transaction: Transaction): Promise<number> => {
  const [lines, order] = await Promise.all([OrderItem.findAll({ where: { orderId }, transaction }), Order.findByPk(orderId, { attributes: ['discountTotal'], transaction })]);
  const productIds = lines.map((line) => line.productId).filter((value): value is number => value !== null);
  const profiles = productIds.length ? await CakeProductProfile.findAll({ where: { productId: productIds }, transaction }) : [];
  const cakeIds = new Set(profiles.map((profile) => profile.productId));
  return cakeLineBase(lines, cakeIds, Number(order?.discountTotal ?? 0));
};

export const cakeCommissionService = {
  async ensureForOrder(order: Order, transaction: Transaction): Promise<CakeCommission | null> {
    const fullCakeBase = await cakeBaseForOrder(order.id, transaction);
    if (fullCakeBase <= 0) return null;
    const paid = Number(await Payment.sum('amount', { where: { payableType: PAYABLE_TYPE.ORDER, payableId: order.id, status: { [Op.in]: [PAYMENT_STATUS.SUCCEEDED, PAYMENT_STATUS.REFUNDED] } }, transaction }) ?? 0);
    const collectible = Number(order.grandTotal) + Number(order.walletAmount);
    const paidValue = paid + Number(order.walletAmount);
    // En tortas con anticipo se devenga solo la parte efectivamente cobrada.
    if (paidValue <= 0 && collectible > 0) return null;
    const base = accruedCakeBase(fullCakeBase, paidValue, collectible);
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
    return CakeCommission.create({
      orderId: order.id,
      baseAmount: base,
      rate: 0.15,
      adjustmentAmount: 0,
      refundAmount: 0,
      commissionAmount: cakeCommissionAmount(base, 0, 0, 0.15),
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
    // Un reembolso parcial sin detalle de lineas se reparte entre tortas, otros
    // productos y delivery en la misma proporcion en que participaron del cobro.
    const collectible = Number(order.grandTotal) + Number(order.walletAmount);
    const fullCakeBase = await cakeBaseForOrder(order.id, transaction);
    const cakeShare = cakeRefundShare(fullCakeBase, collectible);
    commission.refundAmount = Math.min(Number(commission.baseAmount), round2(Number(commission.refundAmount) + amount * cakeShare));
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
      include: [{ model: Order, as: 'order', required: true, attributes: ['id', 'orderNumber', 'branchId', 'status', 'placedAt', 'grandTotal'], where: whereOrder }],
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
    return { rows: shaped, summary };
  },

  async adjust(id: number, adjustmentAmount: number, notes: string | undefined, actorId: number) {
    return sequelize.transaction(async (transaction: Transaction) => {
      const row = await CakeCommission.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!row) throw ApiError.notFound('Liquidacion de torta no encontrada');
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
      if (!row) throw ApiError.notFound('Liquidacion de torta no encontrada');
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

