import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '@middlewares/auth.middleware';
import { authLimiter } from '@middlewares/rateLimit.middleware';
import { validate } from '@middlewares/validate.middleware';
import { accountController } from './account.controller';
import { activityStream } from '@modules/notifications/activityStream';
import { asyncHandler } from '@shared/utils/asyncHandler';
import {
  addressIdSchema,
  changePasswordSchema,
  createAddressSchema,
  updateAddressSchema,
  updateProfileSchema,
  createSavedBowlSchema,
  updateSavedBowlSchema,
  savedBowlIdSchema,
  updateFoodPreferencesSchema,
  updatePurchaseContextSchema,
} from './account.validation';

/**
 * Modulo ACCOUNT - Perfil y direcciones del cliente (M02).
 * Prefijo: /api/v1/account  (todo requiere sesion)
 */
const router = Router();

router.use(authenticate);
router.get('/events', asyncHandler(activityStream));

router.get('/profile', accountController.getProfile);
router.patch('/profile', validate(updateProfileSchema), accountController.updateProfile);
router.post(
  '/profile/avatar',
  validate(z.object({ body: z.object({
    fileName: z.string().trim().min(1).max(180),
    mimeType: z.enum(['image/webp', 'image/jpeg', 'image/png']),
    dataUrl: z.string().min(20).max(7_500_000),
  }) })),
  accountController.updateAvatar,
);
router.delete('/profile/avatar', accountController.removeAvatar);
router.patch('/password', validate(changePasswordSchema), accountController.changePassword);

/**
 * Baja de la cuenta a peticion del titular (Ley 29733 y requisito de ambas
 * tiendas de aplicaciones). Cuelga de la raiz del modulo porque el recurso que
 * se elimina es la cuenta entera, no una de sus partes.
 *
 * authLimiter: el cuerpo lleva la contrasena actual, asi que la ruta se puede
 * usar para adivinarla igual que el formulario de acceso. Mismo freno.
 */
router.delete(
  '/',
  authLimiter,
  validate(
    z.object({
      body: z.object({
        password: z.string().min(1, 'Ingresa tu contrasena para confirmar'),
        reason: z.string().trim().max(300).optional(),
      }),
    }),
  ),
  accountController.deleteAccount,
);
router.get('/notifications', accountController.listNotifications);
router.get('/notifications/feed', validate(z.object({ query: z.object({ audience: z.enum(['CUSTOMER', 'STAFF', 'ALL']).default('ALL'), page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(50).default(15) }) })), accountController.notificationFeed);
router.patch('/notifications/read', validate(z.object({ body: z.object({ ids: z.array(z.number().int().positive()).min(1).max(100).optional(), all: z.boolean().optional(), throughId: z.number().int().positive().optional(), audience: z.enum(['CUSTOMER', 'STAFF', 'ALL']).optional() }).optional() })), accountController.markNotificationsRead);
router.post(
  '/mobile-devices',
  validate(z.object({ body: z.object({
    expoPushToken: z.string().regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/).max(255),
    platform: z.enum(['android', 'ios']),
    deviceId: z.string().trim().min(3).max(160).optional(),
    appVersion: z.string().trim().min(1).max(30).optional(),
  }) })),
  accountController.registerMobileDevice,
);
router.delete(
  '/mobile-devices',
  validate(z.object({ body: z.object({ expoPushToken: z.string().max(255) }) })),
  accountController.unregisterMobileDevice,
);
router.get(
  '/availability-alerts',
  validate(z.object({ query: z.object({ productId: z.coerce.number().int().positive(), branchId: z.coerce.number().int().positive() }) })),
  accountController.getAvailabilityAlert,
);
router.post(
  '/availability-alerts',
  validate(z.object({ body: z.object({
    productId: z.coerce.number().int().positive(),
    branchId: z.coerce.number().int().positive(),
    notifyEmail: z.boolean(),
    notifyInApp: z.boolean(),
  }) })),
  accountController.subscribeAvailabilityAlert,
);
router.delete(
  '/availability-alerts',
  validate(z.object({ query: z.object({ productId: z.coerce.number().int().positive(), branchId: z.coerce.number().int().positive() }) })),
  accountController.cancelAvailabilityAlert,
);
router.get('/food-preferences', accountController.getFoodPreferences);
router.put('/food-preferences', validate(updateFoodPreferencesSchema), accountController.updateFoodPreferences);

// Donde entregamos: se recupera al iniciar sesion en cualquier navegador.
router.get('/purchase-context', accountController.getPurchaseContext);
router.put(
  '/purchase-context',
  validate(updatePurchaseContextSchema),
  accountController.updatePurchaseContext,
);

router.get('/addresses', accountController.listAddresses);
router.post('/addresses', validate(createAddressSchema), accountController.createAddress);
router.patch('/addresses/:id', validate(updateAddressSchema), accountController.updateAddress);
router.delete('/addresses/:id', validate(addressIdSchema), accountController.deleteAddress);
router.get('/saved-bowls', accountController.listSavedBowls);
router.post('/saved-bowls', validate(createSavedBowlSchema), accountController.createSavedBowl);
router.patch('/saved-bowls/:id', validate(updateSavedBowlSchema), accountController.updateSavedBowl);
router.delete('/saved-bowls/:id', validate(savedBowlIdSchema), accountController.deleteSavedBowl);

export default router;
