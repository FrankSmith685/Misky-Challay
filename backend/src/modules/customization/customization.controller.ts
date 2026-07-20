import type { Request, Response } from 'express';
import { ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { customizationService } from './customization.service';
import { builderInsightsService } from './builderInsights.service';

/** Modulo CUSTOMIZATION (M05): configuracion y cotizacion del constructor de bowls. */
export const customizationController = {
  config: asyncHandler(async (req: Request, res: Response) => {
    const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
    const config = await customizationService.getConfig(Number(req.params.productId), branchId);
    return ok(res, config);
  }),

  /** RN-007: la UI estima, pero el precio valido es el que devuelve este endpoint. */
  quote: asyncHandler(async (req: Request, res: Response) => {
    const quote = await customizationService.quote(req.body);
    return ok(res, quote, 'Cotizacion actualizada');
  }),
  trackEvent: asyncHandler(async (req: Request, res: Response) => {
    await builderInsightsService.track({ ...req.body, userId: req.user?.sub ?? null });
    return ok(res, null, 'Evento registrado');
  }),
};
