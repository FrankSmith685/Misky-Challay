import { z } from 'zod';

/**
 * Esquemas de validacion del modulo pricing (se usan con validate(schema) en las rutas).
 *
 * Ejemplo:
 * export const listSchema = z.object({
 *   query: z.object({ page: z.coerce.number().min(1).optional() }),
 * });
 */
export const pricingSchemas = {
  // TODO: definir esquemas.
};

export type PricingSchemas = typeof pricingSchemas;
void z;
