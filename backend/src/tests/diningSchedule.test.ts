import assert from 'node:assert/strict';
import test from 'node:test';
import { limaClock, offeringState } from '@modules/operations/dining.service';

const mondayAtLunchUtc = new Date('2026-08-10T17:30:00.000Z'); // 12:30 en Lima

test('el menú de salón usa la hora de Lima y no la hora UTC', () => {
  assert.deepEqual(limaClock(mondayAtLunchUtc), {
    date: '2026-08-10',
    time: '12:30:00',
    weekday: 1,
  });
  assert.equal(offeringState({
    weekdaysJson: [1], soldDate: '2026-08-10', soldCount: 4, dailyLimit: 10,
    startsAt: '11:00:00', endsAt: '16:00:00', isActive: true,
  }, mondayAtLunchUtc).activeNow, true);
});

test('el menú se oculta al agotar sus porciones diarias', () => {
  assert.deepEqual(offeringState({
    weekdaysJson: [1], soldDate: '2026-08-10', soldCount: 10, dailyLimit: 10,
    startsAt: '11:00:00', endsAt: '16:00:00', isActive: true,
  }, mondayAtLunchUtc), { activeNow: false, remaining: 0 });
});

test('el contador de porciones no se arrastra al día siguiente', () => {
  assert.deepEqual(offeringState({
    weekdaysJson: [1], soldDate: '2026-08-09', soldCount: 10, dailyLimit: 10,
    startsAt: '11:00:00', endsAt: '16:00:00', isActive: true,
  }, mondayAtLunchUtc), { activeNow: true, remaining: 10 });
});
