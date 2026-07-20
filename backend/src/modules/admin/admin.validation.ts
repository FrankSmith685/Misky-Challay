import { z } from 'zod';

/**
 * Esquemas de validacion del modulo admin (se usan con validate(schema) en las rutas).
 *
 * Ejemplo:
 * export const listSchema = z.object({
 *   query: z.object({ page: z.coerce.number().min(1).optional() }),
 * });
 */
export const adminSchemas = {
  // TODO: definir esquemas.
};

export type AdminSchemas = typeof adminSchemas;
void z;
