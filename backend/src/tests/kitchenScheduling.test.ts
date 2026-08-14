import assert from 'node:assert/strict';
import test from 'node:test';
import { kitchenReleaseAt } from '@modules/operations/operations.service';

test('libera un pedido programado con el margen de preparacion de su cocina', () => {
  const scheduledAt = new Date('2026-08-13T20:00:00.000Z');
  assert.equal(
    kitchenReleaseAt(scheduledAt, 20).toISOString(),
    '2026-08-13T19:40:00.000Z',
  );
});

test('un margen negativo nunca retrasa la comanda mas alla de la hora programada', () => {
  const scheduledAt = new Date('2026-08-13T20:00:00.000Z');
  assert.equal(kitchenReleaseAt(scheduledAt, -5).toISOString(), scheduledAt.toISOString());
});
