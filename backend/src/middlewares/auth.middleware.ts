import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '@shared/errors/ApiError';
import { verifyAccessToken } from '@shared/utils/jwt';
import { USER_STATUS } from '@config/constants';
import { User } from '@database/models';

const extractToken = (req: Request): string | null => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  if (typeof req.cookies?.accessToken === 'string') return req.cookies.accessToken;
  return null;
};

/**
 * REVALIDACION DE LA SESION EN CURSO
 * ---------------------------------------------------------------------------
 * El JWT es autocontenido: verificar la firma solo prueba que lo emitimos
 * nosotros, no que la cuenta siga viva. Bloquear a un empleado no cortaba su
 * sesion, porque nadie miraba `status` ni `tokenVersion` hasta que el token
 * caducaba: hasta 15 minutos cancelando pedidos o devolviendo dinero.
 *
 * La consulta se cachea unos segundos, igual que hace `requireSuperAdmin` al
 * revalidar la marca: sin cache, cada peticion de cada pantalla con sondeo seria
 * un SELECT extra. La ventana que deja abierta es de segundos, no de minutos, y
 * las acciones que cierran una sesion a proposito (bloquear, cambiar roles)
 * ademas invalidan la entrada al instante con `revokeSessionCache`.
 */
const SESSION_TTL_MS = 15_000;
/** Techo defensivo: sin el, una rafaga de tokens distintos haria crecer el mapa sin fin. */
const SESSION_CACHE_MAX = 5_000;

interface SessionSnapshot {
  status: string;
  tokenVersion: number;
  expiresAt: number;
}

const sessionCache = new Map<number, SessionSnapshot>();

/** Descarta la sesion cacheada de un usuario para que el proximo request la relea. */
export const revokeSessionCache = (userId: number): void => {
  sessionCache.delete(userId);
};

const readSession = async (userId: number, fresh = false): Promise<SessionSnapshot | null> => {
  const cached = sessionCache.get(userId);
  if (!fresh && cached && cached.expiresAt > Date.now()) return cached;

  const account = await User.findByPk(userId, { attributes: ['id', 'status', 'tokenVersion'] });
  if (!account) {
    sessionCache.delete(userId);
    return null;
  }

  if (sessionCache.size >= SESSION_CACHE_MAX) {
    const now = Date.now();
    for (const [id, entry] of sessionCache) {
      if (entry.expiresAt <= now) sessionCache.delete(id);
    }
    if (sessionCache.size >= SESSION_CACHE_MAX) sessionCache.clear();
  }

  const snapshot: SessionSnapshot = {
    status: account.status,
    tokenVersion: account.tokenVersion,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  sessionCache.set(userId, snapshot);
  return snapshot;
};

/**
 * Motivo por el que el token, aun siendo valido, ya no sirve.
 * Se responde 401 (y no 403) a proposito: el cliente reintenta el refresh, este
 * lo rechaza igual y la aplicacion limpia la sesion sola en vez de quedarse
 * aparentando estar dentro mientras todo devuelve error.
 */
const describeRejection = (
  snapshot: SessionSnapshot | null,
  tokenVersion: number,
): string | null => {
  if (!snapshot) return 'Tu cuenta ya no existe. Vuelve a iniciar sesion.';
  if (snapshot.status !== USER_STATUS.ACTIVE) {
    return 'Tu cuenta ya no esta activa. Habla con quien administra los accesos.';
  }
  if (snapshot.tokenVersion !== tokenVersion) {
    return 'Tu sesion dejo de ser valida. Vuelve a iniciar sesion.';
  }
  return null;
};

/**
 * Devuelve el motivo de rechazo, o null si la sesion sigue siendo valida.
 *
 * Un rechazo SIEMPRE se confirma contra la base: la entrada cacheada puede ser
 * anterior al ultimo inicio de sesion, y sin esta segunda lectura un token
 * recien emitido quedaria negado hasta que la entrada caducara.
 */
const evaluateSession = async (userId: number, tokenVersion: number): Promise<string | null> => {
  const rejection = describeRejection(await readSession(userId), tokenVersion);
  if (!rejection) return null;
  return describeRejection(await readSession(userId, true), tokenVersion);
};

/** Exige un token valido y una cuenta viva. Inyecta req.user. */
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  const token = extractToken(req);
  if (!token) {
    next(ApiError.unauthorized('Se requiere iniciar sesion'));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    const rejection = await evaluateSession(payload.sub, payload.tv);
    if (rejection) {
      next(ApiError.unauthorized(rejection));
      return;
    }

    req.user = payload;
    next();
  } catch (error) {
    next(error);
  }
};

/** No exige token, pero si viene y es valido inyecta req.user (util para carrito de invitado). */
export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  const token = extractToken(req);
  if (!token) {
    next();
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    // Misma revalidacion, distinto desenlace: aqui una sesion muerta no es un
    // error, simplemente se sigue como invitado.
    if (!(await evaluateSession(payload.sub, payload.tv))) {
      req.user = payload;
    }
  } catch {
    // token invalido -> se continua como invitado
  }
  next();
};
