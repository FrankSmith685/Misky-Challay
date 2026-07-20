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
    response: z.string().trim().min(5, 'Escribe la respuesta al consumidor').max(3000),
    status: z
      .enum([COMPLAINT_STATUS.IN_PROGRESS, COMPLAINT_STATUS.RESOLVED])
      .default(COMPLAINT_STATUS.RESOLVED),
  }),
});

export const trackComplaintSchema = z.object({
  query: z.object({
    code: z.string().trim().min(3).max(20),
    docNumber: z.string().trim().min(6).max(20),
  }),
});

export type CreateComplaintBody = z.infer<typeof createComplaintSchema>['body'];
