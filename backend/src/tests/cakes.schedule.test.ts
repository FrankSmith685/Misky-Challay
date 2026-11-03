import assert from 'node:assert/strict';
import { test } from 'node:test';
import { asEffort, dayInLima, needsFromEffort } from '../modules/cakes/cakeProduction.service';

test('la fecha de trabajo usa Lima y conserva el día anterior al cruzar UTC', () => {
  const delivery = new Date('2026-10-18T02:00:00.000Z');
  assert.equal(dayInLima(delivery), '2026-10-17');
  assert.deepEqual(needsFromEffort({ BAKING: 45, QA: 15 }, { BAKING: 1, QA: 0 }, delivery, 2), [
    { station: 'BAKING', workDate: '2026-10-16', minutes: 90 },
    { station: 'QA', workDate: '2026-10-17', minutes: 30 },
  ]);
});

test('rechaza tiempos inválidos antes de reservar capacidad', () => {
  assert.throws(() => asEffort({ BAKING: -1 }), /Minutos invalidos/);
  assert.throws(() => asEffort({ BAKING: 1441 }), /Minutos invalidos/);
  assert.throws(() => needsFromEffort({ DESIGN: 30 }, { DESIGN: 31 }, new Date(), 1), /Calendario de produccion invalido/);
});
