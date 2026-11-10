import { z } from 'zod';
import { COMPLAINT_DOC, COMPLAINT_ITEM, COMPLAINT_STATUS, COMPLAINT_TYPE } from '@database/models/complaint.model';

export const createComplaintSchema = z.object({
  body: z.object({
    type: z.enum([COMPLAINT_TYPE.RECLAMO, COMPLAINT_TYPE.QUEJA]),
    itemType: z.enum([COMPLAINT_ITEM.PRODUCTO, COMPLAINT_ITEM.SERVICIO]),
    consumerName: z.string().trim().min(3, 'Ingresa el nombre completo').max(160),
    docType: z.enum([COMPLAINT_DOC.DNI, COMPLAINT_DOC.CE, COMPLAINT_DOC.PASAPORTE, COMPLAINT_DOC.RUC]),
    docNumber: z.string().trim().min(6, 'Documento invalido').max(20),
    email: z.string().email('Correo invalido'),
    phone: z.string().trim().max(30).optional(),
    address: z.string().trim().max(200).optional(),
    isMinor: z.boolean().optional(),
    guardianName: z.string().trim().max(160).optional(),
    itemDescription: z.string().trim().max(255).optional(),
    claimedAmount: z.coerce.number().min(0).max(1_000_000).optional(),
    detail: z.string().trim().min(10, 'Cuentanos con mas detalle que paso').max(3000),
    request: z.string().trim().min(5, 'Indica que solucion esperas').max(2000),
    orderNumber: z.string().trim().max(20).optional(),
  }),
});

export const respondComplaintSchema = z.object({
  params: z.object({ id: z.coerce.number().int().positive() }),
  body: z.object({
    response: z.string().trim().min(30, 'Explica la solución al consumidor con al menos 30 caracteres').max(3000),
    reason: z.string().trim().min(5).max(500).optional(),
    expectedUpdatedAt: z.string().datetime(),
    status: z
      .enum([COMPLAINT_STATUS.IN_PROGRESS, COMPLAINT_STATUS.RESOLVED])
      .default(COMPLAINT_STATUS.RESOLVED),
  }),
});

const idParams = z.object({ id: z.coerce.number().int().positive() });
const reason = z.string().trim().min(10, 'Explica el motivo con al menos 10 caracteres').max(500);
export const complaintActionSchema = z.object({ params: idParams, body: z.object({ reason, expectedUpdatedAt: z.string().datetime() }) });
export const assignComplaintSchema = z.object({ params: idParams, body: z.object({ userId: z.coerce.number().int().positive().nullable(), reason, expectedUpdatedAt: z.string().datetime() }) });
export const complaintDraftSchema = z.object({ params: idParams, body: z.object({ response: z.string().trim().max(3000), expectedUpdatedAt: z.string().datetime() }) });
export const complaintNoteSchema = z.object({ params: idParams, body: z.object({ note: z.string().trim().min(5).max(3000) }) });
export const complaintEvidenceSchema = z.object({ params: idParams, body: z.object({ fileName: z.string().trim().min(1).max(180), dataUrl: z.string().max(7_000_000) }) });
export const complaintResponseIdSchema = z.object({ params: idParams.extend({ responseId: z.coerce.number().int().positive() }) });
export const complaintEvidenceIdSchema = z.object({ params: idParams.extend({ evidenceId: z.coerce.number().int().positive() }) });
const isoDate = z.string().date();
export const complaintHolidaySchema = z.object({ body: z.object({ holidayDate: isoDate, label: z.string().trim().min(3).max(120), isActive: z.boolean(), reason }) });
export const complaintCalendarSchema = z.object({ query: z.object({ year: z.coerce.number().int().min(2020).max(2100) }) });
const flag = z.enum(['true', 'false', '1', '0']).optional();
export const complaintListQuery = z.object({
  status: z.enum(['RECEIVED', 'IN_PROGRESS', 'RESOLVED']).optional(),
  search: z.string().trim().max(160).optional(),
  overdue: flag, dueSoon: flag, unassigned: flag, escalated: flag,
  page: z.coerce.number().int().positive().optional(), pageSize: z.coerce.number().int().min(1).max(100).optional(),
  from: isoDate.optional(), to: isoDate.optional(),
});
export const complaintListSchema = z.object({ query: complaintListQuery });
export const complaintExportSchema = z.object({ query: complaintListQuery.extend({ from: isoDate, to: isoDate, reason, masked: flag }).refine((input) => {
  const days = (Date.parse(input.to) - Date.parse(input.from)) / 86_400_000;
  return days >= 0 && days <= 366;
}, 'El rango debe ser de hasta 366 días y la fecha final no puede ser anterior a la inicial.') });
export const complaintIdSchema = z.object({ params: idParams });

export const trackComplaintSchema = z.object({
  query: z.object({
    code: z.string().trim().min(3).max(20),
    docNumber: z.string().trim().min(6).max(20),
  }),
});

export type CreateComplaintBody = z.infer<typeof createComplaintSchema>['body'];
