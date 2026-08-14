import { api } from '@services/api/client';
import { ENDPOINTS } from '@services/api/endpoints';
import type { ApiSuccess } from '@/types/api';
import type { PendingReview, ProductReviews } from '../types';

export const reviewsApi = {
  async product(productId: number): Promise<ProductReviews> {
    const { data } = await api.get<ApiSuccess<ProductReviews>>(
      ENDPOINTS.engagement.reviews(productId),
      { params: { page: 1, pageSize: 10 } },
    );
    return data.data;
  },

  async pending(): Promise<PendingReview[]> {
    const { data } = await api.get<ApiSuccess<PendingReview[]>>(ENDPOINTS.engagement.pendingReviews);
    return data.data;
  },

  async create(orderItemId: number, rating: number, comment: string): Promise<void> {
    await api.post(ENDPOINTS.engagement.createReview, {
      orderItemId,
      rating,
      comment: comment.trim() || null,
    });
  },
};
