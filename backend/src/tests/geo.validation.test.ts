import assert from 'node:assert/strict';
import test from 'node:test';
import { addressSuggestionsSchema, resolveAddressSchema, reverseAddressSchema } from '../modules/geo/geo.validation';

test('acepta una búsqueda contextualizada por ciudad y distrito', () => {
  const result = addressSuggestionsSchema.safeParse({
    query: { q: 'Avenida Larco', cityId: '1', districtId: '22' },
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.query.cityId, 1);
    assert.equal(result.data.query.districtId, 22);
  }
});

test('evita consultas de dirección demasiado cortas', () => {
  const result = addressSuggestionsSchema.safeParse({ query: { q: 'Av', cityId: 1 } });
  assert.equal(result.success, false);
});

test('valida la resolución explícita de una dirección completa', () => {
  const result = resolveAddressSchema.safeParse({
    body: { query: 'Avenida José Larco 345', cityId: 1, districtId: 22 },
  });
  assert.equal(result.success, true);
});

test('acepta coordenadas válidas para convertir un pin en dirección', () => {
  const result = reverseAddressSchema.safeParse({
    body: { latitude: -12.1219, longitude: -77.0297, cityId: 1 },
  });
  assert.equal(result.success, true);
});

test('rechaza coordenadas fuera del rango geográfico', () => {
  const result = reverseAddressSchema.safeParse({
    body: { latitude: -120, longitude: -77.0297, cityId: 1 },
  });
  assert.equal(result.success, false);
});
