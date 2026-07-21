import { Op } from 'sequelize';
import { Complaint, Order, sequelize } from '@database/models';
import {
  COMPLAINT_STATUS,
  type ComplaintStatus,
} from '@database/models/complaint.model';
import { ApiError } from '@shared/errors/ApiError';
import { getPagination, buildMeta, type PaginationQuery } from '@shared/utils/pagination';
import { businessInfo } from '@config/business';
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

  async list(filters: PaginationQuery & { status?: string; search?: string }) {
    const pagination = getPagination(filters);
    const where: Record<string, unknown> = {};

    if (filters.status) where.status = filters.status;
    if (filters.search) {
      where[Op.or as unknown as string] = [
        { code: { [Op.like]: `%${filters.search}%` } },
        { consumerName: { [Op.like]: `%${filters.search}%` } },
        { docNumber: { [Op.like]: `%${filters.search}%` } },
      ];
    }

    const { rows, count } = await Complaint.findAndCountAll({
      where,
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
      Complaint.count({
        where: {
          status: { [Op.ne]: COMPLAINT_STATUS.RESOLVED },
          dueAt: { [Op.lt]: new Date() },
        },
      }),
    ]);

    return { received, inProgress, resolved, overdue };
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
