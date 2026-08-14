import { Router } from 'express';
import { authenticate, optionalAuth } from '@middlewares/auth.middleware';
import { validate } from '@middlewares/validate.middleware';
import { engagementController } from './engagement.controller';
import {
  createReviewSchema,
  favoriteProductSchema,
  favoritesQuerySchema,
  newsletterSchema,
  recommendationsSchema,
  reviewsQuerySchema,
  trackEventSchema,
  updateReviewSchema,
} from './engagement.validation';

/** Fase 6: fidelización, prueba social, consentimiento y señales de producto. */
const router = Router();

router.post('/events', optionalAuth, validate(trackEventSchema), engagementController.track);
router.get('/recommendations', optionalAuth, validate(recommendationsSchema), engagementController.recommendations);

router.get('/favorites', authenticate, validate(favoritesQuerySchema), engagementController.favorites);
router.post('/favorites/:productId', authenticate, validate(favoriteProductSchema), engagementController.addFavorite);
router.delete('/favorites/:productId', authenticate, validate(favoriteProductSchema), engagementController.removeFavorite);

router.get('/reviews/pending', authenticate, engagementController.pendingReviews);
router.post('/reviews', authenticate, validate(createReviewSchema), engagementController.createReview);
router.put('/reviews/:reviewId', authenticate, validate(updateReviewSchema), engagementController.updateReview);
router.get('/products/:productId/reviews', validate(reviewsQuerySchema), engagementController.productReviews);

router.get('/newsletter', authenticate, engagementController.newsletterStatus);
router.put('/newsletter', authenticate, validate(newsletterSchema), engagementController.newsletter);

export default router;
