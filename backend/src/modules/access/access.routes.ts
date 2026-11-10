import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '@middlewares/auth.middleware';
import { requireAnyPermission, requirePermissions, requireSuperAdmin } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import { PERMISSIONS } from '@config/constants';
import { accessController } from './access.controller';

/**
 * Modulo ACCESS - Gobierno de accesos.
 * Prefijo: /api/v1/access
 *
 * Zona sensible: cada endpoint exige su permiso y todo queda auditado.
 */
const router = Router();

router.use(authenticate);

// --- Permisos (solo lectura: los define el codigo) ---
router.get('/permissions', requireSuperAdmin, accessController.permissions);

// --- Roles ---
// El personal que administra usuarios necesita leer el catalogo de roles para
// asignar perfiles operativos; editar, archivar e impactar roles sigue siendo
// exclusivo del superadmin.
router.get('/roles', requireAnyPermission(PERMISSIONS.ROLE_READ, PERMISSIONS.USER_READ), validate(z.object({ query: z.object({ includeArchived: z.coerce.boolean().optional() }) })), accessController.roles);
router.get('/roles/:roleId/impact', requireSuperAdmin, validate(z.object({ params: z.object({ roleId: z.coerce.number().int().positive() }) })), accessController.roleImpact);

router.get('/teams/overview', requirePermissions(PERMISSIONS.USER_READ), accessController.teamsOverview);

router.get('/teams', requirePermissions(PERMISSIONS.USER_READ), validate(z.object({ query: z.object({ includeInactive: z.coerce.boolean().optional() }) })), accessController.teams);
router.post('/teams', requireSuperAdmin, validate(z.object({ body: z.object({ key: z.string().min(3).max(50).regex(/^[a-z0-9_-]+$/), name: z.string().min(3).max(100), description: z.string().max(255).optional(), route: z.string().min(1).max(120), icon: z.string().max(40).optional(), roleCodes: z.array(z.string().min(1).max(50)), branchRequired: z.boolean().optional(), minimumPerBranch: z.number().int().min(0).max(100).optional(), sortOrder: z.number().int().min(0).max(10000).optional() }) })), accessController.createTeam);
router.patch('/teams/:teamId', requireSuperAdmin, validate(z.object({ params: z.object({ teamId: z.coerce.number().int().positive() }), body: z.object({ name: z.string().min(3).max(100).optional(), description: z.string().max(255).nullable().optional(), route: z.string().min(1).max(120).optional(), icon: z.string().max(40).nullable().optional(), roleCodes: z.array(z.string().min(1).max(50)).optional(), branchRequired: z.boolean().optional(), minimumPerBranch: z.number().int().min(0).max(100).optional(), sortOrder: z.number().int().min(0).max(10000).optional(), isActive: z.boolean().optional() }) })), accessController.updateTeam);
router.post('/teams/:teamId/archive', requireSuperAdmin, validate(z.object({ params: z.object({ teamId: z.coerce.number().int().positive() }) })), accessController.archiveTeam);
router.post('/teams/:teamId/assignments', requireSuperAdmin, validate(z.object({ params: z.object({ teamId: z.coerce.number().int().positive() }), body: z.object({ userId: z.coerce.number().int().positive(), branchId: z.coerce.number().int().positive().nullable().optional(), responsibility: z.enum(['PRIMARY', 'BACKUP']).optional(), effectiveFrom: z.coerce.date().optional(), effectiveUntil: z.coerce.date().nullable().optional(), availability: z.enum(['AVAILABLE', 'AWAY', 'UNAVAILABLE']).optional(), reason: z.string().trim().max(255).nullable().optional() }) })), accessController.createTeamAssignment);
router.patch('/teams/:teamId/assignments/:assignmentId', requireSuperAdmin, validate(z.object({ params: z.object({ teamId: z.coerce.number().int().positive(), assignmentId: z.coerce.number().int().positive() }), body: z.object({ branchId: z.coerce.number().int().positive().nullable().optional(), responsibility: z.enum(['PRIMARY', 'BACKUP']).optional(), effectiveFrom: z.coerce.date().optional(), effectiveUntil: z.coerce.date().nullable().optional(), availability: z.enum(['AVAILABLE', 'AWAY', 'UNAVAILABLE']).optional(), reason: z.string().trim().max(255).nullable().optional() }) })), accessController.updateTeamAssignment);
router.delete('/teams/:teamId/assignments/:assignmentId', requireSuperAdmin, validate(z.object({ params: z.object({ teamId: z.coerce.number().int().positive(), assignmentId: z.coerce.number().int().positive() }) })), accessController.removeTeamAssignment);

router.post(
  '/roles',
  requireSuperAdmin,
  validate(
    z.object({
      body: z.object({
        code: z
          .string()
          .min(3)
          .max(40)
          .regex(/^[a-z0-9_]+$/, 'Usa minusculas, numeros y guion bajo'),
        name: z.string().min(3).max(80),
        description: z.string().max(255).optional(),
        permissions: z.array(z.string()).min(1, 'Marca al menos un permiso'),
        reason: z.string().trim().min(3).max(255).optional(),
      }),
    }),
  ),
  accessController.createRole,
);

router.patch(
  '/roles/:roleId',
  requireSuperAdmin,
  validate(
    z.object({
      params: z.object({ roleId: z.coerce.number().int().positive() }),
      body: z.object({
        name: z.string().min(3).max(80).optional(),
        description: z.string().max(255).optional(),
        permissions: z.array(z.string()).optional(),
        reason: z.string().trim().min(3).max(255).optional(),
      }),
    }),
  ),
  accessController.updateRole,
);

router.post('/roles/:roleId/clone', requireSuperAdmin, validate(z.object({ params: z.object({ roleId: z.coerce.number().int().positive() }), body: z.object({ code: z.string().min(3).max(40).regex(/^[a-z0-9_]+$/), name: z.string().min(3).max(80), description: z.string().max(255).optional(), reason: z.string().trim().min(3).max(255).optional() }) })), accessController.cloneRole);
router.post('/roles/:roleId/restore', requireSuperAdmin, validate(z.object({ params: z.object({ roleId: z.coerce.number().int().positive() }), body: z.object({ reason: z.string().trim().min(3).max(255) }) })), accessController.restoreRole);

router.delete(
  '/roles/:roleId',
  requireSuperAdmin,
  validate(z.object({ params: z.object({ roleId: z.coerce.number().int().positive() }), body: z.object({ reason: z.string().trim().min(3).max(255) }) })),
  accessController.deleteRole,
);

// --- Usuarios internos ---
router.get('/staff', requirePermissions(PERMISSIONS.USER_READ), validate(z.object({ query: z.object({ search: z.string().trim().max(80).optional(), status: z.enum(['PENDING', 'ACTIVE', 'BLOCKED', 'DELETED']).optional(), roleId: z.coerce.number().int().positive().optional(), branchId: z.coerce.number().int().positive().optional(), includeArchived: z.coerce.boolean().optional() }) })), accessController.staff);

router.get('/customers', requirePermissions(PERMISSIONS.CUSTOMER_READ), validate(z.object({ query: z.object({ search: z.string().trim().max(80).optional(), status: z.enum(['ACTIVE', 'BLOCKED', 'DELETED']).optional() }) })), accessController.customers);
router.patch('/customers/:userId/status', requirePermissions(PERMISSIONS.CUSTOMER_MANAGE), validate(z.object({ params: z.object({ userId: z.coerce.number().int().positive() }), body: z.object({ status: z.enum(['ACTIVE', 'BLOCKED']), expectedVersion: z.coerce.number().int().positive().optional(), reason: z.string().trim().max(255).optional() }) })), accessController.setCustomerStatus);

router.post(
  '/staff',
  requirePermissions(PERMISSIONS.USER_MANAGE),
  validate(
    z.object({
      body: z.object({
        email: z.string().email(),
        password: z.string().min(8),
        firstName: z.string().min(2).max(80),
        lastName: z.string().min(2).max(80),
        roleIds: z.array(z.coerce.number().int().positive()).min(1, 'Asigna al menos un rol'),
        branchId: z.coerce.number().int().positive().nullable().optional(),
        branchIds: z.array(z.coerce.number().int().positive()).max(50).optional(),
      }),
    }),
  ),
  accessController.createStaff,
);

router.patch(
  '/staff/:userId/roles',
  requirePermissions(PERMISSIONS.USER_MANAGE),
  validate(
    z.object({
      params: z.object({ userId: z.coerce.number().int().positive() }),
      body: z.object({
        roleIds: z.array(z.coerce.number().int().positive()).min(1),
        branchId: z.coerce.number().int().positive().nullable().optional(),
        branchIds: z.array(z.coerce.number().int().positive()).max(50).optional(),
        expectedVersion: z.coerce.number().int().positive().optional(),
        reason: z.string().trim().min(3).max(255).optional(),
      }),
    }),
  ),
  accessController.updateStaffRoles,
);

router.patch(
  '/staff/:userId/status',
  requirePermissions(PERMISSIONS.USER_MANAGE),
  validate(
    z.object({
      params: z.object({ userId: z.coerce.number().int().positive() }),
      body: z.object({ status: z.enum(['ACTIVE', 'BLOCKED']), expectedVersion: z.coerce.number().int().positive().optional(), reason: z.string().trim().min(3).max(255) }),
    }),
  ),
  accessController.setStatus,
);

// Nombrar o quitar superadmin: el propio servicio exige que el actor lo sea.
router.patch(
  '/staff/:userId/superadmin',
  validate(
    z.object({
      params: z.object({ userId: z.coerce.number().int().positive() }),
      body: z.object({ value: z.boolean(), expectedVersion: z.coerce.number().int().positive().optional(), reason: z.string().trim().min(3).max(255) }),
    }),
  ),
  accessController.setSuperAdmin,
);

router.post('/staff/:userId/archive', requirePermissions(PERMISSIONS.USER_MANAGE), validate(z.object({ params: z.object({ userId: z.coerce.number().int().positive() }), body: z.object({ expectedVersion: z.coerce.number().int().positive().optional(), reason: z.string().trim().min(3).max(255) }) })), accessController.archiveStaff);
router.post('/staff/:userId/restore', requirePermissions(PERMISSIONS.USER_MANAGE), validate(z.object({ params: z.object({ userId: z.coerce.number().int().positive() }), body: z.object({ expectedVersion: z.coerce.number().int().positive().optional() }) })), accessController.restoreStaff);
router.get('/staff/:userId/sessions', requirePermissions(PERMISSIONS.USER_READ), validate(z.object({ params: z.object({ userId: z.coerce.number().int().positive() }) })), accessController.sessions);
router.post('/staff/:userId/sessions/revoke', requirePermissions(PERMISSIONS.USER_MANAGE), validate(z.object({ params: z.object({ userId: z.coerce.number().int().positive() }), body: z.object({ sessionId: z.coerce.number().int().positive().optional() }) })), accessController.revokeSessions);
router.post('/staff/:userId/mfa/setup', requirePermissions(PERMISSIONS.USER_MANAGE), validate(z.object({ params: z.object({ userId: z.coerce.number().int().positive() }) })), accessController.prepareMfa);
router.post('/staff/:userId/mfa/confirm', requirePermissions(PERMISSIONS.USER_MANAGE), validate(z.object({ params: z.object({ userId: z.coerce.number().int().positive() }), body: z.object({ code: z.string().regex(/^(\d{6}|[A-Fa-f0-9]{10})$/) }) })), accessController.confirmMfa);
router.post('/staff/:userId/mfa/disable', requirePermissions(PERMISSIONS.USER_MANAGE), validate(z.object({ params: z.object({ userId: z.coerce.number().int().positive() }), body: z.object({ expectedVersion: z.coerce.number().int().positive().optional(), reason: z.string().trim().min(3).max(255) }) })), accessController.disableMfa);

export default router;
