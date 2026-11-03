import { subscriptionTermsApi } from './customerJourney';
import { useCallback, useEffect, useRef, useState } from 'react';
import api, { getApiErrorMessage } from '@services/api/client';
import { announceDataChanged, useLiveRefresh } from '@services/realtime';
import type { ApiSuccess } from '@/types/api';

export interface CheckoutTerms {
  version: number;
  title: string;
  content: string;
  acceptanceLabel: string;
  publishedAt: string;
}

export const checkoutTermsApi = {
  get: async () => (await api.get<ApiSuccess<CheckoutTerms>>('/settings/terms')).data.data,
  publish: async (input: Omit<CheckoutTerms, 'publishedAt'>) => {
    const result = (await api.put<ApiSuccess<CheckoutTerms>>('/settings/terms', input)).data.data;
    announceDataChanged(['settings']);
    return result;
  },
};

/** Sin documento vigente no se permite confirmar. Un fallo nunca inventa términos de respaldo. */
export function useCheckoutTerms(subscription = false) {
  const [terms, setTerms] = useState<CheckoutTerms | null>(null);
  const [error, setError] = useState('');
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++request.current;
    try {
      const data = await (subscription ? subscriptionTermsApi : checkoutTermsApi).get();
      if (current === request.current) { setTerms(data); setError(''); }
    } catch (caught) {
      if (current === request.current) setError(getApiErrorMessage(caught));
    }
  }, [subscription]);
  useEffect(() => { void refresh(); return () => { request.current += 1; }; }, [refresh]);
  useLiveRefresh(['settings'], refresh);
  return { terms, error, refresh };
}
