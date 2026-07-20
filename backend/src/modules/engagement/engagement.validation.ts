import { z } from 'zod';

/**
 * Esquemas de validacion del modulo engagement (se usan con validate(schema) en las rutas).
 *
 * Ejemplo:
 * export const listSchema = z.object({
 *   query: z.object({ page: z.coerce.number().min(1).optional() }),
 * });
 */
export const engagementSchemas = {
  // TODO: definir esquemas.
};

export type EngagementSchemas = typeof engagementSchemas;
void z;
