import type { Request, Response } from 'express';
import { ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { ApiError } from '@shared/errors/ApiError';
import { resolveBranchId } from '@shared/utils/scope';
import type { DeliveryStatus } from '@database/models/delivery.model';
import { deliveryService } from './delivery.service';

const requireActor = (req: Request): number => {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.sub;
};

/** Modulo DELIVERY (M11): despacho, asignacion y seguimiento del reparto. */
export const deliveryController = {
  board: asyncHandler(async (req: Request, res: Response) => {
    const branchId = resolveBranchId(req, req.query.branchId as string | undefined);
    const deliveries = await deliveryService.board(branchId);
    return ok(res, deliveries, `${deliveries.length} repartos activos`);
  }),

  drivers: asyncHandler(async (req: Request, res: Response) => {
    const branchId = resolveBranchId(req, req.query.branchId as string | undefined);
    const drivers = await deliveryService.listDrivers(branchId);
    return ok(res, drivers);
  }),

  assign: asyncHandler(async (req: Request, res: Response) => {
    const delivery = req.body.driverId
      ? await deliveryService.assignDriver(
          Number(req.params.deliveryId),
          Number(req.body.driverId),
          requireActor(req),
        )
      : await deliveryService.assignExternal(
          Number(req.params.deliveryId),
          req.body.provider,
          req.body.reference,
          requireActor(req),
        );

    return ok(res, { id: delivery.id, status: delivery.status }, 'Reparto asignado');
  }),

  advance: asyncHandler(async (req: Request, res: Response) => {
    const delivery = await deliveryService.advance(
      Number(req.params.deliveryId),
      req.body.status as DeliveryStatus,
      requireActor(req),
      req.body.comment,
    );

    return ok(res, { id: delivery.id, status: delivery.status }, 'Reparto actualizado');
  }),
};
