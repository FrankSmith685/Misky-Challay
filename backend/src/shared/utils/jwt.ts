import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '@config/env';
import { ApiError } from '@shared/errors/ApiError';

/** Unico algoritmo aceptado: se fija explicitamente para no depender del default. */
const ALGORITHM = 'HS256' as const;

export interface TokenPayload {
  sub: number;
  email: string | null;
  roles: string[];
  permissions: string[];
  /** Se salta la verificacion de permisos: es el dueno del sistema. */
  isSuperAdmin: boolean;
  /**
   * Sucursales que puede tocar. Vacio = alcance GLOBAL (admin general, soporte).
   * Con valores = solo esas sucursales (administrador o cocinero de un local).
   */
  branchIds: number[];
  /**
   * Version del token del usuario. Al cerrar sesion (o cambiar la contrasena) se
   * incrementa en la BD, y cualquier token con una version anterior deja de servir
   * para renovar. Asi el logout SI revoca el refresh token.
   */
  tv: number;
}

export const signAccessToken = (payload: TokenPayload): string =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    algorithm: ALGORITHM,
  } as SignOptions);

export const signRefreshToken = (payload: Pick<TokenPayload, 'sub' | 'tv'>): string =>
  jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    algorithm: ALGORITHM,
  } as SignOptions);

export const verifyAccessToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: [ALGORITHM],
    }) as unknown as TokenPayload;
  } catch {
    throw ApiError.unauthorized('Token invalido o expirado');
  }
};

export const verifyRefreshToken = (token: string): Pick<TokenPayload, 'sub' | 'tv'> => {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET, {
      algorithms: [ALGORITHM],
    }) as unknown as Pick<TokenPayload, 'sub' | 'tv'>;
  } catch {
    throw ApiError.unauthorized('Refresh token invalido o expirado');
  }
};
