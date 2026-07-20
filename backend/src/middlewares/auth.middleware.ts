import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '@shared/errors/ApiError';
import { verifyAccessToken } from '@shared/utils/jwt';

const extractToken = (req: Request): string | null => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  if (typeof req.cookies?.accessToken === 'string') return req.cookies.accessToken;
  return null;
};

/** Exige un token valido. Inyecta req.user. */
export const authenticate = (req: Request, _res: Response, next: NextFunction): void => {
  const token = extractToken(req);
  if (!token) {
    next(ApiError.unauthorized('Se requiere iniciar sesion'));
    return;
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch (error) {
    next(error);
  }
};

/** No exige token, pero si viene y es valido inyecta req.user (util para carrito de invitado). */
export const optionalAuth = (req: Request, _res: Response, next: NextFunction): void => {
  const token = extractToken(req);
  if (!token) {
    next();
    return;
  }

  try {
    req.user = verifyAccessToken(token);
  } catch {
    // token invalido -> se continua como invitado
  }
  next();
};
