import { Op, type WhereOptions } from 'sequelize';
import { Complaint, Order, sequelize } from '@database/models';
import {
  COMPLAINT_STATUS,
  type ComplaintStatus,
} from '@database/models/complaint.model';
import { ApiError } from '@shared/errors/ApiError';
import { getPagination, buildMeta, type PaginationQuery } from '@shared/utils/pagination';
import { settingsService } from '@modules/settings/settings.service';
import { addDaysToIsoDate, zonedDateAt, zonedParts } from '@shared/utils/datetime';
import { notificationsService } from '@modules/notifications/notifications.service';
import { logger } from '@config/logger';

export interface CreateComplaintInput {
  type: 'RECLAMO' | 'QUEJA';
  itemType: 'PRODUCTO' | 'SERVICIO';
  consumerName: string;
  docType: 'DNI' | 'CE' | 'PASAPORTE' | 'RUC';
  docNumber: string;
  email: string;
  phone?: string;
  address?: string;
  isMinor?: boolean;
  guardianName?: string;
  itemDescription?: string;
  claimedAmount?: number;
  detail: string;
  request: string;
  orderNumber?: string;
  userId?: number | null;
}

/**
 * Fecha limite de respuesta segun el plazo legal (dias HABILES, sin contar sabados y
 * domingos). No contempla feriados nacionales; para eso haria falta un calendario, y
 * el plazo real siempre puede ser mayor, nunca menor, asi que quedarse corto aqui es
 * conservador para el consumidor.
 */
const computeDueDate = (from: Date, businessDays: number): Date => {
  let iso = zonedParts(from).isoDate;
  let added = 0;
  while (added < businessDays) {
    iso = addDaysToIsoDate(iso, 1);
    const weekday = zonedParts(zonedDateAt(iso, 12, 0)).weekday; // 0 domingo, 6 sabado
    if (weekday !== 0 && weekday !== 6) added += 1;
  }
  return zonedDateAt(iso, 23, 59);
};

export interface ComplaintListFilters extends PaginationQuery {
  status?: string;
  search?: string;
  /** Llega por query string, asi que tambien vale "true"/"1". */
  overdue?: boolean | string;
}

/** Vencido = paso el plazo legal y todavia no se ha respondido. */
const overdueCondition = (): WhereOptions => ({
  status: { [Op.ne]: COMPLAINT_STATUS.RESOLVED },
  dueAt: { [Op.lt]: new Date() },
});

const isTrue = (value: boolean | string | undefined): boolean =>
  value === true || value === 'true' || value === '1';

/**
 * Filtros de la lista, del contador y de la exportacion: una sola construccion.
 *
 * El chip "Vencidos" reutiliza LITERALMENTE la condicion del contador global; si
 * cada uno tuviera la suya, el banner podria anunciar cuatro y la lista mostrar
 * tres. Se acumulan en `Op.and` porque estado, vencimiento y busqueda pueden
 * coincidir sobre la misma columna (`status`).
 */
const buildWhere = (filters: ComplaintListFilters): WhereOptions => {
  const conditions: WhereOptions[] = [];

  if (filters.status) conditions.push({ status: filters.status });
  if (isTrue(filters.overdue)) conditions.push(overdueCondition());
  if (filters.search) {
    conditions.push({
      [Op.or]: [
        { code: { [Op.like]: `%${filters.search}%` } },
        { consumerName: { [Op.like]: `%${filters.search}%` } },
        { docNumber: { [Op.like]: `%${filters.search}%` } },
      ],
    });
  }

  return conditions.length > 0 ? { [Op.and]: conditions } : {};
};

/**
 * Escape de un campo CSV.
 *
 * Las comillas se doblan y todo va entrecomillado porque el detalle del reclamo
 * es texto libre con saltos de linea. El prefijo del apostrofe frena la inyeccion
 * de formulas: un consumidor puede escribir "=1+1" en su reclamo y la hoja de
 * calculo de quien lo abra lo ejecutaria como formula.
 */
const csvCell = (value: unknown): string => {
  if (value === null || value === undefined) return '""';
  const text = value instanceof Date ? value.toISOString() : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

const CSV_COLUMNS: Array<{ header: string; value: (row: Complaint) => unknown }> = [
  { header: 'Codigo', value: (row) => row.code },
  { header: 'Tipo', value: (row) => row.type },
  { header: 'Bien', value: (row) => row.itemType },
  { header: 'Consumidor', value: (row) => row.consumerName },
  { header: 'Documento', value: (row) => `${row.docType} ${row.docNumber}` },
  { header: 'Correo', value: (row) => row.email },
  { header: 'Telefono', value: (row) => row.phone },
  { header: 'Estado', value: (row) => row.status },
  { header: 'Presentado', value: (row) => row.createdAt },
  { header: 'Vence', value: (row) => row.dueAt },
  { header: 'Respondido', value: (row) => row.respondedAt },
  { header: 'Detalle', value: (row) => row.detail },
  { header: 'Pedido del consumidor', value: (row) => row.request },
  { header: 'Respuesta', value: (row) => row.response },
];

/** Techo de la exportacion: un CSV se arma entero en memoria antes de enviarse. */
const EXPORT_LIMIT = 5_000;

export const complaintsService = {
  /**
   * Registra una hoja del Libro de Reclamaciones.
   * El correlativo se asigna DENTRO de la transaccion a partir del id ya insertado,
   * asi que es estrictamente secuencial y unico sin condiciones de carrera.
   */
  async create(input: CreateComplaintInput): Promise<Complaint> {
    if (input.isMinor && !input.guardianName?.trim()) {
      throw ApiError.badRequest('Si el consumidor es menor de edad, indica el padre o apoderado');
    }

    let orderId: number | null = null;
    if (input.orderNumber) {
      const order = await Order.findOne({ where: { orderNumber: input.orderNumber } });
      // El pedido es un dato de contexto: si el numero no existe, no se bloquea el
      // reclamo (el consumidor tiene derecho a reclamar igual), solo no se vincula.
      orderId = order?.id ?? null;
    }

    const businessInfo = await settingsService.getBusinessInfo();
    const dueAt = computeDueDate(new Date(), businessInfo.complaintResponseDays);

    const complaint = await sequelize.transaction(async (transaction) => {
      const created = await Complaint.create(
        {
          type: input.type,
          itemType: input.itemType,
          consumerName: input.consumerName,
          docType: input.docType,
          docNumber: input.docNumber,
          email: input.email,
          phone: input.phone ?? null,
          address: input.address ?? null,
          isMinor: input.isMinor ?? false,
          guardianName: input.guardianName ?? null,
          itemDescription: input.itemDescription ?? null,
          claimedAmount: input.claimedAmount ?? null,
          detail: input.detail,
          request: input.request,
          orderId,
          userId: input.userId ?? null,
          status: COMPLAINT_STATUS.RECEIVED,
          dueAt,
        },
        { transaction },
      );

      created.code = `LR-${String(created.id).padStart(6, '0')}`;
      await created.save({ transaction });
      return created;
    });

    // Fuera de la transaccion: los correos no pueden tumbar el registro del reclamo.
    await notificationsService
      .notifyComplaintReceived(complaint)
      .catch((error) => logger.error('Fallo el aviso de reclamo recibido', error));

    return complaint;
  },

  async list(filters: ComplaintListFilters) {
    const pagination = getPagination(filters);

    const { rows, count } = await Complaint.findAndCountAll({
      where: buildWhere(filters),
      // La lista NO necesita el documento, telefono, direccion ni los textos libres:
      // esos datos personales solo se cargan en el detalle. Proyectar aqui evita
      // enviar PII de mas al listado y aligera la respuesta.
      attributes: [
        'id',
        'code',
        'type',
        'itemType',
        'consumerName',
        'email',
        'status',
        'createdAt',
        'dueAt',
        'respondedAt',
      ],
      order: [['id', 'DESC']],
      limit: pagination.limit,
      offset: pagination.offset,
    });

    return { complaints: rows, meta: buildMeta(pagination, count) };
  },

  /**
   * Contadores globales para el panel. El banner de "vencidos" NO puede derivarse de
   * la pagina visible: un admin en la pagina 2, o filtrando por "atendidos", veria un
   * numero enganoso. Aqui se cuenta sobre TODA la tabla.
   */
  async summary() {
    const [received, inProgress, resolved, overdue] = await Promise.all([
      Complaint.count({ where: { status: COMPLAINT_STATUS.RECEIVED } }),
      Complaint.count({ where: { status: COMPLAINT_STATUS.IN_PROGRESS } }),
      Complaint.count({ where: { status: COMPLAINT_STATUS.RESOLVED } }),
      Complaint.count({ where: overdueCondition() }),
    ]);

    return { received, inProgress, resolved, overdue };
  },

  /**
   * Exporta a CSV lo que el panel tenga filtrado en ese momento.
   *
   * Sale con TODOS los campos, tambien los personales: es el Libro de
   * Reclamaciones, y quien lo descarga ya tiene `complaint.manage`, que es
   * justamente el permiso de leer esos datos uno por uno en pantalla.
   */
  async exportCsv(filters: ComplaintListFilters): Promise<string> {
    const rows = await Complaint.findAll({
      where: buildWhere(filters),
      order: [['id', 'DESC']],
      limit: EXPORT_LIMIT,
    });

    const lines = [
      CSV_COLUMNS.map((column) => csvCell(column.header)).join(';'),
      ...rows.map((row) => CSV_COLUMNS.map((column) => csvCell(column.value(row))).join(';')),
    ];

    // Punto y coma y BOM: es lo que hace que Excel en es-PE abra el archivo en
    // columnas y con las tildes intactas en vez de una sola columna con simbolos.
    return `\uFEFF${lines.join('\r\n')}\r\n`;
  },

  async getById(id: number): Promise<Complaint> {
    const complaint = await Complaint.findByPk(id);
    if (!complaint) throw ApiError.notFound('Reclamo no encontrado');
    return complaint;
  },

  /** Consulta publica del consumidor: correlativo + documento, sin exponer el resto. */
  async trackByCodeAndDoc(code: string, docNumber: string) {
    const complaint = await Complaint.findOne({ where: { code, docNumber } });
    if (!complaint) throw ApiError.notFound('No encontramos un reclamo con esos datos');

    return {
      code: complaint.code,
      type: complaint.type,
      status: complaint.status,
      createdAt: complaint.createdAt,
      dueAt: complaint.dueAt,
      response: complaint.response,
      respondedAt: complaint.respondedAt,
    };
  },

  async respond(id: number, response: string, status: ComplaintStatus, actorId: number) {
    const complaint = await this.getById(id);

    complaint.response = response;
    complaint.status = status;
    if (status === COMPLAINT_STATUS.RESOLVED && !complaint.respondedAt) {
      complaint.respondedAt = new Date();
      complaint.respondedBy = actorId;
    }
    await complaint.save();

    await notificationsService
      .notifyComplaintResponded(complaint)
      .catch((error) => logger.error('Fallo el aviso de respuesta al reclamo', error));

    return complaint;
  },
};

export type ComplaintsService = typeof complaintsService;
