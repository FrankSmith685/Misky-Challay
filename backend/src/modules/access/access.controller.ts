import type { Request, Response } from 'express';
import { created, noContent, ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { ApiError } from '@shared/errors/ApiError';
import { audit } from '@shared/utils/audit';
import type { TokenPayload } from '@shared/utils/jwt';
import { notificationsService } from '@modules/notifications/notifications.service';
import { accessService } from './access.service';

const actorOf = (req: Request): TokenPayload => {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
};

/**
 * Modulo ACCESS: gobierno de accesos.
 * Todo cambio aqui queda en la bitacora: quien le dio que permiso a quien (RN-021).
 */
export const accessController = {
  permissions: asyncHandler(async (_req: Request, res: Response) => {
    return ok(res, accessService.listPermissions());
  }),

  roles: asyncHandler(async (_req: Request, res: Response) => {
    const roles = await accessService.listRoles();
    return ok(res, roles, `${roles.length} roles`);
  }),

  createRole: asyncHandler(async (req: Request, res: Response) => {
    const role = await accessService.createRole(actorOf(req), req.body);

    await audit(req, {
      action: 'role.create',
      entity: 'roles',
      entityId: role.id,
      after: { code: role.code, name: role.name, permissions: req.body.permissions },
    });

    return created(res, { id: role.id, code: role.code }, 'Rol creado');
  }),

  updateRole: asyncHandler(async (req: Request, res: Response) => {
    const roleId = Number(req.params.roleId);

    const before = (await accessService.listRoles()).find((role) => role.id === roleId);
    const role = await accessService.updateRole(actorOf(req), roleId, req.body);

    await audit(req, {
      action: 'role.update',
      entity: 'roles',
      entityId: role.id,
      before: before ? { permissions: before.permissions, name: before.name } : null,
      after: { permissions: req.body.permissions, name: req.body.name },
    });

    return ok(res, { id: role.id, code: role.code }, 'Rol actualizado');
  }),

  deleteRole: asyncHandler(async (req: Request, res: Response) => {
    const roleId = Number(req.params.roleId);
    await accessService.deleteRole(roleId);

    await audit(req, { action: 'role.delete', entity: 'roles', entityId: roleId });
    return noContent(res);
  }),

  staff: asyncHandler(async (_req: Request, res: Response) => {
    const staff = await accessService.listStaff();
    return ok(res, staff, `${staff.length} usuarios internos`);
  }),

  createStaff: asyncHandler(async (req: Request, res: Response) => {
    const user = await accessService.createStaff(actorOf(req), req.body);

    await notificationsService.notifyStaffAccess({
      userId: user.id,
      temporaryPassword: req.body.password,
      roleIds: req.body.roleIds,
      branchId: req.body.branchId ?? null,
    });

    await audit(req, {
      action: 'user.create',
      entity: 'users',
      entityId: user.id,
      after: { email: user.email, roleIds: req.body.roleIds, branchId: req.body.branchId ?? null },
    });

    return created(res, { id: user.id, email: user.email }, 'Usuario interno creado');
  }),

  updateStaffRoles: asyncHandler(async (req: Request, res: Response) => {
    const userId = Number(req.params.userId);
    const user = await accessService.updateStaffRoles(actorOf(req), userId, req.body);

    await audit(req, {
      action: 'user.update_roles',
      entity: 'users',
      entityId: user.id,
      after: { roleIds: req.body.roleIds, branchId: req.body.branchId ?? null },
    });

    return ok(res, { id: user.id }, 'Roles actualizados');
  }),

  setSuperAdmin: asyncHandler(async (req: Request, res: Response) => {
    const userId = Number(req.params.userId);
    const user = await accessService.setSuperAdmin(actorOf(req), userId, req.body.value);

    await audit(req, {
      action: 'user.set_superadmin',
      entity: 'users',
      entityId: user.id,
      after: { isSuperAdmin: user.isSuperAdmin },
    });

    return ok(res, { id: user.id, isSuperAdmin: user.isSuperAdmin }, 'Superadmin actualizado');
  }),

  setStatus: asyncHandler(async (req: Request, res: Response) => {
    const userId = Number(req.params.userId);
    const user = await accessService.setStatus(actorOf(req), userId, req.body.status);

    await audit(req, {
      action: 'user.set_status',
      entity: 'users',
      entityId: user.id,
      after: { status: user.status },
    });

    return ok(res, { id: user.id, status: user.status }, 'Estado actualizado');
  }),
};
