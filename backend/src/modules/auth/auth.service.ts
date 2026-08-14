import crypto from 'node:crypto';
import { Op } from 'sequelize';
import { ROLES, USER_STATUS } from '@config/constants';
import { Permission, Role, User, UserRole } from '@database/models';
import { ApiError } from '@shared/errors/ApiError';
import { logger } from '@config/logger';
import { comparePassword, hashPassword } from '@shared/utils/password';
import { normalizePhone } from '@shared/utils/phone';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type TokenPayload,
} from '@shared/utils/jwt';
import { notificationsService } from '@modules/notifications/notifications.service';
import type { LoginInput, RegisterInput } from './auth.validation';

/** El enlace de reset caduca a la hora. Suficiente para el usuario, corto para un atacante. */
const RESET_TOKEN_TTL_MINUTES = 60;
const sha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

export interface AuthenticatedUser {
  id: number;
  email: string | null;
  /**
   * Viaja con la sesion para que el checkout no tenga que volver a pedirle al
   * cliente un dato que ya dio al registrarse.
   */
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
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
    phone: user.phone,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
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
    const email = input.email.trim().toLowerCase();
    const phone = normalizePhone(input.phone);

    /*
     * Se comprueban los DOS datos unicos, no solo el email.
     *
     * `users` tiene indice unico en email y en telefono. Al mirar solo el email,
     * un registro con correo nuevo y un telefono ya usado pasaba el control y
     * reventaba en el INSERT: el cliente veia "El registro ya existe" con un email
     * que efectivamente no existia, y no habia forma de adivinar que sobraba.
     *
     * `paranoid: false` porque el indice unico SI cuenta las filas dadas de baja
     * en blando; sin eso, el email de una cuenta eliminada volveria a colarse
     * hasta el INSERT.
     */
    const [emailTaken, phoneTaken] = await Promise.all([
      User.findOne({ where: { email }, paranoid: false }),
      phone ? User.findOne({ where: { phone }, paranoid: false }) : null,
    ]);
    if (emailTaken) throw ApiError.conflict('Ese email ya esta registrado');
    if (phoneTaken) {
      throw ApiError.conflict('Ese telefono ya esta registrado en otra cuenta');
    }

    const created = await User.create({
      email,
      phone,
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

  /**
   * Paso 1: genera un token de reset y lo envia por correo.
   *
   * Anti-enumeracion: responde SIEMPRE igual (el controlador da el mismo mensaje),
   * exista o no el correo. En la base se guarda solo el SHA-256 del token; el token
   * en claro solo viaja en el correo, una vez.
   */
  async forgotPassword(email: string, client: 'WEB' | 'MOBILE' = 'WEB'): Promise<void> {
    const user = await User.findOne({ where: { email } });
    // Silencioso a proposito: no se revela si el email existe ni si esta activo.
    if (!user?.email || user.status !== USER_STATUS.ACTIVE) return;

    /* Fire-and-forget: la respuesta HTTP NO espera al UPDATE ni al envio del correo.
     * Si lo hiciera, una cuenta existente responderia mas lento que una inexistente
     * (el envio SMTP es un round-trip de red), y esa diferencia de latencia seria un
     * oraculo de enumeracion — justo lo que la respuesta uniforme intenta evitar.
     * El usuario tarda segundos en abrir el correo, asi que hacerlo despues de
     * responder no afecta la experiencia. */
    void (async () => {
      try {
        const rawToken = crypto.randomBytes(32).toString('hex'); // 64 chars, va en el enlace
        user.passwordResetTokenHash = sha256(rawToken);
        user.passwordResetExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000);
        await user.save();
        await notificationsService.notifyPasswordReset(
          user.id,
          rawToken,
          RESET_TOKEN_TTL_MINUTES,
          client,
        );
      } catch (error) {
        logger.error('Fallo al generar el enlace de recuperacion', error);
      }
    })();
  },

  /**
   * Paso 2: consume el token y fija la nueva clave.
   * El token es de un solo uso (se limpia al usarlo) y cierra las sesiones abiertas.
   */
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const user = await User.findOne({
      where: {
        passwordResetTokenHash: sha256(rawToken),
        passwordResetExpiresAt: { [Op.gt]: new Date() },
        // Si la cuenta se bloqueo tras pedir el reset (p.ej. por fraude), el token
        // deja de servir. El mensaje generico no revela el motivo.
        status: USER_STATUS.ACTIVE,
      },
    });
    if (!user) throw ApiError.badRequest('El enlace no es valido o ya expiro');

    user.passwordHash = await hashPassword(newPassword);
    // Un solo uso: el token se invalida al consumirlo.
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    // Cierra cualquier sesion abierta: los refresh tokens previos dejan de servir.
    user.tokenVersion += 1;
    await user.save();
  },
};
