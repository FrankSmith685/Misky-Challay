import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '@shared/errors/ApiError';
import type { PermissionCode, RoleCode } from '@config/constants';
import { PERMISSION_CATALOG, USER_STATUS } from '@config/constants';
import { User } from '@database/models';

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

/**
 * EL 403 SE LE LEE A UN OPERARIO, NO A UN PROGRAMADOR
 * ---------------------------------------------------------------------------
 * La respuesta era literalmente "Faltan permisos: catalog.product.write": no
 * dice que hacer ni a quien pedirlo, y de paso publica el mapa interno de
 * permisos a cualquiera que toque un boton. El catalogo ya tiene la etiqueta en
 * espanol de cada permiso, que es exactamente la que el administrador ve en la
 * pantalla de Roles: usando la misma palabra en los dos lados, quien recibe el
 * aviso puede pedir el acceso por su nombre.
 *
 * El codigo interno sigue viajando en `details.missing` (y se registra en el
 * log): lo necesita el soporte, no el mensaje de pantalla.
 */
const PERMISSION_LABELS = new Map<string, string>(
  PERMISSION_CATALOG.flatMap((group) =>
    group.permissions.map((permission) => [permission.code, permission.label] as const),
  ),
);

const describePermissions = (codes: readonly string[], conjunction: 'y' | 'o'): string => {
  const labels = codes.map((code) => `«${PERMISSION_LABELS.get(code) ?? code}»`);
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} ${conjunction} ${labels[labels.length - 1]}`;
};

/* `ApiError.forbidden` no acepta detalles, y el codigo del permiso tiene que
 * llegar al soporte aunque no se le muestre al operario. */
const forbiddenWithMissing = (message: string, missing: readonly string[]): ApiError =>
  new ApiError(403, message, 'FORBIDDEN', { missing: [...missing] });
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
      next(
        forbiddenWithMissing(
          `No tienes permiso para esta acción: te ${missing.length === 1 ? 'falta' : 'faltan'} ${describePermissions(missing, 'y')}. Pídeselo a quien administra los accesos del panel.`,
          missing,
        ),
      );
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
      next(
        forbiddenWithMissing(
          `No tienes permiso para esta acción: necesitas ${describePermissions(allowed, 'o')}. Pídeselo a quien administra los accesos del panel.`,
          allowed,
        ),
      );
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

/** Operaciones de gobierno que no son delegables mediante roles editables. */
export const requireSuperAdmin = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!req.user) {
    next(ApiError.unauthorized());
    return;
  }
  if (!req.user.isSuperAdmin) {
    next(ApiError.forbidden('Esta operación es exclusiva del superadmin'));
    return;
  }
  try {
    // Revalida la marca actual en la base. Si se revocó el superadmin, un token
    // emitido antes del cambio no conserva acceso a la identidad legal.
    const current = await User.findByPk(req.user.sub, { attributes: ['id', 'isSuperAdmin', 'status'] });
    if (!current?.isSuperAdmin || current.status !== USER_STATUS.ACTIVE) {
      next(ApiError.forbidden('Esta operación es exclusiva del superadmin'));
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
};
