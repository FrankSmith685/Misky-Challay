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
 * Regla: sin sucursal asignada = alcance GLOBAL (admin general, soporte).
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
  if (scope.length === 0) return branchId; // alcance global

  if (!scope.includes(branchId)) {
    throw ApiError.forbidden('No tienes acceso a esa sucursal');
  }

  return branchId;
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
  if (scope.length === 1) return scope[0];

  throw ApiError.badRequest('Indica la sucursal (branchId)');
};
