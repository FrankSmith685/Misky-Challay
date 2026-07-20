import type { Request, Response } from 'express';
import { ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';

/** Controladores del modulo cart: Carrito persistente, items y personalizaciones temporales. */
export const cartController = {
  placeholder: asyncHandler(async (_req: Request, res: Response) =>
    ok(res, { module: 'cart', status: 'pendiente de implementar' }, 'Modulo cart disponible'),
  ),
};
