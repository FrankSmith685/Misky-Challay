import type { Request, Response } from 'express';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { created, ok } from '@shared/http/ApiResponse';
import { ApiError } from '@shared/errors/ApiError';
import { audit } from '@shared/utils/audit';
import { authService } from './auth.service';

export const authController = {
  register: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.register(req.body, { ip: req.ip, userAgent: req.headers['user-agent'] });
    await audit(req, { actorId: result.user.id, action: 'auth.register.success', entity: 'users', entityId: result.user.id, after: { email: result.user.email } });
    return created(res, result, 'Cuenta creada correctamente');
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    try {
      const result = await authService.login(req.body, { ip: req.ip, userAgent: req.headers['user-agent'] });
      await audit(req, { actorId: result.user.id, action: 'auth.login.success', entity: 'users', entityId: result.user.id, after: { mfa: result.user.mfaEnabled } });
      return ok(res, result, 'Sesion iniciada');
    } catch (error) {
      await audit(req, { action: 'auth.login.failed', entity: 'users', after: { email: req.body.email, reason: error instanceof Error ? error.message : 'unknown' }, outcome: 'FAILURE' });
      throw error;
    }
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
    await audit(req, { action: 'auth.logout', entity: 'sessions', entityId: req.user?.sub ?? null });
    return ok(res, null, 'Sesion cerrada');
  }),

  forgotPassword: asyncHandler(async (req: Request, res: Response) => {
    await authService.forgotPassword(req.body.email, req.body.client);
    // Misma respuesta exista o no el correo: no se revela si hay cuenta (anti-enumeracion).
    return ok(
      res,
      null,
      'Si el correo esta registrado, te enviamos un enlace para restablecer tu contrasena',
    );
  }),

  resetPassword: asyncHandler(async (req: Request, res: Response) => {
    await authService.resetPassword(req.body.token, req.body.password);
    await audit(req, { action: 'auth.password.reset', entity: 'users', after: { completed: true } });
    return ok(res, null, 'Contrasena restablecida. Ya puedes iniciar sesion');
  }),
};
