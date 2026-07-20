import { z } from 'zod';

/**
 * Esquemas de validacion del modulo payments (se usan con validate(schema) en las rutas).
 *
 * Ejemplo:
 * export const listSchema = z.object({
 *   query: z.object({ page: z.coerce.number().min(1).optional() }),
 * });
 */
export const paymentsSchemas = {
  // TODO: definir esquemas.
};

export type PaymentsSchemas = typeof paymentsSchemas;
void z;
