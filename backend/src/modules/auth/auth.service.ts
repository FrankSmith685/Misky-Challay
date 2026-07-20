import { ROLES, USER_STATUS } from '@config/constants';
import { Permission, Role, User, UserRole } from '@database/models';
import { ApiError } from '@shared/errors/ApiError';
import { comparePassword, hashPassword } from '@shared/utils/password';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type TokenPayload,
} from '@shared/utils/jwt';
import type { LoginInput, RegisterInput } from './auth.validation';

export interface AuthenticatedUser {
  id: number;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  roles: string[];
  permissions: string[];
  /** Se salta la verificacion de permisos (marca del sistema, no un rol). */
  isSuperAdmin: boolean;
  /** Sucursales asignadas. Vacio = alcance global. */
  branchIds: number[];
}

export interface AuthResult {
  user: AuthenticatedUser;
  accessToken: string;
  refreshToken: string;
}

/** Carga el usuario con sus roles y permisos efectivos. */
const loadUserWithAccess = async (userId: number): Promise<AuthenticatedUser> => {
  const user = await User.findByPk(userId, {
    include: [
      {
        model: Role,
        as: 'roles',
        through: { attributes: [] },
        include: [{ model: Permission, as: 'permissions', through: { attributes: [] } }],
      },
    ],
  });

  if (!user) throw ApiError.notFound('Usuario no encontrado');

  const roles = user.roles ?? [];
  const permissions = new Set<string>();
  roles.forEach((role) => role.permissions?.forEach((p) => permissions.add(p.code)));

  // Sucursales asignadas al personal (user_roles.branch_id). Sin ninguna = global.
  const assignments = await UserRole.findAll({ where: { userId: user.id } });
  const branchIds = [
    ...new Set(
      assignments
        .map((assignment) => assignment.branchId)
        .filter((branchId): branchId is number => branchId !== null),
    ),
  ];

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    roles: roles.map((role) => role.code),
    permissions: [...permissions],
    isSuperAdmin: user.isSuperAdmin,
    branchIds,
  };
};

const issueTokens = (user: AuthenticatedUser, tokenVersion: number): Omit<AuthResult, 'user'> => {
  const payload: TokenPayload = {
    sub: user.id,
    email: user.email,
    roles: user.roles,
    permissions: user.permissions,
    isSuperAdmin: user.isSuperAdmin,
    branchIds: user.branchIds,
    tv: tokenVersion,
  };

  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken({ sub: user.id, tv: tokenVersion }),
  };
};

export const authService = {
  async register(input: RegisterInput): Promise<AuthResult> {
    const existing = await User.findOne({ where: { email: input.email } });
    if (existing) throw ApiError.conflict('El email ya esta registrado');

    const created = await User.create({
      email: input.email,
      phone: input.phone ?? null,
      passwordHash: await hashPassword(input.password),
      firstName: input.firstName,
      lastName: input.lastName,
      status: USER_STATUS.ACTIVE,
      emailVerifiedAt: null,
      // Se sella el momento del consentimiento: es la prueba que exige la Ley 29733.
      termsAcceptedAt: new Date(),
      lastLoginAt: null,
    });

    const customerRole = await Role.findOne({ where: { code: ROLES.CUSTOMER } });
    if (customerRole) {
      await UserRole.create({ userId: created.id, roleId: customerRole.id });
    }

    const user = await loadUserWithAccess(created.id);
    return { user, ...issueTokens(user, created.tokenVersion) };
  },

  async login(input: LoginInput): Promise<AuthResult> {
    const account = await User.scope('withPassword').findOne({ where: { email: input.email } });
    if (!account?.passwordHash) throw ApiError.unauthorized('Credenciales incorrectas');
    if (account.status !== USER_STATUS.ACTIVE) throw ApiError.forbidden('La cuenta no esta activa');

    const valid = await comparePassword(input.password, account.passwordHash);
    if (!valid) throw ApiError.unauthorized('Credenciales incorrectas');

    account.lastLoginAt = new Date();
    await account.save();

    const user = await loadUserWithAccess(account.id);
    return { user, ...issueTokens(user, account.tokenVersion) };
  },

  async refresh(refreshToken: string): Promise<AuthResult> {
    const payload = verifyRefreshToken(refreshToken);

    const account = await User.findByPk(payload.sub);
    if (!account) throw ApiError.unauthorized('Sesion invalida');
    // Un usuario bloqueado no puede seguir renovando su sesion.
    if (account.status !== USER_STATUS.ACTIVE) throw ApiError.forbidden('La cuenta no esta activa');
    // El refresh token quedo revocado por un logout (o cambio de version).
    if (account.tokenVersion !== payload.tv) {
      throw ApiError.unauthorized('Sesion expirada, vuelve a iniciar sesion');
    }

    const user = await loadUserWithAccess(account.id);
    return { user, ...issueTokens(user, account.tokenVersion) };
  },

  async me(userId: number): Promise<AuthenticatedUser> {
    return loadUserWithAccess(userId);
  },

  /** Revoca todos los refresh tokens del usuario subiendo su version. */
  async logout(userId: number): Promise<void> {
    await User.increment('tokenVersion', { where: { id: userId } });
  },
};
