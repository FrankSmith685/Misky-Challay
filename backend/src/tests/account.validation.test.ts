import assert from 'node:assert/strict';
import test from 'node:test';
import { createAddressSchema, updateAddressSchema } from '../modules/account/account.validation';

test('una direccion acepta coordenadas solamente como pareja', () => {
  const complete = createAddressSchema.safeParse({
    body: { label: 'Casa', line1: 'Avenida Larco 123', latitude: -12.1, longitude: -77.03 },
  });
  const incomplete = createAddressSchema.safeParse({
    body: { label: 'Casa', line1: 'Avenida Larco 123', latitude: -12.1 },
  });
  assert.equal(complete.success, true);
  assert.equal(incomplete.success, false);
});

test('una edicion ordinaria no obliga a reenviar coordenadas', () => {
  const result = updateAddressSchema.safeParse({ params: { id: 1 }, body: { label: 'Oficina' } });
  assert.equal(result.success, true);
});

test('para borrar un pin se envian latitud y longitud nulas juntas', () => {
  const valid = updateAddressSchema.safeParse({
    params: { id: 1 }, body: { latitude: null, longitude: null },
  });
  const invalid = updateAddressSchema.safeParse({ params: { id: 1 }, body: { latitude: null } });
  assert.equal(valid.success, true);
  assert.equal(invalid.success, false);
});
