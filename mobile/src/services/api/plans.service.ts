import type { Plan, PlanPurchase, WalletSummary, WalletTransaction } from '../../types/domain';
import { apiRequest } from './client';
import { ENDPOINTS } from './endpoints';

export const PLAN_TERMS_VERSION = '2026-08-02';

export const plansApi = {
  list: () => apiRequest<Plan[]>(ENDPOINTS.plans.root),
  purchase: (planCode: string, idempotencyKey: string) => apiRequest<PlanPurchase>(ENDPOINTS.plans.purchase, {
    method: 'POST',
    auth: true,
    body: { planCode, idempotencyKey, termsAccepted: true, termsVersion: PLAN_TERMS_VERSION, client: 'MOBILE' },
  }),
  wallet: () => apiRequest<WalletSummary>(ENDPOINTS.plans.wallet, { auth: true }),
  transactions: (page = 1, pageSize = 30) => apiRequest<WalletTransaction[]>(ENDPOINTS.plans.transactions, { auth: true, query: { page, pageSize } }),
};
