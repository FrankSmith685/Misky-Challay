import { orderDesignImages } from '@modules/cakes/cakeOrderImages.service';
import { col, fn, literal, Op, type Transaction } from 'sequelize';
import {
  AuditLog,
  Branch,
  CashMovement,
  CashSession,
  CakeCommission,
  CakeCommissionSettlement,
  CakeProductionTask,
  DiningTable,
  KitchenTicket,
  Order,
  OrderItem,
  OrderItemReference,
  OrderItemCustomization,
  OrderStatusHistory,
  Payment,
  Delivery,
  DeliveryEvidence,
  MobilePaymentClaim,
  Refund,
  UxEvent,
  User,
  sequelize,
} from '@database/models';
import { PAYABLE_TYPE } from '@database/models/payment.model';
import { DOCUMENT_TYPE, INVOICE_STATUS, ORDER_STATUS, type OrderStatus } from '@config/constants';
import { ApiError } from '@shared/errors/ApiError';
import type { BranchScopeCheck } from '@shared/utils/scope';
import { buildMeta, getPagination, type PaginationQuery } from '@shared/utils/pagination';
import { addDaysToIsoDate, defaultTimeZone, zonedDateAt, zonedParts } from '@shared/utils/datetime';
import { settingsService } from '@modules/settings/settings.service';
import { kitchenReleaseAtForTasks } from '@modules/operations/kitchenSchedule';
import { CASH_MOVEMENT_TYPE, type CashMovementType } from '@database/models/cashMovement.model';
import { CASH_SESSION_STATUS } from '@database/models/cashSession.model';
import { round2 } from '@shared/utils/money';
import { auditCanonical, auditHash } from '@shared/utils/auditIntegrity';
import { getPlatformCommissionRate } from '@modules/cakes/cakeCommission.service';

const productionSummary = (tasks: CakeProductionTask[]) => [...tasks].sort((a, b) => a.workDate.localeCompare(b.workDate) || a.sequence - b.sequence).map((task) => ({
  id: task.id,
  station: task.station,
  workDate: task.workDate,
  status: task.status,
  assigned: task.assignedTo != null,
}));

export interface OrderBoardFilters extends PaginationQuery {
  branchId?: number;
  status?: string;
  from?: string;
  to?: string;
  search?: string;
  source?: 'WEB' | 'POS';
  deliveryType?: 'DELIVERY' | 'PICKUP' | 'DINE_IN';
}

export interface AuditLogQuery extends PaginationQuery {
  entity?: string;
  actorId?: number;
  action?: string;
  entityId?: string;
  severity?: string;
  outcome?: string;
  correlationId?: string;
  search?: string;
  from?: string;
  to?: string;
}

/**
 * Rango de un informe a partir de fechas de calendario.
 *
 * `new Date('2026-08-03')` es medianoche UTC, que en Lima son las 19:00 del dia 2.
 * Con eso, un informe "del 3 al 3" dejaba fuera toda la cena del 3 (19:00-22:00
 * locales caen ya en el 4 UTC) y la contaba en el dia siguiente: el cierre de caja
 * nunca cuadraba. Aqui el dia empieza y termina en la zona de la operacion.
 */
const parseRange = (from?: string, to?: string): { start: Date; end: Date } => {
  const timeZone = defaultTimeZone();
  const today = zonedParts(new Date(), timeZone).isoDate;

  const endDate = to ?? today;
  const startDate = from ?? addDaysToIsoDate(endDate, -30);

  return {
    start: zonedDateAt(startDate, 0, 0, timeZone),
    // Fin del dia: el instante en que empieza el siguiente, menos 1 ms.
    end: new Date(zonedDateAt(addDaysToIsoDate(endDate, 1), 0, 0, timeZone).getTime() - 1),
  };
};

const limaBusinessDate = (date = new Date()): string => zonedParts(date, defaultTimeZone()).isoDate;
const CASH_IN_MOVEMENT_TYPES: CashMovementType[] = [CASH_MOVEMENT_TYPE.CASH_IN];
const CASH_OUT_MOVEMENT_TYPES: CashMovementType[] = [CASH_MOVEMENT_TYPE.EXPENSE, CASH_MOVEMENT_TYPE.CASH_OUT];

const cashSessionReconciliation = async (session: CashSession, transaction?: Transaction) => {
  const from = session.openedAt;
  const to = session.closedAt ?? new Date();
  const orders = await Order.findAll({
    // La caja sigue teniendo el efectivo aunque el pedido se cancele después;
    // solo un reembolso SUCCEEDED lo resta del esperado.
    where: { branchId: session.branchId },
    attributes: ['id'],
    transaction,
  });
  const orderIds = orders.map((order) => order.id);
  const payments = orderIds.length
    ? await Payment.findAll({
        where: {
          payableType: PAYABLE_TYPE.ORDER,
          payableId: orderIds,
          provider: 'cash',
          status: { [Op.in]: ['SUCCEEDED', 'REFUNDED'] },
          [Op.or]: [
            { capturedAt: { [Op.between]: [from, to] } },
            { capturedAt: null, createdAt: { [Op.between]: [from, to] } },
          ],
        },
        attributes: ['id', 'amount'],
        transaction,
      })
    : [];
  const refunds = payments.length
    ? await Refund.findAll({ where: { paymentId: payments.map((payment) => payment.id), status: 'SUCCEEDED' }, attributes: ['amount'], transaction })
    : [];
  const movements = await CashMovement.findAll({ where: { sessionId: session.id }, order: [['id', 'ASC']], transaction });
  const manualIn = movements.filter((movement) => CASH_IN_MOVEMENT_TYPES.includes(movement.type)).reduce((sum, movement) => sum + Number(movement.amount), 0);
  const manualOut = movements.filter((movement) => CASH_OUT_MOVEMENT_TYPES.includes(movement.type)).reduce((sum, movement) => sum + Number(movement.amount), 0);
  const adjustments = movements.filter((movement) => movement.type === CASH_MOVEMENT_TYPE.ADJUSTMENT).reduce((sum, movement) => sum + Number(movement.amount), 0);
  const cashSales = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const cashRefunds = refunds.reduce((sum, refund) => sum + Number(refund.amount), 0);
  const expectedCash = round2(Number(session.openingFloat) + cashSales - cashRefunds + manualIn - manualOut + adjustments);
  return {
    movements,
    cashSales: round2(cashSales),
    cashRefunds: round2(cashRefunds),
    manualIn: round2(manualIn),
    manualOut: round2(manualOut),
    adjustments: round2(adjustments),
    expectedCash,
    declaredCash: session.declaredCash === null ? null : round2(Number(session.declaredCash)),
    variance: session.declaredCash === null ? null : round2(Number(session.declaredCash) - expectedCash),
  };
};

export interface CashSummaryFilters {
  branchId?: number;
  from?: string;
  to?: string;
}

/** Estados que cuentan como venta real (excluye canceladas y no pagadas). */
const SOLD_STATUSES: OrderStatus[] = [
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.READY,
  ORDER_STATUS.OUT_FOR_DELIVERY,
  ORDER_STATUS.DELIVERED,
];

/** Numero a partir de un DECIMAL: mysql2 lo devuelve como cadena. */
const money = (value: unknown): number => Math.round(Number(value ?? 0) * 100) / 100;

type OrderPaymentSummary = {
  state: 'NO_PAYMENT' | 'PENDING_PAYMENT' | 'REVIEW' | 'OBSERVED' | 'PAID' | 'FAILED' | 'REFUND_PENDING';
  amount: number;
  provider: string | null;
  refundPending: boolean;
};

const summarizeOrderPayments = (
  orderId: number,
  payments: Payment[],
  claims: MobilePaymentClaim[],
  pendingRefunds: Refund[],
): OrderPaymentSummary => {
  const rows = payments.filter((payment) => payment.payableId === orderId);
  const claimByPayment = new Map(claims.map((claim) => [claim.paymentId, claim]));
  const pendingRefundIds = new Set(pendingRefunds.map((refund) => refund.paymentId));
  const amount = money(rows.reduce((sum, payment) => sum + Number(payment.amount), 0));
  const refundPending = rows.some((payment) => pendingRefundIds.has(payment.id));
  const directClaim = rows
    .map((payment) => ({ payment, claim: claimByPayment.get(payment.id) }))
    .find(({ payment, claim }) => payment.status === 'PENDING' && ['PENDING', 'OBSERVED'].includes(claim?.status ?? ''));
  if (refundPending) return { state: 'REFUND_PENDING', amount, provider: rows[0]?.provider ?? null, refundPending: true };
  if (directClaim?.claim?.status === 'OBSERVED') return { state: 'OBSERVED', amount, provider: directClaim.payment.provider, refundPending: false };
  if (directClaim?.claim?.status === 'PENDING') return { state: 'REVIEW', amount, provider: directClaim.payment.provider, refundPending: false };
  if (rows.some((payment) => payment.status === 'SUCCEEDED')) return { state: 'PAID', amount, provider: rows.find((payment) => payment.status === 'SUCCEEDED')?.provider ?? null, refundPending: false };
  if (rows.some((payment) => payment.status === 'PENDING')) return { state: 'PENDING_PAYMENT', amount, provider: rows.find((payment) => payment.status === 'PENDING')?.provider ?? null, refundPending: false };
  if (rows.some((payment) => payment.status === 'FAILED')) return { state: 'FAILED', amount, provider: rows.find((payment) => payment.status === 'FAILED')?.provider ?? null, refundPending: false };
  return { state: 'NO_PAYMENT', amount, provider: rows[0]?.provider ?? null, refundPending: false };
};

export const adminService = {
  /**
   * Registra una solicitud de impresion del resumen interno. No cambia ningun
   * estado fiscal y usa el numero inmutable del pedido como identificador.
   */
  async recordInternalReceiptPrint(orderNumber: string, scopeCheck?: BranchScopeCheck) {
    return sequelize.transaction(async (transaction) => {
      const order = await Order.findOne({
        where: { orderNumber },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!order) throw ApiError.notFound('Pedido no encontrado');
      scopeCheck?.(order.branchId);
      if (order.status === ORDER_STATUS.PENDING_PAYMENT) {
        throw ApiError.unprocessable('El ticket interno se habilita cuando el pedido queda confirmado');
      }

      const now = new Date();
      order.internalReceiptFirstPrintedAt ??= now;
      order.internalReceiptLastPrintedAt = now;
      order.internalReceiptPrintCount += 1;
      await order.save({ transaction });
      return order;
    });
  },

  /**
   * Guarda la constancia entregada por el OSE/integrador. Es deliberadamente
   * distinto de "imprimir": una vista previa nunca se convierte en CPE por abrirla.
   */
  async registerInvoice(
    orderNumber: string,
    input: {
      series: string;
      number: string;
      providerReference?: string;
      pdfUrl?: string;
      xmlUrl?: string;
    },
    scopeCheck?: BranchScopeCheck,
  ) {
    return sequelize.transaction(async (transaction) => {
      const order = await Order.findOne({
        where: { orderNumber },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!order) throw ApiError.notFound('Pedido no encontrado');
      scopeCheck?.(order.branchId);
      const blockedStatuses: OrderStatus[] = [
        ORDER_STATUS.PENDING_PAYMENT,
        ORDER_STATUS.CANCELLED,
        ORDER_STATUS.REFUNDED,
      ];
      if (blockedStatuses.includes(order.status)) {
        throw ApiError.unprocessable('Este pedido no puede emitir un comprobante');
      }

      const series = input.series.trim().toUpperCase();
      const number = input.number.trim().padStart(8, '0');
      const requiredPrefix = order.documentType === DOCUMENT_TYPE.FACTURA ? 'F' : 'B';
      if (!series.startsWith(requiredPrefix)) {
        throw ApiError.unprocessable(
          `${order.documentType === DOCUMENT_TYPE.FACTURA ? 'La factura' : 'La boleta'} debe usar una serie que empiece con ${requiredPrefix}`,
        );
      }

      if (order.invoiceStatus === INVOICE_STATUS.ISSUED) {
        if (order.invoiceSeries === series && order.invoiceNumber === number) return order;
        throw ApiError.conflict('El pedido ya tiene un comprobante emitido');
      }

      order.invoiceStatus = INVOICE_STATUS.ISSUED;
      order.invoiceSeries = series;
      order.invoiceNumber = number;
      order.invoiceIssuedAt = new Date();
      order.invoiceProviderReference = input.providerReference?.trim() || null;
      order.invoicePdfUrl = input.pdfUrl?.trim() || null;
      order.invoiceXmlUrl = input.xmlUrl?.trim() || null;
      await order.save({ transaction });
      return order;
    });
  },

  /** Tablero de pedidos con filtros (seccion 9.7). */
  async orderBoard(filters: OrderBoardFilters) {
    const pagination = getPagination(filters);
    const where: Record<string, unknown> = {};

    if (filters.branchId) where.branchId = filters.branchId;
    if (filters.status) where.status = { [Op.in]: String(filters.status).split(',') };
    if (filters.source) where.source = filters.source;
    if (filters.deliveryType) where.deliveryType = filters.deliveryType;

    if (filters.from || filters.to) {
      const { start, end } = parseRange(filters.from, filters.to);
      where.placedAt = { [Op.between]: [start, end] };
    }

    /**
     * Busqueda OR sobre numero, nombre y telefono.
     *
     * Antes solo miraba `orderNumber`, y quien atiende al cliente POR TELEFONO no
     * tiene el codigo del pedido delante: tiene un nombre y un numero. El telefono
     * se busca por sus digitos porque el cliente lo dicta con espacios o guiones y
     * en base esta normalizado.
     */
    const term = filters.search?.trim();
    const digits = term ? term.replace(/\D/g, '') : '';
    const searchClause = term
      ? [
          { orderNumber: { [Op.like]: `%${term}%` } },
          { contactName: { [Op.like]: `%${term}%` } },
          // Con menos de 4 digitos el filtro devuelve medio padron: no vale la pena.
          ...(digits.length >= 4 ? [{ contactPhone: { [Op.like]: `%${digits}%` } }] : []),
        ]
      : null;

    const { rows, count } = await Order.findAndCountAll({
      where: searchClause ? { ...where, [Op.or]: searchClause } : where,
      attributes: { exclude: ['termsAcceptanceJson'] },
      include: [
        { model: OrderItem, as: 'items', attributes: ['id', 'productNameSnapshot', 'quantity'] },
        { model: Branch, as: 'branch', attributes: ['id', 'name', 'prepMinutes'] },
        { model: DiningTable, as: 'diningTable', attributes: ['id', 'code', 'area'] },
        { model: KitchenTicket, as: 'kitchenTicket', attributes: ['id', 'status', 'targetAt'] },
        { model: CakeProductionTask, as: 'cakeTasks', attributes: ['id', 'station', 'workDate', 'plannedMinutes', 'status', 'assignedTo'], separate: true },
      ],
      order: [['id', 'DESC']],
      limit: pagination.limit,
      offset: pagination.offset,
      distinct: true,
    });

    const matchingOrders = await Order.findAll({ where: searchClause ? { ...where, [Op.or]: searchClause } : where, attributes: ['id', 'status', 'grandTotal'] });
    const matchingOrderIds = matchingOrders.map((order) => order.id);
    const paymentRows = matchingOrderIds.length
      ? await Payment.findAll({ where: { payableType: PAYABLE_TYPE.ORDER, payableId: matchingOrderIds }, attributes: ['id', 'payableId', 'provider', 'amount', 'status'] })
      : [];
    const paymentIds = paymentRows.map((payment) => payment.id);
    const [claims, pendingRefunds] = paymentIds.length
      ? await Promise.all([
          MobilePaymentClaim.findAll({ where: { paymentId: { [Op.in]: paymentIds } }, attributes: ['paymentId', 'status'] }),
          Refund.findAll({ where: { status: 'PENDING', paymentId: { [Op.in]: paymentIds } }, attributes: ['paymentId', 'amount'] }),
        ])
      : [[], []];
    const summaryCounts: Record<string, number> = {};
    let summaryAmount = 0;
    for (const order of matchingOrders) {
      summaryCounts[order.status] = (summaryCounts[order.status] ?? 0) + 1;
      summaryAmount += Number(order.grandTotal);
    }
    const paymentSummaryByOrder = new Map<number, OrderPaymentSummary>();
    for (const order of matchingOrders) paymentSummaryByOrder.set(order.id, summarizeOrderPayments(order.id, paymentRows, claims, pendingRefunds));
    const paymentCounts: Record<string, number> = {};
    const pendingRefundAmount = money(pendingRefunds.reduce((sum, refund) => sum + Number(refund.amount), 0));
    let pendingPaymentAmount = 0;
    for (const summary of paymentSummaryByOrder.values()) {
      paymentCounts[summary.state] = (paymentCounts[summary.state] ?? 0) + 1;
      if (['PENDING_PAYMENT', 'REVIEW', 'OBSERVED'].includes(summary.state)) pendingPaymentAmount += summary.amount;
    }

    return {
      orders: rows.map((order) => {
        const tasks = (order.get('cakeTasks') as CakeProductionTask[] | undefined) ?? [];
        const branch = order.get('branch') as Branch | undefined;
        return {
          ...order.toJSON(),
          cakeTasks: productionSummary(tasks),
          paymentSummary: paymentSummaryByOrder.get(order.id) ?? { state: 'NO_PAYMENT', amount: 0, provider: null, refundPending: false },
          kitchenReleaseAt: order.scheduledAt
            ? kitchenReleaseAtForTasks(order.scheduledAt, branch?.prepMinutes ?? 20, tasks)
            : null,
        };
      }),
      meta: buildMeta(pagination, count),
      summary: {
        totalAmount: money(summaryAmount),
        counts: summaryCounts,
        paymentCounts,
        pendingPaymentAmount: money(pendingPaymentAmount),
        pendingRefundAmount: money(pendingRefundAmount),
      },
    };
  },

  async cashSummary(filters: CashSummaryFilters) {
    const { start, end } = parseRange(filters.from, filters.to);
    const branchFilter = filters.branchId ? { branchId: filters.branchId } : {};
    const sessions = await CashSession.findAll({
      where: { ...branchFilter, businessDate: { [Op.between]: [start, end] } },
      include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'] }],
      order: [['businessDate', 'DESC'], ['id', 'DESC']],
    });
    const openSessions = sessions.filter((session) => session.status === CASH_SESSION_STATUS.OPEN);
    const closedSessions = sessions.filter((session) => session.status === CASH_SESSION_STATUS.CLOSED);
    const sales = await Order.findAll({
      where: { ...branchFilter, status: { [Op.in]: SOLD_STATUSES }, placedAt: { [Op.between]: [start, end] } },
      attributes: ['id'],
    });
    const allOrders = await Order.findAll({
      where: { ...branchFilter, placedAt: { [Op.between]: [start, end] } },
      attributes: ['id'],
    });
    const orderIds = sales.map((order) => order.id);
    const payments = orderIds.length
      ? await Payment.findAll({ where: { payableType: PAYABLE_TYPE.ORDER, payableId: orderIds, provider: 'cash' }, attributes: ['id', 'amount', 'status', 'capturedAt', 'createdAt'] })
      : [];
    const captured = payments.filter((payment) => {
      const capturedAt = payment.capturedAt ?? payment.createdAt;
      return ['SUCCEEDED', 'REFUNDED'].includes(payment.status) && capturedAt >= start && capturedAt <= end;
    });
    const refunds = captured.length
      ? await Refund.findAll({ where: { paymentId: captured.map((payment) => payment.id), status: 'SUCCEEDED' }, attributes: ['amount'] })
      : [];
    const movements = await CashMovement.findAll({ where: { ...branchFilter, createdAt: { [Op.between]: [start, end] } }, attributes: ['type', 'amount'] });
    const manualIn = movements.filter((movement) => movement.type === CASH_MOVEMENT_TYPE.CASH_IN).reduce((sum, movement) => sum + Number(movement.amount), 0);
    const manualOut = movements.filter((movement) => CASH_OUT_MOVEMENT_TYPES.includes(movement.type)).reduce((sum, movement) => sum + Number(movement.amount), 0);
    const adjustments = movements.filter((movement) => movement.type === CASH_MOVEMENT_TYPE.ADJUSTMENT).reduce((sum, movement) => sum + Number(movement.amount), 0);
    const cashSales = captured.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const cashRefunds = refunds.reduce((sum, refund) => sum + Number(refund.amount), 0);
    const platformRate = await getPlatformCommissionRate();
    const pendingPayments = allOrders.length
      ? await Payment.findAll({ where: { payableType: PAYABLE_TYPE.ORDER, payableId: allOrders.map((order) => order.id), provider: { [Op.in]: ['cash', 'yape', 'plin'] }, status: 'PENDING' }, attributes: ['amount'] })
      : [];
    return {
      range: { from: start.toISOString(), to: end.toISOString() },
      cash: {
        sales: money(cashSales),
        refunds: money(cashRefunds),
        manualIn: money(manualIn),
        manualOut: money(manualOut),
        adjustments: money(adjustments),
        net: money(cashSales - cashRefunds + manualIn - manualOut + adjustments),
      },
      pending: { count: pendingPayments.length, amount: money(pendingPayments.reduce((sum, payment) => sum + Number(payment.amount), 0)) },
      platform: { rate: platformRate },
      sessions: {
        open: openSessions.length,
        closed: closedSessions.length,
        variance: money(closedSessions.reduce((sum, session) => sum + Number(session.variance ?? 0), 0)),
      },
      openSessions: openSessions.map((session) => ({
        id: session.id,
        branchId: session.branchId,
        branchName: (session.get('branch') as Branch | undefined)?.name ?? null,
        businessDate: session.businessDate,
        openingFloat: money(session.openingFloat),
        openedAt: session.openedAt,
      })),
      recentSessions: sessions.slice(0, 12).map((session) => ({
        id: session.id,
        branchId: session.branchId,
        branchName: (session.get('branch') as Branch | undefined)?.name ?? null,
        businessDate: session.businessDate,
        status: session.status,
        openingFloat: money(session.openingFloat),
        expectedCash: session.expectedCash === null ? null : money(session.expectedCash),
        declaredCash: session.declaredCash === null ? null : money(session.declaredCash),
        variance: session.variance === null ? null : money(session.variance),
        openedAt: session.openedAt,
        closedAt: session.closedAt,
      })),
    };
  },

  async cashSessionDetail(id: number, scopeCheck?: BranchScopeCheck) {
    const session = await CashSession.findByPk(id, { include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'] }] });
    if (!session) throw ApiError.notFound('Sesión de caja no encontrada');
    scopeCheck?.(session.branchId);
    const reconciliation = await cashSessionReconciliation(session);
    return {
      session: {
        id: session.id,
        branchId: session.branchId,
        branchName: (session.get('branch') as Branch | undefined)?.name ?? null,
        businessDate: session.businessDate,
        status: session.status,
        openingFloat: money(session.openingFloat),
        openedAt: session.openedAt,
        closedAt: session.closedAt,
        closingNotes: session.closingNotes,
      },
      reconciliation: {
        cashSales: reconciliation.cashSales,
        cashRefunds: reconciliation.cashRefunds,
        manualIn: reconciliation.manualIn,
        manualOut: reconciliation.manualOut,
        adjustments: reconciliation.adjustments,
        expectedCash: reconciliation.expectedCash,
        declaredCash: reconciliation.declaredCash,
        variance: reconciliation.variance,
      },
      movements: reconciliation.movements.map((movement) => ({
        id: movement.id,
        type: movement.type,
        amount: round2(Number(movement.amount)),
        reason: movement.reason,
        orderId: movement.orderId,
        paymentId: movement.paymentId,
        actorId: movement.actorId,
        createdAt: movement.createdAt,
      })),
    };
  },

  async openCashSession(input: { branchId: number; businessDate?: string; openingFloat: number; actorId: number }, scopeCheck?: BranchScopeCheck) {
    scopeCheck?.(input.branchId);
    const businessDate = input.businessDate ?? limaBusinessDate();
    if (!Number.isFinite(input.openingFloat) || input.openingFloat < 0) throw ApiError.unprocessable('El fondo inicial no puede ser negativo');
    return sequelize.transaction(async (transaction) => {
      const branch = await Branch.findByPk(input.branchId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!branch) throw ApiError.notFound('Sucursal no encontrada');
      const current = await CashSession.findOne({ where: { branchId: input.branchId, businessDate, status: CASH_SESSION_STATUS.OPEN }, transaction, lock: transaction.LOCK.UPDATE });
      if (current) throw ApiError.conflict('Ya existe una caja abierta para esta sucursal y fecha');
      const session = await CashSession.create({ branchId: input.branchId, businessDate, status: CASH_SESSION_STATUS.OPEN, openedBy: input.actorId, openedAt: new Date(), openingFloat: round2(input.openingFloat), closedBy: null, closedAt: null, expectedCash: null, declaredCash: null, variance: null, closingNotes: null }, { transaction });
      return session;
    });
  },

  async recordCashMovement(input: { sessionId: number; type: CashMovementType; amount: number; reason: string; actorId: number }, scopeCheck?: BranchScopeCheck) {
    if (([CASH_MOVEMENT_TYPE.SALE, CASH_MOVEMENT_TYPE.REFUND] as CashMovementType[]).includes(input.type)) throw ApiError.unprocessable('Las ventas y devoluciones se calculan desde los pagos registrados');
    if (!Number.isFinite(input.amount) || (input.type === CASH_MOVEMENT_TYPE.ADJUSTMENT ? input.amount === 0 : input.amount <= 0)) throw ApiError.unprocessable('El importe del movimiento no es válido');
    const session = await CashSession.findByPk(input.sessionId);
    if (!session) throw ApiError.notFound('Sesión de caja no encontrada');
    scopeCheck?.(session.branchId);
    if (session.status !== CASH_SESSION_STATUS.OPEN) throw ApiError.conflict('La caja ya está cerrada');
    return CashMovement.create({ sessionId: session.id, branchId: session.branchId, type: input.type, amount: round2(input.amount), reason: input.reason.trim(), actorId: input.actorId, paymentId: null, orderId: null });
  },

  async closeCashSession(input: { id: number; declaredCash: number; notes?: string; actorId: number }, scopeCheck?: BranchScopeCheck) {
    if (!Number.isFinite(input.declaredCash) || input.declaredCash < 0) throw ApiError.unprocessable('El efectivo declarado no puede ser negativo');
    return sequelize.transaction(async (transaction) => {
      const session = await CashSession.findByPk(input.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!session) throw ApiError.notFound('Sesión de caja no encontrada');
      scopeCheck?.(session.branchId);
      if (session.status !== CASH_SESSION_STATUS.OPEN) throw ApiError.conflict('La caja ya está cerrada');
      session.closedAt = new Date();
      const reconciliation = await cashSessionReconciliation(session, transaction);
      const declaredCash = round2(input.declaredCash);
      const variance = round2(declaredCash - reconciliation.expectedCash);
      if (Math.abs(variance) >= 0.01 && !input.notes?.trim()) throw ApiError.unprocessable('Explica la diferencia antes de cerrar la caja');
      session.status = CASH_SESSION_STATUS.CLOSED;
      session.closedBy = input.actorId;
      session.expectedCash = reconciliation.expectedCash;
      session.declaredCash = declaredCash;
      session.variance = variance;
      session.closingNotes = input.notes?.trim() || null;
      await session.save({ transaction });
      return session;
    });
  },

  /**
   * Ficha completa del pedido (`GET /admin/orders/:orderNumber`).
   *
   * Soporte atendia al cliente por telefono sin ver ni las personalizaciones, ni el
   * historial de estados, ni el pago. Todo esto ya estaba en base; lo que faltaba
   * era un endpoint que lo reuniera.
   *
   * `includePayments` es el permiso `payment.read` hecho efectivo: el bloque de
   * dinero no viaja a quien no puede verlo, y no basta con ocultarlo en la UI.
   * `scopeCheck` valida la sucursal en cuanto se conoce la del pedido (mismo patron
   * que cocina y reparto): un admin de sucursal no lee la ficha de otra cocina.
   */
  async orderDetail(
    orderNumber: string,
    options: { includePayments: boolean; scopeCheck?: BranchScopeCheck },
  ) {
    const order = await Order.findOne({
      where: { orderNumber },
      include: [
        {
          model: OrderItem,
          as: 'items',
          include: [{ model: OrderItemCustomization, as: 'customizations' }, { model: OrderItemReference, as: 'reference', attributes: ['id'] }, { model: OrderItemReference, as: 'designImages', attributes: ['id', 'kind', 'position'] }],
        },
        { model: Branch, as: 'branch', attributes: ['id', 'name', 'prepMinutes'] },
        { model: DiningTable, as: 'diningTable', attributes: ['id', 'code', 'area'] },
        { model: KitchenTicket, as: 'kitchenTicket', attributes: ['id', 'status', 'targetAt'] },
        { model: CakeProductionTask, as: 'cakeTasks', attributes: ['id', 'station', 'workDate', 'plannedMinutes', 'status', 'assignedTo'], separate: true },
        {
          model: OrderStatusHistory,
          as: 'statusHistory',
          separate: true,
          order: [['id', 'ASC']],
        },
      ],
    });

    if (!order) throw ApiError.notFound('Pedido no encontrado');
    options.scopeCheck?.(order.branchId);

    const items = order.items ?? [];
    const cakeTasks = (order.get('cakeTasks') as CakeProductionTask[] | undefined) ?? [];
    const branch = order.get('branch') as Branch | undefined;
    const history =
      (order.get('statusHistory') as OrderStatusHistory[] | undefined) ?? [];

    const [payments, receiptSettings, customer] = await Promise.all([
      options.includePayments
      ? await Payment.findAll({
          where: { payableType: PAYABLE_TYPE.ORDER, payableId: order.id },
          include: [
            { model: Refund, as: 'refunds' },
            { model: MobilePaymentClaim, as: 'mobileClaim', required: false },
          ],
          order: [['id', 'DESC']],
        })
      : Promise.resolve([]),
      settingsService.getReceiptSettings(),
      order.userId ? User.findByPk(order.userId, { attributes: ['email'] }) : Promise.resolve(null),
    ]);

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      deliveryType: order.deliveryType,
      diningTableId: order.diningTableId,
      waiterId: order.waiterId,
      source: order.source,
      serviceMode: order.serviceMode,
      scheduledAt: order.scheduledAt,
      placedAt: order.placedAt,
      cancelReason: order.cancelReason,
      contactName: order.contactName,
      termsAcceptanceJson: order.termsAcceptanceJson,
      contactPhone: order.contactPhone,
      customerEmail: customer?.email ?? null,
      customerContactJson: order.customerContactJson,
      notes: order.notes,
      addressSnapshotJson: order.addressSnapshotJson,
      branch: order.get('branch') ?? null,
      diningTable: order.get('diningTable') ?? null,
      kitchenTicket: order.get('kitchenTicket') ?? null,
      cakeTasks: productionSummary(cakeTasks),
      kitchenReleaseAt: order.scheduledAt
        ? kitchenReleaseAtForTasks(order.scheduledAt, branch?.prepMinutes ?? 20, cakeTasks)
        : null,

      subtotal: money(order.subtotal),
      deliveryFee: money(order.deliveryFee),
      cakeDeliveryFee: money(order.cakeDeliveryFee),
      deliveryVehicleType: order.deliveryVehicleType,
      deliveryHandlingInstructions: order.deliveryHandlingInstructions,
      deliveryProof: await (async () => {
        const delivery = await Delivery.findOne({ where: { orderId: order.id }, attributes: ['id', 'status', 'proofJson'] });
        if (!delivery) return null;
        const photos = await DeliveryEvidence.findAll({ where: { deliveryId: delivery.id }, attributes: ['stage'] });
        return { id: delivery.id, status: delivery.status, recipientName: delivery.proofJson?.recipientName ?? null, evidence: photos.map((photo) => photo.stage) };
      })(),
      discountTotal: money(order.discountTotal),
      walletAmount: money(order.walletAmount),
      taxRate: Number(order.taxRate),
      taxableBase: money(order.taxableBase),
      taxTotal: money(order.taxTotal),
      grandTotal: money(order.grandTotal),
      currency: order.currency,

      // El pedido ya es la fuente congelada del comprobante. Exponer estos datos
      // permite a soporte revisar la boleta/factura sin reconstruirla con el
      // perfil actual del cliente, que pudo cambiar despues de la compra.
      documentType: order.documentType,
      billingDocType: order.billingDocType,
      billingDocNumber: order.billingDocNumber,
      billingName: order.billingName,
      billingAddress: order.billingAddress,
      invoiceStatus: order.invoiceStatus,
      invoiceSeries: order.invoiceSeries,
      invoiceNumber: order.invoiceNumber,
      invoiceIssuedAt: order.invoiceIssuedAt,
      invoiceProviderReference: order.invoiceProviderReference,
      invoicePdfUrl: order.invoicePdfUrl,
      invoiceXmlUrl: order.invoiceXmlUrl,
      receiptMode: receiptSettings.mode,
      receiptSettings,
      internalReceiptFirstPrintedAt: order.internalReceiptFirstPrintedAt,
      internalReceiptLastPrintedAt: order.internalReceiptLastPrintedAt,
      internalReceiptPrintCount: order.internalReceiptPrintCount,

      // Proyeccion corta, la misma que pinta la tabla del tablero.
      items: items.map((item) => ({
        id: item.id,
        productNameSnapshot: item.productNameSnapshot,
        quantity: item.quantity,
      })),

      // Proyeccion larga: lo que Soporte necesita leerle al cliente.
      detailItems: items.map((item) => ({
        id: item.id,
        themeSnapshotJson: item.themeSnapshotJson,
        productNameSnapshot: item.productNameSnapshot,
        variantNameSnapshot: item.variantNameSnapshot ?? null,
        descriptionSnapshot: item.descriptionSnapshot ?? null,
        quantity: item.quantity,
        unitPrice: money(item.unitPrice),
        lineTotal: money(item.lineTotal),
        specialInstructions: item.specialInstructions ?? null,
        hasReference: Boolean(item.get('reference')),
        designImages: orderDesignImages(item),
        customizations: (item.customizations ?? []).map((customization) => ({
          group: customization.groupNameSnapshot,
          option: customization.optionNameSnapshot,
          quantity: customization.quantity,
          priceDelta: money(customization.priceDelta),
        })),
        allergens: item.allergenSnapshotJson ?? [],
      })),

      statusHistory: history.map((entry) => ({
        id: entry.id,
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        source: entry.source,
        comment: entry.comment,
        createdAt: entry.createdAt,
      })),

      payments: payments.map((payment) => ({
        id: payment.id,
        provider: payment.provider,
        method: payment.method,
        status: payment.status,
        amount: money(payment.amount),
        currency: payment.currency,
        providerReference: payment.providerReference,
        failureReason: payment.failureReason,
        createdAt: payment.createdAt,
        posSale: payment.safeResponseJson?.posSale ?? null,
        mobileClaim: (() => {
          const claim = payment.get('mobileClaim') as MobilePaymentClaim | undefined;
          return claim ? {
            status: claim.status,
            operationCode: claim.operationCode,
            payerPhone: claim.payerPhone,
            submittedAt: claim.submittedAt,
            reviewedAt: claim.reviewedAt,
            rejectionReason: claim.rejectionReason,
          } : null;
        })(),
        refunds: ((payment.get('refunds') as Refund[] | undefined) ?? []).map((refund) => ({
          id: refund.id,
          amount: money(refund.amount),
          reason: refund.reason,
          status: refund.status,
          createdAt: refund.createdAt,
        })),
      })),
    };
  },

  /**
   * Reportes esenciales (seccion 18.3): ventas, ticket promedio, productos,
   * tiempos de cocina y cancelaciones.
   *
   * `includeSales` separa el bloque de DINERO del bloque de OPERACION. El endpoint
   * exigia `report.sales.read` a secas y el Administrador de sucursal, que solo
   * tiene `report.operations.read`, aterrizaba cada dia en una pantalla en blanco
   * con un 403 repitiendose cada 30 s. Ahora entra y ve lo suyo; los importes ni
   * siquiera salen del servidor.
   */
  async reports(filters: {
    branchId?: number;
    from?: string;
    to?: string;
    includeSales?: boolean;
    includePlatform?: boolean;
  }) {
    const includeSales = filters.includeSales ?? true;
    const includePlatform = filters.includePlatform ?? false;
    const { start, end } = parseRange(filters.from, filters.to);
    const branchFilter = filters.branchId ? { branchId: filters.branchId } : {};

    const soldWhere = {
      ...branchFilter,
      status: { [Op.in]: SOLD_STATUSES },
      placedAt: { [Op.between]: [start, end] },
    };

    const [orders, cancelled, uxRows] = await Promise.all([
      Order.findAll({
        where: soldWhere,
        attributes: ['id', 'branchId', 'grandTotal', 'walletAmount', 'subtotal', 'discountTotal', 'deliveryFee', 'deliveryType', 'placedAt'],
      }),
      Order.count({
        where: {
          ...branchFilter,
          status: ORDER_STATUS.CANCELLED,
          placedAt: { [Op.between]: [start, end] },
        },
      }),
      // Las metricas de experiencia SI se acotan a la cocina seleccionada: la
      // consulta filtraba solo por fecha mientras la cabecera decia "en la cocina
      // seleccionada", asi que el mismo numero se pintaba bajo dos sucursales
      // distintas. Un evento sin sucursal identificada queda fuera a proposito:
      // atribuirlo a la cocina activa seria inventarselo.
      UxEvent.findAll({
        where: { createdAt: { [Op.between]: [start, end] }, ...branchFilter },
        // El embudo cuenta sesiones, no toques. Recalcular una cotización o abrir
        // dos veces una ficha dentro de la misma visita no infla la conversión.
        attributes: ['eventType', [fn('COUNT', fn('DISTINCT', col('session_id'))), 'count']],
        group: ['eventType'],
        raw: true,
      }),
    ]);

    const pendingOrderIds = await Order.findAll({
      where: {
        ...branchFilter,
        status: ORDER_STATUS.PENDING_PAYMENT,
        placedAt: { [Op.between]: [start, end] },
      },
      attributes: ['id'],
    });
    const pendingPayments = pendingOrderIds.length
      ? await Payment.findAll({
          where: {
            payableType: PAYABLE_TYPE.ORDER,
            payableId: pendingOrderIds.map((order) => order.id),
            provider: { [Op.in]: ['yape', 'plin'] },
            status: 'PENDING',
          },
          attributes: ['amount'],
        })
      : [];

    let platform: { rate: number; accrued: number; settled: number; outstanding: number } | undefined;
    if (includePlatform) {
      const rate = await getPlatformCommissionRate();
      const commissions = await CakeCommission.findAll({
        include: [{
          model: Order,
          as: 'order',
          required: true,
          where: { ...branchFilter, status: { [Op.in]: SOLD_STATUSES }, placedAt: { [Op.between]: [start, end] } },
          attributes: [],
        }],
        attributes: ['id', 'commissionAmount'],
      });
      const settlements = commissions.length
        ? await CakeCommissionSettlement.findAll({
            where: { commissionId: commissions.map((row) => row.id) },
            attributes: ['commissionId', 'amount'],
          })
        : [];
      const settled = settlements.reduce((sum, row) => sum + Number(row.amount), 0);
      const accrued = commissions.reduce((sum, row) => sum + Number(row.commissionAmount), 0);
      platform = {
        rate,
        accrued: money(accrued),
        settled: money(settled),
        outstanding: money(Math.max(0, accrued - settled)),
      };
    }

    // El saldo del plan es forma de pago, no descuento. `grandTotal` contiene solo
    // lo que faltaba cobrar fuera del monedero; sumarlo solo subestimaba la venta.
    const revenue = orders.reduce(
      (total, order) => total + Number(order.grandTotal) + Number(order.walletAmount),
      0,
    );
    const discounts = orders.reduce((total, order) => total + Number(order.discountTotal), 0);
    const deliveryOrders = orders.filter((order) => order.deliveryType === 'DELIVERY').length;

    // Productos mas vendidos. Se agrupa por el NOMBRE DEL SNAPSHOT, no por el
    // producto del catalogo: asi el reporte sigue siendo cierto aunque el producto
    // se renombre o se elimine (RN-017).
    const topRows = await OrderItem.findAll({
      attributes: [
        ['product_name_snapshot', 'name'],
        [fn('SUM', col('OrderItem.quantity')), 'units'],
        [fn('SUM', col('OrderItem.line_total')), 'revenue'],
      ],
      include: [
        {
          model: Order,
          as: 'order',
          attributes: [],
          required: true,
          where: soldWhere,
        },
      ],
      group: ['product_name_snapshot'],
      order: [[literal('units'), 'DESC']],
      limit: 10,
      raw: true,
    });

    const topProducts = topRows as unknown as Array<{
      name: string;
      units: string;
      revenue: string;
    }>;

    // Tiempos reales de cocina
    const tickets = await KitchenTicket.findAll({
      where: {
        ...branchFilter,
        prepMinutesActual: { [Op.ne]: null },
        createdAt: { [Op.between]: [start, end] },
      },
      attributes: ['prepMinutesActual'],
    });

    const prepTimes = tickets
      .map((ticket) => ticket.prepMinutesActual)
      .filter((minutes): minutes is number => minutes !== null);

    const avgPrepMinutes = prepTimes.length
      ? Math.round(prepTimes.reduce((total, minutes) => total + minutes, 0) / prepTimes.length)
      : 0;

    const totalOrders = orders.length;
    const orderIds = orders.map((order) => order.id);
    const paymentRows = orderIds.length
      ? await Payment.findAll({
          where: { payableType: PAYABLE_TYPE.ORDER, payableId: orderIds },
          attributes: ['provider', 'method', 'amount', 'status'],
        })
      : [];

    const channelMap = new Map<string, { orders: number; revenue: number }>();
    const hourlyMap = new Map<number, { orders: number; revenue: number }>();
    orders.forEach((order) => {
      const channel = order.deliveryType;
      const channelRow = channelMap.get(channel) ?? { orders: 0, revenue: 0 };
      channelRow.orders += 1;
      const orderRevenue = Number(order.grandTotal) + Number(order.walletAmount);
      channelRow.revenue += orderRevenue;
      channelMap.set(channel, channelRow);

      const hour = Math.floor(zonedParts(order.placedAt).minutes / 60);
      const hourlyRow = hourlyMap.get(hour) ?? { orders: 0, revenue: 0 };
      hourlyRow.orders += 1;
      hourlyRow.revenue += orderRevenue;
      hourlyMap.set(hour, hourlyRow);
    });

    const paymentMap = new Map<string, { transactions: number; amount: number }>();
    paymentRows.forEach((payment) => {
      const isPendingManual = ['cash', 'yape', 'plin'].includes(payment.provider) && payment.status === 'PENDING';
      if (payment.status !== 'SUCCEEDED' && !isPendingManual) return;
      // Los pagos wallet llevan importe 0 porque el dinero sale del libro del plan;
      // se añade con el snapshot del pedido unas líneas más abajo.
      if (payment.provider === 'wallet') return;
      const key = isPendingManual ? `${payment.provider}_pending` : payment.provider;
      const row = paymentMap.get(key) ?? { transactions: 0, amount: 0 };
      row.transactions += 1;
      row.amount += Number(payment.amount);
      paymentMap.set(key, row);
    });
    const walletPaid = orders.reduce((total, order) => total + Number(order.walletAmount), 0);
    if (walletPaid > 0) {
      paymentMap.set('wallet', {
        transactions: orders.filter((order) => Number(order.walletAmount) > 0).length,
        amount: Math.round(walletPaid * 100) / 100,
      });
    }

    return {
      range: { from: start, to: end },
      // Sin `report.sales.read` la clave `sales` NO viaja. El panel ya la trata como
      // opcional y esconde los importes cuando falta.
      ...(includeSales
        ? {
            sales: {
              orders: totalOrders,
              revenue: Math.round(revenue * 100) / 100,
              averageTicket: totalOrders ? Math.round((revenue / totalOrders) * 100) / 100 : 0,
              discounts: Math.round(discounts * 100) / 100,
              deliveryShare: totalOrders ? Math.round((deliveryOrders / totalOrders) * 100) : 0,
            },
          }
        : {}),
      quality: {
        cancelled,
        cancellationRate: totalOrders + cancelled
          ? Math.round((cancelled / (totalOrders + cancelled)) * 100)
          : 0,
      },
      operations: {
        avgPrepMinutes,
        ticketsMeasured: prepTimes.length,
      },
      experience: Object.fromEntries((uxRows as unknown as Array<{ eventType: string; count: string }>).map((row) => [row.eventType, Number(row.count)])),
      pendingPayments: {
        count: pendingPayments.length,
        amount: includeSales ? money(pendingPayments.reduce((sum, payment) => sum + Number(payment.amount), 0)) : 0,
      },
      ...(platform ? { platform } : {}),
      // Las unidades son informacion operativa y las ve cualquiera que entre; el
      // importe por producto es dinero y se anula igual que el bloque `sales`.
      topProducts: topProducts.map((row) => ({
        name: row.name,
        units: Number(row.units),
        revenue: includeSales ? Number(row.revenue) : 0,
      })),
      channelBreakdown: [...channelMap.entries()].map(([channel, row]) => ({
        channel,
        orders: row.orders,
        revenue: includeSales ? Math.round(row.revenue * 100) / 100 : 0,
      })),
      hourlySales: [...hourlyMap.entries()]
        .sort(([left], [right]) => left - right)
        .map(([hour, row]) => ({
          hour,
          orders: row.orders,
          revenue: includeSales ? Math.round(row.revenue * 100) / 100 : 0,
        })),
      ...(includeSales
        ? {
            paymentBreakdown: [...paymentMap.entries()].map(([method, row]) => ({
              method,
              transactions: row.transactions,
              amount: Math.round(row.amount * 100) / 100,
            })),
          }
        : {}),
    };
  },

  /** Bitácora de cambios sensibles con filtros operativos y alcance trazable. */
  async auditLogs(filters: AuditLogQuery) {
    const pagination = getPagination(filters);
    const conditions: Record<string, unknown>[] = [];

    if (filters.entity) conditions.push({ entity: filters.entity });
    if (filters.actorId) conditions.push({ actorId: filters.actorId });
    if (filters.action) conditions.push({ action: { [Op.like]: `%${filters.action}%` } });
    if (filters.entityId) conditions.push({ entityId: filters.entityId });
    if (filters.severity) conditions.push({ severity: filters.severity });
    if (filters.outcome) conditions.push({ outcome: filters.outcome });
    if (filters.correlationId) conditions.push({ correlationId: filters.correlationId });
    if (filters.from) conditions.push({ createdAt: { [Op.gte]: new Date(`${filters.from}T00:00:00.000Z`) } });
    if (filters.to) {
      const end = new Date(`${filters.to}T00:00:00.000Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      conditions.push({ createdAt: { [Op.lt]: end } });
    }
    if (filters.search) conditions.push({ [Op.or]: [
      { action: { [Op.like]: `%${filters.search}%` } },
      { entity: { [Op.like]: `%${filters.search}%` } },
      { entityId: { [Op.like]: `%${filters.search}%` } },
      { correlationId: { [Op.like]: `%${filters.search}%` } },
    ] });

    const { rows, count } = await AuditLog.findAndCountAll({
      where: conditions.length ? { [Op.and]: conditions } : {},
      include: [{ model: User, as: 'actor', attributes: ['id', 'firstName', 'lastName', 'email'] }],
      order: [['id', 'DESC']],
      limit: pagination.limit,
      offset: pagination.offset,
    });

    return { logs: rows, meta: buildMeta(pagination, count) };
  },

  async auditSummary() {
    const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
    const [today, critical, failures] = await Promise.all([
      AuditLog.count({ where: { createdAt: { [Op.gte]: dayStart } } }),
      AuditLog.count({ where: { severity: 'CRITICAL', createdAt: { [Op.gte]: dayStart } } }),
      AuditLog.count({ where: { outcome: 'FAILURE', createdAt: { [Op.gte]: dayStart } } }),
    ]);
    return { today, critical, failures, generatedAt: new Date().toISOString() };
  },

  async verifyAuditIntegrity() {
    const rows = await AuditLog.findAll({ order: [['id', 'ASC']] });
    let previousHash: string | null = null;
    const violations: Array<{ id: number; reason: string }> = [];
    for (const row of rows) {
      const canonical = auditCanonical({
        previousHash,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        actorId: row.actorId,
        beforeJson: row.beforeJson,
        afterJson: row.afterJson,
        severity: row.severity,
        outcome: row.outcome,
        method: row.method,
        path: row.path,
        correlationId: row.correlationId,
        createdAt: row.createdAt,
      });
      const expected = auditHash(canonical);
      if (row.previousHash !== previousHash) violations.push({ id: row.id, reason: 'previous_hash no coincide' });
      if (row.integrityHash !== expected) violations.push({ id: row.id, reason: 'integrity_hash no coincide' });
      previousHash = row.integrityHash;
      if (violations.length >= 50) break;
    }
    return { valid: violations.length === 0, checked: rows.length, violations, checkedAt: new Date().toISOString() };
  },

  async exportAuditCsv(filters: AuditLogQuery) {
    const { logs } = await this.auditLogs({ ...filters, page: 1, pageSize: 5000 });
    const cell = (value: unknown): string => {
      const text = value === null || value === undefined ? '' : value instanceof Date ? value.toISOString() : typeof value === 'object' ? JSON.stringify(value) : String(value);
      const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const lines = [
      ['id', 'fecha', 'actor', 'accion', 'entidad', 'entidad_id', 'severidad', 'resultado', 'correlation_id', 'ip', 'antes', 'despues'].map(cell).join(';'),
      ...logs.map((row) => [row.id, row.createdAt, row.actorId ?? 'Sistema', row.action, row.entity, row.entityId, row.severity, row.outcome, row.correlationId, row.ip, row.beforeJson, row.afterJson].map(cell).join(';')),
    ];
    return `\uFEFF${lines.join('\r\n')}\r\n`;
  },
};

export type AdminService = typeof adminService;
