import { useEffect } from 'react';
import { useAppSelector } from './hooks';
import { announceDataChanged, openAuthenticatedStream } from '@services/realtime';

export function RealtimeConnection() {
  const userId = useAppSelector((state) => state.auth.user?.id);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retry = 1000;
    const connect = async () => {
      try {
        const response = await openAuthenticatedStream(userId ? '/account/events' : '/locations/events', controller.signal);
        if (!response.ok || !response.body) throw new Error('Stream unavailable');
        retry = 1000;
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
        while (!controller.signal.aborted) {
          const result = await reader.read(); if (result.done) break;
          buffer = `${buffer}${decoder.decode(result.value, { stream: true })}`.slice(-65536);
          const blocks = buffer.split(/\r?\n\r?\n/); buffer = blocks.pop() ?? '';
          for (const block of blocks) {
            const line = block.split(/\r?\n/).find((row) => row.startsWith('data:'));
            if (!line) continue;
            try { const data = JSON.parse(line.slice(5)) as { topics?: string[] }; if (Array.isArray(data.topics)) announceDataChanged(data.topics); } catch { /* Polling recovers malformed events. */ }
          }
        }
      } catch { retry = Math.min(15000, retry * 2); }
      finally { if (!controller.signal.aborted) timer = setTimeout(() => void connect(), retry); }
    };
    void connect();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [userId]);
  return null;
}
