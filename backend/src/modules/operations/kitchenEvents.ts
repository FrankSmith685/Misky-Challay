import { EventEmitter } from 'node:events';

export type KitchenRealtimeEvent = {
  id: string;
  type: 'TICKET_CREATED' | 'TICKET_UPDATED' | 'HEARTBEAT';
  branchId: number;
  ticketId?: number;
  orderNumber?: string;
  status?: string;
  occurredAt: string;
};

const emitter = new EventEmitter();
// Una instancia puede mantener varias pantallas por sucursal. El limite evita el
// warning de Node sin convertir una conexion SSE legitima en una fuga silenciosa.
emitter.setMaxListeners(500);

const channel = (branchId: number) => `branch:${branchId}`;

export const publishKitchenEvent = (
  event: Omit<KitchenRealtimeEvent, 'id' | 'occurredAt'>,
): KitchenRealtimeEvent => {
  const complete: KitchenRealtimeEvent = {
    ...event,
    id: `${Date.now()}-${event.ticketId ?? 'board'}`,
    occurredAt: new Date().toISOString(),
  };
  emitter.emit(channel(event.branchId), complete);
  return complete;
};

export const subscribeKitchenEvents = (
  branchId: number,
  listener: (event: KitchenRealtimeEvent) => void,
): (() => void) => {
  const name = channel(branchId);
  emitter.on(name, listener);
  return () => emitter.off(name, listener);
};

