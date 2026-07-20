import type { Request, Response } from 'express';
import { ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';

/** Controladores del modulo pricing: Motor de cotizacion: precios, promociones, cupones, beneficios de plan e impuestos. */
export const pricingController = {
  placeholder: asyncHandler(async (_req: Request, res: Response) =>
    ok(res, { module: 'pricing', status: 'pendiente de implementar' }, 'Modulo pricing disponible'),
  ),
};
