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

  roles: asyncHandler(async (req: Request, res: Response) => {
    const roles = await accessService.listRoles(req.query.includeArchived === 'true');
    return ok(res, roles, `${roles.length} roles`);
  }),

  teamsOverview: asyncHandler(async (_req: Request, res: Response) => {
    const overview = await accessService.teamOverview();
    return ok(res, overview, 'Resumen de equipos');
  }),

  teams: asyncHandler(async (req: Request, res: Response) => ok(res, await accessService.listTeams(req.query.includeInactive === 'true'))),

  createTeam: asyncHandler(async (req: Request, res: Response) => {
    const team = await accessService.createTeam(actorOf(req), req.body);
    await audit(req, { action: 'team.create', entity: 'teams', entityId: team.id, after: req.body });
    return created(res, { id: team.id, key: team.key }, 'Equipo creado');
  }),

  updateTeam: asyncHandler(async (req: Request, res: Response) => {
    const team = await accessService.updateTeam(actorOf(req), Number(req.params.teamId), req.body);
    await audit(req, { action: 'team.update', entity: 'teams', entityId: team.id, after: req.body });
    return ok(res, { id: team.id, key: team.key }, 'Equipo actualizado');
  }),

  archiveTeam: asyncHandler(async (req: Request, res: Response) => {
    const team = await accessService.archiveTeam(actorOf(req), Number(req.params.teamId));
    await audit(req, { action: 'team.archive', entity: 'teams', entityId: team.id });
    return ok(res, { id: team.id, isActive: team.isActive }, 'Equipo archivado');
  }),

  createTeamAssignment: asyncHandler(async (req: Request, res: Response) => {
    const assignment = await accessService.createTeamAssignment(actorOf(req), Number(req.params.teamId), {
      ...req.body,
      effectiveFrom: req.body.effectiveFrom ? new Date(req.body.effectiveFrom) : undefined,
      effectiveUntil: req.body.effectiveUntil ? new Date(req.body.effectiveUntil) : null,
    });
    await audit(req, { action: 'team.assignment.create', entity: 'team_assignments', entityId: assignment.id, after: req.body });
    return created(res, { id: assignment.id }, 'Responsable asignado');
  }),

  updateTeamAssignment: asyncHandler(async (req: Request, res: Response) => {
    const assignment = await accessService.updateTeamAssignment(actorOf(req), Number(req.params.teamId), Number(req.params.assignmentId), {
      ...req.body,
      effectiveFrom: req.body.effectiveFrom ? new Date(req.body.effectiveFrom) : undefined,
      effectiveUntil: req.body.effectiveUntil ? new Date(req.body.effectiveUntil) : undefined,
    });
    await audit(req, { action: 'team.assignment.update', entity: 'team_assignments', entityId: assignment.id, after: req.body });
    return ok(res, { id: assignment.id }, 'Responsable actualizado');
  }),

  removeTeamAssignment: asyncHandler(async (req: Request, res: Response) => {
    await accessService.removeTeamAssignment(actorOf(req), Number(req.params.teamId), Number(req.params.assignmentId));
    await audit(req, { action: 'team.assignment.delete', entity: 'team_assignments', entityId: Number(req.params.assignmentId) });
    return noContent(res);
  }),

  createRole: asyncHandler(async (req: Request, res: Response) => {
    const role = await accessService.createRole(actorOf(req), req.body);

    await audit(req, {
      action: 'role.create',
      entity: 'roles',
      entityId: role.id,
      after: { code: role.code, name: role.name, permissions: req.body.permissions, reason: req.body.reason ?? null },
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
      after: { permissions: req.body.permissions, name: req.body.name, reason: req.body.reason ?? null },
    });

    return ok(res, { id: role.id, code: role.code }, 'Rol actualizado');
  }),

  cloneRole: asyncHandler(async (req: Request, res: Response) => {
    const role = await accessService.cloneRole(actorOf(req), Number(req.params.roleId), req.body);
    await audit(req, { action: 'role.clone', entity: 'roles', entityId: role.id, after: { code: role.code, name: role.name, sourceRoleId: Number(req.params.roleId), reason: req.body.reason ?? null } });
    return created(res, { id: role.id, code: role.code }, 'Rol clonado');
  }),

  roleImpact: asyncHandler(async (req: Request, res: Response) => ok(res, await accessService.roleImpact(Number(req.params.roleId)))),

  restoreRole: asyncHandler(async (req: Request, res: Response) => {
    const role = await accessService.restoreRole(actorOf(req), Number(req.params.roleId));
    await audit(req, { action: 'role.restore', entity: 'roles', entityId: role.id, after: { reason: req.body.reason ?? null } });
    return ok(res, { id: role.id, code: role.code }, 'Rol restaurado');
  }),

  deleteRole: asyncHandler(async (req: Request, res: Response) => {
    const roleId = Number(req.params.roleId);
    await accessService.deleteRole(roleId, req.body.reason);

    await audit(req, { action: 'role.delete', entity: 'roles', entityId: roleId, after: { archived: true, reason: req.body.reason } });
    return noContent(res);
  }),

  staff: asyncHandler(async (req: Request, res: Response) => {
    const staff = await accessService.listStaff({ search: req.query.search as string | undefined, status: req.query.status as string | undefined, roleId: req.query.roleId ? Number(req.query.roleId) : undefined, branchId: req.query.branchId ? Number(req.query.branchId) : undefined, includeArchived: req.query.includeArchived === 'true' });
    return ok(res, staff, `${staff.length} usuarios internos`);
  }),

  customers: asyncHandler(async (req: Request, res: Response) => {
    const customers = await accessService.listCustomers({ search: req.query.search as string | undefined, status: req.query.status as string | undefined });
    return ok(res, customers, `${customers.length} clientes`);
  }),

  setCustomerStatus: asyncHandler(async (req: Request, res: Response) => {
    const user = await accessService.setCustomerStatus(actorOf(req), Number(req.params.userId), req.body.status, req.body.expectedVersion);
    await audit(req, { action: 'customer.status.update', entity: 'users', entityId: user.id, after: { status: user.status, reason: req.body.reason ?? null } });
    return ok(res, { id: user.id, status: user.status, version: user.version }, 'Estado del cliente actualizado');
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
      after: { roleIds: req.body.roleIds, branchIds: req.body.branchIds ?? (req.body.branchId ? [req.body.branchId] : []), reason: req.body.reason ?? null },
    });

    return ok(res, { id: user.id }, 'Roles actualizados');
  }),

  setSuperAdmin: asyncHandler(async (req: Request, res: Response) => {
    const userId = Number(req.params.userId);
    const user = await accessService.setSuperAdmin(actorOf(req), userId, req.body.value, req.body.expectedVersion);

    await audit(req, {
      action: 'user.set_superadmin',
      entity: 'users',
      entityId: user.id,
      after: { isSuperAdmin: user.isSuperAdmin, reason: req.body.reason ?? null },
    });

    return ok(res, { id: user.id, isSuperAdmin: user.isSuperAdmin }, 'Superadmin actualizado');
  }),

  setStatus: asyncHandler(async (req: Request, res: Response) => {
    const userId = Number(req.params.userId);
    const user = await accessService.setStatus(actorOf(req), userId, req.body.status, req.body.expectedVersion);

    await audit(req, {
      action: 'user.set_status',
      entity: 'users',
      entityId: user.id,
      after: { status: user.status, reason: req.body.reason ?? null },
    });

    return ok(res, { id: user.id, status: user.status }, 'Estado actualizado');
  }),

  archiveStaff: asyncHandler(async (req: Request, res: Response) => {
    const user = await accessService.archiveStaff(actorOf(req), Number(req.params.userId), req.body.expectedVersion);
    await audit(req, { action: 'user.archive', entity: 'users', entityId: user.id, after: { archivedAt: user.archivedAt, reason: req.body.reason } });
    return ok(res, { id: user.id, archivedAt: user.archivedAt }, 'Usuario archivado');
  }),

  restoreStaff: asyncHandler(async (req: Request, res: Response) => {
    const user = await accessService.restoreStaff(actorOf(req), Number(req.params.userId), req.body.expectedVersion);
    await audit(req, { action: 'user.restore', entity: 'users', entityId: user.id, after: { archivedAt: null } });
    return ok(res, { id: user.id, archivedAt: user.archivedAt }, 'Usuario restaurado');
  }),

  sessions: asyncHandler(async (req: Request, res: Response) => ok(res, await accessService.listSessions(actorOf(req), Number(req.params.userId)))),

  revokeSessions: asyncHandler(async (req: Request, res: Response) => {
    const result = await accessService.revokeSessions(actorOf(req), Number(req.params.userId), req.body.sessionId);
    await audit(req, { action: 'user.sessions.revoke', entity: 'users', entityId: Number(req.params.userId), after: { ...result, sessionId: req.body.sessionId ?? null } });
    return ok(res, result, 'Sesiones revocadas');
  }),

  prepareMfa: asyncHandler(async (req: Request, res: Response) => ok(res, await accessService.prepareMfa(actorOf(req), Number(req.params.userId)), 'Configuracion MFA preparada')),

  confirmMfa: asyncHandler(async (req: Request, res: Response) => {
    const result = await accessService.confirmMfa(actorOf(req), Number(req.params.userId), req.body.code);
    await audit(req, { action: 'user.mfa.enable', entity: 'users', entityId: Number(req.params.userId), after: { enabled: true } });
    return ok(res, result, 'MFA activado');
  }),

  disableMfa: asyncHandler(async (req: Request, res: Response) => {
    const result = await accessService.disableMfa(actorOf(req), Number(req.params.userId), req.body.expectedVersion);
    await audit(req, { action: 'user.mfa.disable', entity: 'users', entityId: Number(req.params.userId), after: { enabled: false, reason: req.body.reason ?? null } });
    return ok(res, result, 'MFA desactivado');
  }),
};
