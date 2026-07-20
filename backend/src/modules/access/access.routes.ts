import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '@middlewares/auth.middleware';
import { requirePermissions } from '@middlewares/rbac.middleware';
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
router.get('/permissions', requirePermissions(PERMISSIONS.ROLE_READ), accessController.permissions);

// --- Roles ---
router.get('/roles', requirePermissions(PERMISSIONS.ROLE_READ), accessController.roles);

router.post(
  '/roles',
  requirePermissions(PERMISSIONS.ROLE_MANAGE),
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
      }),
    }),
  ),
  accessController.createRole,
);

router.patch(
  '/roles/:roleId',
  requirePermissions(PERMISSIONS.ROLE_MANAGE),
  validate(
    z.object({
      params: z.object({ roleId: z.coerce.number().int().positive() }),
      body: z.object({
        name: z.string().min(3).max(80).optional(),
        description: z.string().max(255).optional(),
        permissions: z.array(z.string()).optional(),
      }),
    }),
  ),
  accessController.updateRole,
);

router.delete(
  '/roles/:roleId',
  requirePermissions(PERMISSIONS.ROLE_MANAGE),
  validate(z.object({ params: z.object({ roleId: z.coerce.number().int().positive() }) })),
  accessController.deleteRole,
);

// --- Usuarios internos ---
router.get('/staff', requirePermissions(PERMISSIONS.USER_READ), accessController.staff);

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
      body: z.object({ status: z.enum(['ACTIVE', 'BLOCKED']) }),
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
      body: z.object({ value: z.boolean() }),
    }),
  ),
  accessController.setSuperAdmin,
);

export default router;
