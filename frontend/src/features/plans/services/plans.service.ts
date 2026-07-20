import { api } from '@services/api/client';
import { ENDPOINTS } from '@services/api/endpoints';
import type { ApiSuccess } from '@/types/api';
import type { Plan, PlanPurchase, WalletSummary, WalletTransaction } from '../types';

export const plansApi = {
  async list(): Promise<Plan[]> {
    const { data } = await api.get<ApiSuccess<Plan[]>>(ENDPOINTS.plans.root);
    return data.data;
  },

  /**
   * Compra un plan. El saldo NO llega aqui: el backend abre el pago y solo lo
   * acredita cuando el webhook confirma el cobro (RN-012).
   */
  async purchase(planCode: string, idempotencyKey: string): Promise<PlanPurchase> {
    const { data } = await api.post<ApiSuccess<PlanPurchase>>(ENDPOINTS.plans.purchase, {
      planCode,
      idempotencyKey,
    });
    return data.data;
  },

  async wallet(): Promise<WalletSummary> {
    const { data } = await api.get<ApiSuccess<WalletSummary>>(ENDPOINTS.plans.wallet);
    return data.data;
  },

  async transactions(): Promise<WalletTransaction[]> {
    const { data } = await api.get<ApiSuccess<WalletTransaction[]>>(ENDPOINTS.plans.transactions);
    return data.data;
  },
};
