import type { Request, Response } from 'express';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { created, ok } from '@shared/http/ApiResponse';
import { ApiError } from '@shared/errors/ApiError';
import { authService } from './auth.service';

export const authController = {
  register: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.register(req.body);
    return created(res, result, 'Cuenta creada correctamente');
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.login(req.body);
    return ok(res, result, 'Sesion iniciada');
  }),

  refresh: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.refresh(req.body.refreshToken);
    return ok(res, result, 'Token renovado');
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const user = await authService.me(req.user.sub);
    return ok(res, user);
  }),

  logout: asyncHandler(async (req: Request, res: Response) => {
    // Sube la version del token del usuario: sus refresh tokens dejan de servir.
    if (req.user) await authService.logout(req.user.sub);
    return ok(res, null, 'Sesion cerrada');
  }),
};
