import type { NewsletterStatus, PendingReview, Product, ProductReviews, Recommendation } from '../../types/domain';
import { apiRequest } from './client';
import { ENDPOINTS } from './endpoints';

/**
 * Eventos de uso que acepta el backend (backend/src/database/models/uxEvent.model.ts).
 * `CHECKOUT_ERROR` y `PAYMENT_REDIRECT` los emite tambien la web: mandarlos como
 * un CHECKOUT_STEP disfrazado ensuciaba el embudo.
 */
export type MobileUxEvent =
  | 'APP_OPEN'
  | 'MENU_VIEW'
  | 'PRODUCT_VIEW'
  | 'FAVORITE_ADD'
  | 'FAVORITE_REMOVE'
  | 'CART_ADD'
  | 'CHECKOUT_START'
  | 'CHECKOUT_STEP'
  | 'CHECKOUT_ERROR'
  | 'PAYMENT_REDIRECT'
  | 'ORDER_COMPLETED'
  | 'REVIEW_SUBMITTED'
  | 'RECOMMENDATION_OPEN';

export const engagementApi = {
  favorites: (branchId?: number | null) => apiRequest<Product[]>(ENDPOINTS.engagement.favorites, { auth: true, query: { branchId } }),
  addFavorite: (productId: number) => apiRequest<{ productId: number; created: boolean }>(ENDPOINTS.engagement.favorite(productId), { method: 'POST', auth: true }),
  removeFavorite: (productId: number) => apiRequest<{ productId: number; removed: boolean }>(ENDPOINTS.engagement.favorite(productId), { method: 'DELETE', auth: true }),
  reviews: (productId: number) => apiRequest<ProductReviews>(ENDPOINTS.engagement.reviews(productId), { query: { page: 1, pageSize: 10 } }),
  pendingReviews: () => apiRequest<PendingReview[]>(ENDPOINTS.engagement.pendingReviews, { auth: true }),
  createReview: (orderItemId: number, rating: number, comment: string) => apiRequest(ENDPOINTS.engagement.createReview, { method: 'POST', auth: true, body: { orderItemId, rating, comment: comment.trim() || null } }),
  recommendations: (branchId?: number | null, limit = 6) => apiRequest<Recommendation[]>(ENDPOINTS.engagement.recommendations, { auth: true, query: { branchId, limit } }),
  newsletter: () => apiRequest<NewsletterStatus>(ENDPOINTS.engagement.newsletter, { auth: true }),
  setNewsletter: (subscribed: boolean) => apiRequest<NewsletterStatus>(ENDPOINTS.engagement.newsletter, { method: 'PUT', auth: true, body: { subscribed, source: 'MOBILE' } }),
  event: (sessionId: string, eventType: MobileUxEvent, metadata?: Record<string, string | number | boolean | null>, branchId?: number | null) => apiRequest<null>(ENDPOINTS.engagement.events, { method: 'POST', auth: true, body: { sessionId, eventType, metadata, branchId } }),
};
