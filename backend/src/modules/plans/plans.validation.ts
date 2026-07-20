import { z } from 'zod';

/**
 * Esquemas de validacion del modulo plans (se usan con validate(schema) en las rutas).
 *
 * Ejemplo:
 * export const listSchema = z.object({
 *   query: z.object({ page: z.coerce.number().min(1).optional() }),
 * });
 */
export const plansSchemas = {
  // TODO: definir esquemas.
};

export type PlansSchemas = typeof plansSchemas;
void z;
