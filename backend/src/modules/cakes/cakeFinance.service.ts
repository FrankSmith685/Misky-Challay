import { Op, type Transaction } from 'sequelize';
import {
  BranchInventory, CakeCommission, CakeCommissionSettlement, CakeDesignQuote, CakeFinanceEntry, CakeOrderCostSnapshot, CakeProductProfile,
  InventoryItem, InventoryMovement, Order, OrderItem, Payment, PurchaseOrder, sequelize,
} from '@database/models';
import { PAYMENT_STATUS } from '@config/constants';
import { CAKE_FINANCE_KIND } from '@database/models/cakeFinanceEntry.model';
import { MOVEMENT_TYPE } from '@database/models/inventoryMovement.model';
import { PAYABLE_TYPE } from '@database/models/payment.model';
import { PURCHASE_ORDER_STATUS } from '@database/models/procurement.model';
import { ApiError } from '@shared/errors/ApiError';
import { round2 } from '@shared/utils/money';
import { calculateRequirements } from '@modules/operations/inventory.service';

const amount = (value: unknown) => Number(value ?? 0);
const dateFilter = (from?: string, to?: string) => ({
  ...(from ? { [Op.gte]: new Date(`${from}T00:00:00-05:00`) } : {}),
  ...(to ? { [Op.lte]: new Date(`${to}T23:59:59.999-05:00`) } : {}),
});

const assertCakeOrder = async (orderId: number, transaction?: Transaction): Promise<void> => {
  const lines = await OrderItem.findAll({ where: { orderId }, attributes: ['productId'], transaction });
  const ids = lines.map((line) => line.productId).filter((id): id is number => id !== null);
  if (!ids.length || !await CakeProductProfile.count({ where: { productId: ids }, transaction })) {
    throw ApiError.unprocessable('Selecciona un pedido que contenga una torta');
  }
};

export const cakeFinanceService = {
  /** Se ejecuta dentro del checkout: congela costo conocido y receta de esta venta. */
  async snapshotOrderEstimate(order: Order, transaction: Transaction): Promise<void> {
    const requirements = await calculateRequirements(order.id, transaction, true);
    if (!requirements.size) return;
    const quote = await CakeDesignQuote.findOne({ where: { orderId: order.id }, transaction });
    const ids = [...requirements.keys()];
    const [stocks, items] = await Promise.all([
      BranchInventory.findAll({ where: { branchId: order.branchId, inventoryItemId: ids }, transaction }),
      InventoryItem.findAll({ where: { id: ids }, transaction }),
    ]);
    const stockById = new Map(stocks.map((row) => [row.inventoryItemId, row]));
    const itemById = new Map(items.map((row) => [row.id, row]));
    const materials = ids.map((itemId) => {
      const stockCost = amount(stockById.get(itemId)?.averageUnitCost);
      const itemCost = amount(itemById.get(itemId)?.unitCost);
      const unitCost = stockCost > 0 ? stockCost : itemCost > 0 ? itemCost : null;
      return { itemId, quantity: requirements.get(itemId)!, unitCost,
        source: (stockCost > 0 ? 'AVERAGE' : itemCost > 0 ? 'ITEM' : 'MISSING') as 'AVERAGE' | 'ITEM' | 'MISSING' };
    });
    await CakeOrderCostSnapshot.create({ orderId: order.id,
      estimatedMaterialCost: round2(materials.reduce((sum, line) => sum + line.quantity * (line.unitCost ?? 0), 0)),
      estimatedLaborCost: Number(quote?.estimatedLaborCost ?? 0), estimatedPackagingCost: Number(quote?.estimatedPackagingCost ?? 0),
      costsComplete: materials.every((line) => line.unitCost !== null), materialsJson: materials,
    }, { transaction });
  },

  async createExpense(input: { kind: 'BUSINESS_EXPENSE' | 'PLATFORM_EXPENSE'; branchId?: number; orderId?: number; category: string; amount: number; reference: string; occurredAt: Date; actorId: number; notes?: string }) {
    if (input.kind === CAKE_FINANCE_KIND.BUSINESS_EXPENSE && !input.branchId) throw ApiError.badRequest('Indica la sucursal');
    if (input.kind === CAKE_FINANCE_KIND.PLATFORM_EXPENSE && (input.branchId || input.orderId)) throw ApiError.badRequest('El gasto de plataforma no pertenece a una sucursal');
    if (input.orderId) {
      const order = await Order.findByPk(input.orderId);
      if (!order || order.branchId !== input.branchId) throw ApiError.unprocessable('El pedido no pertenece a la sucursal');
      await assertCakeOrder(order.id);
    }
    const duplicate = await CakeFinanceEntry.findOne({ where: { kind: input.kind, reference: input.reference } });
    if (duplicate) throw ApiError.conflict('Este comprobante ya fue registrado');
    return CakeFinanceEntry.create({ ...input, branchId: input.branchId ?? null, orderId: input.orderId ?? null, notes: input.notes ?? null });
  },

  async recordSupplierPayment(input: { branchId: number; purchaseOrderId: number; amount: number; reference: string; occurredAt: Date; actorId: number; notes?: string }) {
    return sequelize.transaction(async (transaction) => {
      const order = await PurchaseOrder.findOne({ where: { id: input.purchaseOrderId, branchId: input.branchId }, transaction, lock: transaction.LOCK.UPDATE });
      if (!order || order.status === PURCHASE_ORDER_STATUS.CANCELLED || order.status === PURCHASE_ORDER_STATUS.DRAFT) throw ApiError.unprocessable('La compra debe estar ordenada y activa');
      const paid = amount(await CakeFinanceEntry.sum('amount', { where: { purchaseOrderId: order.id, kind: CAKE_FINANCE_KIND.SUPPLIER_PAYMENT }, transaction }));
      if (round2(paid + input.amount) > amount(order.total)) throw ApiError.unprocessable('El pago supera el saldo de la orden de compra');
      if (await CakeFinanceEntry.findOne({ where: { kind: CAKE_FINANCE_KIND.SUPPLIER_PAYMENT, reference: input.reference }, transaction })) throw ApiError.conflict('Esta transferencia ya fue registrada');
      return CakeFinanceEntry.create({ ...input, kind: CAKE_FINANCE_KIND.SUPPLIER_PAYMENT, category: 'INSUMOS', notes: input.notes ?? null }, { transaction });
    });
  },

  async reconcilePayment(input: { branchId: number; paymentId: number; fee: number; netAmount: number; reference: string; occurredAt: Date; actorId: number; notes?: string }) {
    return sequelize.transaction(async (transaction) => {
      const payment = await Payment.findByPk(input.paymentId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!payment || payment.payableType !== PAYABLE_TYPE.ORDER || (payment.status !== PAYMENT_STATUS.SUCCEEDED && payment.status !== PAYMENT_STATUS.REFUNDED)) throw ApiError.unprocessable('El pago no esta acreditado');
      const order = await Order.findByPk(payment.payableId, { transaction });
      if (!order || order.branchId !== input.branchId) throw ApiError.unprocessable('El pago no pertenece a esta sucursal');
      await assertCakeOrder(order.id, transaction);
      if (round2(input.fee + input.netAmount) !== round2(amount(payment.amount))) throw ApiError.unprocessable('Neto recibido mas tarifa debe igualar el importe cobrado');
      if (await CakeFinanceEntry.findOne({ where: { paymentId: payment.id }, transaction })) throw ApiError.conflict('Este pago ya fue conciliado');
      if (await CakeFinanceEntry.findOne({ where: { kind: CAKE_FINANCE_KIND.PAYMENT_FEE, reference: input.reference }, transaction })) throw ApiError.conflict('Esta referencia ya esta registrada');
      return CakeFinanceEntry.create({ kind: CAKE_FINANCE_KIND.PAYMENT_FEE, branchId: input.branchId, orderId: order.id,
        paymentId: payment.id, category: 'PASARELA', amount: input.fee, netAmount: input.netAmount,
        reference: input.reference, occurredAt: input.occurredAt, actorId: input.actorId, notes: input.notes ?? null }, { transaction });
    });
  },

  async report(input: { branchId: number; from?: string; to?: string; isSuperAdmin: boolean }) {
    const orderWhere = { branchId: input.branchId, ...(input.from || input.to ? { placedAt: dateFilter(input.from, input.to) } : {}) };
    const entryWhere = { branchId: input.branchId, ...(input.from || input.to ? { occurredAt: dateFilter(input.from, input.to) } : {}) };
    const [commissions, entries, purchases] = await Promise.all([
      CakeCommission.findAll({ include: [{ model: Order, as: 'order', required: true, where: orderWhere, attributes: ['id', 'orderNumber', 'status', 'placedAt', 'grandTotal'] }], order: [['createdAt', 'DESC']] }),
      CakeFinanceEntry.findAll({ where: entryWhere, order: [['occurredAt', 'DESC']] }),
      PurchaseOrder.findAll({ where: { branchId: input.branchId, status: { [Op.notIn]: [PURCHASE_ORDER_STATUS.DRAFT, PURCHASE_ORDER_STATUS.CANCELLED] } }, attributes: ['id', 'orderNumber', 'total'] }),
    ]);
    const orderIds = commissions.map((row) => row.orderId);
    const [snapshots, movements, payments, settlements, orderItems, allOrderEntries, allSupplierPayments, profiles] = await Promise.all([
      CakeOrderCostSnapshot.findAll({ where: { orderId: orderIds } }),
      InventoryMovement.findAll({ where: { orderId: orderIds, type: { [Op.in]: [MOVEMENT_TYPE.CONSUME, MOVEMENT_TYPE.WASTE, MOVEMENT_TYPE.ADJUSTMENT] } } }),
      Payment.findAll({ where: { payableType: PAYABLE_TYPE.ORDER, payableId: orderIds, status: { [Op.in]: [PAYMENT_STATUS.SUCCEEDED, PAYMENT_STATUS.REFUNDED] } }, attributes: ['id', 'payableId', 'amount', 'provider'] }),
      CakeCommissionSettlement.findAll({ where: { commissionId: commissions.map((row) => row.id) } }),
      OrderItem.findAll({ where: { orderId: orderIds }, attributes: ['orderId', 'productId'] }),
      CakeFinanceEntry.findAll({ where: { orderId: orderIds } }),
      CakeFinanceEntry.findAll({ where: { branchId: input.branchId, kind: CAKE_FINANCE_KIND.SUPPLIER_PAYMENT }, attributes: ['purchaseOrderId', 'amount'] }),
      CakeProductProfile.findAll({ attributes: ['productId'] }),
    ]);
    const cakeProductIds = new Set(profiles.map((profile) => profile.productId));
    const snapshotByOrder = new Map(snapshots.map((row) => [row.orderId, row]));
    const paymentsByOrder = new Map<number, Payment[]>();
    for (const payment of payments) paymentsByOrder.set(payment.payableId, [...(paymentsByOrder.get(payment.payableId) ?? []), payment]);
    const rows = commissions.map((commission) => {
      const order = commission.get('order') as Order;
      const snapshot = snapshotByOrder.get(order.id);
      const orderMovements = movements.filter((entry) => entry.orderId === order.id);
      const expenseRows = allOrderEntries.filter((entry) => entry.orderId === order.id && entry.kind === CAKE_FINANCE_KIND.BUSINESS_EXPENSE);
      const missingLabor = !expenseRows.some((entry) => entry.category === 'LABOR');
      const missingPackaging = !expenseRows.some((entry) => entry.category === 'PACKAGING');
      const directExpenses = expenseRows.reduce((sum, entry) => sum + amount(entry.amount), 0)
        + (missingLabor ? amount(snapshot?.estimatedLaborCost) : 0) + (missingPackaging ? amount(snapshot?.estimatedPackagingCost) : 0);
      const feeEntries = allOrderEntries.filter((entry) => entry.orderId === order.id && entry.kind === CAKE_FINANCE_KIND.PAYMENT_FEE);
      const paymentFees = round2(feeEntries.reduce((sum, entry) => sum + amount(entry.amount), 0));
      const actualMaterialCost = round2(orderMovements.reduce((sum, entry) => sum + amount(entry.totalCost), 0));
      const expectedMaterialCost = amount(snapshot?.estimatedMaterialCost);
      const materialCost = orderMovements.length ? actualMaterialCost : expectedMaterialCost;
      const revenue = round2(Math.max(0, amount(commission.baseAmount) - amount(commission.refundAmount)));
      const paidCommission = round2(settlements.filter((entry) => entry.commissionId === commission.id).reduce((sum, entry) => sum + amount(entry.amount), 0));
      const orderPayments = paymentsByOrder.get(order.id) ?? [];
      const missingFee = orderPayments.some((payment) => payment.provider === 'mercadopago' && !feeEntries.some((entry) => entry.paymentId === payment.id));
      const materialMissing = !snapshot || !snapshot.costsComplete || (orderMovements.length > 0 && orderMovements.some((entry) => entry.unitCost == null || amount(entry.unitCost) <= 0));
      const mixedProducts = orderItems.filter((entry) => entry.orderId === order.id).some((entry) => !entry.productId || !cakeProductIds.has(entry.productId));
      return { orderId: order.id, orderNumber: order.orderNumber, status: order.status, placedAt: order.placedAt,
        payments: orderPayments.map((payment) => ({ id: payment.id, amount: amount(payment.amount), provider: payment.provider, reconciled: feeEntries.some((entry) => entry.paymentId === payment.id) })),
        revenue, estimatedMaterialCost: expectedMaterialCost, actualMaterialCost, materialCost, materialCostType: orderMovements.length ? 'ACTUAL' : 'ESTIMATED',
        directExpenses: round2(directExpenses), paymentFees, platformCommission: amount(commission.commissionAmount), paidCommission,
        contribution: round2(revenue - materialCost - directExpenses - paymentFees - amount(commission.commissionAmount)),
        costsComplete: !materialMissing && !missingFee && !mixedProducts && !missingLabor && !missingPackaging,
        missingMaterialCost: materialMissing, missingPaymentFee: missingFee, missingLabor, missingPackaging, mixedProducts,
      };
    });
    const supplierPayments = entries.filter((entry) => entry.kind === CAKE_FINANCE_KIND.SUPPLIER_PAYMENT);
    const generalExpenses = round2(entries.filter((entry) => entry.kind === CAKE_FINANCE_KIND.BUSINESS_EXPENSE && !entry.orderId)
      .reduce((sum, entry) => sum + amount(entry.amount), 0));
    const orderContribution = round2(rows.reduce((sum, row) => sum + row.contribution, 0));
    const summary = { revenue: round2(rows.reduce((sum, row) => sum + row.revenue, 0)),
      estimatedMaterials: round2(rows.reduce((sum, row) => sum + row.estimatedMaterialCost, 0)),
      materials: round2(rows.reduce((sum, row) => sum + row.materialCost, 0)),
      directExpenses: round2(rows.reduce((sum, row) => sum + row.directExpenses, 0)),
      paymentFees: round2(rows.reduce((sum, row) => sum + row.paymentFees, 0)),
      commission: round2(rows.reduce((sum, row) => sum + row.platformCommission, 0)),
      contribution: orderContribution,
      generalExpenses,
      operatingContribution: round2(orderContribution - generalExpenses),
      supplierPaid: round2(supplierPayments.reduce((sum, entry) => sum + amount(entry.amount), 0)),
      supplierCommitted: round2(purchases.reduce((sum, entry) => sum + amount(entry.total), 0)),
      supplierOutstanding: round2(Math.max(0, purchases.reduce((sum, entry) => sum + amount(entry.total), 0) - allSupplierPayments.reduce((sum, entry) => sum + amount(entry.amount), 0))),
      incompleteOrders: rows.filter((row) => !row.costsComplete).length,
    };
    const platform = input.isSuperAdmin ? await cakeFinanceService.platformSummary(input.from, input.to) : undefined;
    const purchaseOrders = purchases.map((order) => ({ id: order.id, orderNumber: order.orderNumber, total: amount(order.total),
      paid: round2(allSupplierPayments.filter((entry) => entry.purchaseOrderId === order.id).reduce((sum, entry) => sum + amount(entry.amount), 0)) }));
    return { rows, entries, purchaseOrders, summary, platform, canManagePlatform: input.isSuperAdmin };
  },

  async platformSummary(from?: string, to?: string) {
    const [commissions, settlements, expenses] = await Promise.all([
      CakeCommission.findAll({ include: [{ model: Order, as: 'order', required: true, where: from || to ? { placedAt: dateFilter(from, to) } : undefined, attributes: [] }] }),
      CakeCommissionSettlement.findAll({ where: from || to ? { createdAt: dateFilter(from, to) } : undefined }),
      CakeFinanceEntry.findAll({ where: { kind: CAKE_FINANCE_KIND.PLATFORM_EXPENSE, ...(from || to ? { occurredAt: dateFilter(from, to) } : {}) } }),
    ]);
    const earned = round2(commissions.reduce((sum, row) => sum + amount(row.commissionAmount), 0));
    const received = round2(settlements.reduce((sum, row) => sum + amount(row.amount), 0));
    const operatingExpenses = round2(expenses.reduce((sum, row) => sum + amount(row.amount), 0));
    return { earned, received, operatingExpenses, contribution: round2(earned - operatingExpenses) };
  },
};
