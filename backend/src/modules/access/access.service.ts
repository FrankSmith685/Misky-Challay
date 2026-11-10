import crypto from 'node:crypto';
import { Op, type Transaction } from 'sequelize';
import {
  Branch,
  Complaint,
  Driver,
  Delivery,
  KitchenTicket,
  Order,
  Payment,
  PurchaseOrder,
  Permission,
  Role,
  RolePermission,
  Team,
  TeamAssignment,
  AuditLog,
  User,
  UserRole,
  UserSession,
  sequelize,
} from '@database/models';
import { DRIVER_STATUS } from '@database/models/driver.model';
import { COMPLAINT_STATUS } from '@database/models/complaint.model';
import { DELIVERY_STATUS } from '@database/models/delivery.model';
import { PURCHASE_ORDER_STATUS } from '@database/models/procurement.model';
import { TICKET_STATUS } from '@database/models/kitchenTicket.model';
import { TEAM_AVAILABILITY, TEAM_RESPONSIBILITY } from '@database/models/teamAssignment.model';
import { PERMISSION_CATALOG, PERMISSIONS, ROLES, USER_STATUS, ORDER_STATUS } from '@config/constants';
import { TEAM_DEFINITIONS } from '@config/teamDefinitions';
import { ApiError } from '@shared/errors/ApiError';
import { hashPassword } from '@shared/utils/password';
import { revokeSessionCache } from '@middlewares/auth.middleware';
import type { TokenPayload } from '@shared/utils/jwt';
import { decryptTotpSecret, encryptTotpSecret, randomBase32, verifyTotp } from '@shared/utils/totp';

/**
 * Roles que sostienen la operacion: no se borran. El panel tampoco ofrece editar
 * sus permisos, y el de Cliente ademas lo rechaza el servidor (ver `updateRole`).
 */
const PROTECTED_ROLES: string[] = [ROLES.CUSTOMER, ROLES.ADMIN];
const BRANCH_SCOPED_ROLES: string[] = [
  ROLES.KITCHEN,
  ROLES.PURCHASING,
  ROLES.CASHIER,
  ROLES.WAITER,
  ROLES.DISPATCHER,
  ROLES.DRIVER,
  ROLES.BRANCH_ADMIN,
  ROLES.ADMIN,
];

/**
 * Permisos que abren la puerta por la que se entro a cambiarlos. Quitarselos a uno
 * mismo no es un cambio de configuracion: es cerrarse por dentro, y sin superadmin
 * a mano no hay pantalla desde la cual deshacerlo.
 */
const SELF_LOCKOUT_PERMISSIONS: string[] = [PERMISSIONS.ROLE_MANAGE, PERMISSIONS.USER_MANAGE];

const assertBranchScope = async (roleIds: number[], branchIds: number[] = []): Promise<void> => {
  const roles = await Role.findAll({ where: { id: { [Op.in]: roleIds } } });
  if (roles.length !== roleIds.length) throw ApiError.badRequest('Algun rol no existe');

  const requiresBranch = roles.some((role) => BRANCH_SCOPED_ROLES.includes(role.code));
  if (requiresBranch && branchIds.length === 0) {
    throw ApiError.unprocessable(
      'Cocina, reparto y administracion de sucursal requieren una cocina asignada',
    );
  }
  if (branchIds.length > 0) {
    const branches = await Branch.findAll({ where: { id: { [Op.in]: branchIds }, isActive: true }, attributes: ['id'] });
    if (branches.length !== new Set(branchIds).size) throw ApiError.badRequest('Alguna sucursal no existe o esta inactiva');
  }
};

const normalizedBranchIds = (input: { branchIds?: number[]; branchId?: number | null }): number[] =>
  [...new Set(input.branchIds ?? (input.branchId ? [input.branchId] : []))];

const assertActorBranchAssignments = (actor: TokenPayload, branchIds: number[]): void => {
  if (actor.isSuperAdmin) return;
  if (!branchIds.length) throw ApiError.forbidden('Asigna al menos una sucursal a esta cuenta');
  const allowed = new Set(actor.branchIds ?? []);
  if (allowed.size === 0 || branchIds.some((branchId) => !allowed.has(branchId))) {
    throw ApiError.forbidden('No puedes asignar personal fuera de tus sucursales');
  }
};

/** Codigos de los roles indicados, para decidir por rol y no por id. */
const roleCodesOf = async (roleIds: number[]): Promise<string[]> => {
  if (roleIds.length === 0) return [];
  const roles = await Role.findAll({ where: { id: { [Op.in]: roleIds } }, attributes: ['code'] });
  return roles.map((role) => role.code);
};

/** Permisos efectivos de un usuario, opcionalmente ignorando uno de sus roles. */
const effectivePermissionsOf = async (
  userId: number,
  options: { exceptRoleId?: number } = {},
): Promise<Set<string>> => {
  const assignments = await UserRole.findAll({ where: { userId }, attributes: ['roleId'] });
  const roleIds = assignments
    .map((assignment) => assignment.roleId)
    .filter((roleId) => roleId !== options.exceptRoleId);

  if (roleIds.length === 0) return new Set();

  const roles = await Role.findAll({
    where: { id: { [Op.in]: roleIds } },
    include: [{ model: Permission, as: 'permissions', through: { attributes: [] } }],
  });

  const codes = new Set<string>();
  roles.forEach((role) => role.permissions?.forEach((permission) => codes.add(permission.code)));
  return codes;
};

const permissionLabel = (code: string): string => {
  for (const group of PERMISSION_CATALOG) {
    const found = group.permissions.find((permission) => permission.code === code);
    if (found) return found.label;
  }
  return code;
};

const PERMISSION_DEPENDENCIES: Record<string, string[]> = {
  'catalog.product.write': ['catalog.product.read'],
  'catalog.product.publish': ['catalog.product.read'],
  'catalog.category.write': ['catalog.product.read'],
  'catalog.availability.write': ['catalog.product.read'],
  'catalog.customization.write': ['catalog.product.read'],
  'allergen.write': ['catalog.product.read'],
  'dietary_tag.write': ['catalog.product.read'],
  'experience.write': ['experience.read'],
  'experience.publish': ['experience.read'],
  'geo.write': ['geo.read'],
  'order.update_status': ['order.read'],
  'order.cancel': ['order.read'],
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
  'communication.reply': ['communication.read'],
  'settings.design.manage': ['settings.design.read'],
  'settings.design.publish': ['settings.design.read'],
  'audit.export': ['audit.read'],
  'audit.verify': ['audit.read'],
  'audit.retention': ['audit.read'],
  'complaint.manage': ['complaint.read', 'complaint.respond', 'complaint.reopen', 'complaint.export'],
  'complaint.respond': ['complaint.read'],
  'complaint.reopen': ['complaint.read'],
  'complaint.export': ['complaint.read'],
};

const BRANCH_SCOPED_PERMISSION_PREFIXES = ['kitchen.', 'dining.', 'pos.', 'inventory.', 'procurement.', 'delivery.', 'payment.', 'order.'];
const CRITICAL_PERMISSIONS = new Set(['user.manage', 'role.manage', 'settings.manage', 'payment.refund', 'cake.finance.manage']);
const HIGH_RISK_PERMISSIONS = new Set(['payment.verify', 'invoice.manage', 'procurement.manage', 'inventory.manage', 'delivery.assign', 'catalog.product.publish', 'promotion.manage']);

const permissionMetadata = (code: string) => ({
  dependencies: PERMISSION_DEPENDENCIES[code] ?? [],
  scope: BRANCH_SCOPED_PERMISSION_PREFIXES.some((prefix) => code.startsWith(prefix)) ? 'BRANCH' as const : 'GLOBAL' as const,
  risk: CRITICAL_PERMISSIONS.has(code) ? 'CRITICAL' as const : HIGH_RISK_PERMISSIONS.has(code) ? 'HIGH' as const : 'NORMAL' as const,
});

const roleSecurity = (codes: string[]) => {
  const unique = [...new Set(codes)];
  const missingDependencies = [...new Set(unique.flatMap((code) => (PERMISSION_DEPENDENCIES[code] ?? []).filter((dependency) => !unique.includes(dependency))))];
  const reasons: string[] = [];
  if (unique.some((code) => CRITICAL_PERMISSIONS.has(code))) reasons.push('Incluye permisos críticos');
  if (unique.some((code) => HIGH_RISK_PERMISSIONS.has(code))) reasons.push('Incluye operaciones sensibles');
  if (unique.includes('payment.refund') && unique.includes('payment.verify')) reasons.push('Puede verificar pagos y aprobar reembolsos');
  if (unique.includes('user.manage') && unique.includes('audit.read')) reasons.push('Gestiona usuarios y puede consultar su propia auditoría');
  if (unique.includes('catalog.product.write') && unique.includes('payment.verify')) reasons.push('Combina catálogo y validación de pagos');
  if (unique.includes('procurement.manage') && unique.includes('cake.finance.manage')) reasons.push('Combina compras y finanzas');
  const level = unique.some((code) => CRITICAL_PERMISSIONS.has(code)) ? 'CRITICAL' : unique.some((code) => HIGH_RISK_PERMISSIONS.has(code)) ? 'HIGH' : unique.length ? 'NORMAL' : 'NONE';
  return { level, reasons, missingDependencies, requiresBranch: unique.some((code) => BRANCH_SCOPED_PERMISSION_PREFIXES.some((prefix) => code.startsWith(prefix))) };
};

const assertPermissionDependencies = (codes: string[]): void => {
  const missing = roleSecurity(codes).missingDependencies;
  if (missing.length > 0) throw ApiError.unprocessable(`Faltan permisos base: ${missing.join(', ')}`);
};

const fullName = (person: { firstName: string | null; lastName: string | null; email: string | null }): string =>
  [person.firstName, person.lastName].filter(Boolean).join(' ').trim() || person.email || 'Sin nombre';

type TeamCatalogRow = {
  id: number | null;
  key: string;
  name: string;
  description: string;
  route: string;
  icon: string | null;
  roleCodes: string[];
  branchRequired: boolean;
  minimumPerBranch: number;
  sortOrder: number;
};

const teamCatalog = async (): Promise<TeamCatalogRow[]> => {
  let rows: Team[] = [];
  try {
    rows = await Team.findAll({ where: { isActive: true }, order: [['sortOrder', 'ASC'], ['name', 'ASC']] });
  } catch {
    // Permite que una instancia anterior siga mostrando el directorio mientras
    // se aplica la migración 0086.
    rows = [];
  }
  if (rows.length > 0) {
    return rows.map((team) => ({
      id: team.id,
      key: team.key,
      name: team.name,
      description: team.description ?? '',
      route: team.route,
      icon: team.icon,
      roleCodes: Array.isArray(team.roleCodes) ? team.roleCodes : [],
      branchRequired: team.branchRequired,
      minimumPerBranch: team.minimumPerBranch,
      sortOrder: team.sortOrder,
    }));
  }
  return TEAM_DEFINITIONS.map((team) => ({ ...team, id: null, description: team.description, icon: team.icon, roleCodes: [...team.roleCodes] }));
};

/**
 * GUARDA CONTRA LA AUTO-DEGRADACION
 * ---------------------------------------------------------------------------
 * `assertCanGrant` mira lo que se OTORGA y nunca lo que se retira, asi que un
 * administrador podia quitarse `role.manage` a si mismo —editando su propio rol
 * o cambiandose los roles— y quedarse fuera de la unica pantalla desde la que se
 * arregla. El superadmin queda al margen: se salta la verificacion por
 * definicion, no puede encerrarse.
 *
 * Se comparan permisos EFECTIVOS: si conserva el permiso por otro de sus roles,
 * el cambio es legitimo y pasa.
 */
const assertNoSelfLockout = async (
  actor: TokenPayload,
  current: Set<string>,
  next: Set<string>,
): Promise<void> => {
  if (actor.isSuperAdmin) return;

  const lost = SELF_LOCKOUT_PERMISSIONS.filter((code) => current.has(code) && !next.has(code));
  if (lost.length === 0) return;

  throw ApiError.unprocessable(
    `Ese cambio te dejaria sin ${lost.map((code) => `"${permissionLabel(code)}"`).join(' ni ')}: perderias el acceso a esta pantalla y no podrias deshacerlo. Pideselo a otro administrador.`,
  );
};

/**
 * VINCULACION DEL ROL REPARTIDOR CON LA FLOTA
 * ---------------------------------------------------------------------------
 * `drivers.userId` es el unico vinculo entre la persona y su fila de la flota, y
 * de el dependen dos cosas: que el desplegable de asignacion muestre a los
 * repartidores reales (antes solo salian los sembrados) y que el tablero le
 * ensene a cada uno SUS repartos y no los de sus companeros, con nombre,
 * telefono, direccion e importe del cliente.
 *
 * Al retirar el rol la fila no se borra: los repartos historicos apuntan a ella.
 * Se desactiva y se pone OFFLINE, que es lo que la saca del desplegable.
 */
const syncDriverProfile = async (
  user: User,
  roleCodes: string[],
  branchId: number | null,
  transaction: Transaction,
): Promise<void> => {
  const existing = await Driver.findOne({ where: { userId: user.id }, transaction });
  const isDriver = roleCodes.includes(ROLES.DRIVER);

  if (!isDriver) {
    if (existing?.isActive) {
      existing.isActive = false;
      existing.status = DRIVER_STATUS.OFFLINE;
      await existing.save({ transaction });
    }
    return;
  }

  // `assertBranchScope` ya garantiza la cocina para este rol; el fallback solo
  // evita romper el tipo de una columna que no admite nulos.
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
    || user.email
    || `Repartidor #${user.id}`;

  if (existing) {
    existing.fullName = fullName;
    if (branchId) existing.branchId = branchId;
    existing.isActive = true;
    // Volver a la flota no lo pone a repartir: OFFLINE es "no disponible", y el
    // despachador decide. Solo se levanta de OFFLINE, nunca se pisa un BUSY.
    if (existing.status === DRIVER_STATUS.OFFLINE) existing.status = DRIVER_STATUS.AVAILABLE;
    await existing.save({ transaction });
    return;
  }

  if (!branchId) return;

  await Driver.create(
    {
      userId: user.id,
      branchId,
      fullName,
      phone: user.phone,
      status: DRIVER_STATUS.AVAILABLE,
      isActive: true,
    },
    { transaction },
  );
};

/**
 * GUARDA CONTRA LA ESCALADA DE PRIVILEGIOS
 * ---------------------------------------------------------------------------
 * Nadie puede otorgar un permiso que el mismo no tiene. Sin esta regla, un
 * usuario con `role.manage` podria crearse un rol con `payment.refund` y
 * devolverse dinero a si mismo.
 *
 * El superadmin es la unica excepcion: por definicion los tiene todos.
 */
const assertCanGrant = (actor: TokenPayload, permissionCodes: string[]): void => {
  if (actor.isSuperAdmin) return;

  const own = new Set(actor.permissions ?? []);
  const forbidden = permissionCodes.filter((code) => !own.has(code));

  if (forbidden.length > 0) {
    throw ApiError.forbidden(
      `No puedes otorgar permisos que tu no tienes: ${forbidden.join(', ')}`,
    );
  }
};

const assertCanManageStaffAccount = async (actor: TokenPayload, user: User): Promise<void> => {
  if (actor.isSuperAdmin) return;
  if (user.isSuperAdmin) throw ApiError.forbidden('Solo un superadmin puede modificar a otro superadmin');
  const assignments = await UserRole.findAll({ where: { userId: user.id }, attributes: ['roleId'] });
  const roles = assignments.length
    ? await Role.findAll({ where: { id: assignments.map((assignment) => assignment.roleId) }, attributes: ['code'] })
    : [];
  if (roles.some((role) => role.code === ROLES.ADMIN)) {
    throw ApiError.forbidden('Solo un superadmin puede modificar cuentas de administrador');
  }
};

export const accessService = {
  /** Los permisos los define el codigo; la UI solo los pinta agrupados. */
  listPermissions() {
    return PERMISSION_CATALOG.map((group) => ({
      ...group,
      permissions: group.permissions.map((permission) => ({ ...permission, ...permissionMetadata(permission.code) })),
    }));
  },

  async listRoles(includeArchived = false) {
    const roles = await Role.findAll({
      where: includeArchived ? {} : { archivedAt: null },
      include: [{ model: Permission, as: 'permissions', through: { attributes: [] } }],
      order: [['name', 'ASC']],
    });

    const counts = await UserRole.findAll({
      attributes: ['roleId', 'userId'],
      raw: true,
    });

    const usersByRole = counts.reduce<Record<number, Set<number>>>((acc, row) => {
      (acc[row.roleId] ??= new Set()).add(row.userId);
      return acc;
    }, {});

    return roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      isProtected: PROTECTED_ROLES.includes(role.code),
      isArchived: Boolean(role.archivedAt),
      userCount: usersByRole[role.id]?.size ?? 0,
      permissions: (role.permissions ?? []).map((permission) => permission.code),
      security: { ...roleSecurity((role.permissions ?? []).map((permission) => permission.code)), requiresBranch: BRANCH_SCOPED_ROLES.includes(role.code) },
    }));
  },

  /** Crea un rol nuevo con los permisos marcados. */
  async createRole(
    actor: TokenPayload,
    input: { code: string; name: string; description?: string; permissions: string[]; reason?: string },
  ) {
    assertPermissionDependencies(input.permissions);
    const security = roleSecurity(input.permissions);
    if (security.level === 'CRITICAL' && !actor.isSuperAdmin) throw ApiError.forbidden('Los roles con permisos criticos solo los puede crear un superadmin');
    if (security.level !== 'NONE' && !input.reason) throw ApiError.unprocessable('Indica el motivo de la creacion del rol');
    assertCanGrant(actor, input.permissions);

    const existing = await Role.findOne({ where: { code: input.code } });
    if (existing) throw ApiError.conflict('Ya existe un rol con ese codigo');

    return sequelize.transaction(async (transaction) => {
      const role = await Role.create(
        {
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          isSystem: false, // los roles creados desde el panel nunca son de sistema
        },
        { transaction },
      );

      await accessService.replacePermissions(role.id, input.permissions, transaction);
      return role;
    });
  },

  async cloneRole(actor: TokenPayload, roleId: number, input: { code: string; name: string; description?: string; reason?: string }) {
    const source = await Role.findByPk(roleId, { include: [{ model: Permission, as: 'permissions', through: { attributes: [] } }] });
    if (!source || source.archivedAt) throw ApiError.notFound('Rol no encontrado');
    return accessService.createRole(actor, {
      code: input.code,
      name: input.name,
      description: input.description ?? source.description ?? undefined,
      permissions: (source.permissions ?? []).map((permission) => permission.code),
      reason: input.reason,
    });
  },

  /** Cambia nombre y/o permisos de un rol. Los de sistema conservan su codigo. */
  async updateRole(
    actor: TokenPayload,
    roleId: number,
    input: { name?: string; description?: string; permissions?: string[]; reason?: string },
  ) {
    const role = await Role.findByPk(roleId);
    if (!role) throw ApiError.notFound('Rol no encontrado');

    if (input.permissions) {
      /*
       * EL ROL CLIENTE NO SE ARMA CON PERMISOS.
       *
       * Lo tiene TODA persona registrada en la tienda. Marcarle una sola casilla
       * convierte a cada cliente en personal del panel de golpe, y el aviso de la
       * pantalla ("no entra al panel") no lo impedia: era una frase, no una regla.
       * El nombre y la descripcion si se pueden retocar; los permisos, no.
       */
      if (PROTECTED_ROLES.includes(role.code)) {
        throw ApiError.unprocessable(
          'Los roles protegidos no cambian sus permisos. Crea un rol nuevo o clónalo para aplicar una variante controlada.',
        );
      }

      assertCanGrant(actor, input.permissions);
      assertPermissionDependencies(input.permissions);
      const security = roleSecurity(input.permissions);
      if (security.level === 'CRITICAL' && !actor.isSuperAdmin) throw ApiError.forbidden('Los cambios con permisos criticos requieren un superadmin');
      if (security.level !== 'NONE' && !input.reason) throw ApiError.unprocessable('Indica el motivo del cambio de permisos');

      await assertNoSelfLockout(
        actor,
        await effectivePermissionsOf(actor.sub),
        new Set([
          ...(await effectivePermissionsOf(actor.sub, { exceptRoleId: roleId })),
          ...input.permissions,
        ]),
      );
    }

    return sequelize.transaction(async (transaction) => {
      if (input.name) role.name = input.name;
      if (input.description !== undefined) role.description = input.description;
      await role.save({ transaction });

      if (input.permissions) {
        await accessService.replacePermissions(role.id, input.permissions, transaction);
      }

      return role;
    });
  },

  /** Deja el rol exactamente con los permisos indicados (borra y reescribe). */
  async replacePermissions(roleId: number, codes: string[], transaction?: Transaction) {
    const permissions = await Permission.findAll({
      where: { code: { [Op.in]: codes } },
      transaction,
    });

    if (permissions.length !== codes.length) {
      throw ApiError.badRequest('Alguno de los permisos enviados no existe');
    }

    await RolePermission.destroy({ where: { roleId }, transaction });

    for (const permission of permissions) {
      await RolePermission.create({ roleId, permissionId: permission.id }, { transaction });
    }
  },

  /** Archiva roles configurables sin borrar permisos ni historial. */
  async deleteRole(roleId: number, reason?: string) {
    if (!reason?.trim()) throw ApiError.unprocessable('Indica el motivo para archivar el rol');
    const role = await Role.findByPk(roleId);
    if (!role) throw ApiError.notFound('Rol no encontrado');

    if (role.isSystem || PROTECTED_ROLES.includes(role.code)) {
      throw ApiError.unprocessable('Los roles del sistema no se pueden borrar');
    }

    const assigned = await UserRole.count({ where: { roleId } });
    if (assigned > 0) {
      throw ApiError.unprocessable(
        `Ese rol todavia lo tienen ${assigned} usuario(s). Reasignalos antes de borrarlo.`,
      );
    }

    role.archivedAt = new Date();
    await role.save();
  },

  async restoreRole(actor: TokenPayload, roleId: number) {
    if (!actor.isSuperAdmin) throw ApiError.forbidden('Solo un superadmin puede restaurar roles archivados');
    const role = await Role.findByPk(roleId, { paranoid: false });
    if (!role) throw ApiError.notFound('Rol no encontrado');
    role.archivedAt = null;
    await role.save();
    return role;
  },

  async roleImpact(roleId: number) {
    const role = await Role.findByPk(roleId, { include: [{ model: Permission, as: 'permissions', through: { attributes: [] } }] });
    if (!role) throw ApiError.notFound('Rol no encontrado');
    const assignments = await UserRole.findAll({ where: { roleId }, include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'] }] });
    const userIds = [...new Set(assignments.map((assignment) => assignment.userId))];
    const users = userIds.length ? await User.findAll({ where: { id: { [Op.in]: userIds } }, attributes: ['id', 'email', 'firstName', 'lastName', 'status', 'isSuperAdmin', 'archivedAt'] }) : [];
    return {
      role: { id: role.id, code: role.code, name: role.name, permissions: (role.permissions ?? []).map((permission) => permission.code), security: { ...roleSecurity((role.permissions ?? []).map((permission) => permission.code)), requiresBranch: BRANCH_SCOPED_ROLES.includes(role.code) } },
      users: users.map((user) => ({ id: user.id, name: fullName(user), email: user.email, status: user.status, isSuperAdmin: user.isSuperAdmin, archivedAt: user.archivedAt, branchIds: assignments.filter((assignment) => assignment.userId === user.id && assignment.branchId !== null).map((assignment) => assignment.branchId), branches: assignments.filter((assignment) => assignment.userId === user.id).map((assignment) => assignment.branch?.name).filter(Boolean) })),
      totalUsers: users.length,
      assignments: assignments.length,
      activeUsers: users.filter((user) => user.status === USER_STATUS.ACTIVE && !user.archivedAt).length,
      globalAssignments: assignments.filter((assignment) => assignment.branchId === null).length,
      audit: await AuditLog.findAll({ where: { entity: 'roles', entityId: String(roleId) }, order: [['createdAt', 'DESC']], limit: 20, attributes: ['id', 'action', 'actorId', 'beforeJson', 'afterJson', 'createdAt'] }),
    };
  },

  /**
   * Centro operativo de equipos. Calcula cobertura desde las asignaciones RBAC
   * existentes, pero mantiene superadmins y alcances globales separados para no
   * maquillar una sucursal sin personal operativo.
   */
  async teamOverview() {
    const [staff, roles, branches, catalog] = await Promise.all([
      accessService.listStaff(),
      accessService.listRoles(),
      Branch.findAll({ where: { isActive: true }, attributes: ['id', 'name', 'isActive'], order: [['name', 'ASC']] }),
      teamCatalog(),
    ]);

    const userIds = staff.map((person) => person.id);
    const assignments = userIds.length
      ? await UserRole.findAll({ where: { userId: { [Op.in]: userIds } }, attributes: ['userId', 'roleId', 'branchId'], raw: true })
      : [];
    const catalogIds = catalog.map((team) => team.id).filter((id): id is number => id !== null);
    let teamAssignments: TeamAssignment[] = [];
    if (catalogIds.length) {
      try {
        teamAssignments = await TeamAssignment.findAll({ where: { teamId: { [Op.in]: catalogIds } }, raw: true });
      } catch {
        teamAssignments = [];
      }
    }
    const assignmentByUser = new Map<number, Array<{ roleId: number; branchId: number | null }>>();
    assignments.forEach((assignment) => {
      const rows = assignmentByUser.get(assignment.userId) ?? [];
      rows.push({ roleId: assignment.roleId, branchId: assignment.branchId });
      assignmentByUser.set(assignment.userId, rows);
    });

    const now = Date.now();
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;
    const activeStaff = staff.filter((person) => person.status === USER_STATUS.ACTIVE && !person.archivedAt);
    const superadmins = activeStaff.filter((person) => person.isSuperAdmin);
    const reviewUsers = activeStaff.filter((person) => {
      const dormant = !person.lastLoginAt || now - new Date(person.lastLoginAt).getTime() > ninetyDays;
      const operationalRoleWithoutScope = person.roles.some((role) =>
        catalog.some((team) => team.branchRequired && team.roleCodes.includes(role.code))
      ) && person.branchIds.length === 0;
      return person.mustChangePassword || dormant || (person.isSuperAdmin && !person.mfaEnabled) || operationalRoleWithoutScope;
    });

    const teamRows = catalog.map((team) => {
      const members = activeStaff
        .filter((person) => !person.isSuperAdmin && person.roles.some((role) => team.roleCodes.includes(role.code)))
        .map((person) => {
          const ownAssignments = assignmentByUser.get(person.id) ?? [];
          const globalScope = ownAssignments.some((assignment) => assignment.branchId === null && person.roles.some((role) => role.id === assignment.roleId && team.roleCodes.includes(role.code)));
          return {
            id: person.id,
            name: fullName(person),
            status: person.status,
            roles: person.roles.filter((role) => team.roleCodes.includes(role.code)).map((role) => role.name),
            branchIds: person.branchIds,
            globalScope,
            mustChangePassword: person.mustChangePassword,
          };
        });
      const noBranchScope = team.branchRequired ? members.filter((member) => member.branchIds.length === 0).length : 0;
      const globalScope = members.filter((member) => member.globalScope).length;
      const responsibilities = teamAssignments
        .filter((assignment) => assignment.teamId === team.id)
        .filter((assignment) => new Date(assignment.effectiveFrom).getTime() <= now && (!assignment.effectiveUntil || new Date(assignment.effectiveUntil).getTime() >= now))
        .map((assignment) => ({
          id: assignment.id,
          userId: assignment.userId,
          userName: fullName(staff.find((person) => person.id === assignment.userId) ?? { firstName: null, lastName: null, email: null }),
          branchId: assignment.branchId,
          responsibility: assignment.responsibility,
          availability: assignment.availability,
          effectiveFrom: assignment.effectiveFrom,
          effectiveUntil: assignment.effectiveUntil,
          reason: assignment.reason,
        }));
      const issues = [
        ...(members.length === 0 ? ['El equipo no tiene personal operativo'] : []),
        ...(noBranchScope > 0 ? [`${noBranchScope} persona(s) no tienen sucursal asignada`] : []),
        ...(globalScope > 0 ? [`${globalScope} persona(s) tienen alcance global`] : []),
        ...(team.id !== null && !responsibilities.some((assignment) => assignment.responsibility === TEAM_RESPONSIBILITY.PRIMARY && assignment.availability === TEAM_AVAILABILITY.AVAILABLE) ? ['No hay responsable principal disponible'] : []),
      ];
      return {
        ...team,
        activeMembers: members.length,
        noBranchScope,
        globalScope,
        health: members.length === 0 ? 'EMPTY' : issues.length ? 'REVIEW' : 'READY',
        issues,
        members,
        responsibilities,
        roles: roles.filter((role) => team.roleCodes.includes(role.code)).map((role) => ({ id: role.id, code: role.code, name: role.name, permissions: role.permissions })),
      };
    });

    const branchRows = branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      isActive: branch.isActive,
      teams: teamRows.map((team) => {
        const people = team.members.filter((member) => member.branchIds.includes(branch.id)).length;
        return { teamKey: team.key, people, minimum: team.minimumPerBranch, covered: !team.branchRequired || people >= team.minimumPerBranch };
      }),
    }));

    const roleCodesWithTeam = new Set<string>(catalog.flatMap((team) => team.roleCodes));
    const rolesWithoutTeam = roles.filter((role) => role.code !== ROLES.CUSTOMER && role.permissions.length > 0 && !roleCodesWithTeam.has(role.code)).map((role) => ({ id: role.id, code: role.code, name: role.name }));
    const usersWithoutTeam = activeStaff.filter((person) => !person.isSuperAdmin && !person.roles.some((role) => roleCodesWithTeam.has(role.code))).map((person) => ({ id: person.id, name: fullName(person) }));

    const [pendingOrders, openKitchenTickets, unassignedDeliveries, pendingPayments, pendingPurchases, openComplaints] = await Promise.all([
      Order.count({ where: { status: { [Op.in]: [ORDER_STATUS.CONFIRMED, ORDER_STATUS.PREPARING, ORDER_STATUS.READY, ORDER_STATUS.OUT_FOR_DELIVERY] } } }),
      KitchenTicket.count({ where: { status: { [Op.in]: [TICKET_STATUS.QUEUED, TICKET_STATUS.ACCEPTED, TICKET_STATUS.PREPARING, TICKET_STATUS.ON_HOLD] } } }),
      Delivery.count({ where: { status: DELIVERY_STATUS.PENDING } }),
      Payment.count({ where: { payableType: 'ORDER', status: 'PENDING' } }),
      PurchaseOrder.count({ where: { status: { [Op.in]: [PURCHASE_ORDER_STATUS.DRAFT, PURCHASE_ORDER_STATUS.APPROVED, PURCHASE_ORDER_STATUS.ORDERED, PURCHASE_ORDER_STATUS.PARTIALLY_RECEIVED] } } }),
      Complaint.count({ where: { status: { [Op.in]: [COMPLAINT_STATUS.RECEIVED, COMPLAINT_STATUS.IN_PROGRESS] } } }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      teams: teamRows,
      branches: branchRows,
      metrics: { pendingOrders, openKitchenTickets, unassignedDeliveries, pendingPayments, pendingPurchases, openComplaints },
      governance: {
        activeStaff: activeStaff.filter((person) => !person.isSuperAdmin).length,
        superadmins: superadmins.length,
        superadminsWithoutMfa: superadmins.filter((person) => !person.mfaEnabled).length,
        reviewAlerts: reviewUsers.length,
        blockedUsers: staff.filter((person) => person.status === USER_STATUS.BLOCKED && !person.archivedAt).length,
        forcedPasswordUsers: activeStaff.filter((person) => person.mustChangePassword).length,
        dormantUsers: activeStaff.filter((person) => !person.lastLoginAt || now - new Date(person.lastLoginAt).getTime() > ninetyDays).length,
        globalScopeUsers: teamRows.reduce((sum, team) => sum + team.globalScope, 0),
        rolesWithoutTeam,
        usersWithoutTeam,
      },
    };
  },

  async listTeams(includeInactive = false) {
    return Team.findAll({ where: includeInactive ? {} : { isActive: true }, order: [['sortOrder', 'ASC'], ['name', 'ASC']] });
  },

  async createTeam(actor: TokenPayload, input: { key: string; name: string; description?: string; route: string; icon?: string; roleCodes: string[]; branchRequired?: boolean; minimumPerBranch?: number; sortOrder?: number }) {
    if (!actor.isSuperAdmin) throw ApiError.forbidden('Solo un superadmin puede configurar equipos');
    const exists = await Team.findOne({ where: { key: input.key } });
    if (exists) throw ApiError.conflict('Ya existe un equipo con ese codigo');
    return Team.create({ ...input, description: input.description ?? null, icon: input.icon ?? null, roleCodes: input.roleCodes, branchRequired: input.branchRequired ?? false, minimumPerBranch: input.minimumPerBranch ?? 0, sortOrder: input.sortOrder ?? 0, isActive: true });
  },

  async updateTeam(actor: TokenPayload, teamId: number, input: Partial<{ name: string; description: string | null; route: string; icon: string | null; roleCodes: string[]; branchRequired: boolean; minimumPerBranch: number; sortOrder: number; isActive: boolean }>) {
    if (!actor.isSuperAdmin) throw ApiError.forbidden('Solo un superadmin puede configurar equipos');
    const team = await Team.findByPk(teamId);
    if (!team) throw ApiError.notFound('Equipo no encontrado');
    await team.update(input);
    return team;
  },

  async archiveTeam(actor: TokenPayload, teamId: number) {
    if (!actor.isSuperAdmin) throw ApiError.forbidden('Solo un superadmin puede configurar equipos');
    const team = await Team.findByPk(teamId);
    if (!team) throw ApiError.notFound('Equipo no encontrado');
    await team.update({ isActive: false });
    return team;
  },

  async createTeamAssignment(actor: TokenPayload, teamId: number, input: { userId: number; branchId?: number | null; responsibility?: 'PRIMARY' | 'BACKUP'; effectiveFrom?: Date; effectiveUntil?: Date | null; availability?: 'AVAILABLE' | 'AWAY' | 'UNAVAILABLE'; reason?: string | null }) {
    if (!actor.isSuperAdmin) throw ApiError.forbidden('Solo un superadmin puede asignar responsables');
    const [team, user] = await Promise.all([
      Team.findByPk(teamId),
      User.findByPk(input.userId, { include: [{ model: Role, as: 'roles', through: { attributes: [] } }] }),
    ]);
    if (!team || !team.isActive) throw ApiError.notFound('Equipo no encontrado o inactivo');
    if (!user || user.status !== USER_STATUS.ACTIVE || user.archivedAt) throw ApiError.unprocessable('El responsable debe ser un usuario activo');
    if (user.isSuperAdmin) throw ApiError.unprocessable('El superadmin se mantiene como gobierno global y no se asigna como cobertura operativa');
    if (!(user.roles ?? []).some((role) => team.roleCodes.includes(role.code))) throw ApiError.unprocessable('El usuario no tiene un rol relacionado con este equipo');
    if (input.branchId) {
      const branch = await Branch.findOne({ where: { id: input.branchId, isActive: true }, attributes: ['id'] });
      if (!branch) throw ApiError.badRequest('La sucursal no existe o esta inactiva');
    }
    if (team.branchRequired && !input.branchId) throw ApiError.unprocessable('Este equipo requiere una sucursal para asignar responsables');
    const effectiveFrom = input.effectiveFrom ?? new Date();
    const effectiveUntil = input.effectiveUntil ?? null;
    if (input.responsibility === TEAM_RESPONSIBILITY.PRIMARY) {
      const existing = await TeamAssignment.findAll({ where: { teamId, branchId: input.branchId ?? null, responsibility: TEAM_RESPONSIBILITY.PRIMARY, availability: TEAM_AVAILABILITY.AVAILABLE } });
      const start = effectiveFrom.getTime();
      const end = effectiveUntil?.getTime() ?? Number.POSITIVE_INFINITY;
      const overlap = existing.find((assignment) => {
        const currentStart = new Date(assignment.effectiveFrom).getTime();
        const currentEnd = assignment.effectiveUntil ? new Date(assignment.effectiveUntil).getTime() : Number.POSITIVE_INFINITY;
        return start <= currentEnd && currentStart <= end;
      });
      if (overlap) throw ApiError.conflict('Ya existe un responsable principal vigente para este equipo y sucursal');
    }
    return TeamAssignment.create({ teamId, userId: input.userId, branchId: input.branchId ?? null, responsibility: input.responsibility ?? TEAM_RESPONSIBILITY.BACKUP, effectiveFrom, effectiveUntil, availability: input.availability ?? TEAM_AVAILABILITY.AVAILABLE, reason: input.reason ?? null, createdBy: actor.sub });
  },

  async updateTeamAssignment(actor: TokenPayload, teamId: number, assignmentId: number, input: Partial<{ branchId: number | null; responsibility: 'PRIMARY' | 'BACKUP'; effectiveFrom: Date; effectiveUntil: Date | null; availability: 'AVAILABLE' | 'AWAY' | 'UNAVAILABLE'; reason: string | null }>) {
    if (!actor.isSuperAdmin) throw ApiError.forbidden('Solo un superadmin puede asignar responsables');
    const assignment = await TeamAssignment.findByPk(assignmentId);
    if (!assignment) throw ApiError.notFound('Responsabilidad no encontrada');
    if (assignment.teamId !== teamId) throw ApiError.notFound('Responsabilidad no encontrada');
    const team = await Team.findByPk(assignment.teamId);
    if (!team) throw ApiError.notFound('Equipo no encontrado');
    const branchId = input.branchId === undefined ? assignment.branchId : input.branchId;
    if (team.branchRequired && !branchId) throw ApiError.unprocessable('Este equipo requiere una sucursal para asignar responsables');
    if (branchId) {
      const branch = await Branch.findOne({ where: { id: branchId, isActive: true }, attributes: ['id'] });
      if (!branch) throw ApiError.badRequest('La sucursal no existe o esta inactiva');
    }
    const responsibility = input.responsibility ?? assignment.responsibility;
    const availability = input.availability ?? assignment.availability;
    if (responsibility === TEAM_RESPONSIBILITY.PRIMARY && availability === TEAM_AVAILABILITY.AVAILABLE) {
      const effectiveFrom = input.effectiveFrom ?? assignment.effectiveFrom;
      const effectiveUntil = input.effectiveUntil === undefined ? assignment.effectiveUntil : input.effectiveUntil;
      const existing = await TeamAssignment.findAll({ where: { teamId: assignment.teamId, branchId: branchId ?? null, responsibility: TEAM_RESPONSIBILITY.PRIMARY, availability: TEAM_AVAILABILITY.AVAILABLE, id: { [Op.ne]: assignment.id } } });
      const start = new Date(effectiveFrom).getTime();
      const end = effectiveUntil ? new Date(effectiveUntil).getTime() : Number.POSITIVE_INFINITY;
      if (existing.some((row) => start <= (row.effectiveUntil ? new Date(row.effectiveUntil).getTime() : Number.POSITIVE_INFINITY) && new Date(row.effectiveFrom).getTime() <= end)) throw ApiError.conflict('Ya existe un responsable principal vigente para ese periodo');
    }
    await assignment.update(input);
    return assignment;
  },

  async removeTeamAssignment(actor: TokenPayload, teamId: number, assignmentId: number) {
    if (!actor.isSuperAdmin) throw ApiError.forbidden('Solo un superadmin puede retirar responsables');
    const assignment = await TeamAssignment.findByPk(assignmentId);
    if (!assignment) throw ApiError.notFound('Responsabilidad no encontrada');
    if (assignment.teamId !== teamId) throw ApiError.notFound('Responsabilidad no encontrada');
    await assignment.destroy();
  },

  /** Personal interno: todos los que tienen algun rol distinto de "cliente". */
  async listStaff(filters: { search?: string; status?: string; roleId?: number; branchId?: number; includeArchived?: boolean } = {}) {
    const customerRole = await Role.findOne({ where: { code: ROLES.CUSTOMER } });

    const users = await User.findAll({
      where: {
        ...(filters.includeArchived ? {} : { archivedAt: null }),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.search ? { [Op.or]: [
          { email: { [Op.like]: `%${filters.search}%` } },
          { firstName: { [Op.like]: `%${filters.search}%` } },
          { lastName: { [Op.like]: `%${filters.search}%` } },
        ] } : {}),
      },
      include: [
        {
          model: Role,
          as: 'roles',
          through: { attributes: [] },
          where: {
            ...(customerRole ? { id: { [Op.ne]: customerRole.id } } : {}),
            ...(filters.roleId ? { id: filters.roleId } : {}),
          },
          required: true,
        },
      ],
      order: [['id', 'ASC']],
    });

    const assignments = await UserRole.findAll({
      where: {
        userId: { [Op.in]: users.map((user) => user.id) },
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
      },
      include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'] }],
    });

    return users.map((user) => {
      const own = assignments.filter((assignment) => assignment.userId === user.id);

      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status,
        isSuperAdmin: user.isSuperAdmin,
        mustChangePassword: user.mustChangePassword,
        mfaEnabled: user.mfaEnabled,
        archivedAt: user.archivedAt,
        version: user.version,
        lastLoginAt: user.lastLoginAt,
        roles: (user.roles ?? []).map((role) => ({ id: role.id, code: role.code, name: role.name })),
        branchIds: [
          ...new Set(
            own
              .map((assignment) => assignment.branchId)
              .filter((branchId): branchId is number => branchId !== null),
          ),
        ],
      };
    });
  },

  /** Clientes finales: separados del personal interno para no mezclar RBAC con CRM. */
  async listCustomers(filters: { search?: string; status?: string } = {}) {
    const customerRole = await Role.findOne({ where: { code: ROLES.CUSTOMER } });
    if (!customerRole) return [];
    const users = await User.findAll({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.search ? { [Op.or]: [
          { email: { [Op.like]: `%${filters.search}%` } },
          { firstName: { [Op.like]: `%${filters.search}%` } },
          { lastName: { [Op.like]: `%${filters.search}%` } },
        ] } : {}),
      },
      include: [{ model: Role, as: 'roles', through: { attributes: [] }, where: { id: customerRole.id }, required: true }],
      order: [['createdAt', 'DESC']],
      limit: 500,
    });
    const orders = users.length ? await Order.findAll({
      where: { userId: { [Op.in]: users.map((user) => user.id) } },
      attributes: ['userId', 'grandTotal', 'createdAt'],
      order: [['createdAt', 'DESC']],
    }) : [];
    return users.map((user) => {
      const ownOrders = orders.filter((order) => order.userId === user.id);
      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        status: user.status,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        orderCount: ownOrders.length,
        totalSpent: ownOrders.reduce((sum, order) => sum + Number(order.grandTotal), 0),
        lastOrderAt: ownOrders[0]?.createdAt ?? null,
        version: user.version,
      };
    });
  },

  async setCustomerStatus(actor: TokenPayload, userId: number, status: 'ACTIVE' | 'BLOCKED', expectedVersion?: number) {
    const customerRole = await Role.findOne({ where: { code: ROLES.CUSTOMER } });
    const user = await User.findByPk(userId);
    if (!user || !customerRole) throw ApiError.notFound('Cliente no encontrado');
    const assignment = await UserRole.findOne({ where: { userId, roleId: customerRole.id } });
    if (!assignment || user.isSuperAdmin) throw ApiError.notFound('Cliente no encontrado');
    if (expectedVersion !== undefined && expectedVersion !== user.version) throw ApiError.conflict('El cliente cambio mientras lo editabas');
    user.status = status;
    user.tokenVersion += 1;
    user.version += 1;
    await user.save();
    revokeSessionCache(user.id);
    await UserSession.update({ revokedAt: new Date() }, { where: { userId, revokedAt: null } });
    return user;
  },

  /** Crea un miembro del personal y le asigna roles (opcionalmente a una sucursal). */
  async createStaff(
    actor: TokenPayload,
    input: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      roleIds: number[];
      branchId?: number | null;
      branchIds?: number[];
    },
  ) {
    // `paranoid: false`: el indice unico cuenta tambien las cuentas dadas de baja
    // en blando, asi que sin esto el choque salia como un 409 sin campo.
    const existing = await User.findOne({ where: { email: input.email }, paranoid: false });
    if (existing) throw ApiError.conflict('Ese email ya esta registrado');

    const branchIds = normalizedBranchIds(input);
    assertActorBranchAssignments(actor, branchIds);
    await assertBranchScope(input.roleIds, branchIds);
    await accessService.assertCanAssignRoles(actor, input.roleIds);
    const roleCodes = await roleCodesOf(input.roleIds);

    return sequelize.transaction(async (transaction) => {
      const user = await User.create(
        {
          email: input.email,
          phone: null,
          passwordHash: await hashPassword(input.password),
          firstName: input.firstName,
          lastName: input.lastName,
          status: USER_STATUS.ACTIVE,
          mustChangePassword: true,
          passwordChangedAt: null,
          version: 1,
          emailVerifiedAt: new Date(),
          lastLoginAt: null,
        },
        { transaction },
      );

      for (const roleId of input.roleIds) {
        const scopes = branchIds.length ? branchIds : [null];
        for (const scope of scopes) {
          await UserRole.create({ userId: user.id, roleId, branchId: scope }, { transaction });
        }
      }

      await syncDriverProfile(user, roleCodes, branchIds[0] ?? null, transaction);

      return user;
    });
  },

  /** Reemplaza los roles (y la sucursal) de un usuario. */
  async updateStaffRoles(
    actor: TokenPayload,
    userId: number,
    input: { roleIds: number[]; branchId?: number | null; branchIds?: number[]; expectedVersion?: number },
  ) {
    const user = await User.findByPk(userId);
    if (!user) throw ApiError.notFound('Usuario no encontrado');
    if (input.expectedVersion !== undefined && input.expectedVersion !== user.version) {
      throw ApiError.conflict('El usuario cambio mientras lo editabas. Recarga los accesos e intentalo otra vez');
    }

    await assertCanManageStaffAccount(actor, user);

    const branchIds = normalizedBranchIds(input);
    assertActorBranchAssignments(actor, branchIds);
    await assertBranchScope(input.roleIds, branchIds);
    await accessService.assertCanAssignRoles(actor, input.roleIds);

    if (userId === actor.sub) {
      const roles = await Role.findAll({
        where: { id: { [Op.in]: input.roleIds } },
        include: [{ model: Permission, as: 'permissions', through: { attributes: [] } }],
      });
      const next = new Set<string>();
      roles.forEach((role) => role.permissions?.forEach((p) => next.add(p.code)));
      await assertNoSelfLockout(actor, await effectivePermissionsOf(actor.sub), next);
    }

    const roleCodes = await roleCodesOf(input.roleIds);

    const updated = await sequelize.transaction(async (transaction) => {
      await UserRole.destroy({ where: { userId }, transaction });

      for (const roleId of input.roleIds) {
        const scopes = branchIds.length ? branchIds : [null];
        for (const scope of scopes) {
          await UserRole.create({ userId, roleId, branchId: scope }, { transaction });
        }
      }

      await syncDriverProfile(user, roleCodes, branchIds[0] ?? null, transaction);

      /*
       * Los permisos y la sucursal viajan DENTRO del token. Sin subir la version,
       * un cambio de rol no surtia efecto hasta que caducara la sesion en curso:
       * quien acaba de perder el reparto seguia cerrando entregas 15 minutos.
       */
      user.tokenVersion += 1;
      user.version += 1;
      await user.save({ transaction });

      return user;
    });

    // La revalidacion de `authenticate` cachea unos segundos: se descarta la
    // entrada para que el cambio se note en la peticion siguiente, no dentro de un rato.
    revokeSessionCache(userId);
    return updated;
  },

  /** No se puede asignar un rol que contenga permisos que el actor no tiene. */
  async assertCanAssignRoles(actor: TokenPayload, roleIds: number[]) {
    if (actor.isSuperAdmin) return;

    const roles = await Role.findAll({
      where: { id: { [Op.in]: roleIds } },
      include: [{ model: Permission, as: 'permissions', through: { attributes: [] } }],
    });

    if (roles.length !== roleIds.length) throw ApiError.badRequest('Algun rol no existe');

    if (!actor.isSuperAdmin && roles.some((role) => role.code === ROLES.ADMIN || role.code === ROLES.CUSTOMER)) {
      throw ApiError.forbidden('Solo un superadmin puede asignar cuentas de administrador o cliente');
    }

    const codes = new Set<string>();
    roles.forEach((role) => role.permissions?.forEach((p) => codes.add(p.code)));

    assertCanGrant(actor, [...codes]);
  },

  /**
   * Activar o quitar el superadmin.
   * Solo un superadmin puede hacerlo, y NUNCA puede quedar el sistema sin ninguno.
   */
  async setSuperAdmin(actor: TokenPayload, userId: number, value: boolean, expectedVersion?: number) {
    if (!actor.isSuperAdmin) {
      throw ApiError.forbidden('Solo un superadmin puede nombrar a otro superadmin');
    }

    const user = await User.findByPk(userId);
    if (!user) throw ApiError.notFound('Usuario no encontrado');
    if (user.id === actor.sub) throw ApiError.unprocessable('Otra persona superadmin debe aprobar el cambio sobre tu propia cuenta');
    if (expectedVersion !== undefined && expectedVersion !== user.version) throw ApiError.conflict('El usuario cambio mientras lo editabas. Recarga la pantalla');

    if (!value) {
      const remaining = await User.count({
        where: { isSuperAdmin: true, id: { [Op.ne]: userId }, status: USER_STATUS.ACTIVE },
      });

      if (remaining === 0) {
        throw ApiError.unprocessable(
          'No puedes quitar al ultimo superadmin: el sistema se quedaria sin dueno',
        );
      }
    }

    user.isSuperAdmin = value;
    // La marca tambien viaja en el token: sin subir la version, a quien se le
    // retira sigue saltandose la verificacion de permisos hasta que caduque.
    user.tokenVersion += 1;
    user.version += 1;
    await user.save();
    revokeSessionCache(user.id);
    return user;
  },

  /** Desactivar a alguien del personal (no se borra: se bloquea). */
  async setStatus(actor: TokenPayload, userId: number, status: string, expectedVersion?: number) {
    const user = await User.findByPk(userId);
    if (!user) throw ApiError.notFound('Usuario no encontrado');
    if (user.archivedAt && status === USER_STATUS.ACTIVE) throw ApiError.conflict('Una cuenta archivada no puede reactivarse sin restaurarla');
    if (expectedVersion !== undefined && expectedVersion !== user.version) throw ApiError.conflict('El usuario cambio mientras lo editabas. Recarga la pantalla');

    await assertCanManageStaffAccount(actor, user);

    if (user.id === actor.sub) {
      throw ApiError.unprocessable('No puedes bloquearte a ti mismo');
    }

    if (user.isSuperAdmin && status !== USER_STATUS.ACTIVE) {
      const remaining = await User.count({
        where: { isSuperAdmin: true, id: { [Op.ne]: userId }, status: USER_STATUS.ACTIVE },
      });
      if (remaining === 0) {
        throw ApiError.unprocessable('No puedes bloquear al ultimo superadmin activo');
      }
    }

    user.status = status as never;
    /*
     * Bloquear tiene que cortar la sesion EN CURSO, no la siguiente.
     *
     * El estado por si solo no revocaba nada: el token es autocontenido y seguia
     * valido hasta 15 minutos, con su portador cancelando pedidos o devolviendo
     * dinero. Subir la version invalida tambien el refresh, y descartar la sesion
     * cacheada hace que el corte se note ya.
     */
    user.tokenVersion += 1;
    user.version += 1;
    await user.save();
    revokeSessionCache(user.id);
    return user;
  },

  async archiveStaff(actor: TokenPayload, userId: number, expectedVersion?: number) {
    const user = await User.findByPk(userId);
    if (!user) throw ApiError.notFound('Usuario no encontrado');
    if (user.id === actor.sub) throw ApiError.unprocessable('No puedes archivar tu propia cuenta');
    await assertCanManageStaffAccount(actor, user);
    if (user.isSuperAdmin) throw ApiError.forbidden('Retira el superadmin antes de archivar la cuenta');
    if (expectedVersion !== undefined && expectedVersion !== user.version) throw ApiError.conflict('El usuario cambio mientras lo editabas. Recarga la pantalla');
    user.archivedAt = new Date();
    user.status = USER_STATUS.BLOCKED;
    user.tokenVersion += 1;
    user.version += 1;
    await user.save();
    await UserSession.update({ revokedAt: new Date() }, { where: { userId, revokedAt: null } });
    revokeSessionCache(userId);
    return user;
  },

  async restoreStaff(actor: TokenPayload, userId: number, expectedVersion?: number) {
    if (!actor.isSuperAdmin) throw ApiError.forbidden('Solo un superadmin puede restaurar cuentas archivadas');
    const user = await User.findByPk(userId);
    if (!user) throw ApiError.notFound('Usuario no encontrado');
    if (expectedVersion !== undefined && expectedVersion !== user.version) throw ApiError.conflict('El usuario cambio mientras lo editabas');
    user.archivedAt = null;
    user.status = USER_STATUS.ACTIVE;
    user.version += 1;
    await user.save();
    return user;
  },

  async listSessions(actor: TokenPayload, userId: number) {
    if (!actor.isSuperAdmin && actor.sub !== userId) throw ApiError.forbidden('Solo puedes consultar tus propias sesiones');
    const rows = await UserSession.findAll({ where: { userId }, order: [['lastSeenAt', 'DESC']] });
    return rows.map((row) => ({ id: row.id, createdAt: row.createdAt, lastSeenAt: row.lastSeenAt, expiresAt: row.expiresAt, revokedAt: row.revokedAt, ip: row.ip, userAgent: row.userAgent, deviceLabel: row.deviceLabel, active: !row.revokedAt && row.expiresAt > new Date() }));
  },

  async revokeSessions(actor: TokenPayload, userId: number, sessionId?: number) {
    if (!actor.isSuperAdmin && actor.sub !== userId) throw ApiError.forbidden('Solo puedes revocar tus propias sesiones');
    const where = sessionId ? { id: sessionId, userId, revokedAt: null } : { userId, revokedAt: null };
    const [updated] = await UserSession.update({ revokedAt: new Date() }, { where });
    return { revoked: updated };
  },

  async prepareMfa(actor: TokenPayload, userId: number) {
    if (!actor.isSuperAdmin && actor.sub !== userId) throw ApiError.forbidden('Solo puedes configurar tu propio MFA');
    const user = await User.findByPk(userId);
    if (!user) throw ApiError.notFound('Usuario no encontrado');
    const secret = randomBase32();
    user.mfaSecretEncrypted = encryptTotpSecret(secret);
    user.mfaEnabled = false;
    user.version += 1;
    await user.save();
    const issuer = 'Misky Challay';
    const label = encodeURIComponent(`${issuer}:${user.email ?? user.id}`);
    return { secret, otpauthUrl: `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`, version: user.version };
  },

  async confirmMfa(actor: TokenPayload, userId: number, code: string) {
    if (!actor.isSuperAdmin && actor.sub !== userId) throw ApiError.forbidden('Solo puedes configurar tu propio MFA');
    const user = await User.findByPk(userId);
    if (!user?.mfaSecretEncrypted) throw ApiError.badRequest('Primero genera una configuracion MFA');
    if (!verifyTotp(decryptTotpSecret(user.mfaSecretEncrypted), code)) throw ApiError.unprocessable('El codigo MFA no es valido');
    const recoveryCodes = Array.from({ length: 8 }, () => crypto.randomBytes(5).toString('hex').toUpperCase());
    user.mfaEnabled = true;
    user.mfaRecoveryCodesJson = recoveryCodes.map((code) => crypto.createHash('sha256').update(code).digest('hex'));
    user.version += 1;
    await user.save();
    return { enabled: true, recoveryCodes, version: user.version };
  },

  async disableMfa(actor: TokenPayload, userId: number, expectedVersion?: number) {
    if (!actor.isSuperAdmin) throw ApiError.forbidden('Solo un superadmin puede desactivar MFA');
    const user = await User.findByPk(userId);
    if (!user) throw ApiError.notFound('Usuario no encontrado');
    if (expectedVersion !== undefined && expectedVersion !== user.version) throw ApiError.conflict('El usuario cambio mientras lo editabas');
    user.mfaEnabled = false;
    user.mfaSecretEncrypted = null;
    user.mfaRecoveryCodesJson = null;
    user.version += 1;
    await user.save();
    return { enabled: false, version: user.version };
  },
};

export const ACCESS_PERMISSIONS = {
  USER_READ: PERMISSIONS.USER_READ,
  USER_MANAGE: PERMISSIONS.USER_MANAGE,
  ROLE_READ: PERMISSIONS.ROLE_READ,
  ROLE_MANAGE: PERMISSIONS.ROLE_MANAGE,
};

export type AccessService = typeof accessService;
