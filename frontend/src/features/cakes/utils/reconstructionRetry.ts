import axios from 'axios';

/** Honor both delta-seconds and HTTP-date Retry-After responses. */
export const reconstructionRetryAt = (error: unknown, now = Date.now()): number | null => {
  if (!axios.isAxiosError(error) || error.response?.status !== 429) return null;
  const header = error.response.headers['retry-after'];
  const seconds = typeof header === 'string' || typeof header === 'number' ? Number(header) : NaN;
  if (Number.isFinite(seconds) && seconds > 0) return now + seconds * 1000;
  const date = typeof header === 'string' ? Date.parse(header) : NaN;
  if (Number.isFinite(date) && date > now) return date;
  const details = error.response.data?.details as { retryAfterSeconds?: unknown } | undefined;
  if (typeof details?.retryAfterSeconds === 'number' && Number.isFinite(details.retryAfterSeconds) && details.retryAfterSeconds > 0) return now + details.retryAfterSeconds * 1000;
  return now + 15_000;
};
