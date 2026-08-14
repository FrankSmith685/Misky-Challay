import { Op, type Transaction } from 'sequelize';
import {
  Branch,
  Driver,
  Permission,
  Role,
  RolePermission,
  User,
  UserRole,
  sequelize,
} from '@database/models';
import { DRIVER_STATUS } from '@database/models/driver.model';
import { PERMISSION_CATALOG, PERMISSIONS, ROLES, USER_STATUS } from '@config/constants';
import { ApiError } from '@shared/errors/ApiError';
import { hashPassword } from '@shared/utils/password';
import { revokeSessionCache } from '@middlewares/auth.middleware';
import type { TokenPayload } from '@shared/utils/jwt';

/**
 * Roles que sostienen la operacion: no se borran. El panel tampoco ofrece editar
 * sus permisos, y el de Cliente ademas lo rechaza el servidor (ver `updateRole`).
 */
const PROTECTED_ROLES: string[] = [ROLES.CUSTOMER, ROLES.ADMIN];
const BRANCH_SCOPED_ROLES: string[] = [
  ROLES.KITCHEN,
  ROLES.DISPATCHER,
  ROLES.DRIVER,
  ROLES.BRANCH_ADMIN,
];

/**
 * Permisos que abren la puerta por la que se entro a cambiarlos. Quitarselos a uno
 * mismo no es un cambio de configuracion: es cerrarse por dentro, y sin superadmin
 * a mano no hay pantalla desde la cual deshacerlo.
 */
const SELF_LOCKOUT_PERMISSIONS: string[] = [PERMISSIONS.ROLE_MANAGE, PERMISSIONS.USER_MANAGE];

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

    if (input.permissions) {
      /*
       * EL ROL CLIENTE NO SE ARMA CON PERMISOS.
       *
       * Lo tiene TODA persona registrada en la tienda. Marcarle una sola casilla
       * convierte a cada cliente en personal del panel de golpe, y el aviso de la
       * pantalla ("no entra al panel") no lo impedia: era una frase, no una regla.
       * El nombre y la descripcion si se pueden retocar; los permisos, no.
       */
      if (role.code === ROLES.CUSTOMER) {
        throw ApiError.unprocessable(
          'El rol Cliente lo tienen todas las personas registradas en la tienda: darle un permiso las convertiria a todas en personal del panel. Crea un rol nuevo para eso.',
        );
      }

      assertCanGrant(actor, input.permissions);

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
    // `paranoid: false`: el indice unico cuenta tambien las cuentas dadas de baja
    // en blando, asi que sin esto el choque salia como un 409 sin campo.
    const existing = await User.findOne({ where: { email: input.email }, paranoid: false });
    if (existing) throw ApiError.conflict('Ese email ya esta registrado');

    await assertBranchScope(input.roleIds, input.branchId);
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

      await syncDriverProfile(user, roleCodes, input.branchId ?? null, transaction);

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
        await UserRole.create(
          { userId, roleId, branchId: input.branchId ?? null },
          { transaction },
        );
      }

      await syncDriverProfile(user, roleCodes, input.branchId ?? null, transaction);

      /*
       * Los permisos y la sucursal viajan DENTRO del token. Sin subir la version,
       * un cambio de rol no surtia efecto hasta que caducara la sesion en curso:
       * quien acaba de perder el reparto seguia cerrando entregas 15 minutos.
       */
      user.tokenVersion += 1;
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
    // La marca tambien viaja en el token: sin subir la version, a quien se le
    // retira sigue saltandose la verificacion de permisos hasta que caduque.
    user.tokenVersion += 1;
    await user.save();
    revokeSessionCache(user.id);
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
    /*
     * Bloquear tiene que cortar la sesion EN CURSO, no la siguiente.
     *
     * El estado por si solo no revocaba nada: el token es autocontenido y seguia
     * valido hasta 15 minutos, con su portador cancelando pedidos o devolviendo
     * dinero. Subir la version invalida tambien el refresh, y descartar la sesion
     * cacheada hace que el corte se note ya.
     */
    user.tokenVersion += 1;
    await user.save();
    revokeSessionCache(user.id);
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
