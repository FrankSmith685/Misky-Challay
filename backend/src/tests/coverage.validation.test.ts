import assert from 'node:assert/strict';
import test from 'node:test';
import { coverageSchema } from '../modules/geo/geo.validation';

test('cobertura rechaza una coordenada aislada aunque exista distrito', () => {
  const result = coverageSchema.safeParse({ body: { districtId: 1, latitude: -12.1 } });
  assert.equal(result.success, false);
});

test('cobertura acepta un punto completo dentro o fuera de zona para resolverlo despues', () => {
  const result = coverageSchema.safeParse({
    body: { latitude: -12.1219, longitude: -77.0297 },
  });
  assert.equal(result.success, true);
});
