import { z } from 'zod';
import { UX_EVENT_TYPES } from '@database/models/uxEvent.model';

const idParams = (key: string) => z.record(z.string(), z.coerce.number().int().positive()).refine((value) => key in value);

export const trackEventSchema = z.object({
  body: z.object({
    sessionId: z.string().uuid(),
    eventType: z.enum(UX_EVENT_TYPES),
    branchId: z.coerce.number().int().positive().nullable().optional(),
    metadata: z.record(z.union([z.string().max(300), z.number(), z.boolean(), z.null()])).optional(),
  }),
});

export const favoritesQuerySchema = z.object({ query: z.object({ branchId: z.coerce.number().int().positive().optional() }) });
export const favoriteProductSchema = z.object({ params: idParams('productId') });

export const reviewsQuerySchema = z.object({
  params: idParams('productId'),
  query: z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(10) }),
});
export const createReviewSchema = z.object({
  body: z.object({ orderItemId: z.coerce.number().int().positive(), rating: z.coerce.number().int().min(1).max(5), comment: z.string().trim().max(800).nullable().optional() }),
});
export const updateReviewSchema = z.object({
  params: idParams('reviewId'),
  body: z.object({ rating: z.coerce.number().int().min(1).max(5), comment: z.string().trim().max(800).nullable().optional() }),
});
export const recommendationsSchema = z.object({
  query: z.object({ branchId: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().min(1).max(12).default(6) }),
});
export const newsletterSchema = z.object({ body: z.object({ subscribed: z.boolean(), source: z.enum(['WEB', 'MOBILE']).default('WEB') }) });

export type CreateReviewInput = z.infer<typeof createReviewSchema>['body'];
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>['body'];
