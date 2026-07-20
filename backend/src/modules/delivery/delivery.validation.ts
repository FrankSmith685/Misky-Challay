import { z } from 'zod';

/**
 * Esquemas de validacion del modulo delivery (se usan con validate(schema) en las rutas).
 *
 * Ejemplo:
 * export const listSchema = z.object({
 *   query: z.object({ page: z.coerce.number().min(1).optional() }),
 * });
 */
export const deliverySchemas = {
  // TODO: definir esquemas.
};

export type DeliverySchemas = typeof deliverySchemas;
void z;
