import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDaysToIsoDate, zonedDateAt, zonedParts } from '@shared/utils/datetime';

const LIMA = 'America/Lima';

test('lee fecha, dia y hora en la zona indicada y no en UTC', () => {
  // 2026-08-04T01:30:00Z son las 20:30 del 3 de agosto en Lima (lunes).
  const instant = new Date('2026-08-04T01:30:00Z');

  const lima = zonedParts(instant, LIMA);
  assert.equal(lima.isoDate, '2026-08-03');
  assert.equal(lima.weekday, 1); // lunes
  assert.equal(lima.minutes, 20 * 60 + 30);

  const utc = zonedParts(instant, 'UTC');
  assert.equal(utc.isoDate, '2026-08-04');
  assert.equal(utc.weekday, 2); // martes: el off-by-one que rompia los feriados
});

test('una sucursal 10:00-22:00 sigue abierta a las 20:30 de Lima', () => {
  const { minutes } = zonedParts(new Date('2026-08-04T01:30:00Z'), LIMA);
  assert.ok(minutes >= 10 * 60 && minutes < 22 * 60);
});

test('convierte una hora local en el instante correcto', () => {
  // Lima es UTC-5 todo el ano: las 12:00 locales son las 17:00 UTC.
  const noon = zonedDateAt('2026-08-03', 12, 0, LIMA);
  assert.equal(noon.toISOString(), '2026-08-03T17:00:00.000Z');
});

test('ida y vuelta: convertir a instante y volver a leer da la misma hora local', () => {
  for (const hour of [0, 6, 12, 19, 23]) {
    const instant = zonedDateAt('2026-12-31', hour, 30, LIMA);
    const back = zonedParts(instant, LIMA);
    assert.equal(back.isoDate, '2026-12-31');
    assert.equal(back.minutes, hour * 60 + 30);
  }
});

test('sumar dias cruza fin de mes y fin de ano', () => {
  assert.equal(addDaysToIsoDate('2026-08-31', 1), '2026-09-01');
  assert.equal(addDaysToIsoDate('2026-12-31', 1), '2027-01-01');
  assert.equal(addDaysToIsoDate('2028-02-28', 1), '2028-02-29'); // bisiesto
});
