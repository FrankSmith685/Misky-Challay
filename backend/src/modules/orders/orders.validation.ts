import { z } from 'zod';

export const listOrdersSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(50).optional(),
  }),
});

export const orderNumberSchema = z.object({
  params: z.object({ orderNumber: z.string().min(5).max(20) }),
});

export const cancelOrderSchema = z.object({
  params: z.object({ orderNumber: z.string().min(5).max(20) }),
  body: z.object({
    reason: z.string().min(3, 'Cuentanos por que cancelas').max(255),
  }),
});
