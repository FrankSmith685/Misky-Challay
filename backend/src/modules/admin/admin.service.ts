import { col, fn, literal, Op } from 'sequelize';
import { AuditLog, Branch, KitchenTicket, Order, OrderItem, UxEvent } from '@database/models';
import { ORDER_STATUS, type OrderStatus } from '@config/constants';
import { buildMeta, getPagination, type PaginationQuery } from '@shared/utils/pagination';
import { addDaysToIsoDate, defaultTimeZone, zonedDateAt, zonedParts } from '@shared/utils/datetime';

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

export const adminService = {
  /** Tablero de pedidos con filtros (seccion 9.7). */
  async orderBoard(filters: OrderBoardFilters) {
    const pagination = getPagination(filters);
    const where: Record<string, unknown> = {};

    if (filters.branchId) where.branchId = filters.branchId;
    if (filters.status) where.status = { [Op.in]: String(filters.status).split(',') };
    if (filters.search) where.orderNumber = { [Op.like]: `%${filters.search}%` };

    if (filters.from || filters.to) {
      const { start, end } = parseRange(filters.from, filters.to);
      where.placedAt = { [Op.between]: [start, end] };
    }

    const { rows, count } = await Order.findAndCountAll({
      where,
      include: [
        { model: OrderItem, as: 'items', attributes: ['id', 'productNameSnapshot', 'quantity'] },
        { model: Branch, as: 'branch', attributes: ['id', 'name'] },
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
   * Reportes esenciales (seccion 18.3): ventas, ticket promedio, productos,
   * tiempos de cocina y cancelaciones.
   */
  async reports(filters: { branchId?: number; from?: string; to?: string }) {
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
        attributes: ['id', 'grandTotal', 'subtotal', 'discountTotal', 'deliveryFee', 'deliveryType'],
      }),
      Order.count({
        where: {
          ...branchFilter,
          status: ORDER_STATUS.CANCELLED,
          placedAt: { [Op.between]: [start, end] },
        },
      }),
      UxEvent.findAll({ where: { createdAt: { [Op.between]: [start, end] } }, attributes: ['eventType', [fn('COUNT', col('id')), 'count']], group: ['eventType'], raw: true }),
    ]);

    const revenue = orders.reduce((total, order) => total + Number(order.grandTotal), 0);
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

    return {
      range: { from: start, to: end },
      sales: {
        orders: totalOrders,
        revenue: Math.round(revenue * 100) / 100,
        averageTicket: totalOrders ? Math.round((revenue / totalOrders) * 100) / 100 : 0,
        discounts: Math.round(discounts * 100) / 100,
        deliveryShare: totalOrders ? Math.round((deliveryOrders / totalOrders) * 100) : 0,
      },
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
      topProducts: topProducts.map((row) => ({
        name: row.name,
        units: Number(row.units),
        revenue: Number(row.revenue),
      })),
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
