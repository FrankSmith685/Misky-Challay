import { Router } from 'express';
import { validate } from '@middlewares/validate.middleware';
import { catalogController } from './catalog.controller';
import { listProductsSchema, productSlugSchema } from './catalog.validation';

/**
 * Modulo CATALOG (M04).
 * Prefijo: /api/v1/catalog
 */
const router = Router();

router.get('/categories', catalogController.categories);
router.get('/allergens', catalogController.allergens);
router.get('/dietary-tags', catalogController.dietaryTags);
router.get('/products', validate(listProductsSchema), catalogController.products);
router.get('/products/:slug', validate(productSlugSchema), catalogController.product);

export default router;
