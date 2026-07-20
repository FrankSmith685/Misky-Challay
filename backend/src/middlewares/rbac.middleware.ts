import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '@shared/errors/ApiError';
import type { PermissionCode, RoleCode } from '@config/constants';

/**
 * AUTORIZACION (seccion 7.1)
 * ---------------------------------------------------------------------------
 * La interfaz oculta lo que no puedes hacer, pero la seguridad REAL se valida
 * aqui: aunque alguien escriba la URL a mano, no pasa de este middleware.
 *
 * El superadmin se salta la verificacion por definicion. No es un rol con todos
 * los permisos (eso seria fragil: bastaria editarle el rol para dejarlo fuera),
 * es una marca del sistema.
 */
export const requirePermissions =
  (...required: PermissionCode[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized());
      return;
    }

    if (req.user.isSuperAdmin) {
      next();
      return;
    }

    const granted = new Set(req.user.permissions ?? []);
    const missing = required.filter((permission) => !granted.has(permission));

    if (missing.length > 0) {
      next(ApiError.forbidden(`Faltan permisos: ${missing.join(', ')}`));
      return;
    }

    next();
  };

/** Basta con UNO de los permisos indicados (ej. leer O gestionar). */
export const requireAnyPermission =
  (...allowed: PermissionCode[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized());
      return;
    }

    if (req.user.isSuperAdmin) {
      next();
      return;
    }

    const granted = new Set(req.user.permissions ?? []);
    const hasAny = allowed.some((permission) => granted.has(permission));

    if (!hasAny) {
      next(ApiError.forbidden(`Faltan permisos: ${allowed.join(' o ')}`));
      return;
    }

    next();
  };

export const requireRoles =
  (...required: RoleCode[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized());
      return;
    }

    if (req.user.isSuperAdmin) {
      next();
      return;
    }

    const roles = new Set(req.user.roles ?? []);
    if (!required.some((role) => roles.has(role))) {
      next(ApiError.forbidden('Rol no autorizado para esta accion'));
      return;
    }

    next();
  };
