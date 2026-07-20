import { Router } from 'express';
import { validate } from '@middlewares/validate.middleware';
import { geoController } from './geo.controller';
import { addressSuggestionsSchema, branchesSchema, coverageSchema, districtsSchema, resolveAddressSchema, reverseAddressSchema, slotsSchema } from './geo.validation';

/**
 * Modulo GEO - Cobertura y sucursales (M03).
 * Prefijo: /api/v1/locations
 */
const router = Router();

router.get('/cities', geoController.cities);
router.get('/address-suggestions', validate(addressSuggestionsSchema), geoController.addressSuggestions);
router.post('/resolve-address', validate(resolveAddressSchema), geoController.resolveAddress);
router.post('/reverse-address', validate(reverseAddressSchema), geoController.reverseAddress);
router.get('/districts', validate(districtsSchema), geoController.districts);
router.get('/branches', validate(branchesSchema), geoController.branches);
router.post('/coverage', validate(coverageSchema), geoController.coverage);
router.get('/slots', validate(slotsSchema), geoController.slots);

export default router;
