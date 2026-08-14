import assert from 'node:assert/strict';
import test from 'node:test';
import { publishKitchenEvent, subscribeKitchenEvents } from '@modules/operations/kitchenEvents';

test('los eventos de cocina solo llegan a la sucursal suscrita', () => {
  const received: string[] = [];
  const unsubscribe = subscribeKitchenEvents(7, (event) => received.push(`${event.type}:${event.ticketId}`));

  publishKitchenEvent({ type: 'TICKET_CREATED', branchId: 8, ticketId: 10, status: 'QUEUED' });
  publishKitchenEvent({ type: 'TICKET_CREATED', branchId: 7, ticketId: 11, status: 'QUEUED' });
  unsubscribe();
  publishKitchenEvent({ type: 'TICKET_UPDATED', branchId: 7, ticketId: 11, status: 'ACCEPTED' });

  assert.deepEqual(received, ['TICKET_CREATED:11']);
});

