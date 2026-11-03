import { useEffect, useRef } from 'react';
import { api, tokenStorage } from '@services/api/client';

export const DATA_CHANGED = 'dulceflow:data-changed';
export const announceDataChanged = (topics: string[]) => window.dispatchEvent(new CustomEvent(DATA_CHANGED, { detail: topics }));

export async function openAuthenticatedStream(path: string, signal: AbortSignal) {
  const request = () => fetch(`${String(api.defaults.baseURL ?? '/api/v1').replace(/\/$/, '')}${path}`, {
    credentials: 'include', cache: 'no-store', signal,
    headers: { Accept: 'text/event-stream', Authorization: `Bearer ${tokenStorage.getAccess() ?? ''}` },
  });
  let response = await request();
  if (response.status === 401 && !signal.aborted) {
    await api.get('/auth/me', { signal });
    response = await request();
  }
  return response;
}

/** Refresh reads only. Callers keep their editable drafts separate from server snapshots. */
export function useLiveRefresh(topics: string[], refresh: () => unknown, options: { enabled?: boolean; intervalMs?: number } = {}) {
  const ref = useRef(refresh); ref.current = refresh;
  const key = topics.join(',');
  const { enabled = true, intervalMs = 30000 } = options;
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let running = false;
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      if (!active || document.hidden) return;
      if (running) { pending = true; return; }
      running = true;
      try { await ref.current(); } catch { /* The reader exposes its own error state. */ }
      finally { running = false; if (pending && active) { pending = false; void run(); } }
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void run(), 200);
    };
    const onChange = (event: Event) => {
      const changed = (event as CustomEvent<string[]>).detail ?? [];
      if (changed.includes('resync') || changed.some((topic) => key.split(',').includes(topic))) schedule();
    };
    const onVisible = () => { if (!document.hidden) schedule(); };
    window.addEventListener(DATA_CHANGED, onChange);
    window.addEventListener('online', schedule);
    window.addEventListener('focus', schedule);
    document.addEventListener('visibilitychange', onVisible);
    const poll = intervalMs > 0 ? setInterval(onVisible, intervalMs) : undefined;
    return () => {
      active = false; clearTimeout(timer); clearInterval(poll);
      window.removeEventListener(DATA_CHANGED, onChange); window.removeEventListener('online', schedule); window.removeEventListener('focus', schedule); document.removeEventListener('visibilitychange', onVisible);
    };
  }, [key, enabled, intervalMs]);
}
