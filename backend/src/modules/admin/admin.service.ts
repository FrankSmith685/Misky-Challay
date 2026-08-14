import { col, fn, literal, Op } from 'sequelize';
import {
  AuditLog,
  Branch,
  DiningTable,
  KitchenTicket,
  Order,
  OrderItem,
  OrderItemCustomization,
  OrderStatusHistory,
  Payment,
  MobilePaymentClaim,
  Refund,
  UxEvent,
  sequelize,
} from '@database/models';
import { PAYABLE_TYPE } from '@database/models/payment.model';
import { DOCUMENT_TYPE, INVOICE_STATUS, ORDER_STATUS, type OrderStatus } from '@config/constants';
import { ApiError } from '@shared/errors/ApiError';
import type { BranchScopeCheck } from '@shared/utils/scope';
import { buildMeta, getPagination, type PaginationQuery } from '@shared/utils/pagination';
import { addDaysToIsoDate, defaultTimeZone, zonedDateAt, zonedParts } from '@shared/utils/datetime';
import { settingsService } from '@modules/settings/settings.service';

export interface OrderBoardFilters extends PaginationQuery {
  branchId?: number;
  status?: string;
  from?: string;
  to?: string;
  search?: string;
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
      include: [
        { model: OrderItem, as: 'items', attributes: ['id', 'productNameSnapshot', 'quantity'] },
        { model: Branch, as: 'branch', attributes: ['id', 'name', 'prepMinutes'] },
        { model: DiningTable, as: 'diningTable', attributes: ['id', 'code', 'area'] },
        { model: KitchenTicket, as: 'kitchenTicket', attributes: ['id', 'status', 'targetAt'] },
      ],
      order: [['id', 'DESC']],
      limit: pagination.limit,
      offset: pagination.offset,
      distinct: true,
    });

    return { orders: rows, meta: buildMeta(pagination, count) };
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
          include: [{ model: OrderItemCustomization, as: 'customizations' }],
        },
        { model: Branch, as: 'branch', attributes: ['id', 'name', 'prepMinutes'] },
        { model: DiningTable, as: 'diningTable', attributes: ['id', 'code', 'area'] },
        { model: KitchenTicket, as: 'kitchenTicket', attributes: ['id', 'status', 'targetAt'] },
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
    const history =
      (order.get('statusHistory') as OrderStatusHistory[] | undefined) ?? [];

    const [payments, receiptSettings] = await Promise.all([
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
      contactPhone: order.contactPhone,
      notes: order.notes,
      addressSnapshotJson: order.addressSnapshotJson,
      branch: order.get('branch') ?? null,
      diningTable: order.get('diningTable') ?? null,
      kitchenTicket: order.get('kitchenTicket') ?? null,

      subtotal: money(order.subtotal),
      deliveryFee: money(order.deliveryFee),
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
        productNameSnapshot: item.productNameSnapshot,
        variantNameSnapshot: item.variantNameSnapshot ?? null,
        quantity: item.quantity,
        unitPrice: money(item.unitPrice),
        lineTotal: money(item.lineTotal),
        specialInstructions: item.specialInstructions ?? null,
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
  }) {
    const includeSales = filters.includeSales ?? true;
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

  /** Bitacora de cambios sensibles (RN-021). */
  async auditLogs(filters: PaginationQuery & { entity?: string; actorId?: number }) {
    const pagination = getPagination(filters);
    const where: Record<string, unknown> = {};

    if (filters.entity) where.entity = filters.entity;
    if (filters.actorId) where.actorId = filters.actorId;

    const { rows, count } = await AuditLog.findAndCountAll({
      where,
      order: [['id', 'DESC']],
      limit: pagination.limit,
      offset: pagination.offset,
    });

    return { logs: rows, meta: buildMeta(pagination, count) };
  },
};

export type AdminService = typeof adminService;
