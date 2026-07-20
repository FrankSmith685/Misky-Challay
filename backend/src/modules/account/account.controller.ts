import type { Request, Response } from 'express';
import { created, noContent, ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { ApiError } from '@shared/errors/ApiError';
import { accountService } from './account.service';
import { notificationsService } from '@modules/notifications/notifications.service';

const requireUserId = (req: Request): number => {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.sub;
};

export const accountController = {
  listNotifications: asyncHandler(async (req: Request, res: Response) =>
    ok(res, await notificationsService.listForUser(requireUserId(req))),
  ),
  getFoodPreferences: asyncHandler(async (req: Request, res: Response) =>
    ok(res, await accountService.getFoodPreferences(requireUserId(req))),
  ),

  updateFoodPreferences: asyncHandler(async (req: Request, res: Response) =>
    ok(res, await accountService.updateFoodPreferences(requireUserId(req), req.body), 'Preferencias guardadas'),
  ),

  getProfile: asyncHandler(async (req: Request, res: Response) => {
    const profile = await accountService.getProfile(requireUserId(req));
    return ok(res, profile);
  }),

  updateProfile: asyncHandler(async (req: Request, res: Response) => {
    const profile = await accountService.updateProfile(requireUserId(req), req.body);
    return ok(res, profile, 'Perfil actualizado');
  }),

  changePassword: asyncHandler(async (req: Request, res: Response) => {
    await accountService.changePassword(requireUserId(req), req.body);
    return ok(res, null, 'Contrasena actualizada');
  }),

  listAddresses: asyncHandler(async (req: Request, res: Response) => {
    const addresses = await accountService.listAddresses(requireUserId(req));
    return ok(res, addresses);
  }),

  createAddress: asyncHandler(async (req: Request, res: Response) => {
    const address = await accountService.createAddress(requireUserId(req), req.body);
    return created(res, address, 'Direccion guardada');
  }),

  updateAddress: asyncHandler(async (req: Request, res: Response) => {
    const address = await accountService.updateAddress(
      requireUserId(req),
      Number(req.params.id),
      req.body,
    );
    return ok(res, address, 'Direccion actualizada');
  }),

  deleteAddress: asyncHandler(async (req: Request, res: Response) => {
    await accountService.deleteAddress(requireUserId(req), Number(req.params.id));
    return noContent(res);
  }),

  listSavedBowls: asyncHandler(async (req: Request, res: Response) =>
    ok(res, await accountService.listSavedBowls(requireUserId(req))),
  ),
  createSavedBowl: asyncHandler(async (req: Request, res: Response) =>
    created(res, await accountService.createSavedBowl(requireUserId(req), req.body), 'Bowl guardado'),
  ),
  updateSavedBowl: asyncHandler(async (req: Request, res: Response) =>
    ok(res, await accountService.updateSavedBowl(requireUserId(req), Number(req.params.id), req.body), 'Bowl actualizado'),
  ),
  deleteSavedBowl: asyncHandler(async (req: Request, res: Response) => {
    await accountService.deleteSavedBowl(requireUserId(req), Number(req.params.id));
    return noContent(res);
  }),
};
