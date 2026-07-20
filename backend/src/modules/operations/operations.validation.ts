import { z } from 'zod';

/**
 * Esquemas de validacion del modulo operations (se usan con validate(schema) en las rutas).
 *
 * Ejemplo:
 * export const listSchema = z.object({
 *   query: z.object({ page: z.coerce.number().min(1).optional() }),
 * });
 */
export const operationsSchemas = {
  // TODO: definir esquemas.
};

export type OperationsSchemas = typeof operationsSchemas;
void z;
