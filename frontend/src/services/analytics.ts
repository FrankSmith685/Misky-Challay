import { api } from '@services/api/client';

export type UxEventType = 'COVERAGE_SUCCESS' | 'COVERAGE_FAIL' | 'COVERAGE_ERROR' | 'CHECKOUT_START' | 'CHECKOUT_ERROR' | 'PAYMENT_REDIRECT';

const getSessionId = () => {
  const key = 'verde-bowl:ux-session';
  const current = sessionStorage.getItem(key);
  if (current) return current;
  const created = crypto.randomUUID();
  sessionStorage.setItem(key, created);
  return created;
};

/** Medicion propia y anonima; no carga SDKs publicitarios ni comparte datos con terceros. */
export const trackUxEvent = (eventType: UxEventType, metadata?: Record<string, string | number | boolean | null>) =>
  api.post('/engagement/events', { sessionId: getSessionId(), eventType, metadata }).catch(() => undefined);
