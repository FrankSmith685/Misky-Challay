import type { Request, Response } from 'express';
import { ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { ApiError } from '@shared/errors/ApiError';
import { branchScopeCheck, resolveBranchId } from '@shared/utils/scope';
import { PERMISSIONS, type PermissionCode } from '@config/constants';
import type { DeliveryStatus } from '@database/models/delivery.model';
import { deliveryService } from './delivery.service';

const requireActor = (req: Request): number => {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.sub;
};

/** Lectura suelta del permiso: el middleware ya dejo pasar, esto solo MATIZA que se ve. */
const has = (req: Request, permission: PermissionCode): boolean =>
  Boolean(req.user?.isSuperAdmin) || (req.user?.permissions ?? []).includes(permission);

/**
 * Repartidor de calle: opera repartos pero no los reparte.
 *
 * Es la unica frontera entre el Repartidor y el Despachador, que comparten
 * `delivery.read` y `delivery.operate`. Se define por lo que NO tiene a proposito:
 * el Auditor, que no tiene ninguno de los dos permisos de operacion, conserva la
 * lectura completa que justifica su rol, y el Despachador sigue viendo su cocina
 * entera. Quien cae aqui solo ve —y solo puede cerrar— lo que lleva encima.
 */
const isFieldDriver = (req: Request): boolean =>
  has(req, PERMISSIONS.DELIVERY_OPERATE) && !has(req, PERMISSIONS.DELIVERY_ASSIGN);

/** Modulo DELIVERY (M11): despacho, asignacion y seguimiento del reparto. */
export const deliveryController = {
  board: asyncHandler(async (req: Request, res: Response) => {
    const branchId = resolveBranchId(req, req.query.branchId as string | undefined);

    // Al repartidor se le acota a lo suyo. Se resuelve por sucursal a proposito:
    // una cuenta sin sucursal asignada tiene alcance global y podia pedir cualquier
    // branchId por query; sin fila `drivers` en esa cocina, no ve nada de ella.
    const onlyDriverIds = isFieldDriver(req)
      ? await deliveryService.driverIdsForUser(requireActor(req), branchId)
      : undefined;

    const deliveries = await deliveryService.board(branchId, { onlyDriverIds });

    if (onlyDriverIds?.length === 0) {
      return ok(res, deliveries, 'Tu cuenta no esta vinculada a ningun repartidor de esta cocina');
    }

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
          branchScopeCheck(req),
          req.body.reason,
        )
      : await deliveryService.assignExternal(
          Number(req.params.deliveryId),
          req.body.provider,
          req.body.reference,
          requireActor(req),
          branchScopeCheck(req),
        );

    return ok(
      res,
      { id: delivery.id, status: delivery.status, driverId: delivery.driverId },
      'Reparto asignado',
    );
  }),

  advance: asyncHandler(async (req: Request, res: Response) => {
    const actorId = requireActor(req);

    // El repartidor solo cierra lo suyo. Sin filtro de sucursal: el reparto puede
    // ser de otra cocina y el alcance ya lo comprueba `branchScopeCheck`.
    const onlyDriverIds = isFieldDriver(req)
      ? await deliveryService.driverIdsForUser(actorId)
      : undefined;

    const delivery = await deliveryService.advance(
      Number(req.params.deliveryId),
      req.body.status as DeliveryStatus,
      actorId,
      req.body.comment,
      branchScopeCheck(req),
      { onlyDriverIds },
    );

    return ok(res, { id: delivery.id, status: delivery.status }, 'Reparto actualizado');
  }),
};
