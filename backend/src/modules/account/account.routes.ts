import { Router } from 'express';
import { authenticate } from '@middlewares/auth.middleware';
import { validate } from '@middlewares/validate.middleware';
import { accountController } from './account.controller';
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
} from './account.validation';

/**
 * Modulo ACCOUNT - Perfil y direcciones del cliente (M02).
 * Prefijo: /api/v1/account  (todo requiere sesion)
 */
const router = Router();

router.use(authenticate);

router.get('/profile', accountController.getProfile);
router.patch('/profile', validate(updateProfileSchema), accountController.updateProfile);
router.patch('/password', validate(changePasswordSchema), accountController.changePassword);
router.get('/notifications', accountController.listNotifications);
router.get('/food-preferences', accountController.getFoodPreferences);
router.put('/food-preferences', validate(updateFoodPreferencesSchema), accountController.updateFoodPreferences);

router.get('/addresses', accountController.listAddresses);
router.post('/addresses', validate(createAddressSchema), accountController.createAddress);
router.patch('/addresses/:id', validate(updateAddressSchema), accountController.updateAddress);
router.delete('/addresses/:id', validate(addressIdSchema), accountController.deleteAddress);
router.get('/saved-bowls', accountController.listSavedBowls);
router.post('/saved-bowls', validate(createSavedBowlSchema), accountController.createSavedBowl);
router.patch('/saved-bowls/:id', validate(updateSavedBowlSchema), accountController.updateSavedBowl);
router.delete('/saved-bowls/:id', validate(savedBowlIdSchema), accountController.deleteSavedBowl);

export default router;
