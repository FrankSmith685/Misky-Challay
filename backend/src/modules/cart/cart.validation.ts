import { z } from 'zod';

/**
 * Esquemas de validacion del modulo cart (se usan con validate(schema) en las rutas).
 *
 * Ejemplo:
 * export const listSchema = z.object({
 *   query: z.object({ page: z.coerce.number().min(1).optional() }),
 * });
 */
export const cartSchemas = {
  // TODO: definir esquemas.
};

export type CartSchemas = typeof cartSchemas;
void z;
