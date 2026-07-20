import { Op, type Transaction } from 'sequelize';
import {
  Branch,
  Permission,
  Role,
  RolePermission,
  User,
  UserRole,
  sequelize,
} from '@database/models';
import { PERMISSION_CATALOG, PERMISSIONS, ROLES, USER_STATUS } from '@config/constants';
import { ApiError } from '@shared/errors/ApiError';
import { hashPassword } from '@shared/utils/password';
import type { TokenPayload } from '@shared/utils/jwt';

/** Roles que sostienen la operacion: se pueden editar sus permisos, pero no borrarlos. */
const PROTECTED_ROLES: string[] = [ROLES.CUSTOMER, ROLES.ADMIN];
const BRANCH_SCOPED_ROLES: string[] = [
  ROLES.KITCHEN,
  ROLES.DISPATCHER,
  ROLES.DRIVER,
  ROLES.BRANCH_ADMIN,
];

const assertBranchScope = async (roleIds: number[], branchId?: number | null): Promise<void> => {
  const roles = await Role.findAll({ where: { id: { [Op.in]: roleIds } } });
  if (roles.length !== roleIds.length) throw ApiError.badRequest('Algun rol no existe');

  const requiresBranch = roles.some((role) => BRANCH_SCOPED_ROLES.includes(role.code));
  if (requiresBranch && !branchId) {
    throw ApiError.unprocessable(
      'Cocina, reparto y administracion de sucursal requieren una cocina asignada',
    );
  }
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

export const accessService = {
  /** Los permisos los define el codigo; la UI solo los pinta agrupados. */
  listPermissions() {
    return PERMISSION_CATALOG;
  },

  async listRoles() {
    const roles = await Role.findAll({
      include: [{ model: Permission, as: 'permissions', through: { attributes: [] } }],
      order: [['name', 'ASC']],
    });

    const counts = await UserRole.findAll({
      attributes: ['roleId'],
      raw: true,
    });

    const usersByRole = counts.reduce<Record<number, number>>((acc, row) => {
      acc[row.roleId] = (acc[row.roleId] ?? 0) + 1;
      return acc;
    }, {});

    return roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      isProtected: PROTECTED_ROLES.includes(role.code),
      userCount: usersByRole[role.id] ?? 0,
      permissions: (role.permissions ?? []).map((permission) => permission.code),
    }));
  },

  /** Crea un rol nuevo con los permisos marcados. */
  async createRole(
    actor: TokenPayload,
    input: { code: string; name: string; description?: string; permissions: string[] },
  ) {
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

  /** Cambia nombre y/o permisos de un rol. Los de sistema conservan su codigo. */
  async updateRole(
    actor: TokenPayload,
    roleId: number,
    input: { name?: string; description?: string; permissions?: string[] },
  ) {
    const role = await Role.findByPk(roleId);
    if (!role) throw ApiError.notFound('Rol no encontrado');

    if (input.permissions) assertCanGrant(actor, input.permissions);

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

  /** No se borra un rol de sistema ni uno que todavia tenga gente asignada. */
  async deleteRole(roleId: number) {
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

    await RolePermission.destroy({ where: { roleId } });
    await role.destroy();
  },

  /** Personal interno: todos los que tienen algun rol distinto de "cliente". */
  async listStaff() {
    const customerRole = await Role.findOne({ where: { code: ROLES.CUSTOMER } });

    const users = await User.findAll({
      include: [
        {
          model: Role,
          as: 'roles',
          through: { attributes: [] },
          where: customerRole ? { id: { [Op.ne]: customerRole.id } } : undefined,
          required: true,
        },
      ],
      order: [['id', 'ASC']],
    });

    const assignments = await UserRole.findAll({
      where: { userId: { [Op.in]: users.map((user) => user.id) } },
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
    },
  ) {
    const existing = await User.findOne({ where: { email: input.email } });
    if (existing) throw ApiError.conflict('Ese email ya esta registrado');

    await assertBranchScope(input.roleIds, input.branchId);
    await accessService.assertCanAssignRoles(actor, input.roleIds);

    return sequelize.transaction(async (transaction) => {
      const user = await User.create(
        {
          email: input.email,
          phone: null,
          passwordHash: await hashPassword(input.password),
          firstName: input.firstName,
          lastName: input.lastName,
          status: USER_STATUS.ACTIVE,
          emailVerifiedAt: new Date(),
          lastLoginAt: null,
        },
        { transaction },
      );

      for (const roleId of input.roleIds) {
        await UserRole.create(
          { userId: user.id, roleId, branchId: input.branchId ?? null },
          { transaction },
        );
      }

      return user;
    });
  },

  /** Reemplaza los roles (y la sucursal) de un usuario. */
  async updateStaffRoles(
    actor: TokenPayload,
    userId: number,
    input: { roleIds: number[]; branchId?: number | null },
  ) {
    const user = await User.findByPk(userId);
    if (!user) throw ApiError.notFound('Usuario no encontrado');

    // Un superadmin solo lo toca otro superadmin.
    if (user.isSuperAdmin && !actor.isSuperAdmin) {
      throw ApiError.forbidden('Solo un superadmin puede modificar a otro superadmin');
    }

    await assertBranchScope(input.roleIds, input.branchId);
    await accessService.assertCanAssignRoles(actor, input.roleIds);

    return sequelize.transaction(async (transaction) => {
      await UserRole.destroy({ where: { userId }, transaction });

      for (const roleId of input.roleIds) {
        await UserRole.create(
          { userId, roleId, branchId: input.branchId ?? null },
          { transaction },
        );
      }

      return user;
    });
  },

  /** No se puede asignar un rol que contenga permisos que el actor no tiene. */
  async assertCanAssignRoles(actor: TokenPayload, roleIds: number[]) {
    if (actor.isSuperAdmin) return;

    const roles = await Role.findAll({
      where: { id: { [Op.in]: roleIds } },
      include: [{ model: Permission, as: 'permissions', through: { attributes: [] } }],
    });

    if (roles.length !== roleIds.length) throw ApiError.badRequest('Algun rol no existe');

    const codes = new Set<string>();
    roles.forEach((role) => role.permissions?.forEach((p) => codes.add(p.code)));

    assertCanGrant(actor, [...codes]);
  },

  /**
   * Activar o quitar el superadmin.
   * Solo un superadmin puede hacerlo, y NUNCA puede quedar el sistema sin ninguno.
   */
  async setSuperAdmin(actor: TokenPayload, userId: number, value: boolean) {
    if (!actor.isSuperAdmin) {
      throw ApiError.forbidden('Solo un superadmin puede nombrar a otro superadmin');
    }

    const user = await User.findByPk(userId);
    if (!user) throw ApiError.notFound('Usuario no encontrado');

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
    await user.save();
    return user;
  },

  /** Desactivar a alguien del personal (no se borra: se bloquea). */
  async setStatus(actor: TokenPayload, userId: number, status: string) {
    const user = await User.findByPk(userId);
    if (!user) throw ApiError.notFound('Usuario no encontrado');

    if (user.isSuperAdmin && !actor.isSuperAdmin) {
      throw ApiError.forbidden('Solo un superadmin puede bloquear a otro superadmin');
    }

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
    await user.save();
    return user;
  },
};

export const ACCESS_PERMISSIONS = {
  USER_READ: PERMISSIONS.USER_READ,
  USER_MANAGE: PERMISSIONS.USER_MANAGE,
  ROLE_READ: PERMISSIONS.ROLE_READ,
  ROLE_MANAGE: PERMISSIONS.ROLE_MANAGE,
};

export type AccessService = typeof accessService;
