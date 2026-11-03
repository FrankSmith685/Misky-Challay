import { useEffect, useRef, useState } from 'react';
import { openAuthenticatedStream } from '@services/realtime';

export type KitchenRealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'unsupported';

export interface KitchenRealtimeEvent {
  id: string;
  type: 'TICKET_CREATED' | 'TICKET_UPDATED';
  branchId: number;
  ticketId?: number;
  orderNumber?: string;
  status?: string;
  occurredAt: string;
}

/**
 * SSE sobre `fetch`: a diferencia de EventSource permite enviar el Bearer token
 * en un header y evita publicar credenciales en la URL. El tablero conserva su
 * sondeo como respaldo; este canal solo hace que el refresco sea inmediato.
 */
export const useKitchenRealtime = (
  branchId: number | null,
  onEvent: (event: KitchenRealtimeEvent) => void,
) => {
  const [status, setStatus] = useState<KitchenRealtimeStatus>('connecting');
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!branchId || !('ReadableStream' in window)) {
      setStatus(branchId ? 'unsupported' : 'connecting');
      return undefined;
    }

    let active = true;
    let retryMs = 1_000;
    let controller: AbortController | null = null;

    const connect = async () => {
      while (active) {
        controller = new AbortController();
        try {
          setStatus(retryMs === 1_000 ? 'connecting' : 'reconnecting');
          const response = await openAuthenticatedStream(`/operations/kitchen/stream?branchId=${branchId}`, controller.signal);
          if (!response.ok || !response.body) throw new Error(`SSE ${response.status}`);

          setStatus('connected');
          retryMs = 1_000;
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (active) {
            const { done, value } = await reader.read();
            if (done) throw new Error('SSE closed');
            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split(/\r?\n\r?\n/);
            buffer = blocks.pop() ?? '';
            for (const block of blocks) {
              const data = block.split(/\r?\n/)
                .filter((line) => line.startsWith('data:'))
                .map((line) => line.slice(5).trim())
                .join('\n');
              if (!data) continue;
              try {
                const event = JSON.parse(data) as KitchenRealtimeEvent;
                setLastEventAt(Date.now());
                onEventRef.current(event);
              } catch {
                // Un evento corrupto no debe tumbar el canal; el sondeo lo corrige.
              }
            }
          }
        } catch {
          if (!active || controller.signal.aborted) break;
          setStatus('reconnecting');
          await new Promise((resolve) => window.setTimeout(resolve, retryMs));
          retryMs = Math.min(15_000, retryMs * 2);
        }
      }
    };

    void connect();
    return () => {
      active = false;
      controller?.abort();
    };
  }, [branchId]);

  return { status, lastEventAt };
};

