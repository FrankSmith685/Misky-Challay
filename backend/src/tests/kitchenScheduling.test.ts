import assert from 'node:assert/strict';
import test from 'node:test';
import { kitchenReleaseAt } from '@modules/operations/operations.service';
import { kitchenReleaseAtForTasks } from '@modules/operations/kitchenSchedule';

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

test('la comanda de una torta respeta el trabajo previsto el día de entrega', () => {
  const scheduledAt = new Date('2026-10-30T20:00:00.000Z'); // 15:00 en Lima
  const tasks = [
    { workDate: '2026-10-29', plannedMinutes: 80, station: 'BAKING' },
    { workDate: '2026-10-30', plannedMinutes: 90, station: 'DECORATING' },
    { workDate: '2026-10-30', plannedMinutes: 25, station: 'QA' },
    { workDate: '2026-10-30', plannedMinutes: 15, station: 'DISPATCH' },
  ];
  assert.equal(kitchenReleaseAtForTasks(scheduledAt, 20, tasks).toISOString(), '2026-10-30T17:30:00.000Z');
});

test('los pedidos sin plan de torta conservan el margen de la sucursal', () => {
  const scheduledAt = new Date('2026-10-30T20:00:00.000Z');
  assert.equal(kitchenReleaseAtForTasks(scheduledAt, 20, []).toISOString(), '2026-10-30T19:40:00.000Z');
});
