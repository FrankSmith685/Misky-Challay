import type { NextFunction, Request, Response } from 'express';
import type { AnyZodObject, ZodEffects } from 'zod';

type Schema = AnyZodObject | ZodEffects<AnyZodObject>;

/**
 * Valida body / query / params con un esquema zod y reemplaza los valores
 * por la version parseada (tipada y saneada).
 *
 * const schema = z.object({ body: z.object({ email: z.string().email() }) });
 * router.post('/login', validate(schema), controller.login);
 */
export const validate =
  (schema: Schema) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = (await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      })) as { body?: unknown; query?: unknown; params?: unknown };

      if (parsed.body) req.body = parsed.body;
      if (parsed.query) Object.assign(req.query, parsed.query);
      if (parsed.params) Object.assign(req.params, parsed.params);

      next();
    } catch (error) {
      next(error);
    }
  };
