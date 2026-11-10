import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '@shared/errors/ApiError';
import type { PermissionCode, RoleCode } from '@config/constants';
import { PERMISSION_CATALOG, USER_STATUS } from '@config/constants';
import { User } from '@database/models';
import { audit } from '@shared/utils/audit';

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

/**
 * Permisos de escritura/operacion incluyen la lectura necesaria para usar la
 * pantalla que los contiene. Sin esta expansion, un rol con `inventory.manage`
 * podia modificar por API pero no abrir Inventario, y `audit.export` no podia
 * llegar a la Bitacora para exportar.
 */
const IMPLIED_PERMISSIONS: Record<string, readonly string[]> = {
  'catalog.product.write': ['catalog.product.read'],
  'catalog.product.publish': ['catalog.product.read'],
  'catalog.category.write': ['catalog.product.read'],
  'catalog.availability.write': ['catalog.product.read'],
  'catalog.customization.write': ['catalog.product.read'],
  'allergen.write': ['catalog.product.read'],
  'dietary_tag.write': ['catalog.product.read'],
  'geo.write': ['geo.read'],
  'order.update_status': ['order.read'],
  'order.cancel': ['order.read'],
  'experience.write': ['experience.read'],
  'experience.publish': ['experience.read'],
  'kitchen.operate': ['kitchen.read'],
  'dining.operate': ['dining.read'],
  'inventory.manage': ['inventory.read'],
  'procurement.manage': ['procurement.read'],
  'delivery.assign': ['delivery.read'],
  'delivery.operate': ['delivery.read'],
  'payment.verify': ['payment.read'],
  'payment.refund': ['payment.read'],
  'invoice.manage': ['payment.read', 'order.read'],
  'plan.manage': ['plan.read'],
  'cake.finance.manage': ['cake.finance.read'],
  'user.manage': ['user.read'],
  'customer.manage': ['customer.read'],
  'role.manage': ['role.read'],
  'audit.export': ['audit.read'],
  'audit.verify': ['audit.read'],
  'audit.retention': ['audit.read'],
  'settings.design.manage': ['settings.design.read'],
  'settings.design.publish': ['settings.design.read'],
  'communication.reply': ['communication.read'],
  'complaint.manage': ['complaint.read', 'complaint.respond', 'complaint.reopen', 'complaint.export'],
  'complaint.respond': ['complaint.read'],
  'complaint.reopen': ['complaint.read'],
  'complaint.export': ['complaint.read'],
};

const expandPermissions = (permissions: readonly string[]): Set<string> => {
  const expanded = new Set(permissions);
  let changed = true;
  while (changed) {
    changed = false;
    for (const permission of [...expanded]) {
      for (const implied of IMPLIED_PERMISSIONS[permission] ?? []) {
        if (!expanded.has(implied)) {
          expanded.add(implied);
          changed = true;
        }
      }
    }
  }
  return expanded;
};

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

    const granted = expandPermissions(req.user.permissions ?? []);
    const missing = required.filter((permission) => !granted.has(permission));

    if (missing.length > 0) {
      void audit(req, { action: 'auth.permission.denied', entity: 'permissions', after: { required, missing, path: req.originalUrl }, outcome: 'FAILURE' });
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

    const granted = expandPermissions(req.user.permissions ?? []);
    const hasAny = allowed.some((permission) => granted.has(permission));

    if (!hasAny) {
      void audit(req, { action: 'auth.permission.denied', entity: 'permissions', after: { allowed, path: req.originalUrl }, outcome: 'FAILURE' });
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
