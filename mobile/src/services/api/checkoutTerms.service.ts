import { apiRequest } from './client';

export interface CheckoutTerms {
  version: number;
  title: string;
  content: string;
  acceptanceLabel: string;
  publishedAt: string;
}
export const checkoutTermsApi = { get: () => apiRequest<CheckoutTerms>('/settings/terms') };
