import { Op, type WhereOptions, type Transaction } from 'sequelize';
import { Complaint, ComplaintResponse, ComplaintNote, ComplaintEvidence, ComplaintHoliday, Order, User, Role, Permission, sequelize } from '@database/models';
import { PERMISSIONS, USER_STATUS } from '@config/constants';
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
import { computeComplaintDueDate, nationalComplaintHolidays } from './complaints.calendar';

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
export interface ComplaintListFilters extends PaginationQuery {
  status?: string;
  search?: string;
  /** Llega por query string, asi que tambien vale "true"/"1". */
  overdue?: boolean | string;
  dueSoon?: boolean | string;
  unassigned?: boolean | string;
  escalated?: boolean | string;
  from?: string;
  to?: string;
  masked?: boolean | string;
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
  if (isTrue(filters.dueSoon)) conditions.push({ status: { [Op.ne]: COMPLAINT_STATUS.RESOLVED }, dueAt: { [Op.between]: [new Date(), zonedDateAt(addDaysToIsoDate(zonedParts(new Date()).isoDate, 3), 23, 59)] } });
  if (isTrue(filters.unassigned)) conditions.push({ status: { [Op.ne]: COMPLAINT_STATUS.RESOLVED }, assignedTo: null });
  if (isTrue(filters.escalated)) conditions.push({ status: { [Op.ne]: COMPLAINT_STATUS.RESOLVED }, escalatedAt: { [Op.ne]: null } });
  if (filters.from) conditions.push({ createdAt: { [Op.gte]: zonedDateAt(filters.from, 0, 0) } });
  if (filters.to) conditions.push({ createdAt: { [Op.lt]: zonedDateAt(addDaysToIsoDate(filters.to, 1), 0, 0) } });
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

const staffAttributes = ['id', 'firstName', 'lastName'];
const requireCurrent = (complaint: Complaint, expectedUpdatedAt: string): void => {
  if (complaint.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
    throw ApiError.conflict('El expediente cambió. Vuelve a abrirlo antes de guardar para revisar los cambios.');
  }
};
const lockedComplaint = async (id: number, transaction: Transaction): Promise<Complaint> => {
  const complaint = await Complaint.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!complaint) throw ApiError.notFound('Reclamo no encontrado');
  return complaint;
};
const notifyResponse = async (complaint: Complaint, entry: ComplaintResponse): Promise<void> => {
  try {
    // Los reintentos usan el contenido y la clave de ESTA versión, nunca la última respuesta.
    complaint.response = entry.response;
    const result = await notificationsService.notifyComplaintResponded(complaint, entry.version);
    await entry.update({ notificationStatus: result.status, notificationError: result.error, sentAt: result.status === 'SENT' ? new Date() : null });
  } catch (error) {
    logger.error('Fallo el aviso de respuesta al reclamo', error);
    await entry.update({ notificationStatus: 'FAILED', notificationError: 'No se pudo enviar el correo. Revisa Comunicaciones y reintenta.' });
  }
};

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
    const year = Number(zonedParts(new Date()).isoDate.slice(0, 4));
    const calendar = (await Promise.all([this.holidays(year), this.holidays(year + 1)])).flat();
    const dueAt = computeComplaintDueDate(new Date(), Math.min(15, Math.max(1, businessInfo.complaintResponseDays)), new Set(calendar.filter((day) => day.isActive).map((day) => day.holidayDate)));

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
        'assignedTo',
        'escalatedAt',
        'reopenedAt',
        'updatedAt',
      ],
      include: [{ model: User, as: 'assignedUser', attributes: staffAttributes }],
      order: [['dueAt', 'ASC'], ['id', 'DESC']],
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
    const [received, inProgress, resolved, overdue, dueSoon, unassigned, escalated, reopened, notificationFailures] = await Promise.all([
      Complaint.count({ where: { status: COMPLAINT_STATUS.RECEIVED } }),
      Complaint.count({ where: { status: COMPLAINT_STATUS.IN_PROGRESS } }),
      Complaint.count({ where: { status: COMPLAINT_STATUS.RESOLVED } }),
      Complaint.count({ where: overdueCondition() }),
      Complaint.count({ where: buildWhere({ dueSoon: true }) }),
      Complaint.count({ where: buildWhere({ unassigned: true }) }),
      Complaint.count({ where: buildWhere({ escalated: true }) }),
      Complaint.count({ where: { status: { [Op.ne]: COMPLAINT_STATUS.RESOLVED }, reopenedAt: { [Op.ne]: null } } }),
      ComplaintResponse.count({ where: { notificationStatus: 'FAILED' } }),
    ]);

    return { received, inProgress, resolved, overdue, dueSoon, unassigned, escalated, reopened, notificationFailures };
  },

  /**
   * Exporta a CSV lo que el panel tenga filtrado en ese momento.
   *
   * Sale con TODOS los campos, tambien los personales: es el Libro de
   * Reclamaciones, y quien lo descarga ya tiene `complaint.manage`, que es
   * justamente el permiso de leer esos datos uno por uno en pantalla.
   */
  async exportCsv(filters: ComplaintListFilters): Promise<string> {
    const count = await Complaint.count({ where: buildWhere(filters) });
    if (count > EXPORT_LIMIT) throw ApiError.badRequest('La exportación supera 5000 expedientes. Reduce el rango de fechas.');
    const rows = await Complaint.findAll({
      where: buildWhere(filters),
      order: [['id', 'DESC']],
      limit: EXPORT_LIMIT,
    });

    const lines = [
      CSV_COLUMNS.map((column) => csvCell(column.header)).join(';'),
      ...rows.map((row) => CSV_COLUMNS.map((column) => {
        if (isTrue(filters.masked) && ['Consumidor', 'Documento', 'Correo', 'Telefono', 'Detalle', 'Pedido del consumidor', 'Respuesta'].includes(column.header)) return csvCell('[PROTEGIDO]');
        return csvCell(column.value(row));
      }).join(';')),
    ];

    // Punto y coma y BOM: es lo que hace que Excel en es-PE abra el archivo en
    // columnas y con las tildes intactas en vez de una sola columna con simbolos.
    return `\uFEFF${lines.join('\r\n')}\r\n`;
  },

  async getById(id: number): Promise<Complaint> {
    const complaint = await Complaint.findByPk(id, {
      include: [
        { model: User, as: 'assignedUser', attributes: staffAttributes },
        { model: Order, as: 'order', attributes: ['id', 'orderNumber', 'status'] },
        { model: ComplaintResponse, as: 'responses', separate: true, order: [['version', 'DESC']], include: [{ model: User, as: 'actor', attributes: staffAttributes }] },
        { model: ComplaintNote, as: 'notes', separate: true, order: [['id', 'DESC']], include: [{ model: User, as: 'author', attributes: staffAttributes }] },
        { model: ComplaintEvidence, as: 'evidences', separate: true, order: [['id', 'DESC']], include: [{ model: User, as: 'uploader', attributes: staffAttributes }] },
      ],
    });
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

  async respond(id: number, response: string, status: ComplaintStatus, actorId: number, expectedUpdatedAt: string, reason?: string) {
    const { complaint, entry } = await sequelize.transaction(async (transaction) => {
      const complaint = await lockedComplaint(id, transaction);
      requireCurrent(complaint, expectedUpdatedAt);
      if (complaint.status === COMPLAINT_STATUS.RESOLVED) throw ApiError.conflict('Reabre el reclamo con un motivo antes de corregir la respuesta.');
      const latest = await ComplaintResponse.findOne({ where: { complaintId: id }, order: [['version', 'DESC']], transaction });
      if (latest && !reason?.trim()) throw ApiError.badRequest('Indica el motivo de la nueva versión de respuesta.');
      const entry = await ComplaintResponse.create({ complaintId: id, version: (latest?.version ?? 0) + 1, response,
        status: status === COMPLAINT_STATUS.RESOLVED ? 'RESOLVED' : 'IN_PROGRESS', actorId, reason: reason ?? null }, { transaction });
      await complaint.update({ response, status, respondedAt: status === COMPLAINT_STATUS.RESOLVED ? new Date() : complaint.respondedAt,
        respondedBy: actorId, draftResponse: null, draftBy: null, draftUpdatedAt: null }, { transaction });
      return { complaint, entry };
    });
    await notifyResponse(complaint, entry);
    return { id: complaint.id, status: complaint.status, version: entry.version, notificationStatus: entry.notificationStatus };
  },

  async saveDraft(id: number, response: string, actorId: number, expectedUpdatedAt: string) {
    return sequelize.transaction(async (transaction) => {
      const complaint = await lockedComplaint(id, transaction);
      requireCurrent(complaint, expectedUpdatedAt);
      if (complaint.status === COMPLAINT_STATUS.RESOLVED) throw ApiError.conflict('Reabre el expediente antes de preparar otra respuesta.');
      await complaint.update({ draftResponse: response, draftBy: actorId, draftUpdatedAt: new Date() }, { transaction });
      return { id, updatedAt: complaint.updatedAt };
    });
  },

  async reopen(id: number, actorId: number, reason: string, expectedUpdatedAt: string) {
    return sequelize.transaction(async (transaction) => {
      const complaint = await lockedComplaint(id, transaction);
      requireCurrent(complaint, expectedUpdatedAt);
      if (complaint.status !== COMPLAINT_STATUS.RESOLVED) throw ApiError.conflict('Solo se pueden reabrir expedientes atendidos.');
      await complaint.update({ status: COMPLAINT_STATUS.IN_PROGRESS, reopenedAt: new Date(), reopenedBy: actorId, reopenReason: reason }, { transaction });
      await ComplaintNote.create({ complaintId: id, authorId: actorId, note: `Reapertura: ${reason}` }, { transaction });
      return { id, status: complaint.status };
    });
  },

  async assignees() {
    const users = await User.findAll({ where: { status: USER_STATUS.ACTIVE, archivedAt: null },
      attributes: ['id', 'firstName', 'lastName', 'isSuperAdmin'],
      include: [{ model: Role, as: 'roles', attributes: ['id'], where: { archivedAt: null }, required: false,
        include: [{ model: Permission, as: 'permissions', attributes: ['code'], through: { attributes: [] } }], through: { attributes: [] } }],
      order: [['firstName', 'ASC']],
    });
    return users.filter((user) => user.isSuperAdmin || user.roles?.some((role) => role.permissions?.some((permission) =>
      [PERMISSIONS.COMPLAINT_MANAGE, PERMISSIONS.COMPLAINT_RESPOND].includes(permission.code as typeof PERMISSIONS.COMPLAINT_RESPOND))))
      .map((user) => ({ id: user.id, firstName: user.firstName, lastName: user.lastName }));
  },

  async assign(id: number, userId: number | null, actorId: number, reason: string, expectedUpdatedAt: string) {
    if (userId !== null && !(await this.assignees()).some((user) => Number(user.id) === userId)) throw ApiError.badRequest('El responsable debe estar activo y autorizado para responder reclamos.');
    return sequelize.transaction(async (transaction) => {
      const complaint = await lockedComplaint(id, transaction);
      requireCurrent(complaint, expectedUpdatedAt);
      await complaint.update({ assignedTo: userId, assignedAt: userId ? new Date() : null }, { transaction });
      await ComplaintNote.create({ complaintId: id, authorId: actorId, note: `Responsable ${userId ? `asignado (#${userId})` : 'retirado'}: ${reason}` }, { transaction });
      return { id, assignedTo: userId };
    });
  },

  async escalate(id: number, actorId: number, reason: string, expectedUpdatedAt: string) {
    return sequelize.transaction(async (transaction) => {
      const complaint = await lockedComplaint(id, transaction);
      requireCurrent(complaint, expectedUpdatedAt);
      if (complaint.status === COMPLAINT_STATUS.RESOLVED) throw ApiError.conflict('El expediente ya está atendido.');
      await complaint.update({ escalatedAt: new Date(), escalationReason: reason }, { transaction });
      await ComplaintNote.create({ complaintId: id, authorId: actorId, note: `Escalamiento a administración general: ${reason}` }, { transaction });
      return { id, escalatedAt: complaint.escalatedAt };
    });
  },

  async addNote(id: number, actorId: number, note: string) {
    await this.getById(id);
    return ComplaintNote.create({ complaintId: id, authorId: actorId, note });
  },

  async addEvidence(id: number, actorId: number, input: { fileName: string; fileUrl: string; mimeType?: string }) {
    await this.getById(id);
    return ComplaintEvidence.create({ complaintId: id, uploadedBy: actorId, ...input });
  },

  async retryNotification(id: number, responseId: number) {
    const complaint = await this.getById(id);
    const entry = await ComplaintResponse.findOne({ where: { id: responseId, complaintId: id } });
    if (!entry) throw ApiError.notFound('Versión no encontrada');
    if (entry.notificationStatus !== 'SENT') await notifyResponse(complaint, entry);
    return { id: entry.id, notificationStatus: entry.notificationStatus };
  },

  async holidays(year: number) {
    const base = nationalComplaintHolidays(year);
    const custom = await ComplaintHoliday.findAll({ where: { holidayDate: { [Op.between]: [`${year}-01-01`, `${year}-12-31`] } } });
    const calendar = new Map(base.map((day) => [day.holidayDate, { ...day, source: 'NATIONAL' }]));
    for (const day of custom) calendar.set(day.holidayDate, { holidayDate: day.holidayDate, label: day.label, isActive: day.isActive, source: 'CUSTOM' });
    return [...calendar.values()].sort((left, right) => left.holidayDate.localeCompare(right.holidayDate));
  },

  async saveHoliday(input: { holidayDate: string; label: string; isActive: boolean }, actorId: number) {
    const [day] = await ComplaintHoliday.findOrCreate({ where: { holidayDate: input.holidayDate }, defaults: { holidayDate: input.holidayDate, label: input.label, isActive: input.isActive, createdBy: actorId } });
    await day.update({ holidayDate: input.holidayDate, label: input.label, isActive: input.isActive, createdBy: actorId });
    return day;
  },
};

export type ComplaintsService = typeof complaintsService;
