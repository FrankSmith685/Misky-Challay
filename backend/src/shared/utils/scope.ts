import type { Request } from 'express';
import { ApiError } from '@shared/errors/ApiError';

/**
 * ALCANCE POR SUCURSAL
 * ---------------------------------------------------------------------------
 * La autorizacion tiene DOS dimensiones:
 *   - permiso -> QUE puedes hacer   (requirePermissions)
 *   - alcance -> SOBRE QUE lo haces (esto)
 *
 * El administrador de Miraflores y el de San Isidro tienen los mismos permisos;
 * lo que los separa es la sucursal asignada en `user_roles.branch_id`.
 *
 * Regla: el superadmin tiene alcance GLOBAL. El administrador debe tener
 * sucursales asignadas; dejar la lista vacia no le concede acceso global.
 *        Con sucursales asignadas = solo esas.
 *
 * El branchId que llega en la peticion NO se cree a ciegas: se valida contra el
 * alcance del token. Sin esto, un cocinero de Miraflores podria leer los pedidos
 * de otra cocina simplemente cambiando el numero en la URL.
 */
export const assertBranchScope = (req: Request, branchId: number): number => {
  if (!req.user) throw ApiError.unauthorized();

  if (req.user.isSuperAdmin) return branchId;

  const scope = req.user.branchIds ?? [];
  if (scope.length === 0 && req.user.roles?.includes('admin')) {
    throw ApiError.forbidden('Tu cuenta de administrador necesita una sucursal asignada');
  }
  if (scope.length === 0) return branchId; // alcance global solo para perfiles operativos globales

  if (!scope.includes(branchId)) {
    throw ApiError.forbidden('No tienes acceso a esa sucursal');
  }

  return branchId;
};

/**
 * Comprobacion diferida del alcance, para los servicios que cargan el recurso ellos
 * mismos a partir de un id.
 *
 * Los endpoints que LISTAN reciben el branchId y lo validan con `resolveBranchId`.
 * Los que MUTAN reciben el id del ticket o del reparto —enteros autoincrementales—
 * y hasta ahora no comprobaban nada: bastaba iterar el numero de la URL para operar
 * sobre la cocina de otra sucursal. El controlador pasa esta funcion y el servicio
 * la invoca en cuanto conoce el branchId real del recurso.
 */
export type BranchScopeCheck = (branchId: number) => void;

export const branchScopeCheck =
  (req: Request): BranchScopeCheck =>
  (branchId: number): void => {
    assertBranchScope(req, branchId);
  };

/**
 * Sucursal sobre la que trabajar cuando la peticion no la indica.
 * Si el usuario esta limitado a una sola sucursal, se asume esa.
 */
export const resolveBranchId = (req: Request, requested?: number | string): number => {
  if (requested !== undefined && requested !== '') {
    return assertBranchScope(req, Number(requested));
  }

  const scope = req.user?.branchIds ?? [];
  if (scope.length === 0 && req.user?.roles?.includes('admin') && !req.user.isSuperAdmin) {
    throw ApiError.badRequest('Indica una sucursal asignada a tu cuenta');
  }
  if (scope.length === 1) return scope[0];

  throw ApiError.badRequest('Indica la sucursal (branchId)');
};

/**
 * Resuelve el alcance de una consulta que puede trabajar con todas las
 * sucursales. La ausencia de `branchId` solo abre el alcance global para el
 * superadmin o para una cuenta que ya tenga alcance global; una cuenta con
 * varias sucursales asignadas debe elegir una explícitamente.
 */
export const resolveOptionalBranchId = (
  req: Request,
  requested?: number | string,
): number | undefined => {
  if (requested !== undefined && requested !== '') {
    return assertBranchScope(req, Number(requested));
  }

  const scope = req.user?.branchIds ?? [];
  if (req.user?.isSuperAdmin) return undefined;
  if (scope.length === 0 && req.user?.roles?.includes('admin')) {
    throw ApiError.badRequest('Indica una sucursal asignada a tu cuenta');
  }
  if (scope.length === 0) return undefined;
  if (scope.length === 1) return scope[0];

  throw ApiError.badRequest('Indica la sucursal (branchId)');
};
