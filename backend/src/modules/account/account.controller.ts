import type { Request, Response } from 'express';
import { created, noContent, ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { ApiError } from '@shared/errors/ApiError';
import { audit } from '@shared/utils/audit';
import { accountService } from './account.service';
import { availabilityAlertsService } from '@modules/catalog/availabilityAlerts.service';
import { mobilePushService } from '@modules/notifications/mobilePush.service';
import { notificationFeed, type FeedAudience } from '@modules/notifications/notificationFeed.service';

const requireUserId = (req: Request): number => {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.sub;
};

export const accountController = {
  registerMobileDevice: asyncHandler(async (req: Request, res: Response) =>
    ok(res, await mobilePushService.register(requireUserId(req), req.body), 'Dispositivo registrado'),
  ),
  unregisterMobileDevice: asyncHandler(async (req: Request, res: Response) => {
    await mobilePushService.unregister(requireUserId(req), req.body.expoPushToken);
    return ok(res, null, 'Dispositivo revocado');
  }),
  getAvailabilityAlert: asyncHandler(async (req: Request, res: Response) =>
    ok(
      res,
      await availabilityAlertsService.get(
        requireUserId(req),
        Number(req.query.productId),
        Number(req.query.branchId),
      ),
    ),
  ),
  subscribeAvailabilityAlert: asyncHandler(async (req: Request, res: Response) =>
    created(
      res,
      await availabilityAlertsService.subscribe({ userId: requireUserId(req), ...req.body }),
      'Te avisaremos una sola vez cuando el plato vuelva',
    ),
  ),
  cancelAvailabilityAlert: asyncHandler(async (req: Request, res: Response) => {
    await availabilityAlertsService.cancel(
      requireUserId(req),
      Number(req.query.productId),
      Number(req.query.branchId),
    );
    return noContent(res);
  }),
  listNotifications: asyncHandler(async (req: Request, res: Response) =>
    ok(res, (await notificationFeed.list(req.user!, 'ALL', 1, 50)).items),
  ),
  notificationFeed: asyncHandler(async (req: Request, res: Response) =>
    ok(res, await notificationFeed.list(req.user!, req.query.audience as FeedAudience, Number(req.query.page), Number(req.query.pageSize))),
  ),
  markNotificationsRead: asyncHandler(async (req: Request, res: Response) => {
    await notificationFeed.read(req.user!, req.body ?? { all: true });
    return ok(res, null, 'Notificaciones marcadas como leidas');
  }),
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

  updateAvatar: asyncHandler(async (req: Request, res: Response) =>
    ok(
      res,
      await accountService.updateAvatar(requireUserId(req), req.body),
      'Foto de perfil actualizada',
    ),
  ),

  removeAvatar: asyncHandler(async (req: Request, res: Response) =>
    ok(res, await accountService.removeAvatar(requireUserId(req)), 'Foto de perfil eliminada'),
  ),

  changePassword: asyncHandler(async (req: Request, res: Response) => {
    await accountService.changePassword(requireUserId(req), req.body);
    return ok(res, null, 'Contrasena actualizada');
  }),

  deleteAccount: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const result = await accountService.deleteAccount(userId, req.body);

    /* Queda en la bitacora porque es irreversible y porque alguien preguntara
     * por que desaparecio ese cliente. Sin datos personales: el motivo lo
     * escribe el titular y los identificadores ya no existen. */
    await audit(req, {
      action: 'account.delete',
      entity: 'users',
      entityId: userId,
      after: {
        deletedAt: result.deletedAt,
        keptOrders: result.keptOrders,
        forfeitedWalletBalance: result.forfeitedWalletBalance,
        reason: typeof req.body?.reason === 'string' ? req.body.reason : null,
      },
    });

    return ok(res, result, 'Tu cuenta fue eliminada');
  }),

  getPurchaseContext: asyncHandler(async (req: Request, res: Response) =>
    ok(res, await accountService.getPurchaseContext(requireUserId(req))),
  ),

  updatePurchaseContext: asyncHandler(async (req: Request, res: Response) =>
    ok(res, await accountService.savePurchaseContext(requireUserId(req), req.body)),
  ),

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
