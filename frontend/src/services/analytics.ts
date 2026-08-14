import { api } from '@services/api/client';

export type UxEventType = 'COVERAGE_SUCCESS' | 'COVERAGE_FAIL' | 'COVERAGE_ERROR' | 'CHECKOUT_START' | 'CHECKOUT_ERROR' | 'PAYMENT_REDIRECT';

export type AnalyticsConsent = 'accepted' | 'rejected' | null;
const CONSENT_KEY = 'verde-bowl:analytics-consent';

export const getAnalyticsConsent = (): AnalyticsConsent => {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    return value === 'accepted' || value === 'rejected' ? value : null;
  } catch {
    return null;
  }
};

export const setAnalyticsConsent = (value: Exclude<AnalyticsConsent, null>): void => {
  try {
    localStorage.setItem(CONSENT_KEY, value);
    if (value === 'rejected') sessionStorage.removeItem('verde-bowl:ux-session');
  } catch {
    // El navegador puede bloquear almacenamiento; la medición permanece desactivada.
  }
  window.dispatchEvent(new CustomEvent('analytics-consent', { detail: value }));
};

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
  getAnalyticsConsent() !== 'accepted'
    ? Promise.resolve(undefined)
    : api.post('/engagement/events', { sessionId: getSessionId(), eventType, metadata }).catch(() => undefined);
